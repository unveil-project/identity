import { CONFIG } from "./config";
import type { EvidenceGroup, IdentifyFlag, ScoredGroup } from "./types";

export type ScoreOptions = {
	aiMultiplier?: number;
	bountyMultiplier?: number;
};

export type ScoreResult = {
	/** Total penalty points across all evidence groups. */
	total: number;
	/** Per-group breakdown, ordered by contribution descending. */
	groups: ScoredGroup[];
	/** Input flags with `effectivePoints` populated. */
	flags: IdentifyFlag[];
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
	flags: readonly IdentifyFlag[],
	{ aiMultiplier = 1, bountyMultiplier = 1 }: ScoreOptions = {},
): ScoreResult {
	const scored: IdentifyFlag[] = flags.map((flag) => ({
		...flag,
		effectivePoints: flag.amplifiable
			? Math.round(flag.points * aiMultiplier * bountyMultiplier)
			: flag.points,
	}));

	const byGroup = new Map<EvidenceGroup, IdentifyFlag[]>();
	for (const flag of scored) {
		const existing = byGroup.get(flag.group);
		if (existing) {
			existing.push(flag);
		} else {
			byGroup.set(flag.group, [flag]);
		}
	}

	const groups: ScoredGroup[] = [];
	let total = 0;

	for (const [group, groupFlags] of byGroup) {
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

	return { total, groups, flags: scored };
}
