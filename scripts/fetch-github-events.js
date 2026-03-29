#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { faker } from "@faker-js/faker";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function generateReadableName() {
  const firstName = faker.person.firstName().toLowerCase();
  const lastName = faker.person.lastName().toLowerCase();
  return `${firstName}${lastName}`;
}

function anonymizeData(user, events) {
  const repoMapping = {};

  for (const event of events) {
    const repoName = event.repo.name;
    if (!repoMapping[repoName]) {
      const repoNum = Object.keys(repoMapping).length + 1;
      repoMapping[repoName] = `repo-${repoNum}`;
    }
  }

  const anonymousUsername = generateReadableName();

  const anonymousUser = {
    login: anonymousUsername,
    created_at: user.created_at,
    public_repos: user.public_repos,
  };

  const anonymousEvents = events.map((event) => ({
    ...event,
    repo: {
      ...event.repo,
      name: repoMapping[event.repo.name],
    },
  }));

  return { anonymousUser, anonymousEvents };
}

async function fetchGitHubEvents(username, type = "automation") {
  if (!username) {
    console.error("Usage: node fetch-github-events.js <github-username>");
    console.error("Example: node fetch-github-events.js crabby-rathbun");
    process.exit(1);
  }

  const userUrl = `https://api.github.com/users/${username}`;
  const outputDir = path.join(__dirname, "..", "test", "fixtures");

  try {
    console.log(`Fetching data for user: ${username}`);

    fs.mkdirSync(outputDir, { recursive: true });

    console.log(`Fetching user details: ${userUrl}`);
    const userResponse = await fetch(userUrl);
    if (!userResponse.ok) {
      throw new Error(`GitHub API error: ${userResponse.status} ${userResponse.statusText}`);
    }
    const userData = await userResponse.json();

    const user = {
      login: userData.login,
      created_at: userData.created_at,
      public_repos: userData.public_repos,
    };

    const MIN_PAGE = 1;
    const MAX_PAGE = 2;

    // Fetch 2 pages of 100 events each (200 total)
    console.log(`Fetching events (page ${MIN_PAGE} and ${MAX_PAGE}, ${MAX_PAGE * 100} total)`);
    const events = [];
    for (let page = MIN_PAGE; page <= MAX_PAGE; page++) {
      const eventsUrl = `https://api.github.com/users/${username}/events?per_page=100&page=${page}`;
      const eventsResponse = await fetch(eventsUrl);
      if (!eventsResponse.ok) {
        throw new Error(`GitHub API error: ${eventsResponse.status} ${eventsResponse.statusText}`);
      }
      const pageEvents = await eventsResponse.json();
      if (pageEvents.length === 0) break; // Stop if no more events
      events.push(...pageEvents);
    }

    const transformedEvents = events.map((event) => {
      let newEvent = {
        type: event.type,
        created_at: event.created_at,
        repo: {
          name: event.repo.name,
        },
      };

      // Extract relevant payload properties by event type
      if (event?.payload?.ref_type) {
        // CreateEvent: include branch/repo ref type
        newEvent = {
          ...newEvent,
          payload: { ref_type: event.payload.ref_type },
        };
      }

      if (event?.payload?.action) {
        newEvent = {
          ...newEvent,
          payload: { action: event.payload.action },
        };
      }

      return newEvent;
    });

    const { anonymousUser, anonymousEvents } = anonymizeData(user, transformedEvents);

    const outputFile = path.join(outputDir, `${type}_${anonymousUser.login}.json`);

    const data = {
      user: anonymousUser,
      events: anonymousEvents,
    };

    fs.writeFileSync(outputFile, JSON.stringify(data, null, 2));

    console.log(`✓ Successfully saved to: ${outputFile}`);
    console.log(`✓ User: ${anonymousUser.login} (${anonymousUser.public_repos} public repos)`);
    console.log(`✓ Total events: ${anonymousEvents.length}`);
  } catch (error) {
    console.error(`✗ Error: ${error.message}`);
    process.exit(1);
  }
}

await fetchGitHubEvents(process.argv[2], process.argv[3]);
