import { CONFIG } from "../config";
import type { GitHubEvent, IdentifyFlag, WindowInfo } from "../types";

export type DormancyResult = {
	flags: IdentifyFlag[];
	/** True when the account's age is not backed by a matching activity history. */
	isDormantReactivation: boolean;
};

/**
 * Find old accounts that have no real history behind them.
 *
 * Old accounts can be bought, so an old creation date alone does not prove that
 * a real person has been using it. An account made years ago that only started
 * doing things recently is a warning sign, not a good sign.
 *
 * We only have the user and the last 90 days of events, so this is a careful
 * guess rather than a certainty: an old account with almost no repos, where
 * everything we can see happened in one short recent burst.
 */
export function detectDormancy(
	events: GitHubEvent[],
	accountAge: number,
	reposCount: number,
	window: WindowInfo,
): DormancyResult {
	const looksReactivated =
		accountAge >= CONFIG.DORMANCY_INFERRED_MIN_AGE_DAYS &&
		reposCount <= CONFIG.DORMANCY_INFERRED_MAX_REPOS &&
		window.eventCount >= CONFIG.MIN_EVENTS_FOR_ANALYSIS &&
		window.spanDays <= CONFIG.DORMANCY_INFERRED_MAX_SPAN_DAYS;

	if (!looksReactivated) {
		return { flags: [], isDormantReactivation: false };
	}

	return {
		isDormantReactivation: true,
		flags: [
			{
				label: "Activity inconsistent with account age",
				points: CONFIG.POINTS_DORMANT_REACTIVATION,
				group: "account-age",
				amplifiable: true,
				detail: `The account is ${accountAge} days old with ${reposCount} repositories, but all ${window.eventCount} events we can see happened in the space of ${window.spanDays.toFixed(1)} days`,
				data: [
					{
						label: "Account age (days)",
						value: accountAge,
						threshold: CONFIG.DORMANCY_INFERRED_MIN_AGE_DAYS,
					},
					{
						label: "Observed activity span (days)",
						value: parseFloat(window.spanDays.toFixed(1)),
						threshold: CONFIG.DORMANCY_INFERRED_MAX_SPAN_DAYS,
					},
					{
						label: "Public repos",
						value: reposCount,
						threshold: CONFIG.DORMANCY_INFERRED_MAX_REPOS,
					},
				],
				events,
			},
		],
	};
}
