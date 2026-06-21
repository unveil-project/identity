import { createHash } from "node:crypto";
import {
	BOUNTY_REPO_NAMES,
	BOUNTY_REPO_PATHS,
} from "../../src/data/bounty-repos";

type JsonValue =
	| string
	| number
	| boolean
	| null
	| JsonValue[]
	| { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

function sha256(s: string | number): string {
	return createHash("sha256").update(String(s)).digest("hex");
}

export interface ObfuscateResult {
	data: JsonObject;
	stats: { logins: number; repos: number };
}

export function obfuscateFixture(raw: JsonObject): ObfuscateResult {
	const loginCache = new Map<string, string>();
	const repoCache = new Map<string, string>();
	const numericIdCache = new Map<number, number>();

	function fakeLogin(real: string): string {
		let cached = loginCache.get(real);
		if (cached === undefined) {
			cached = `user-${sha256(`login:${real}`).slice(0, 8)}`;
			loginCache.set(real, cached);
		}
		return cached;
	}

	function fakeRepo(fullName: string): string {
		let cached = repoCache.get(fullName);
		if (cached === undefined) {
			const lower = fullName.toLowerCase();
			const repoName = lower.split("/")[1];
			console.log(repoName, lower);
			if (
				BOUNTY_REPO_PATHS.has(lower) ||
				(repoName !== undefined && BOUNTY_REPO_NAMES.has(repoName))
			) {
				cached = fullName;
			} else {
				const slash = fullName.indexOf("/");
				const owner = fullName.slice(0, slash);
				const repo = fullName.slice(slash + 1);
				cached = `${fakeLogin(owner)}/repo-${sha256(`repo:${repo}`).slice(0, 8)}`;
			}
			repoCache.set(fullName, cached);
		}
		return cached;
	}

	function fakeNumericId(real: number): number {
		let cached = numericIdCache.get(real);
		if (cached === undefined) {
			cached = parseInt(sha256(`numid:${real}`).slice(0, 8), 16);
			numericIdCache.set(real, cached);
		}
		return cached;
	}

	function fakeNodeId(real: string): string {
		return sha256(`nodeid:${real}`).slice(0, 24);
	}

	function obfuscateUrl(url: string): string {
		let s = url;

		s = s.replace(
			/(https:\/\/avatars\.githubusercontent\.com\/u\/)(\d+)(.*)/,
			(_, pre, id, suf) => `${pre}${fakeNumericId(Number(id))}${suf}`,
		);

		s = s.replace(
			/(https:\/\/api\.github\.com\/repos\/)([^/]+)\/([^/?{]+)(.*)/,
			(_, pre, owner, repo, suf) =>
				`${pre}${fakeRepo(`${owner}/${repo}`)}${suf}`,
		);

		s = s.replace(
			/(https:\/\/api\.github\.com\/users\/)([^/?{]+)(.*)/,
			(_, pre, login, suf) => `${pre}${fakeLogin(login)}${suf}`,
		);

		s = s.replace(
			/(https:\/\/api\.github\.com\/orgs\/)([^/?]+)(.*)/,
			(_, pre, org, suf) => `${pre}${fakeLogin(org)}${suf}`,
		);

		s = s.replace(
			/(https:\/\/github\.com\/)([^/]+)\/([^/?#\s]+)(.*)/,
			(_, pre, owner, repo, suf) =>
				`${pre}${fakeRepo(`${owner}/${repo}`)}${suf}`,
		);

		s = s.replace(
			/^(https:\/\/github\.com\/)([^/?#\s]+)$/,
			(_, pre, login) => `${pre}${fakeLogin(login)}`,
		);

		s = s.replace(
			/(git:\/\/github\.com\/)([^/]+)\/([^.]+)(\.git.*)/,
			(_, pre, owner, repo, suf) =>
				`${pre}${fakeRepo(`${owner}/${repo}`)}${suf}`,
		);

		s = s.replace(
			/(git@github\.com:)([^/]+)\/([^.]+)(\.git.*)/,
			(_, pre, owner, repo, suf) =>
				`${pre}${fakeRepo(`${owner}/${repo}`)}${suf}`,
		);

		return s;
	}

	function repoFullNameFromUrl(url: unknown): string | null {
		if (!url || typeof url !== "string") return null;
		const m = url.match(/\/repos\/([^/]+)\/([^/?{]+)/);
		return m ? `${m[1]}/${m[2]}` : null;
	}

	function transformObj(obj: JsonObject): JsonObject {
		const result: JsonObject = {};
		for (const [key, val] of Object.entries(obj)) {
			result[key] = transformValue(key, val, obj);
		}
		return result;
	}

	function transformValue(
		key: string,
		val: JsonValue,
		parent: JsonObject,
	): JsonValue {
		if (val === null || val === undefined) return val;

		if (Array.isArray(val)) {
			return val.map((item) =>
				typeof item === "object" && item !== null
					? transformObj(item as JsonObject)
					: item,
			);
		}

		if (typeof val === "object") return transformObj(val as JsonObject);

		if (typeof val === "string") {
			if (key === "login" || key === "display_login") return fakeLogin(val);
			if (key === "node_id") return fakeNodeId(val);

			if ((key === "name" || key === "full_name") && val.includes("/"))
				return fakeRepo(val);

			if (key === "name" && !val.includes("/")) {
				if (typeof parent.full_name === "string") {
					return fakeRepo(parent.full_name).split("/")[1] ?? val;
				}
				const fullName = repoFullNameFromUrl(parent.url);
				if (fullName) return fakeRepo(fullName).split("/")[1] ?? val;
			}

			if (
				key === "url" ||
				key === "html_url" ||
				key.endsWith("_url") ||
				val.startsWith("https://")
			) {
				return obfuscateUrl(val);
			}

			return val;
		}

		if (typeof val === "number") {
			if (key === "id" || key.endsWith("_id")) return fakeNumericId(val);
			return val;
		}

		return val;
	}

	const data = transformObj(raw);
	return { data, stats: { logins: loginCache.size, repos: repoCache.size } };
}
