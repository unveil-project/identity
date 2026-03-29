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
