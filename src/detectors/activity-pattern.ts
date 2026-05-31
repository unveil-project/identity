import type { IdentifyFlag, GitHubEvent } from "../types";
import { CONFIG } from "../config";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);

export function detectInhumanActivityPattern(
  filteredEvents: GitHubEvent[],
): IdentifyFlag[] {
  const flags: IdentifyFlag[] = [];

  if (filteredEvents.length < CONFIG.MIN_EVENTS_FOR_ANALYSIS) {
    return flags;
  }

  // 24/7 activity pattern detection - ONLY PER-DAY ANALYSIS
  // Global hours across multiple days is meaningless - someone codes at different times on different days
  // Only flag if a SINGLE DAY shows no realistic sleep window (< 3 hours gap)
  const eventsByDay = new Map<string, Set<number>>();
  filteredEvents.forEach((e) => {
    const day = dayjs.utc(e.created_at).format("YYYY-MM-DD");
    const hour = dayjs.utc(e.created_at).hour();
    if (!eventsByDay.has(day)) {
      eventsByDay.set(day, new Set());
    }
    eventsByDay.get(day)!.add(hour);
  });

  // Find the day with the most suspicious 24/7 pattern
  type DaySuspiciousPattern = {
    day: string;
    hoursActive: number;
    restGap: number;
    eventCount: number;
  };
  let dayWithMostSuspiciousPattern: DaySuspiciousPattern | null = null;
  let minRestWindowFound = 24;

  eventsByDay.forEach((hoursInDay, day) => {
    const hoursActive = hoursInDay.size;
    const eventsOnDay = filteredEvents.filter(
      (e) => dayjs.utc(e.created_at).format("YYYY-MM-DD") === day,
    ).length;

    // Only check days with significant activity
    if (hoursActive >= CONFIG.HOURS_ACTIVE_EXTREME && eventsOnDay >= 10) {
      const avgEventsPerHour = eventsOnDay / hoursActive;
      const meetsEventThreshold =
        avgEventsPerHour >= CONFIG.EVENTS_PER_HOUR_MIN;

      // Only consider days that meet event density requirement
      if (meetsEventThreshold) {
        const sortedHours = Array.from(hoursInDay).sort((a, b) => a - b);

        // Find the largest rest window (sleep gap) in this specific day
        const firstHour = sortedHours[0]!;
        const lastHour = sortedHours[sortedHours.length - 1]!;
        let maxRestThisDay = 24 - lastHour + firstHour - 1; // wrap-around gap, consistent -1 with intra-day logic

        for (let i = 0; i < sortedHours.length - 1; i++) {
          const gap = sortedHours[i + 1]! - sortedHours[i]! - 1;
          maxRestThisDay = Math.max(maxRestThisDay, gap);
        }

        // Track the day with smallest rest window (most suspicious)
        if (maxRestThisDay < minRestWindowFound) {
          minRestWindowFound = maxRestThisDay;
          dayWithMostSuspiciousPattern = {
            day,
            hoursActive,
            restGap: maxRestThisDay,
            eventCount: eventsOnDay,
          } as DaySuspiciousPattern;
        }
      }
    }
  });

  // Only flag if found a day with unrealistic sleep (< 3 hours = no real sleep possible)
  if (dayWithMostSuspiciousPattern) {
    const pattern: DaySuspiciousPattern = dayWithMostSuspiciousPattern;
    if (minRestWindowFound < 3) {
      let points: number = CONFIG.POINTS_24_7_ACTIVITY;
      if (minRestWindowFound < 1) {
        points = Math.round(points * 1.5);
      }

      flags.push({
        label: "24/7 activity pattern",
        points,
        detail: `${pattern.day}: active across ${pattern.hoursActive} hours with only ${minRestWindowFound} hour${minRestWindowFound === 1 ? "" : "s"} rest`,
      });
    }
  }

  return flags;
}
