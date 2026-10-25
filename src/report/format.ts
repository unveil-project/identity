/** A ratio from 0 to 1 as a whole percentage, like "85%". */
export function percent(ratio: number): string {
	return `${Math.round(ratio * 100)}%`;
}

/** Round to one decimal place, keeping it a number. */
export function oneDecimal(value: number): number {
	return parseFloat(value.toFixed(1));
}

/** "1 day", "2 days". */
export function plural(count: number, word: string): string {
	return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/**
 * Describe how long a burst lasted, in words.
 *
 * Uses minutes for short bursts so we never report "0 hours" for something
 * like twenty stars in forty minutes.
 */
export function formatWindowDuration(minutes: number): string {
	if (minutes < 1) {
		return "under a minute";
	}

	if (minutes < 90) {
		return plural(Math.round(minutes), "minute");
	}

	return plural(Math.round(minutes / 60), "hour");
}

/** A short span like "3d", or "2h" when it is under a day. */
export function formatShortSpan(days: number, minutes: number): string {
	if (days > 0) {
		return `${days}d`;
	}

	return `${Math.max(1, Math.ceil(minutes / 60))}h`;
}

/** ", with spike days of 14, 12 and 10 closures each", or "" without spikes. */
export function describeSpikeDays(spikeDays: readonly number[]): string {
	if (spikeDays.length === 0) {
		return "";
	}

	if (spikeDays.length === 1) {
		return `, with a spike of ${spikeDays[0]} closures on one day`;
	}

	const allButLast = spikeDays.slice(0, -1).join(", ");
	const last = spikeDays[spikeDays.length - 1];

	return `, with spike days of ${allButLast} and ${last} closures each`;
}
