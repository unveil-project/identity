import { CONFIG } from "../config";
import type { IdentifyFlag, IdentifyUser } from "../types";

/** Fields that show a real person put something on their profile. */
const IDENTITY_FIELDS = [
	"bio",
	"blog",
	"company",
	"location",
	"email",
	"twitter_username",
] as const;

/**
 * Checks based on the user's profile.
 *
 * A check is skipped when the field it needs is missing from the user object.
 * A caller passing a small user built from their own database only gets the
 * checks their data can support, and nobody loses points for data we do not
 * have.
 */
export function detectProfileSignals(
	user: IdentifyUser,
	accountAge: number,
): IdentifyFlag[] {
	const flags: IdentifyFlag[] = [];
	const { followers, following } = user;

	// Following people is free. Getting people to follow you is not.
	if (
		typeof followers === "number" &&
		typeof following === "number" &&
		following > CONFIG.FOLLOW_RATIO_FOLLOWING_MIN &&
		followers < CONFIG.FOLLOW_RATIO_FOLLOWERS_MAX
	) {
		flags.push({
			label: "Unreciprocated follow pattern",
			points: CONFIG.POINTS_FOLLOW_RATIO,
			group: "profile",
			amplifiable: true,
			detail: `Following ${following} accounts but followed by only ${followers}`,
			data: [
				{
					label: "Following",
					value: following,
					threshold: CONFIG.FOLLOW_RATIO_FOLLOWING_MIN,
				},
				{
					label: "Followers",
					value: followers,
					threshold: CONFIG.FOLLOW_RATIO_FOLLOWERS_MAX,
				},
			],
			events: [],
		});
	} else if (
		followers === 0 &&
		accountAge >= CONFIG.ZERO_FOLLOWERS_MIN_AGE_DAYS
	) {
		flags.push({
			label: "No followers",
			points: CONFIG.POINTS_ZERO_FOLLOWERS,
			group: "profile",
			amplifiable: true,
			detail: `No followers after ${accountAge} days`,
			data: [
				{ label: "Followers", value: 0 },
				{
					label: "Account age (days)",
					value: accountAge,
					threshold: CONFIG.ZERO_FOLLOWERS_MIN_AGE_DAYS,
				},
			],
			events: [],
		});
	}

	// A missing key means "we did not fetch the profile", which is not the same
	// as "the profile is empty". Only check the fields we were actually given.
	const providedFields = IDENTITY_FIELDS.filter((field) => field in user);

	if (providedFields.length > 0) {
		const filledFields = providedFields.filter((field) => {
			const value = user[field];
			return typeof value === "string" && value.trim().length > 0;
		});

		if (filledFields.length === 0) {
			flags.push({
				label: "No profile identity",
				points: CONFIG.POINTS_NO_IDENTITY,
				group: "profile",
				amplifiable: true,
				detail:
					"No bio, blog, company, location, email or linked social account",
				data: [
					{ label: "Profile fields checked", value: providedFields.length },
					{ label: "Profile fields filled in", value: 0 },
				],
				events: [],
			});
		}
	}

	return flags;
}
