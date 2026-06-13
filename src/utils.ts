/**
 * Calculate Shannon's entropy of a probability distribution
 * Lower entropy = more concentrated/predictable (bot-like)
 * Higher entropy = more uniformly distributed / random
 */
function calculateShannonsEntropy(counts: number[]): number {
	if (counts.length === 0) return 0;

	const total = counts.reduce((sum, count) => sum + count, 0);
	if (total === 0) return 0;

	let entropy = 0;
	for (const count of counts) {
		if (count > 0) {
			const probability = count / total;
			entropy -= probability * Math.log2(probability);
		}
	}

	return entropy;
}

/**
 * Calculate normalized Shannon's entropy (0 to 1)
 * Useful for comparing distributions with different state counts
 * Returns 0-1 where 0 = completely concentrated, 1 = perfectly uniform
 */
export function calculateNormalizedShannonsEntropy(counts: number[]): number {
	if (counts.length <= 1) return 0;

	const entropy = calculateShannonsEntropy(counts);
	const maxEntropy = Math.log2(counts.length);

	return entropy / maxEntropy;
}

// Returns the mean exponential decay weight for a set of events; lower = activity is mostly old.
export function computeActivityRecencyMultiplier(
	events: Array<{ created_at?: string | null }>,
	halfLifeDays: number,
): number {
	if (events.length === 0) return 1;
	const now = Date.now();
	let total = 0;
	for (const e of events) {
		const t = e.created_at ? new Date(e.created_at).getTime() : NaN;
		if (!e.created_at || Number.isNaN(t)) {
			total += 1;
			continue;
		}
		const ageDays = (now - t) / (1000 * 60 * 60 * 24);
		total += Math.exp((-Math.LN2 * ageDays) / halfLifeDays);
	}
	return total / events.length;
}
