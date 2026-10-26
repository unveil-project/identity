import { describe, expect, it } from "vitest";
import { classify } from "../src/classify";
import { fromGitHub } from "../src/providers/github";
import { describeFlag, report } from "../src/report";
import {
	describeSpikeDays,
	formatShortSpan,
	formatWindowDuration,
} from "../src/report/format";
import type { Flag } from "../src/types";
import { event, user } from "./utils/events";

// 12 forks in a day on a 10 day old account, and nothing else.
function forkingAccount() {
	const events = Array.from({ length: 12 }, (_, i) =>
		event(
			"ForkEvent",
			new Date(Date.UTC(2026, 0, 1, i)).toISOString(),
			`owner${i}/repo${i}`,
		),
	);
	const created = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

	return fromGitHub({ user: user({ created_at: created.toISOString() }), events });
}

describe("classify", () => {
	it("returns only the classification", () => {
		const result = classify(forkingAccount());

		expect(Object.keys(result).sort()).toEqual([
			"classification",
			"confidence",
			"isBountyHunter",
			"isGitHubApp",
			"score",
		]);
	});
});

describe("report", () => {
	it("adds a label, detail and data to every flag", () => {
		const { flags } = report(forkingAccount());

		expect(flags.map((f) => f.label)).toEqual([
			"Recently created",
			"Narrow activity focus",
			"Fork spike detected",
		]);
		expect(flags[2]).toMatchObject({
			id: "fork-spike",
			facts: { forks: 12, totalForks: 12 },
			detail: "Burst of 12 fork events in a single 24-hour window",
			data: [
				{ label: "Forks in 24h window", value: 12, threshold: 8 },
				{ label: "Total forks observed", value: 12 },
			],
		});
	});

	it("gives the same classification as classify", () => {
		const input = forkingAccount();

		expect(report(input)).toMatchObject(classify(input));
	});

	it("keeps the original event on every flag event", () => {
		const input = forkingAccount();
		const { flags } = report(input);

		for (const flag of flags) {
			for (const e of flag.events) {
				expect(input.events).toContain(e);
			}
		}
	});

	it("uses the threshold the check used, not a fixed one", () => {
		const flag: Flag = {
			id: "rapid-prs",
			points: 40,
			group: "branch-pr",
			facts: { prs: 7, minPRs: 6, repo: "a/b", maxGapSeconds: 30 },
			events: [],
		};

		expect(describeFlag(flag).data[0]).toEqual({
			label: "Rapid PRs to same repo",
			value: 7,
			threshold: 6,
		});
	});
});

describe("format", () => {
	it("describes how long a window lasted", () => {
		expect(formatWindowDuration(0.4)).toBe("under a minute");
		expect(formatWindowDuration(1)).toBe("1 minute");
		expect(formatWindowDuration(38)).toBe("38 minutes");
		expect(formatWindowDuration(90)).toBe("2 hours");
	});

	it("gives a short span in days, or hours under a day", () => {
		expect(formatShortSpan(3, 4400)).toBe("3d");
		expect(formatShortSpan(0, 10)).toBe("1h");
		expect(formatShortSpan(0, 130)).toBe("3h");
	});

	it("lists spike days", () => {
		expect(describeSpikeDays([])).toBe("");
		expect(describeSpikeDays([14])).toBe(
			", with a spike of 14 closures on one day",
		);
		expect(describeSpikeDays([14, 12, 10])).toBe(
			", with spike days of 14, 12 and 10 closures each",
		);
	});
});
