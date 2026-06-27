<template>
  <div>
    <main>
      <div class="search-form">
        <input
          v-model="username"
          type="text"
          placeholder="Enter GitHub username or ID..."
          @keydown.enter="analyzeUser"
          :disabled="loading"
        />
        <button @click="analyzeUser" :disabled="loading || !username.trim()">
          {{ loading ? "Analyzing..." : "Analyze" }}
        </button>
      </div>

      <div v-if="error" class="error">
        <strong>Error:</strong> {{ error }}
      </div>

      <div v-if="loading" class="loading">
        <div class="spinner"></div>
        <p>{{ loadingMessage }}</p>
      </div>

      <div v-if="result && !loading" class="results-container">
        <!-- User Profile Card -->
        <div class="card full-width">
          <div class="user-header">
            <img v-if="user" :src="user.avatar_url" :alt="user.name || user.login" class="user-avatar" />
            <div>
              <div class="user-name">{{ user?.name || user?.login }}</div>
              <div class="user-login">@{{ user?.login }}</div>
              <a v-if="user?.html_url" :href="user.html_url" target="_blank" style="opacity: 0.6; font-size: 14px"
                >View on GitHub</a
              >
            </div>
          </div>
        </div>

        <!-- Analysis Results -->
        <div class="card">
          <h2>Analysis Results</h2>
          <div class="score-container">
            <div class="score-value">{{ result.score }}/100</div>
            <div class="score-label">Classification Score</div>
          </div>
          <div class="classification-badge" :class="`classification-${result.classification}`">
            {{ result.classification.toUpperCase() }}
          </div>
          <div class="info-row" style="margin-top: 20px">
            <span class="info-label">Bounty Hunter:</span>
            <span class="info-value bounty-hunter" :class="result.isBountyHunter ? 'bounty-hunter--on' : 'bounty-hunter--off'">
              {{ result.isBountyHunter ? "Yes" : "No" }}
            </span>
          </div>
          <div class="info-row">
            <span class="info-label">Account Age:</span>
            <span class="info-value">{{ formatAccountAge(result.profile.age) }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Public Repos:</span>
            <span class="info-value">{{ result.profile.repos }}</span>
          </div>
        </div>

        <!-- Detected Flags -->
        <div class="card full-width">
          <h2>Detected Flags ({{ result.flags.length }})</h2>
          <div v-if="result.flags.length > 0" class="flags-list">
            <div v-for="(flag, index) in result.flags" :key="index" class="flag-item">
              <!-- Flag header -->
              <div class="flag-header" @click="toggleEvidence(index)">
                <div class="flag-title-row">
                  <span class="flag-label">{{ flag.label }}</span>
                  <span class="flag-points">+{{ flag.points }}</span>
                </div>
                <div class="flag-detail">{{ flag.detail }}</div>
                <button v-if="flag.events.length > 0" class="evidence-toggle">
                  {{ openFlags.has(index) ? "Hide evidence" : `Show evidence (${flag.events.length} event${flag.events.length !== 1 ? "s" : ""})` }}
                </button>
              </div>

              <!-- Evidence section -->
              <div v-if="openFlags.has(index) && flag.events.length > 0" class="flag-evidence">

                <!-- Rapid burst warning (computed once via template v-for trick) -->
                <template v-for="burst in [getRapidBurst(flag.events)]" :key="'burst-' + index">
                  <div v-if="burst" class="rapid-burst-alert">
                    <span class="rapid-burst-label">RAPID BURST</span>
                    <span class="rapid-burst-message">
                      {{ burst.count }} events in {{ formatSpan(burst.spanSeconds) }} — no human developer can work this fast. This is consistent with automation.
                    </span>
                  </div>
                </template>

                <!-- Pattern connections (branch→PR, fork→PR) -->
                <div v-if="flag.connections?.length" class="connections-section">
                  <div class="evidence-section-label">{{ flag.connections.length }} matched pair{{ flag.connections.length !== 1 ? "s" : "" }}</div>
                  <div class="connections-list">
                    <div v-for="(conn, i) in flag.connections" :key="i" class="connection-row">
                      <div class="conn-event">
                        <span :class="['event-badge', getEventBadgeClass(conn.from)]">{{ formatEventType(conn.from) }}</span>
                        <span class="event-repo">{{ shortRepo(conn.from.repo?.name) }}</span>
                        <span class="event-ts">{{ formatTime(conn.from.created_at) }}</span>
                      </div>
                      <div class="conn-arrow-wrap">
                        <div class="conn-arrow">→</div>
                        <div class="conn-delta" :class="{ 'delta-fast': getDeltaSeconds(conn.from, conn.to) < 60 }">
                          +{{ getDeltaSeconds(conn.from, conn.to) }}s
                        </div>
                      </div>
                      <div class="conn-event">
                        <span :class="['event-badge', getEventBadgeClass(conn.to)]">{{ formatEventType(conn.to) }}</span>
                        <span class="event-repo">{{ shortRepo(conn.to.repo?.name) }}</span>
                        <span class="event-ts">{{ formatTime(conn.to.created_at) }}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Flat event timeline (no explicit connections) -->
                <div v-else class="timeline-section">
                  <div class="evidence-section-label">{{ flag.events.length }} event{{ flag.events.length !== 1 ? "s" : "" }}</div>
                  <template v-for="sorted in [sortedEvents(flag.events)]" :key="'timeline-' + index">
                    <div class="event-timeline">
                      <div v-for="(event, i) in sorted" :key="event.id ?? i" class="timeline-row">
                        <div class="timeline-gap">
                          <span
                            v-if="i > 0"
                            class="time-gap"
                            :class="{ 'gap-rapid': getGapSeconds(sorted, i) < 60 }"
                          >+{{ getGapSeconds(sorted, i) }}s</span>
                        </div>
                        <div class="timeline-event">
                          <span :class="['event-badge', getEventBadgeClass(event)]">{{ formatEventType(event) }}</span>
                          <span class="event-repo">{{ shortRepo(event.repo?.name) }}</span>
                          <span class="event-ts">{{ formatTime(event.created_at) }}</span>
                        </div>
                      </div>
                    </div>
                  </template>
                </div>

              </div>
            </div>
          </div>
          <div v-else class="no-flags">✓ No automation signals detected</div>
        </div>

        <!-- Raw Data -->
        <div class="card full-width">
          <h2>User Data</h2>
          <div class="info-row">
            <span class="info-label">ID:</span>
            <span class="info-value">{{ user?.id }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Created:</span>
            <span class="info-value">{{ formatDate(user?.created_at) }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Followers:</span>
            <span class="info-value">{{ user?.followers }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Following:</span>
            <span class="info-value">{{ user?.following }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Public Gists:</span>
            <span class="info-value">{{ user?.public_gists }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Bio:</span>
            <span class="info-value">{{ user?.bio || "—" }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Events Analyzed:</span>
            <span class="info-value">{{ events?.length || 0 }}</span>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import type { GitHubEvent, GitHubUser, IdentifyResult } from "@unveil/identity";
import { identify } from "@unveil/identity";
import { ref } from "vue";

const username = ref("");
const loading = ref(false);
const loadingMessage = ref("");
const error = ref("");
const result = ref<IdentifyResult | null>(null);
const user = ref<GitHubUser | null>(null);
const events = ref<GitHubEvent[]>([]);
const openFlags = ref(new Set<number>());

const githubToken = import.meta.env.VITE_GITHUB_TOKEN;

const baseHeaders: Record<string, string> = {
	Accept: "application/vnd.github.v3+json",
};

if (githubToken) {
	baseHeaders["Authorization"] = `token ${githubToken}`;
}

async function fetchUserData(name: string): Promise<GitHubUser | null> {
	loadingMessage.value = "Fetching user data...";
	const response = await fetch(`https://api.github.com/users/${name}`, {
		headers: baseHeaders,
	});

	if (!response.ok) {
		throw new Error(`Failed to fetch user: ${response.statusText}`);
	}

	return response.json();
}

const MAX_PAGES = 3
async function fetchEvents(name: string): Promise<GitHubEvent[]> {
	loadingMessage.value = `Fetching user events (page 1/${MAX_PAGES})...`;
	const allEvents: GitHubEvent[] = [];

	// Fetch 3 pages with 100 items per page = ~300 events total
	for (let page = 1; page <= MAX_PAGES; page++) {
		loadingMessage.value = `Fetching user events (page ${page}/${MAX_PAGES})...`;

		const response = await fetch(
			`https://api.github.com/users/${name}/events/public?per_page=100&page=${page}`,
			{
				headers: baseHeaders,
			},
		);

		if (!response.ok) {
			throw new Error(`Failed to fetch events: ${response.statusText}`);
		}

		const data = await response.json();
		if (Array.isArray(data)) {
			allEvents.push(...data);
		}
	}

	return allEvents;
}

async function analyzeUser() {
	if (!username.value.trim()) {
		error.value = "Please enter a username";
		return;
	}

	loading.value = true;
	error.value = "";
	result.value = null;
	openFlags.value = new Set();

	try {
		// Fetch user data and events in parallel
		loadingMessage.value = "Fetching data...";
		const [userData, userEvents] = await Promise.all([
			fetchUserData(username.value),
			fetchEvents(username.value),
		]);

		if (!userData) {
			throw new Error("User not found");
		}

		user.value = userData;
		events.value = userEvents;

		// Run analysis
		loadingMessage.value = "Analyzing...";
		const analysisResult = identify({
			createdAt: userData.created_at,
			reposCount: userData.public_repos,
			accountName: userData.login,
			events: userEvents,
		});

		result.value = analysisResult;
	} catch (err) {
		error.value = err instanceof Error ? err.message : "An error occurred";
		result.value = null;
	} finally {
		loading.value = false;
	}
}

function toggleEvidence(index: number) {
	if (openFlags.value.has(index)) {
		openFlags.value.delete(index);
	} else {
		openFlags.value.add(index);
	}
	// trigger Vue reactivity on the Set
	openFlags.value = new Set(openFlags.value);
}

// ─── Event formatting helpers ────────────────────────────────────────────────

function formatEventType(event: GitHubEvent): string {
	switch (event.type) {
		case "CreateEvent":
			if (event.payload?.ref_type === "branch") return "Branch";
			if (event.payload?.ref_type === "repository") return "Repo";
			return "Tag";
		case "PullRequestEvent": {
			const num = (event.payload?.pull_request as { number?: number } | undefined)?.number;
			return num ? `PR #${num}` : "PR";
		}
		case "ForkEvent":
			return "Fork";
		case "PushEvent":
			return "Push";
		case "IssuesEvent":
			return "Issue";
		case "IssueCommentEvent":
			return "Comment";
		case "WatchEvent":
			return "Star";
		case "DeleteEvent":
			return `Delete ${event.payload?.ref_type ?? ""}`.trim();
		default:
			return event.type?.replace("Event", "") ?? "Event";
	}
}

function getEventBadgeClass(event: GitHubEvent): string {
	switch (event.type) {
		case "CreateEvent":
			return "badge-create";
		case "PullRequestEvent":
			return "badge-pr";
		case "ForkEvent":
			return "badge-fork";
		case "PushEvent":
			return "badge-push";
		case "IssuesEvent":
		case "IssueCommentEvent":
			return "badge-issue";
		case "WatchEvent":
			return "badge-watch";
		default:
			return "badge-default";
	}
}

function shortRepo(fullName?: string | null): string {
	if (!fullName) return "—";
	const parts = fullName.split("/");
	return parts[parts.length - 1] ?? fullName;
}

// ─── Time helpers ────────────────────────────────────────────────────────────

function sortedEvents(evts: GitHubEvent[]): GitHubEvent[] {
	return [...evts].sort(
		(a, b) =>
			new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime(),
	);
}

function getDeltaSeconds(a: GitHubEvent, b: GitHubEvent): number {
	return Math.round(
		(new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()) / 1000,
	);
}

function getGapSeconds(sorted: GitHubEvent[], index: number): number {
	if (index === 0) return 0;
	return getDeltaSeconds(sorted[index - 1], sorted[index]);
}

function getRapidBurst(
	evts: GitHubEvent[],
): { count: number; spanSeconds: number } | null {
	if (evts.length < 3) return null;
	const sorted = sortedEvents(evts);
	const spanMs =
		new Date(sorted[sorted.length - 1].created_at ?? 0).getTime() -
		new Date(sorted[0].created_at ?? 0).getTime();
	const spanSeconds = Math.round(spanMs / 1000);
	// flag as rapid if average gap between events is less than 2 minutes
	if (spanSeconds / (sorted.length - 1) < 120) {
		return { count: sorted.length, spanSeconds };
	}
	return null;
}

function formatTime(dateString?: string | null): string {
	if (!dateString) return "—";
	return new Date(dateString).toLocaleTimeString("en-US", {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false,
	});
}

function formatSpan(seconds: number): string {
	if (seconds < 60) return `${seconds}s`;
	const m = Math.floor(seconds / 60);
	const s = seconds % 60;
	return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function formatDate(dateString?: string): string {
	if (!dateString) return "—";
	return new Date(dateString).toLocaleDateString("en-US", {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

function formatAccountAge(days: number): string {
	const years = Math.floor(days / 365);
	const months = Math.floor((days % 365) / 30);
	const remainingDays = days % 30;

	if (years > 0) {
		return months > 0
			? `${years} year${years > 1 ? "s" : ""} and ${months} month${months > 1 ? "s" : ""}`
			: `${years} year${years > 1 ? "s" : ""}`;
	}
	if (months > 0) {
		return `${months} month${months > 1 ? "s" : ""}`;
	}
	return `${remainingDays} day${remainingDays > 1 ? "s" : ""}`;
}
</script>

<style scoped>
header {
  text-align: center;
  margin-bottom: 40px;
  padding: 20px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

@media (prefers-color-scheme: light) {
  header {
    border-bottom-color: #ddd;
  }
}

header h1 {
  font-size: 32px;
  margin-bottom: 8px;
}

header p {
  opacity: 0.7;
  font-size: 16px;
}

main {
  padding-bottom: 40px;
}

.bounty-hunter {
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
}

.bounty-hunter--on {
  background: rgba(234, 179, 8, 0.15);
  color: #ca8a04;
}

.bounty-hunter--off {
  background: rgba(100, 100, 100, 0.1);
  color: inherit;
  opacity: 0.5;
}

/* ── Flag item ── */
.flag-item {
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  overflow: hidden;
  margin-bottom: 8px;
}

@media (prefers-color-scheme: light) {
  .flag-item {
    border-color: #e5e7eb;
  }
}

.flag-header {
  padding: 12px 14px;
  cursor: pointer;
  user-select: none;
}

.flag-header:hover {
  background: rgba(255, 255, 255, 0.03);
}

@media (prefers-color-scheme: light) {
  .flag-header:hover {
    background: rgba(0, 0, 0, 0.02);
  }
}

.flag-title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.flag-label {
  font-weight: 600;
  font-size: 14px;
}

.flag-points {
  font-size: 12px;
  font-weight: 700;
  color: #ef4444;
  background: rgba(239, 68, 68, 0.1);
  padding: 2px 7px;
  border-radius: 4px;
  white-space: nowrap;
}

.flag-detail {
  font-size: 13px;
  opacity: 0.65;
  margin-bottom: 8px;
}

.evidence-toggle {
  font-size: 11px;
  padding: 3px 10px;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: transparent;
  color: inherit;
  cursor: pointer;
  opacity: 0.6;
  transition: opacity 0.15s;
}

.evidence-toggle:hover {
  opacity: 1;
}

@media (prefers-color-scheme: light) {
  .evidence-toggle {
    border-color: #d1d5db;
  }
}

/* ── Evidence section ── */
.flag-evidence {
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding: 12px 14px;
  font-size: 13px;
}

@media (prefers-color-scheme: light) {
  .flag-evidence {
    border-top-color: #e5e7eb;
    background: #fafafa;
  }
}

.evidence-section-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  opacity: 0.45;
  margin-bottom: 8px;
}

/* ── Rapid burst alert ── */
.rapid-burst-alert {
  display: flex;
  align-items: baseline;
  gap: 8px;
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.25);
  border-radius: 6px;
  padding: 8px 12px;
  margin-bottom: 12px;
  font-size: 13px;
}

.rapid-burst-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: #ef4444;
  background: rgba(239, 68, 68, 0.15);
  padding: 2px 6px;
  border-radius: 3px;
  white-space: nowrap;
}

.rapid-burst-message {
  opacity: 0.85;
  line-height: 1.4;
}

/* ── Connection pairs ── */
.connections-section {
  margin-top: 4px;
}

.connections-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.connection-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 6px;
  flex-wrap: wrap;
}

@media (prefers-color-scheme: light) {
  .connection-row {
    background: rgba(0, 0, 0, 0.03);
  }
}

.conn-event {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
}

.conn-arrow-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.conn-arrow {
  font-size: 16px;
  opacity: 0.4;
}

.conn-delta {
  font-size: 10px;
  font-weight: 600;
  opacity: 0.55;
  white-space: nowrap;
}

.conn-delta.delta-fast {
  color: #ef4444;
  opacity: 1;
}

/* ── Event timeline ── */
.event-timeline {
  display: flex;
  flex-direction: column;
}

.timeline-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.timeline-gap {
  width: 52px;
  text-align: right;
  flex-shrink: 0;
}

.time-gap {
  font-size: 10px;
  font-weight: 600;
  opacity: 0.45;
  display: inline-block;
  padding: 1px 5px;
  border-radius: 3px;
}

.time-gap.gap-rapid {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.1);
  opacity: 1;
}

.timeline-event {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 0;
  flex: 1;
  min-width: 0;
}

/* ── Shared event elements ── */
.event-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  letter-spacing: 0.03em;
  white-space: nowrap;
  flex-shrink: 0;
}

.badge-create {
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
}

.badge-pr {
  background: rgba(139, 92, 246, 0.15);
  color: #8b5cf6;
}

.badge-fork {
  background: rgba(245, 158, 11, 0.15);
  color: #f59e0b;
}

.badge-push {
  background: rgba(59, 130, 246, 0.15);
  color: #3b82f6;
}

.badge-issue {
  background: rgba(234, 179, 8, 0.15);
  color: #ca8a04;
}

.badge-watch {
  background: rgba(236, 72, 153, 0.15);
  color: #ec4899;
}

.badge-default {
  background: rgba(100, 100, 100, 0.1);
  opacity: 0.7;
}

.event-repo {
  font-size: 12px;
  opacity: 0.6;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.event-ts {
  font-size: 11px;
  font-family: monospace;
  opacity: 0.45;
  white-space: nowrap;
  flex-shrink: 0;
}
</style>
