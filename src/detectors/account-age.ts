import { CONFIG } from "../config";
import type { IdentifyFlag } from "../types";

export function detectAccountAge(accountAge: number): IdentifyFlag[] {
	const flags: IdentifyFlag[] = [];

	if (accountAge < CONFIG.AGE_NEW_ACCOUNT) {
		flags.push({
			id: "new-account",
			points: CONFIG.POINTS_NEW_ACCOUNT,
			group: "account-age",
			facts: { ageDays: accountAge },
			events: [],
		});
	} else if (accountAge < CONFIG.AGE_YOUNG_ACCOUNT) {
		flags.push({
			id: "young-account",
			points: CONFIG.POINTS_YOUNG_ACCOUNT,
			group: "account-age",
			facts: { ageDays: accountAge },
			events: [],
		});
	}

	return flags;
}
