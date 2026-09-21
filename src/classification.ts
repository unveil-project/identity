import type { IdentityClassification } from "./types.ts";

export function getClassificationDetails(
	classification: IdentityClassification | undefined,
) {
	if (!classification) {
		return {
			label: "Analysis unavailable",
			description: "Classification is not available for this account.",
		};
	}

	if (classification === "insufficient-data") {
		return {
			label: "Insufficient data",
			description: "Not enough activity yet to make a reliable assessment.",
		};
	}

	if (classification === "organic") {
		return {
			label: "Organic activity",
			description: "No automation signals detected in the analyzed events.",
		};
	}

	if (classification === "mixed") {
		return {
			label: "Mixed activity",
			description:
				"Activity patterns show a mix of organic and automated signals.",
		};
	}

	return {
		label: "Automation signals",
		description: "Activity patterns show signs of automation.",
	};
}
