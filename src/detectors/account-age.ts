import { CONFIG } from "../config";
import type { Flag } from "../types";

export function detectAccountAge(accountAge: number): Flag[] {
	if (accountAge < CONFIG.AGE_NEW_ACCOUNT) {
		return [
			{
				id: "new-account",
				points: CONFIG.POINTS_NEW_ACCOUNT,
				group: "account-age",
				facts: { ageDays: accountAge },
				events: [],
			},
		];
	}

	if (accountAge < CONFIG.AGE_YOUNG_ACCOUNT) {
		return [
			{
				id: "young-account",
				points: CONFIG.POINTS_YOUNG_ACCOUNT,
				group: "account-age",
				facts: { ageDays: accountAge },
				events: [],
			},
		];
	}

	return [];
}
