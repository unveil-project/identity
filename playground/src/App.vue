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
            <span class="info-label">Account Age:</span>
            <span class="info-value">{{ formatAccountAge(result.profile.age) }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Public Repos:</span>
            <span class="info-value">{{ result.profile.repos }}</span>
          </div>
        </div>

        <!-- Detected Flags -->
        <div class="card">
          <h2>Detected Flags ({{ result.flags.length }})</h2>
          <div v-if="result.flags.length > 0" class="flags-list">
            <div v-for="(flag, index) in result.flags" :key="index" class="flag-item">
              <div class="flag-title">
                {{ flag.label }}
                <span class="flag-points">+{{ flag.points }}</span>
              </div>
              <div class="flag-detail">{{ flag.detail }}</div>
            </div>
          </div>
          <div v-else class="no-flags">✓ No suspicious patterns detected</div>
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
import { ref } from "vue";
import { identify } from "@unveil/identity";
import type { GitHubUser, GitHubEvent, IdentifyResult } from "@unveil/identity";

const username = ref("");
const loading = ref(false);
const loadingMessage = ref("");
const error = ref("");
const result = ref<IdentifyResult | null>(null);
const user = ref<GitHubUser | null>(null);
const events = ref<GitHubEvent[]>([]);

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

async function fetchEvents(name: string): Promise<GitHubEvent[]> {
  loadingMessage.value = "Fetching user events (page 1/2)...";
  const allEvents: GitHubEvent[] = [];

  // Fetch 2 pages with 100 items per page = 200 events total
  for (let page = 1; page <= 2; page++) {
    loadingMessage.value = `Fetching user events (page ${page}/2)...`;

    const response = await fetch(
      `https://api.github.com/users/${name}/events/public?per_page=100&page=${page}`,
      {
        headers: baseHeaders,
      }
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
</style>
