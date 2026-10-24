import type {
	IdentifyCommit,
	IdentifyEvent,
	IdentifyEventType,
	IdentifyInput,
} from "./types";

/** GitHub never gives more events than this, and only goes back about 90 days. */
export const GITHUB_EVENT_CAP = 300;

/**
 * The parts of GET /users/{username} we read. Pass the whole response if you
 * have it: any other field is ignored.
 */
export type GitHubUser = {
	login: string;
	created_at: string;
	public_repos: number;
	/** GitHub sends `"Bot"` for GitHub App accounts. */
	type?: string | null;
	id?: number;
	name?: string | null;
	bio?: string | null;
	avatar_url?: string;
	html_url?: string;
	followers?: number;
	following?: number;
};

/**
 * The parts of a GET /users/{username}/events/public item we read. Pass the
 * whole event if you have it: any other field is ignored.
 */
export type GitHubEvent = {
	type: string | null;
	created_at: string | null;
	repo?: { name?: string };
	/** GitHub sends `type: "Bot"` here for GitHub App actors. */
	actor?: { login?: string; type?: string | null };
	payload?: {
		action?: string;
		ref_type?: string | null;
		ref?: string | null;
		issue?: { title?: string };
		pull_request?: {
			number?: number;
			head?: { repo?: { url?: string } | null };
		};
	};
};

export type GitHubCommit = IdentifyCommit;

export type GitHubInput = {
	user: GitHubUser;
	events: GitHubEvent[];
	commits?: GitHubCommit[];
};

const TYPES: Record<string, IdentifyEventType> = {
	PushEvent: "push",
	CreateEvent: "create",
	DeleteEvent: "delete",
	ForkEvent: "fork",
	WatchEvent: "star",
	IssuesEvent: "issue",
	IssueCommentEvent: "issue-comment",
	PullRequestEvent: "pull-request",
	PullRequestReviewEvent: "review",
	PullRequestReviewCommentEvent: "review-comment",
	PullRequestReviewThreadEvent: "review-thread",
	CommitCommentEvent: "commit-comment",
	ReleaseEvent: "release",
	MemberEvent: "member",
	PublicEvent: "public",
	GollumEvent: "wiki",
	DiscussionEvent: "discussion",
	SponsorshipEvent: "sponsorship",
};

function isBotType(type: string | null | undefined): boolean {
	return typeof type === "string" && type.toLowerCase() === "bot";
}

/** Turn one GitHub event into the shape `identify` reads. */
export function fromGitHubEvent(
	event: GitHubEvent,
	login: string,
): IdentifyEvent<GitHubEvent> {
	const type = event.type ?? "";
	const payload = event.payload;
	const pr = payload?.pull_request;

	// GitHub only tells us who submitted a PR through the repo its head branch
	// lives in. If that repo belongs to the account, the account submitted it.
	const headUrl = pr?.head?.repo?.url?.toLowerCase() ?? "";
	const isAuthor = headUrl.includes(`/repos/${login.toLowerCase()}/`);

	return {
		type: Object.hasOwn(TYPES, type) ? TYPES[type] : type,
		at: event.created_at ?? "",
		repo: event.repo?.name ?? "",
		action: payload?.action,
		ref: payload?.ref_type
			? { type: payload.ref_type, name: payload.ref ?? undefined }
			: undefined,
		issue: payload?.issue ? { title: payload.issue.title } : undefined,
		pullRequest: pr ? { number: pr.number, isAuthor } : undefined,
		actorIsApp: isBotType(event.actor?.type),
		source: event,
	};
}

/**
 * Turn GitHub API responses into the input `identify` takes.
 *
 * @example
 * identify(fromGitHub({ user, events }));
 */
export function fromGitHub({
	user,
	events,
	commits,
}: GitHubInput): IdentifyInput<GitHubEvent> {
	return {
		account: {
			login: user.login,
			createdAt: user.created_at,
			publicRepos: user.public_repos,
			isApp: isBotType(user.type),
			id: user.id === undefined ? undefined : String(user.id),
			name: user.name,
			bio: user.bio,
			avatarUrl: user.avatar_url,
			url: user.html_url,
			followers: user.followers,
			following: user.following,
		},
		events: events.map((event) => fromGitHubEvent(event, user.login)),
		commits,
		eventCap: GITHUB_EVENT_CAP,
	};
}

/**
 * True when GitHub says the account is a GitHub App: `type: "Bot"` on the user,
 * or on the actor of any of its events.
 */
export function isGitHubAppAccount(
	user: Pick<GitHubUser, "type">,
	events: readonly GitHubEvent[] = [],
): boolean {
	return (
		isBotType(user.type) || events.some((event) => isBotType(event.actor?.type))
	);
}
