import { describe, expect, it } from "vitest";
import {
	fromTangled,
	type TangledAccount,
	type TangledRecord,
	type TangledRecordValue,
} from "../src/providers/tangled";

const me = "did:plc:me";
const them = "did:plc:them";
const at = "2026-01-01T00:00:00.000Z";

const account: TangledAccount = {
	did: me,
	handle: "me.tngl.sh",
	createdAt: "2024-01-01T00:00:00Z",
};

function record(
	did: string,
	collection: string,
	rkey: string,
	value: TangledRecordValue,
): TangledRecord {
	return {
		uri: `at://${did}/${collection}/${rkey}`,
		value: { $type: collection, createdAt: at, ...value },
	};
}

const myRepo = record(me, "sh.tangled.repo", "3aaa", {
	name: "dotfiles",
	repoDid: "did:plc:myrepo",
});
const theirRepo = record(them, "sh.tangled.repo", "3bbb", {
	name: "core",
	repoDid: "did:plc:theirrepo",
});
const theirIssue = record(them, "sh.tangled.repo.issue", "3ccc", {
	repo: "did:plc:theirrepo",
	title: "Crash",
});
const myPull = record(me, "sh.tangled.repo.pull", "3ddd", {
	title: "Fix crash",
	target: { repo: "did:plc:theirrepo", branch: "main" },
});

function events(records: TangledRecord[]) {
	return fromTangled({ account, records }).events;
}

describe("fromTangled", () => {
	it("only counts the account's own records as activity", () => {
		expect(events([myRepo, theirRepo, theirIssue])).toHaveLength(1);
	});

	it("names repos by handle for the account, and by DID for others", () => {
		const [repo, pull] = events([myRepo, theirRepo, myPull]);

		expect(repo).toMatchObject({
			type: "create",
			repo: "me.tngl.sh/dotfiles",
			ref: { type: "repository" },
		});
		expect(pull).toMatchObject({
			type: "pull-request",
			action: "opened",
			repo: `${them}/core`,
			pullRequest: { isAuthor: true },
		});
	});

	it("keeps an unknown repo DID as the repo", () => {
		const [pull] = events([myPull]);
		expect(pull?.repo).toBe("did:plc:theirrepo");
	});

	it("finds the repo of a comment through its issue", () => {
		const comment = record(me, "sh.tangled.repo.issue.comment", "3eee", {
			issue: theirIssue.uri,
		});
		const [event] = events([theirRepo, theirIssue, comment]);

		expect(event).toMatchObject({
			type: "issue-comment",
			repo: `${them}/core`,
		});
	});

	it("marks a pull status as the account's when it opened the pull", () => {
		const status = (pull: string, value: string) =>
			record(me, "sh.tangled.repo.pull.status", "3fff", {
				pull,
				status: `sh.tangled.repo.pull.status.${value}`,
			});
		const theirPull = `at://${them}/sh.tangled.repo.pull/3ggg`;

		const [merged, closed] = events([
			myPull,
			status(myPull.uri, "merged"),
			status(theirPull, "closed"),
		]).slice(1);

		expect(merged).toMatchObject({
			action: "merged",
			repo: "did:plc:theirrepo",
			pullRequest: { isAuthor: true },
		});
		expect(closed).toMatchObject({
			action: "closed",
			pullRequest: { isAuthor: false },
		});
	});

	it("maps stars on repos", () => {
		const star = record(me, "sh.tangled.feed.star", "3hhh", {
			subject: { did: "did:plc:theirrepo" },
		});
		expect(events([theirRepo, star])[0]).toMatchObject({
			type: "star",
			repo: `${them}/core`,
		});
	});

	it("maps ref updates the account pushed, dated by their record key", () => {
		const zero = "0".repeat(40);
		const sha = "a".repeat(40);
		const update = (committerDid: string, oldSha: string, newSha: string) => ({
			// A TID made at 2024-11-06T05:49:11.612Z.
			uri: "at://did:plc:knot/sh.tangled.git.refUpdate/3lab2dvzbkc2a",
			value: {
				$type: "sh.tangled.git.refUpdate",
				committerDid,
				repo: "did:plc:myrepo",
				ref: "refs/heads/claude/fix",
				oldSha,
				newSha,
			},
		});

		const [created, pushed, deleted] = events([
			myRepo,
			update(me, zero, sha),
			update(me, sha, sha),
			update(me, sha, zero),
			update(them, sha, sha),
		]).slice(1);

		expect(created).toMatchObject({
			type: "create",
			repo: "me.tngl.sh/dotfiles",
			ref: { type: "branch", name: "claude/fix" },
		});
		expect(created?.at).toBe("2024-11-06T05:49:11.612Z");
		expect(pushed?.type).toBe("push");
		expect(deleted?.type).toBe("delete");
	});

	it("builds the account from the records", () => {
		const profile = record(me, "sh.tangled.actor.profile", "self", {
			description: "Hi",
		});
		const input = fromTangled({
			account,
			records: [myRepo, record(me, "sh.tangled.repo", "3iii", {}), profile],
		});

		expect(input.account).toMatchObject({
			login: "me.tngl.sh",
			id: me,
			createdAt: "2024-01-01T00:00:00Z",
			publicRepos: 2,
			bio: "Hi",
		});
		expect(input.events.map((e) => e.repo)).toEqual([
			"me.tngl.sh/dotfiles",
			"me.tngl.sh/3iii",
		]);
	});
});
