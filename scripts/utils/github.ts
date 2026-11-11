import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { GitHubEvent } from "../../src/providers/github";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.join(__dirname, "../../.env");

// Same depth the agentscan scanner reads, so a fixture sees what the site sees.
const EVENT_PAGES = 3;
const EVENTS_PER_PAGE = 100;

/** The slice of a GitHub profile a fixture keeps. */
export interface FixtureUser {
	login: string;
	created_at: string;
	public_repos: number;
	/** GitHub reports "Bot" for GitHub Apps — dropping it loses `isGitHubApp`. */
	type: string;
}

export interface PullRequestAuthor {
	login: string;
	type: string;
}

export class GitHubRequestError extends Error {
	constructor(
		message: string,
		readonly status: number,
		readonly rateLimited: boolean,
	) {
		super(message);
	}
}

export function loadGitHubToken(): string | undefined {
	if (process.env.GITHUB_TOKEN) {
		return process.env.GITHUB_TOKEN;
	}

	if (!fs.existsSync(ENV_PATH)) {
		return undefined;
	}

	const envContent = fs.readFileSync(ENV_PATH, "utf-8");
	const match = envContent.match(/GITHUB_TOKEN\s*=\s*"?([^"\n%]+)"?/);

	return match?.[1]?.trim();
}

function isRateLimited(response: Response): boolean {
	if (response.status === 429) {
		return true;
	}

	return (
		response.status === 403 &&
		response.headers.get("x-ratelimit-remaining") === "0"
	);
}

export function createGitHubClient(token: string | undefined) {
	const headers: Record<string, string> = token
		? { Authorization: `token ${token}` }
		: {};

	async function request<T>(url: string, label: string): Promise<T> {
		const response = await fetch(url, { headers });

		if (!response.ok) {
			throw new GitHubRequestError(
				`Failed to fetch ${label}: ${response.status} ${response.statusText}`,
				response.status,
				isRateLimited(response),
			);
		}

		return (await response.json()) as T;
	}

	async function fetchUser(login: string): Promise<FixtureUser> {
		const data = await request<FixtureUser>(
			`https://api.github.com/users/${login}`,
			`user ${login}`,
		);

		return {
			login: data.login,
			created_at: data.created_at,
			public_repos: data.public_repos,
			type: data.type,
		};
	}

	async function fetchEvents(login: string): Promise<GitHubEvent[]> {
		const events: GitHubEvent[] = [];

		for (let page = 1; page <= EVENT_PAGES; page++) {
			const pageEvents = await request<GitHubEvent[]>(
				`https://api.github.com/users/${login}/events?per_page=${EVENTS_PER_PAGE}&page=${page}`,
				`events for ${login}`,
			);

			if (pageEvents.length === 0) {
				break;
			}

			events.push(...pageEvents);
		}

		return events;
	}

	async function fetchPullRequestAuthor(
		repo: string,
		number: number,
	): Promise<PullRequestAuthor | undefined> {
		const pr = await request<{ user: PullRequestAuthor | null }>(
			`https://api.github.com/repos/${repo}/pulls/${number}`,
			`${repo}#${number}`,
		);

		// A deleted account leaves the PR behind with no author.
		return pr.user ?? undefined;
	}

	return { fetchUser, fetchEvents, fetchPullRequestAuthor };
}
