import MockDate from "mockdate";

/**
 * Run something with the clock pinned to a fixed moment.
 *
 * Fixtures are snapshots, but identify() reads the wall clock to work out how
 * old an account is. That makes a stored fixture drift: an account captured at
 * 40 days old quietly turns 90 while the file sits in the repo, every
 * young-account check switches off, and the classification changes without
 * anyone touching the code. Replaying each fixture at the moment it was
 * captured keeps its expected result fixed for good.
 */
export function runAtCaptureTime<T>(capturedAt: string, run: () => T): T {
	const frozen = new Date(capturedAt);

	if (Number.isNaN(frozen.getTime())) {
		throw new Error(`Invalid capturedAt: "${capturedAt}"`);
	}

	MockDate.set(frozen);

	try {
		return run();
	} finally {
		MockDate.reset();
	}
}
