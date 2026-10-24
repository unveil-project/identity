import type {
	IdentifyCommit,
	IdentifyEvent,
	IdentifyEventType,
	IdentifyInput,
} from "../types";

/**
 * The parts of GET /users/:id we read. Pass the whole response if you have
 * it: any other field is ignored.
 */
export type GitLabUser = {
	username: string;
	created_at: string;
	/** GitLab sets this for bot users, like project access tokens. */
	bot?: boolean;
	id?: number;
	name?: string | null;
	bio?: string | null;
	avatar_url?: string | null;
	web_url?: string;
	followers?: number;
	following?: number;
};

/**
 * The parts of a GET /users/:id/events item we read. Pass the whole event if
 * you have it: any other field is ignored.
 */
export type GitLabEvent = {
	action_name: string;
	created_at: string;
	project_id?: number | null;
	target_type?: string | null;
	target_iid?: number | null;
	target_title?: string | null;
	push_data?: {
		/** `"pushed"`, `"created"` or `"removed"`. */
		action?: string;
		/** `"branch"` or `"tag"`. */
		ref_type?: string | null;
		ref?: string | null;
	} | null;
	note?: {
		noteable_type?: string | null;
		noteable_iid?: number | null;
	} | null;
};

/** The parts of a GitLab project we read, to name the repo of an event. */
export type GitLabProject = {
	id: number;
	path_with_namespace: string;
};

export type GitLabCommit = IdentifyCommit;

export type GitLabInput = {
	user: GitLabUser;
	events: GitLabEvent[];
	/**
	 * How many public projects the user has. GitLab's user has no count: read
	 * the `X-Total` header of GET /users/:id/projects.
	 */
	publicRepos: number;
	/**
	 * The projects the events happened in. GitLab events only carry a
	 * `project_id`, so without these every repo is named by its id, and the
	 * checks can not tell the user's own projects from other people's.
	 */
	projects?: GitLabProject[];
	commits?: GitLabCommit[];
};

const TARGET_TYPES: Record<string, IdentifyEventType> = {
	Issue: "issue",
	WorkItem: "issue",
	MergeRequest: "pull-request",
	Milestone: "milestone",
	Snippet: "snippet",
	"WikiPage::Meta": "wiki",
	"DesignManagement::Design": "design",
};

const ACTIONS: Record<string, string> = {
	opened: "opened",
	closed: "closed",
	// GitLab calls a merged merge request "accepted".
	accepted: "merged",
	approved: "approved",
	"commented on": "created",
	joined: "joined",
	left: "left",
};

const NOTE_TYPES = new Set(["Note", "DiffNote", "DiscussionNote"]);

function typeOf(event: GitLabEvent): IdentifyEventType {
	const target = event.target_type ?? "";
	const push = event.push_data;

	if (push) {
		if (push.action === "created") {
			return "create";
		}

		return push.action === "removed" ? "delete" : "push";
	}

	if (NOTE_TYPES.has(target)) {
		const noteable = event.note?.noteable_type;
		if (noteable === "Commit") {
			return "commit-comment";
		}
		// Only diff notes sit on the code. Other notes on a merge request are
		// the conversation, like GitHub's issue comments on a PR.
		return noteable === "MergeRequest" && target === "DiffNote"
			? "review-comment"
			: "issue-comment";
	}

	if (target === "MergeRequest" && event.action_name === "approved") {
		return "review";
	}

	if (Object.hasOwn(TARGET_TYPES, target)) {
		return TARGET_TYPES[target];
	}

	if (!target) {
		if (event.action_name === "created" || event.action_name === "imported") {
			return "create";
		}
		if (event.action_name === "joined" || event.action_name === "left") {
			return "member";
		}
	}

	return target || event.action_name;
}

/**
 * Turn one GitLab event into the shape `identify` reads. `projects` maps a
 * project id to its `namespace/path`.
 */
export function fromGitLabEvent(
	event: GitLabEvent,
	projects: ReadonlyMap<number, string> = new Map(),
): IdentifyEvent<GitLabEvent> {
	const type = typeOf(event);
	const push = event.push_data;
	const projectId = event.project_id;
	const target = event.target_type ?? "";

	let ref: IdentifyEvent["ref"];
	if (push && type !== "push") {
		ref = { type: push.ref_type ?? undefined, name: push.ref ?? undefined };
	} else if (type === "create") {
		ref = { type: "repository" };
	}

	let pullRequest: IdentifyEvent["pullRequest"];
	if (target === "MergeRequest") {
		// The event's author is whoever acted. Only opening a merge request
		// tells us they wrote it.
		pullRequest = {
			number: event.target_iid ?? undefined,
			isAuthor: event.action_name === "opened" ? true : undefined,
		};
	} else if (event.note?.noteable_type === "MergeRequest") {
		pullRequest = { number: event.note.noteable_iid ?? undefined };
	}

	const isIssue = target === "Issue" || target === "WorkItem";

	return {
		type,
		at: event.created_at,
		repo:
			projectId == null ? "" : (projects.get(projectId) ?? String(projectId)),
		action: Object.hasOwn(ACTIONS, event.action_name)
			? ACTIONS[event.action_name]
			: event.action_name,
		ref,
		issue: isIssue ? { title: event.target_title ?? undefined } : undefined,
		pullRequest,
		source: event,
	};
}

/**
 * Turn GitLab API responses into the input `identify` takes.
 *
 * @example
 * identify(fromGitLab({ user, events, projects, publicRepos: 12 }));
 */
export function fromGitLab({
	user,
	events,
	publicRepos,
	projects = [],
	commits,
}: GitLabInput): IdentifyInput<GitLabEvent> {
	const paths = new Map(
		projects.map((project) => [project.id, project.path_with_namespace]),
	);

	return {
		account: {
			login: user.username,
			createdAt: user.created_at,
			publicRepos,
			isApp: user.bot === true,
			id: user.id === undefined ? undefined : String(user.id),
			name: user.name,
			bio: user.bio,
			avatarUrl: user.avatar_url ?? undefined,
			url: user.web_url,
			followers: user.followers,
			following: user.following,
		},
		events: events.map((event) => fromGitLabEvent(event, paths)),
		commits,
	};
}
