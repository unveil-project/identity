import { describe, expect, it } from "vitest";
import { explain, explainFlag } from "../src/explain";
import {
	describeSpikeDays,
	formatShortSpan,
	formatWindowDuration,
} from "../src/explain/format";
import { identify } from "../src/identify";
import { fromGitHub } from "../src/providers/github";
import type { IdentifyFlag } from "../src/types";
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

	return identify(
		fromGitHub({ user: user({ created_at: created.toISOString() }), events }),
	);
}

describe("identify without explain", () => {
	it("gives flags an id and facts, but no text", () => {
		const result = forkingAccount();
		const spike = result.flags.find((f) => f.id === "fork-spike");

		expect(spike?.facts).toEqual({ forks: 12, totalForks: 12 });
		for (const flag of result.flags) {
			expect(flag).not.toHaveProperty("label");
			expect(flag).not.toHaveProperty("detail");
			expect(flag).not.toHaveProperty("data");
		}
	});
});

describe("explain", () => {
	it("adds a label, detail and data to every flag", () => {
		const result = forkingAccount();
		const explained = explain(result);

		expect(explained.flags.map((f) => f.label)).toEqual([
			"Recently created",
			"Narrow activity focus",
			"Fork spike detected",
		]);
		expect(explained.flags[2]).toMatchObject({
			detail: "Burst of 12 fork events in a single 24-hour window",
			data: [
				{ label: "Forks in 24h window", value: 12, threshold: 8 },
				{ label: "Total forks observed", value: 12 },
			],
		});
	});

	it("keeps everything else as it was", () => {
		const result = forkingAccount();
		const explained = explain(result);

		expect(explained.score).toBe(result.score);
		expect(explained.classification).toBe(result.classification);
		explained.flags.forEach((flag, i) => {
			expect(flag).toMatchObject(result.flags[i] as object);
			// Same event objects, so `source` still points at the GitHub event.
			expect(flag.events).toBe(result.flags[i]?.events);
		});
	});

	it("uses the threshold the check used, not a fixed one", () => {
		const flag: IdentifyFlag = {
			id: "rapid-prs",
			points: 40,
			group: "branch-pr",
			facts: { prs: 7, minPRs: 6, repo: "a/b", maxGapSeconds: 30 },
			events: [],
		};

		expect(explainFlag(flag).data[0]).toEqual({
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
