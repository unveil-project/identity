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

const STAR_LEVELS = [
	{ min: CONFIG.WATCH_SPAM_REPOS_HIGH, id: "star-spray-high" },
	{ min: CONFIG.WATCH_SPAM_REPOS_EXTREME, id: "star-spray-extreme" },
] as const;

const WATCH_RAMP: readonly RampAnchor[] = [
	[CONFIG.WATCH_SPAM_REPOS_HIGH, CONFIG.POINTS_WATCH_SPAM_HIGH],
	[CONFIG.WATCH_SPAM_REPOS_EXTREME, CONFIG.POINTS_WATCH_SPAM_EXTREME],
];

/** Starring dozens of repositories in one day is how star farms work. */
export function detectWatchActivity(events: ActivityEvent[]): Flag[] {
	const stars = events.filter((event) => event.type === "star");

	if (stars.length < CONFIG.WATCH_SPAM_MIN_EVENTS) {
		return [];
	}

	const burst = densestDistinctWindow(
		stars,
		eventTime,
		(star) => star.repo,
		CONFIG.WATCH_SPAM_WINDOW_HOURS,
	);
	const level = levelFor(burst.distinct, STAR_LEVELS);
	if (!level) {
		return [];
	}

	return [
		{
			id: level.id,
			points: rampPoints(burst.distinct, WATCH_RAMP),
			group: "watch",
			amplifiable: true,
			facts: {
				repos: burst.distinct,
				windowMinutes: spanMinutes(burst.items.map(eventTime)),
				totalStars: stars.length,
			},
			events: burst.items,
		},
	];
}
