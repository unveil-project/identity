import { CONFIG } from "../config";
import type { IdentifyFlag } from "../types";

export function detectAccountAge(accountAge: number): IdentifyFlag[] {
	const flags: IdentifyFlag[] = [];

	if (accountAge < CONFIG.AGE_NEW_ACCOUNT) {
		flags.push({
			label: "Recently created",
			points: CONFIG.POINTS_NEW_ACCOUNT,
			detail: `Account is ${accountAge} days old`,
		});
	} else if (accountAge < CONFIG.AGE_YOUNG_ACCOUNT) {
		flags.push({
			label: "Young account",
			points: CONFIG.POINTS_YOUNG_ACCOUNT,
			detail: `Account is ${accountAge} days old`,
		});
	}

	return flags;
}
