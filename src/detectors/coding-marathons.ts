import { CONFIG } from "../config";
import { longestDayStreak } from "../time";
import { localDay, localHour } from "../timezone";
import type { ActivityEvent, ActivityEventType, Flag } from "../types";
import { calculateNormalizedShannonsEntropy, countBy, groupBy } from "../utils";

const CODING_TYPES: ReadonlySet<ActivityEventType> = new Set([
	"push",
	"pull-request",
	"review",
	"review-comment",
]);

/**
 * Days, in the account's local time, with coding activity in at least
 * HOURS_PER_DAY_INHUMAN different hours, spread evenly over them. A person
 * working a long day still clusters their work in a few busy hours.
 */
function findMarathonDays(
	codingEvents: ActivityEvent[],
	tzOffsetHours: number,
): Set<string> {
	const eventsByDay = groupBy(codingEvents, (event) =>
		localDay(event.at, tzOffsetHours),
	);
	const marathonDays = new Set<string>();

	for (const [day, dayEvents] of eventsByDay) {
		if (!day) {
			continue;
		}

		const eventsPerHour = countBy(dayEvents, (event) =>
			localHour(event.at, tzOffsetHours),
		);
		const evenness = calculateNormalizedShannonsEntropy([
			...eventsPerHour.values(),
		]);

		if (
			eventsPerHour.size >= CONFIG.HOURS_PER_DAY_INHUMAN &&
			evenness > CONFIG.MARATHON_HOUR_EVENNESS_MIN
		) {
			marathonDays.add(day);
		}
	}

	return marathonDays;
}

/**
 * Coding around the clock for days. One marathon day can happen to anyone;
 * several in a row, or many in a few weeks, means nobody stopped to sleep.
 * Everyone needs sleep, so this applies to accounts of any age.
 */
export function detectCodingMarathons(
	events: ActivityEvent[],
	tzOffsetHours = 0,
): Flag[] {
	const codingEvents = events.filter((event) => CODING_TYPES.has(event.type));
	const marathonDays = findMarathonDays(codingEvents, tzOffsetHours);

	if (marathonDays.size < CONFIG.CONSECUTIVE_INHUMAN_DAYS_EXTREME) {
		return [];
	}

	const marathonEvents = codingEvents.filter((event) =>
		marathonDays.has(localDay(event.at, tzOffsetHours)),
	);

	const streak = longestDayStreak(marathonDays);
	if (streak && streak.length >= CONFIG.CONSECUTIVE_INHUMAN_DAYS_EXTREME) {
		return [
			{
				id: "coding-streak",
				points: CONFIG.POINTS_NONSTOP_ACTIVITY,
				group: "timing",
				amplifiable: true,
				facts: { streakDays: streak.length, uniformDays: marathonDays.size },
				events: marathonEvents,
			},
		];
	}

	if (marathonDays.size >= CONFIG.FREQUENT_MARATHON_DAYS) {
		return [
			{
				id: "coding-marathons",
				points: CONFIG.POINTS_FREQUENT_MARATHON,
				group: "timing",
				amplifiable: true,
				facts: { uniformDays: marathonDays.size },
				events: marathonEvents,
			},
		];
	}

	return [];
}
