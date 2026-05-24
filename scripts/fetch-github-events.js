#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { faker } from "@faker-js/faker";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const COMMIT_SEARCH_PAGES = 1; // 100 commits is enough for ratio precision (~±5% at 95% confidence)
const COMMIT_LOOKBACK_DAYS = 180;

const AUTH_HEADERS = process.env.GITHUB_TOKEN
  ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
  : {};

function generateReadableName() {
  const firstName = faker.person.firstName().toLowerCase();
  const lastName = faker.person.lastName().toLowerCase();
  return `${firstName}${lastName}`;
}

function anonymizeData(user, events, commits) {
  const repoMapping = {};

  const ensureMapping = (repoName) => {
    if (!repoName) return undefined;
    if (!repoMapping[repoName]) {
      const repoNum = Object.keys(repoMapping).length + 1;
      repoMapping[repoName] = `repo-${repoNum}`;
    }
    return repoMapping[repoName];
  };

  const anonymousUser = {
    login: generateReadableName(),
    created_at: user.created_at,
    public_repos: user.public_repos,
  };

  const anonymousEvents = events.map((event) => ({
    ...event,
    repo: { ...event.repo, name: ensureMapping(event.repo?.name) },
  }));

  const anonymousCommits = commits.map((c) => ({
    sha: c.sha,
    message: c.message,
    repo: ensureMapping(c.repo),
  }));

  return { anonymousUser, anonymousEvents, anonymousCommits };
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: AUTH_HEADERS });
  const remaining = response.headers.get("x-ratelimit-remaining");
  if (remaining !== null && Number(remaining) <= 5) {
    const reset = response.headers.get("x-ratelimit-reset");
    const resetIn = reset ? `${Math.max(0, Number(reset) - Math.floor(Date.now() / 1000))}s` : "?";
    console.warn(`⚠ rate-limit low: ${remaining} remaining, resets in ${resetIn}`);
  }
  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status} ${response.statusText} (${url})`);
  }
  return response.json();
}

async function fetchUserEvents(username) {
  const events = [];
  for (let page = 1; page <= 2; page++) {
    const url = `https://api.github.com/users/${username}/events?per_page=100&page=${page}`;
    const pageEvents = await fetchJson(url);
    if (pageEvents.length === 0) break;
    events.push(...pageEvents);
    if (pageEvents.length < 100) break;
  }
  return events.map((event) => {
    const newEvent = {
      type: event.type,
      created_at: event.created_at,
      repo: { name: event.repo.name },
    };
    if (event?.payload?.ref_type) {
      newEvent.payload = { ref_type: event.payload.ref_type };
    }
    if (event?.payload?.action) {
      newEvent.payload = { action: event.payload.action };
    }
    return newEvent;
  });
}

async function fetchUserCommits(username, sinceDate) {
  const commits = [];
  for (let page = 1; page <= COMMIT_SEARCH_PAGES; page++) {
    const params = new URLSearchParams({
      q: `author:${username} committer-date:>=${sinceDate}`,
      per_page: "100",
      page: String(page),
      sort: "author-date",
      order: "desc",
    });
    const url = `https://api.github.com/search/commits?${params}`;
    let pageData;
    try {
      pageData = await fetchJson(url);
    } catch (err) {
      console.warn(`Commit search stopped early at page ${page}: ${err.message}`);
      break;
    }
    const items = pageData.items ?? [];
    if (items.length === 0) break;
    for (const item of items) {
      commits.push({
        sha: item.sha,
        message: item.commit?.message ?? "",
        repo: item.repository?.full_name,
      });
    }
    if (items.length < 100) break;
  }
  return commits;
}

async function fetchGitHubEvents(username, type = "automation", { skipCommitsMsfg = false } = {}) {

  if (!username) {
    console.error("Usage: node fetch-github-events.js <github-username> [type] [--no-commits-analysis]");
    console.error("Example: node fetch-github-events.js crabby-rathbun user");
    console.error("         node fetch-github-events.js crabby-rathbun user --no-commits-analysis");
    process.exit(1);
  }

  const outputDir = path.join(__dirname, "..", "test", "fixtures");

  try {
    console.log(`Fetching data for user: ${username}`);

    fs.mkdirSync(outputDir, { recursive: true });

    const userData = await fetchJson(`https://api.github.com/users/${username}`);
    const user = {
      login: userData.login,
      created_at: userData.created_at,
      public_repos: userData.public_repos,
    };

    console.log(`Fetching events (up to 200)`);
    const transformedEvents = await fetchUserEvents(username);

    let transformedCommits = [];
    if (skipCommitsMsfg) {
      console.log(`--no-commits-analysis set, skipping commit search`);
    } else if (transformedEvents.some((e) => e.type === "PushEvent")) {
      const sinceDate = new Date(Date.now() - COMMIT_LOOKBACK_DAYS * 86400000)
        .toISOString()
        .slice(0, 10);
      console.log(`Fetching commits via search (since ${sinceDate}, up to ${COMMIT_SEARCH_PAGES * 100})`);
      transformedCommits = await fetchUserCommits(username, sinceDate);
    } else {
      console.log(`No PushEvents in recent activity, skipping commit search`);
    }

    const { anonymousUser, anonymousEvents, anonymousCommits } = anonymizeData(
      user,
      transformedEvents,
      transformedCommits,
    );

    const outputFile = path.join(outputDir, `${type}_${anonymousUser.login}.json`);
    const data = {
      user: anonymousUser,
      events: anonymousEvents,
      commits: anonymousCommits,
    };
    fs.writeFileSync(outputFile, JSON.stringify(data, null, 2));

    console.log(`✓ Successfully saved to: ${outputFile}`);
    console.log(`✓ User: ${anonymousUser.login} (${anonymousUser.public_repos} public repos)`);
    console.log(`✓ Total events: ${anonymousEvents.length}`);
    console.log(`✓ Total commits check: ${anonymousCommits.length}`);
  } catch (error) {
    console.error(`✗ Error: ${error.message}`);
    process.exit(1);
  }
}

await fetchGitHubEvents(process.argv[2], process.argv[3], { skipCommitsMsfg: process.argv.includes("--no-commits-analysis") });
