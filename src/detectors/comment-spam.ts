import dayjs from "dayjs";
import { CONFIG } from "../config";
import type { GitHubEvent, IdentifyFlag } from "../types";

export function detectCommentSpam(events: GitHubEvent[]): IdentifyFlag[] {
	const flags: IdentifyFlag[] = [];

	if (events.length < CONFIG.MIN_EVENTS_FOR_ANALYSIS) {
		return flags;
	}

	// Issue comment frequency detection (multiple comments across different repos in short time)
	const issueCommentEvents = events.filter(
		(e) => e.type === "IssueCommentEvent",
	);

	if (issueCommentEvents.length >= CONFIG.ISSUE_COMMENT_MIN_FOR_SPRAY) {
		// Sort by timestamp
		const commentTimestamps = issueCommentEvents
			.map((e) => ({ event: e, time: dayjs(e.created_at) }))
			.sort((a, b) => a.time.valueOf() - b.time.valueOf());

		// Find the densest window of activity
		let maxDistinctReposInWindow = 0;
		let maxReposWindowStartIdx = 0;
		let maxReposWindowEndIdx = 0;
		let windowStartIdx = 0;
		const windowMinutes = CONFIG.ISSUE_COMMENT_SPAM_WINDOW_MINUTES;

		for (
			let windowEndIdx = 0;
			windowEndIdx < commentTimestamps.length;
			windowEndIdx++
		) {
			const windowEnd = commentTimestamps[windowEndIdx]?.time;

			// Slide window start forward until within the time window
			while (
				commentTimestamps[windowStartIdx] &&
				windowEnd &&
				windowEnd.diff(commentTimestamps[windowStartIdx].time, "minute", true) >
					windowMinutes
			) {
				windowStartIdx++;
			}

			// Count distinct repos in this time window
			const reposInWindow = new Set(
				commentTimestamps
					.slice(windowStartIdx, windowEndIdx + 1)
					.map((item) => item.event.repo?.name)
					.filter((name) => name !== undefined),
			);

			if (reposInWindow.size > maxDistinctReposInWindow) {
				maxDistinctReposInWindow = reposInWindow.size;
				maxReposWindowStartIdx = windowStartIdx;
				maxReposWindowEndIdx = windowEndIdx;
			}
		}

		// Flag if comments are being sprayed across many repos
		if (maxDistinctReposInWindow >= CONFIG.ISSUE_COMMENT_SPRAY_EXTREME) {
			const windowStart = commentTimestamps[maxReposWindowStartIdx]?.time;
			const windowEnd = commentTimestamps[maxReposWindowEndIdx]?.time;
			const commentsInWindow =
				maxReposWindowEndIdx - maxReposWindowStartIdx + 1;
			const timeSpanMinutes =
				windowEnd && windowStart
					? Math.round(windowEnd.diff(windowStart, "minute", true))
					: 0;
			const windowEvents = commentTimestamps
				.slice(maxReposWindowStartIdx, maxReposWindowEndIdx + 1)
				.map((item) => item.event);
			flags.push({
				label: "Rapid comments across repositories",
				points: CONFIG.POINTS_ISSUE_COMMENT_SPRAY_EXTREME,
				amplifiable: true,
				detail: `${commentsInWindow} comments to ${maxDistinctReposInWindow} different repos in ${timeSpanMinutes} minute${timeSpanMinutes === 1 ? "" : "s"}`,
				data: [
					{
						label: "Comments in window",
						value: commentsInWindow,
						threshold: CONFIG.ISSUE_COMMENT_SPRAY_EXTREME,
					},
					{ label: "Distinct repos", value: maxDistinctReposInWindow },
					{ label: "Window duration (min)", value: timeSpanMinutes },
				],
				events: windowEvents,
			});
		} else if (maxDistinctReposInWindow >= CONFIG.ISSUE_COMMENT_SPRAY_HIGH) {
			const windowStart = commentTimestamps[maxReposWindowStartIdx]?.time;
			const windowEnd = commentTimestamps[maxReposWindowEndIdx]?.time;
			const commentsInWindow =
				maxReposWindowEndIdx - maxReposWindowStartIdx + 1;
			const timeSpanMinutes =
				windowEnd && windowStart
					? Math.round(windowEnd.diff(windowStart, "minute", true))
					: 0;
			const windowEvents = commentTimestamps
				.slice(maxReposWindowStartIdx, maxReposWindowEndIdx + 1)
				.map((item) => item.event);
			flags.push({
				label: "High comment frequency across repos",
				points: CONFIG.POINTS_ISSUE_COMMENT_SPRAY_HIGH,
				amplifiable: true,
				detail: `${commentsInWindow} comments to ${maxDistinctReposInWindow} different repos in ${timeSpanMinutes} minute${timeSpanMinutes === 1 ? "" : "s"}`,
				data: [
					{
						label: "Comments in window",
						value: commentsInWindow,
						threshold: CONFIG.ISSUE_COMMENT_SPRAY_HIGH,
					},
					{ label: "Distinct repos", value: maxDistinctReposInWindow },
					{ label: "Window duration (min)", value: timeSpanMinutes },
				],
				events: windowEvents,
			});
		}
	}

	// PR comment frequency detection (multiple review comments across different PRs/repos in short time)
	const prCommentEvents = events.filter(
		(e) => e.type === "PullRequestReviewCommentEvent",
	);

	if (prCommentEvents.length >= CONFIG.PR_COMMENT_MIN_FOR_SPRAY) {
		// Sort by timestamp
		const prCommentTimestamps = prCommentEvents
			.map((e) => ({ event: e, time: dayjs(e.created_at) }))
			.sort((a, b) => a.time.valueOf() - b.time.valueOf());

		// Find the densest window of PR comment activity
		let maxDistinctPRsInWindow = 0;
		let maxPRsWindowStartIdx = 0;
		let maxPRsWindowEndIdx = 0;
		let windowStartIdx = 0;
		const windowMinutes = CONFIG.PR_COMMENT_SPAM_WINDOW_MINUTES;

		for (
			let windowEndIdx = 0;
			windowEndIdx < prCommentTimestamps.length;
			windowEndIdx++
		) {
			const windowEnd = prCommentTimestamps[windowEndIdx]?.time;

			// Slide window start forward until within the time window
			while (
				prCommentTimestamps[windowStartIdx] &&
				windowEnd &&
				windowEnd.diff(
					prCommentTimestamps[windowStartIdx].time,
					"minute",
					true,
				) > windowMinutes
			) {
				windowStartIdx++;
			}

			// Count distinct PRs (identified by repo + pull request number combination)
			const prsInWindow = new Set(
				prCommentTimestamps
					.slice(windowStartIdx, windowEndIdx + 1)
					.map((item) => {
						const repoName = item.event.repo?.name;
						const prNumber = item.event.payload?.pull_request?.number;

						if (repoName && prNumber) {
							return `${repoName}#${prNumber}`;
						}
						return repoName;
					})
					.filter((key) => key !== undefined),
			);

			if (prsInWindow.size > maxDistinctPRsInWindow) {
				maxDistinctPRsInWindow = prsInWindow.size;
				maxPRsWindowStartIdx = windowStartIdx;
				maxPRsWindowEndIdx = windowEndIdx;
			}
		}

		// Flag if comments are being sprayed across many PRs
		if (maxDistinctPRsInWindow >= CONFIG.PR_COMMENT_SPRAY_EXTREME) {
			const windowStart = prCommentTimestamps[maxPRsWindowStartIdx]?.time;
			const windowEnd = prCommentTimestamps[maxPRsWindowEndIdx]?.time;
			const commentsInWindow = maxPRsWindowEndIdx - maxPRsWindowStartIdx + 1;
			const timeSpanMinutes =
				windowEnd && windowStart
					? Math.round(windowEnd.diff(windowStart, "minute", true))
					: 0;
			const windowEvents = prCommentTimestamps
				.slice(maxPRsWindowStartIdx, maxPRsWindowEndIdx + 1)
				.map((item) => item.event);
			flags.push({
				label: "Rapid PR review comments",
				points: CONFIG.POINTS_PR_COMMENT_SPRAY_EXTREME,
				amplifiable: true,
				detail: `${commentsInWindow} comments on ${maxDistinctPRsInWindow} different PRs in ${timeSpanMinutes} minute${timeSpanMinutes === 1 ? "" : "s"}`,
				data: [
					{
						label: "Comments in window",
						value: commentsInWindow,
						threshold: CONFIG.PR_COMMENT_SPRAY_EXTREME,
					},
					{ label: "Distinct PRs", value: maxDistinctPRsInWindow },
					{ label: "Window duration (min)", value: timeSpanMinutes },
				],
				events: windowEvents,
			});
		} else if (maxDistinctPRsInWindow >= CONFIG.PR_COMMENT_SPRAY_HIGH) {
			const windowStart = prCommentTimestamps[maxPRsWindowStartIdx]?.time;
			const windowEnd = prCommentTimestamps[maxPRsWindowEndIdx]?.time;
			const commentsInWindow = maxPRsWindowEndIdx - maxPRsWindowStartIdx + 1;
			const timeSpanMinutes =
				windowEnd && windowStart
					? Math.round(windowEnd.diff(windowStart, "minute", true))
					: 0;
			const windowEvents = prCommentTimestamps
				.slice(maxPRsWindowStartIdx, maxPRsWindowEndIdx + 1)
				.map((item) => item.event);
			flags.push({
				label: "High PR comment frequency",
				points: CONFIG.POINTS_PR_COMMENT_SPRAY_HIGH,
				amplifiable: true,
				detail: `${commentsInWindow} comments on ${maxDistinctPRsInWindow} different PRs in ${timeSpanMinutes} minute${timeSpanMinutes === 1 ? "" : "s"}`,
				data: [
					{
						label: "Comments in window",
						value: commentsInWindow,
						threshold: CONFIG.PR_COMMENT_SPRAY_HIGH,
					},
					{ label: "Distinct PRs", value: maxDistinctPRsInWindow },
					{ label: "Window duration (min)", value: timeSpanMinutes },
				],
				events: windowEvents,
			});
		}
	}

	return flags;
}
