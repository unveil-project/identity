import { describe, expect, it } from "vitest";
import {
	fromGitLab,
	fromGitLabEvent,
	type GitLabEvent,
} from "../src/providers/gitlab";

const at = "2026-01-01T00:00:00Z";

function event(overrides: Partial<GitLabEvent>): GitLabEvent {
	return { action_name: "opened", created_at: at, project_id: 1, ...overrides };
}

describe("fromGitLabEvent", () => {
	it("maps pushes by what happened to the ref", () => {
		const push = (action: string) =>
			fromGitLabEvent(
				event({
					action_name: "pushed to",
					push_data: { action, ref_type: "branch", ref: "claude/fix" },
				}),
			);

		expect(push("pushed")).toMatchObject({ type: "push", ref: undefined });
		expect(push("created")).toMatchObject({
			type: "create",
			ref: { type: "branch", name: "claude/fix" },
		});
		expect(push("removed").type).toBe("delete");
	});

	it("maps a new project to a created repository", () => {
		expect(fromGitLabEvent(event({ action_name: "created" }))).toMatchObject({
			type: "create",
			ref: { type: "repository" },
		});
	});

	it("maps merge requests, and calls accepted merged", () => {
		const mr = (action_name: string) =>
			fromGitLabEvent(
				event({ action_name, target_type: "MergeRequest", target_iid: 4 }),
			);

		expect(mr("opened")).toMatchObject({
			type: "pull-request",
			action: "opened",
			pullRequest: { number: 4, isAuthor: true },
		});
		expect(mr("accepted")).toMatchObject({
			type: "pull-request",
			action: "merged",
			pullRequest: { number: 4, isAuthor: undefined },
		});
		expect(mr("approved").type).toBe("review");
	});

	it("maps issues with their title", () => {
		expect(
			fromGitLabEvent(
				event({ target_type: "Issue", target_title: "[$50] Fix it" }),
			),
		).toMatchObject({
			type: "issue",
			action: "opened",
			issue: { title: "[$50] Fix it" },
		});
	});

	it("maps notes by what they are on", () => {
		const note = (target_type: string, noteable_type: string) =>
			fromGitLabEvent(
				event({
					action_name: "commented on",
					target_type,
					note: { noteable_type, noteable_iid: 9 },
				}),
			);

		expect(note("Note", "Issue").type).toBe("issue-comment");
		expect(note("DiscussionNote", "MergeRequest")).toMatchObject({
			type: "issue-comment",
			action: "created",
			pullRequest: { number: 9 },
		});
		expect(note("DiffNote", "MergeRequest").type).toBe("review-comment");
		expect(note("Note", "Commit").type).toBe("commit-comment");
	});

	it("names the repo from the projects, or by id", () => {
		const projects = new Map([[1, "group/sub/project"]]);

		expect(fromGitLabEvent(event({}), projects).repo).toBe("group/sub/project");
		expect(fromGitLabEvent(event({ project_id: 2 }), projects).repo).toBe("2");
	});

	it("keeps the original event as the source", () => {
		const raw = event({});
		expect(fromGitLabEvent(raw).source).toBe(raw);
	});
});

describe("fromGitLab", () => {
	it("builds the account", () => {
		const input = fromGitLab({
			user: {
				id: 1,
				username: "root",
				name: "Administrator",
				created_at: "2020-01-01T00:00:00Z",
				bot: false,
				web_url: "https://gitlab.com/root",
				followers: 3,
				following: 1,
			},
			events: [],
			publicRepos: 5,
		});

		expect(input.account).toEqual({
			login: "root",
			createdAt: "2020-01-01T00:00:00Z",
			publicRepos: 5,
			isApp: false,
			id: "1",
			name: "Administrator",
			url: "https://gitlab.com/root",
			followers: 3,
			following: 1,
		});
		expect(input.eventCap).toBeUndefined();
	});

	it("marks bot users as apps", () => {
		const input = fromGitLab({
			user: { username: "project_1_bot", created_at: at, bot: true },
			events: [],
			publicRepos: 0,
		});
		expect(input.account.isApp).toBe(true);
	});

	it("names repos from the projects passed in", () => {
		const input = fromGitLab({
			user: { username: "root", created_at: at },
			events: [event({ project_id: 7 })],
			publicRepos: 1,
			projects: [{ id: 7, path_with_namespace: "root/dotfiles" }],
		});
		expect(input.events[0]?.repo).toBe("root/dotfiles");
	});
});
