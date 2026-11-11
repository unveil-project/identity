import { CONFIG } from "../config";
import { eventTime } from "../events";
import { spanMinutes } from "../time";
import type { ActivityEvent, Flag } from "../types";
import {
	densestDistinctWindow,
	levelFor,
	type RampAnchor,
	rampPoints,
} from "../utils";

const ISSUE_COMMENT_LEVELS = [
	{ min: CONFIG.ISSUE_COMMENT_SPRAY_HIGH, id: "issue-comment-spray-high" },
	{
		min: CONFIG.ISSUE_COMMENT_SPRAY_EXTREME,
		id: "issue-comment-spray-extreme",
	},
] as const;

const ISSUE_COMMENT_RAMP: readonly RampAnchor[] = [
	[CONFIG.ISSUE_COMMENT_SPRAY_HIGH, CONFIG.POINTS_ISSUE_COMMENT_SPRAY_HIGH],
	[
		CONFIG.ISSUE_COMMENT_SPRAY_EXTREME,
		CONFIG.POINTS_ISSUE_COMMENT_SPRAY_EXTREME,
	],
];

const PR_COMMENT_LEVELS = [
	{ min: CONFIG.PR_COMMENT_SPRAY_HIGH, id: "pr-comment-spray-high" },
	{ min: CONFIG.PR_COMMENT_SPRAY_EXTREME, id: "pr-comment-spray-extreme" },
] as const;

const PR_COMMENT_RAMP: readonly RampAnchor[] = [
	[CONFIG.PR_COMMENT_SPRAY_HIGH, CONFIG.POINTS_PR_COMMENT_SPRAY_HIGH],
	[CONFIG.PR_COMMENT_SPRAY_EXTREME, CONFIG.POINTS_PR_COMMENT_SPRAY_EXTREME],
];

type CommentBurst = {
	/** Comments in the busiest window. */
	comments: ActivityEvent[];
	/** How many different repos (or PRs) those comments went to. */
	targets: number;
	/** Minutes between the first and the last comment in the window. */
	minutes: number;
};

/**
 * The few minutes where the comments reached the most different targets. A
 * person can write many comments in one thread quickly; writing to many
 * different threads within a couple of minutes is what spam bots do.
 */
function busiestCommentBurst(
	comments: ActivityEvent[],
	targetOf: (comment: ActivityEvent) => string,
	windowMinutes: number,
): CommentBurst {
	const window = densestDistinctWindow(
		comments,
		eventTime,
		targetOf,
		windowMinutes / 60,
	);

	return {
		comments: window.items,
		targets: window.distinct,
		minutes: spanMinutes(window.items.map(eventTime)),
	};
}

/** Review comments on different PRs of the same repo are different targets. */
function pullRequestOf(comment: ActivityEvent): string {
	const number = comment.pullRequest?.number;
	if (number) {
		return `${comment.repo}#${number}`;
	}

	return comment.repo;
}

function detectIssueCommentSpray(events: ActivityEvent[]): Flag[] {
	const comments = events.filter((event) => event.type === "issue-comment");
	if (comments.length < CONFIG.ISSUE_COMMENT_MIN_FOR_SPRAY) {
		return [];
	}

	const burst = busiestCommentBurst(
		comments,
		(comment) => comment.repo,
		CONFIG.ISSUE_COMMENT_SPAM_WINDOW_MINUTES,
	);
	const level = levelFor(burst.targets, ISSUE_COMMENT_LEVELS);
	if (!level) {
		return [];
	}

	return [
		{
			id: level.id,
			points: rampPoints(burst.targets, ISSUE_COMMENT_RAMP),
			group: "comment-volume",
			amplifiable: true,
			facts: {
				comments: burst.comments.length,
				repos: burst.targets,
				windowMinutes: burst.minutes,
			},
			events: burst.comments,
		},
	];
}

function detectPRCommentSpray(events: ActivityEvent[]): Flag[] {
	const comments = events.filter((event) => event.type === "review-comment");
	if (comments.length < CONFIG.PR_COMMENT_MIN_FOR_SPRAY) {
		return [];
	}

	const burst = busiestCommentBurst(
		comments,
		pullRequestOf,
		CONFIG.PR_COMMENT_SPAM_WINDOW_MINUTES,
	);
	const level = levelFor(burst.targets, PR_COMMENT_LEVELS);
	if (!level) {
		return [];
	}

	return [
		{
			id: level.id,
			points: rampPoints(burst.targets, PR_COMMENT_RAMP),
			group: "pr-comment-volume",
			amplifiable: true,
			facts: {
				comments: burst.comments.length,
				prs: burst.targets,
				windowMinutes: burst.minutes,
			},
			events: burst.comments,
		},
	];
}

export function detectCommentSpam(events: ActivityEvent[]): Flag[] {
	if (events.length < CONFIG.MIN_EVENTS_FOR_ANALYSIS) {
		return [];
	}

	return [...detectIssueCommentSpray(events), ...detectPRCommentSpray(events)];
}
