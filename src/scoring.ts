import { CONFIG } from "./config";
import type { Flag, ScoredGroup } from "./types";
import { groupBy } from "./utils";

export type ScoreOptions = {
	bountyMultiplier?: number;
};

export type ScoreResult = {
	/** Total penalty points across all evidence groups. */
	total: number;
	/** Per-group breakdown, ordered by contribution descending. */
	groups: ScoredGroup[];
	/** Input flags with `effectivePoints` populated. */
	flags: Flag[];
};

/**
 * Add up the points from all flags.
 *
 * Flags in the same group are about the same behaviour, so we do not add them
 * all up. Only the biggest one counts fully. The other ones count less, by
 * CONFIG.EXTRA_FLAG_WEIGHT. Flags in different groups are about different
 * things, so those we do add up.
 */
export function scoreFlags(
	flags: readonly Flag[],
	{ bountyMultiplier = 1 }: ScoreOptions = {},
): ScoreResult {
	const scored: Flag[] = flags.map((flag) => ({
		...flag,
		effectivePoints: flag.amplifiable
			? Math.round(flag.points * bountyMultiplier)
			: flag.points,
	}));

	const groups: ScoredGroup[] = [];
	let total = 0;

	for (const [group, groupFlags] of groupBy(scored, (flag) => flag.group)) {
		const points = groupFlags.map((flag) => flag.effectivePoints ?? 0);
		const rawPoints = points.reduce((sum, value) => sum + value, 0);
		const strongest = points.reduce((max, value) => Math.max(max, value), 0);
		const extraFlags = rawPoints - strongest;
		const groupPoints = Math.round(
			strongest + extraFlags * CONFIG.EXTRA_FLAG_WEIGHT,
		);

		groups.push({
			group,
			flagCount: groupFlags.length,
			rawPoints,
			points: groupPoints,
		});

		total += groupPoints;
	}

	groups.sort((a, b) => b.points - a.points);

	return {
		total,
		groups,
		flags: scored,
	};
}

/**
 * Turn the flags' penalty and the organic bonus into the score, from 100
 * (human) to 0 (automation).
 *
 * Signs of a real person, like merged PRs, can make up for weak flags, so the
 * bonus counts in full while the flags alone keep the account out of
 * automation. Past that point the flags are strong evidence, and bots get PRs
 * merged too, so the bonus fades until it is gone at a penalty of 100. A good
 * sign can soften the result, but never pull an account the flags call
 * automation back to looking human.
 */
export function humanScore(penalty: number, organicBonus: number): number {
	const fadeStart = 100 - CONFIG.THRESHOLD_SUSPICIOUS;
	const fadeProgress = (penalty - fadeStart) / (100 - fadeStart);
	const bonusWeight = Math.min(1, Math.max(0, 1 - fadeProgress));
	const bonus = Math.round(organicBonus * bonusWeight);

	return Math.min(100, Math.max(0, 100 - penalty + bonus));
}
