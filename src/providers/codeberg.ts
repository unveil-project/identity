import type {
	IdentifyCommit,
	IdentifyEvent,
	IdentifyEventType,
	IdentifyInput,
} from "../types";

/**
 * The parts of GET /api/v1/users/{username} we read. Pass the whole response
 * if you have it: any other field is ignored. Any Forgejo or Gitea server
 * sends the same shape.
 */
export type CodebergUser = {
	login: string;
	created: string;
	id?: number;
	full_name?: string | null;
	description?: string | null;
	avatar_url?: string;
	html_url?: string;
	followers_count?: number;
	following_count?: number;
};

/**
 * The parts of a GET /api/v1/users/{username}/activities/feeds item we read.
 * Pass the whole activity if you have it: any other field is ignored.
 */
export type CodebergActivity = {
	op_type: string;
	created: string;
	act_user_id?: number;
	act_user?: { login?: string } | null;
	repo?: { full_name?: string; fork?: boolean } | null;
	/** A full ref, like `"refs/heads/main"`. */
	ref_name?: string | null;
	/**
	 * For issues and pull requests, the index and some text: `["12","Title"]`
	 * on Forgejo, `"12|Title"` on Gitea. For pushes, the commits as JSON.
	 */
	content?: string | null;
};

export type CodebergCommit = IdentifyCommit;

export type CodebergInput = {
	user: CodebergUser;
	/**
	 * The user's activity feed. Ask for it with `only-performed-by=true`:
	 * anything done by someone else is left out either way.
	 */
	events: CodebergActivity[];
	/**
	 * How many public repos the user has. The user has no count: read the
	 * `X-Total-Count` header of GET /api/v1/users/{username}/repos.
	 */
	publicRepos: number;
	commits?: CodebergCommit[];
};

const TYPES: Record<string, IdentifyEventType> = {
	create_repo: "create",
	star_repo: "star",
	watch_repo: "watch",
	commit_repo: "push",
	push_tag: "create",
	delete_tag: "delete",
	delete_branch: "delete",
	create_issue: "issue",
	close_issue: "issue",
	reopen_issue: "issue",
	comment_issue: "issue-comment",
	// Forgejo files both conversation and code comments on a pull request
	// under this. Most are conversation, which GitHub counts as issue comments.
	comment_pull: "issue-comment",
	create_pull_request: "pull-request",
	close_pull_request: "pull-request",
	reopen_pull_request: "pull-request",
	merge_pull_request: "pull-request",
	auto_merge_pull_request: "pull-request",
	approve_pull_request: "review",
	reject_pull_request: "review",
	publish_release: "release",
};

const ACTIONS: Record<string, string> = {
	create_issue: "opened",
	close_issue: "closed",
	reopen_issue: "reopened",
	comment_issue: "created",
	comment_pull: "created",
	create_pull_request: "opened",
	close_pull_request: "closed",
	reopen_pull_request: "reopened",
	merge_pull_request: "merged",
	auto_merge_pull_request: "merged",
	approve_pull_request: "approved",
	reject_pull_request: "changes_requested",
	publish_release: "published",
};

const ISSUE_OPS = new Set(["create_issue", "close_issue", "reopen_issue"]);

/** Read `["12","Title"]` (Forgejo) or `"12|Title"` (Gitea). */
function parseIssueContent(content: string | null | undefined): {
	index?: number;
	text?: string;
} {
	if (!content) {
		return {};
	}

	let parts: unknown[] = content.split("|");
	if (content.startsWith("[")) {
		try {
			const parsed: unknown = JSON.parse(content);
			if (Array.isArray(parsed)) {
				parts = parsed;
			}
		} catch {
			// Not JSON after all: keep the split.
		}
	}

	const index = Number.parseInt(String(parts[0]), 10);
	const text = parts.slice(1).join("|");

	return {
		index: Number.isNaN(index) ? undefined : index,
		text: text || undefined,
	};
}

function refOf(
	refName: string | null | undefined,
): { type: string; name: string } | undefined {
	if (!refName) {
		return undefined;
	}
	if (refName.startsWith("refs/tags/")) {
		return { type: "tag", name: refName.slice("refs/tags/".length) };
	}

	return {
		type: "branch",
		name: refName.startsWith("refs/heads/")
			? refName.slice("refs/heads/".length)
			: refName,
	};
}

function typeOf(activity: CodebergActivity): IdentifyEventType {
	const op = activity.op_type;

	// A new branch is a `commit_repo` with no commits in it.
	if (op === "commit_repo" && !activity.content) {
		return "create";
	}
	if (op === "create_repo" && activity.repo?.fork) {
		return "fork";
	}

	return Object.hasOwn(TYPES, op) ? TYPES[op] : op;
}

/** Turn one Codeberg activity into the shape `identify` reads. */
export function fromCodebergEvent(
	activity: CodebergActivity,
): IdentifyEvent<CodebergActivity> {
	const op = activity.op_type;
	const type = typeOf(activity);

	let ref: IdentifyEvent["ref"];
	if (op === "create_repo" && type === "create") {
		ref = { type: "repository" };
	} else if (type === "create" || type === "delete") {
		ref = refOf(activity.ref_name);
	}

	const isPull =
		type === "pull-request" || type === "review" || op === "comment_pull";
	const { index, text } =
		isPull || type === "issue" || type === "issue-comment"
			? parseIssueContent(activity.content)
			: {};

	return {
		type,
		at: activity.created,
		repo: activity.repo?.full_name ?? "",
		action: Object.hasOwn(ACTIONS, op) ? ACTIONS[op] : undefined,
		ref,
		issue: ISSUE_OPS.has(op) ? { title: text } : undefined,
		pullRequest: isPull
			? {
					number: index,
					// The feed only says who acted. Only opening a pull request
					// tells us they wrote it.
					isAuthor: op === "create_pull_request" ? true : undefined,
				}
			: undefined,
		source: activity,
	};
}

function isByUser(activity: CodebergActivity, user: CodebergUser): boolean {
	if (activity.act_user_id !== undefined && user.id !== undefined) {
		return activity.act_user_id === user.id;
	}
	const login = activity.act_user?.login;

	return (
		login === undefined || login.toLowerCase() === user.login.toLowerCase()
	);
}

/**
 * Turn Codeberg API responses into the input `identify` takes. Works for any
 * Forgejo or Gitea server.
 *
 * @example
 * identify(fromCodeberg({ user, events, publicRepos: 12 }));
 */
export function fromCodeberg({
	user,
	events,
	publicRepos,
	commits,
}: CodebergInput): IdentifyInput<CodebergActivity> {
	return {
		account: {
			login: user.login,
			createdAt: user.created,
			publicRepos,
			id: user.id === undefined ? undefined : String(user.id),
			// Forgejo sends an empty string when there is none.
			name: user.full_name || undefined,
			bio: user.description || undefined,
			avatarUrl: user.avatar_url,
			url: user.html_url,
			followers: user.followers_count,
			following: user.following_count,
		},
		events: events
			.filter((activity) => isByUser(activity, user))
			.map(fromCodebergEvent),
		commits,
	};
}
