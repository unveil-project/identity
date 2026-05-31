import type { IdentifyFlag, GitHubEvent } from "../types";
import { CONFIG } from "../config";

export function detectZeroReposActivity(
  reposCount: number,
  foreignEvents: GitHubEvent[],
  filteredEvents: GitHubEvent[],
): IdentifyFlag[] {
  const flags: IdentifyFlag[] = [];

  const hasAllExternal =
    reposCount === 0 && foreignEvents.length === filteredEvents.length;

  if (hasAllExternal && filteredEvents.length >= CONFIG.ZERO_REPOS_MIN_EVENTS) {
    flags.push({
      label: "Only active on other people's repos",
      points:
        CONFIG.POINTS_ZERO_REPOS_ACTIVE + CONFIG.POINTS_NO_PERSONAL_ACTIVITY,
      detail: `No personal repos, all ${filteredEvents.length} events are on repos they don't own`,
    });
  }

  return flags;
}
