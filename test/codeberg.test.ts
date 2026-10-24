import { describe, expect, it } from "vitest";
import {
	type CodebergActivity,
	fromCodeberg,
	fromCodebergEvent,
} from "../src/providers/codeberg";

const at = "2026-01-01T00:00:00Z";

function activity(
	op_type: string,
	overrides: Partial<CodebergActivity> = {},
): CodebergActivity {
	return {
		op_type,
		created: at,
		repo: { full_name: "owner/repo" },
		...overrides,
	};
}

describe("fromCodebergEvent", () => {
	it("maps op types to its own types", () => {
		const types = [
			"star_repo",
			"create_issue",
			"comment_issue",
			"comment_pull",
			"create_pull_request",
			"merge_pull_request",
			"approve_pull_request",
			"publish_release",
		].map((op) => fromCodebergEvent(activity(op)).type);

		expect(types).toEqual([
			"star",
			"issue",
			"issue-comment",
			"issue-comment",
			"pull-request",
			"pull-request",
			"review",
			"release",
		]);
	});

	it("keeps an op type it does not know as it is", () => {
		expect(fromCodebergEvent(activity("mirror_sync_push")).type).toBe(
			"mirror_sync_push",
		);
	});

	it("tells a new branch from a push", () => {
		const push = fromCodebergEvent(
			activity("commit_repo", {
				ref_name: "refs/heads/main",
				content: '{"Commits":[],"Len":1}',
			}),
		);
		expect(push.type).toBe("push");

		const branch = fromCodebergEvent(
			activity("commit_repo", { ref_name: "refs/heads/codex/fix", content: "" }),
		);
		expect(branch).toMatchObject({
			type: "create",
			ref: { type: "branch", name: "codex/fix" },
		});

		const deleted = fromCodebergEvent(
			activity("delete_tag", { ref_name: "refs/tags/v1.0.0" }),
		);
		expect(deleted).toMatchObject({
			type: "delete",
			ref: { type: "tag", name: "v1.0.0" },
		});
	});

	it("tells a fork from a new repo", () => {
		expect(fromCodebergEvent(activity("create_repo"))).toMatchObject({
			type: "create",
			ref: { type: "repository" },
		});
		expect(
			fromCodebergEvent(
				activity("create_repo", { repo: { full_name: "me/repo", fork: true } }),
			).type,
		).toBe("fork");
	});

	it("reads the index and title from Forgejo and Gitea content", () => {
		const forgejo = fromCodebergEvent(
			activity("create_issue", { content: '["12","[$50] Fix it"]' }),
		);
		expect(forgejo).toMatchObject({
			action: "opened",
			issue: { title: "[$50] Fix it" },
		});

		const gitea = fromCodebergEvent(
			activity("create_pull_request", { content: "7|Fix | the bug" }),
		);
		expect(gitea).toMatchObject({
			action: "opened",
			pullRequest: { number: 7, isAuthor: true },
		});

		const merged = fromCodebergEvent(
			activity("merge_pull_request", { content: '["7","Fix"]' }),
		);
		expect(merged).toMatchObject({
			action: "merged",
			pullRequest: { number: 7, isAuthor: undefined },
		});
	});

	it("keeps the original activity as the source", () => {
		const raw = activity("star_repo");
		expect(fromCodebergEvent(raw).source).toBe(raw);
	});
});

describe("fromCodeberg", () => {
	it("builds the account", () => {
		const input = fromCodeberg({
			user: {
				id: 3,
				login: "alice",
				full_name: "",
				description: "Hi",
				created: "2020-01-01T00:00:00Z",
				html_url: "https://codeberg.org/alice",
				followers_count: 2,
				following_count: 4,
			},
			events: [],
			publicRepos: 6,
		});

		expect(input.account).toEqual({
			login: "alice",
			createdAt: "2020-01-01T00:00:00Z",
			publicRepos: 6,
			id: "3",
			bio: "Hi",
			url: "https://codeberg.org/alice",
			followers: 2,
			following: 4,
		});
	});

	it("leaves out what other people did", () => {
		const input = fromCodeberg({
			user: { id: 3, login: "alice", created: at },
			events: [
				activity("star_repo", { act_user_id: 3 }),
				activity("create_issue", { act_user_id: 9 }),
			],
			publicRepos: 0,
		});
		expect(input.events.map((e) => e.type)).toEqual(["star"]);

		const byLogin = fromCodeberg({
			user: { login: "Alice", created: at },
			events: [
				activity("star_repo", { act_user: { login: "alice" } }),
				activity("star_repo", { act_user: { login: "bob" } }),
			],
			publicRepos: 0,
		});
		expect(byLogin.events).toHaveLength(1);
	});
});
