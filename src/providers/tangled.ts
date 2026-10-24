import type {
	IdentifyCommit,
	IdentifyEvent,
	IdentifyEventType,
	IdentifyInput,
} from "../types";

/**
 * The fields of the `sh.tangled.*` records we read. Pass whole records if you
 * have them: any other field is ignored.
 */
export type TangledRecordValue = {
	$type?: string;
	createdAt?: string;
	/** `sh.tangled.repo`: the repo's name, and its own DID when it has one. */
	name?: string;
	repoDid?: string;
	/** `sh.tangled.repo` and `sh.tangled.actor.profile` */
	description?: string;
	/** `sh.tangled.repo`: where a fork came from. `sh.tangled.repo.pull`: the source branch. */
	source?: string | { branch?: string; repo?: string };
	/** The repo's DID. Older issues point at the repo record's AT-URI. */
	repo?: string;
	title?: string;
	/** `sh.tangled.repo.pull`: the repo and branch it targets. */
	target?: { repo?: string; branch?: string };
	/** The AT-URI of the issue or pull a state, status or comment is about. */
	issue?: string;
	pull?: string;
	state?: string;
	status?: string;
	/**
	 * What a star, comment, reaction or follow is about. On a collaborator
	 * record, the DID of the person added.
	 */
	subject?: string | { did?: string; uri?: string };
	/** `sh.tangled.git.refUpdate` */
	ref?: string;
	committerDid?: string;
	oldSha?: string;
	newSha?: string;
};

/**
 * A record as `com.atproto.repo.listRecords` and the Tangled AppView's
 * `list*By` queries return it.
 */
export type TangledRecord<Value = TangledRecordValue> = {
	uri: string;
	cid?: string;
	value: Value;
};

export type TangledAccount = {
	did: string;
	handle: string;
	/**
	 * Tangled keeps no sign-up date. Use the first entry of the DID's PLC audit
	 * log, or the `createdAt` of the account's Bluesky profile.
	 */
	createdAt: string;
	displayName?: string | null;
	/** Read from the `sh.tangled.actor.profile` record when left out. */
	bio?: string | null;
	avatarUrl?: string;
	url?: string;
	followers?: number;
	following?: number;
};

export type TangledCommit = IdentifyCommit;

export type TangledInput = {
	account: TangledAccount;
	/**
	 * The account's `sh.tangled.*` records, and the `sh.tangled.git.refUpdate`
	 * records it pushed. Add the repo, issue and pull records of other accounts
	 * that these point at, so their repos can be named: they are only looked up,
	 * never counted as the account's activity.
	 */
	records: TangledRecord[];
	commits?: TangledCommit[];
};

const NSID = "sh.tangled";

const TYPES: Record<string, IdentifyEventType> = {
	[`${NSID}.repo.issue`]: "issue",
	[`${NSID}.repo.issue.state`]: "issue",
	[`${NSID}.repo.issue.comment`]: "issue-comment",
	[`${NSID}.repo.pull`]: "pull-request",
	[`${NSID}.repo.pull.status`]: "pull-request",
	// Pull comments are the conversation, like GitHub's issue comments on a PR.
	[`${NSID}.repo.pull.comment`]: "issue-comment",
	[`${NSID}.feed.comment`]: "issue-comment",
	[`${NSID}.feed.star`]: "star",
	[`${NSID}.feed.reaction`]: "reaction",
	[`${NSID}.graph.follow`]: "follow",
	[`${NSID}.repo.collaborator`]: "member",
	[`${NSID}.string`]: "string",
};

/** Records that describe the account rather than something it did. */
const NOT_ACTIVITY = new Set([`${NSID}.actor.profile`]);

const ZERO_SHA = "0".repeat(40);

/** The base32 alphabet AT Protocol record keys (TIDs) are written in. */
const TID_ALPHABET = "234567abcdefghijklmnopqrstuvwxyz";

function parseAtUri(uri: string | undefined): {
	did: string;
	collection: string;
	rkey: string;
} {
	const [did = "", collection = "", rkey = ""] = (uri ?? "")
		.replace(/^at:\/\//, "")
		.split("/");

	return { did, collection, rkey };
}

/**
 * When a TID record key was made. Its first 11 characters hold the
 * microseconds since 1970, which still fit in a float.
 */
function tidToIso(rkey: string): string | undefined {
	if (!/^[2-7a-z]{13}$/.test(rkey)) {
		return undefined;
	}

	let micros = 0;
	for (const char of rkey.slice(0, 11)) {
		micros = micros * 32 + TID_ALPHABET.indexOf(char);
	}

	return new Date(Math.floor(micros / 1000)).toISOString();
}

function collectionOf(record: TangledRecord): string {
	return record.value.$type ?? parseAtUri(record.uri).collection;
}

/** Repo names (`handle/name`), by repo DID and by repo record AT-URI. */
function namesOf(
	records: readonly TangledRecord[],
	account: TangledAccount,
): (ref: string | undefined) => string {
	const ownerName = (did: string) =>
		did === account.did ? account.handle : did;
	const names = new Map<string, string>();

	for (const record of records) {
		if (collectionOf(record) !== `${NSID}.repo`) {
			continue;
		}
		const { did, rkey } = parseAtUri(record.uri);
		const name = `${ownerName(did)}/${record.value.name ?? rkey}`;
		names.set(record.uri, name);
		if (record.value.repoDid) {
			names.set(record.value.repoDid, name);
		}
	}

	return (ref) => {
		if (!ref) {
			return "";
		}
		const known = names.get(ref);
		if (known) {
			return known;
		}
		if (ref.startsWith("at://")) {
			const { did, rkey } = parseAtUri(ref);
			return `${ownerName(did)}/${rkey}`;
		}

		// A repo DID we have no record for. It names the repo, but not its owner.
		return ref;
	};
}

function subjectOf(value: TangledRecordValue): string | undefined {
	const subject = value.subject;

	return typeof subject === "string" ? subject : (subject?.uri ?? subject?.did);
}

function refOf(name: string | undefined): IdentifyEvent["ref"] {
	if (!name) {
		return undefined;
	}
	if (name.startsWith("refs/tags/")) {
		return { type: "tag", name: name.slice("refs/tags/".length) };
	}

	return { type: "branch", name: name.replace(/^refs\/heads\//, "") };
}

/**
 * Turn Tangled records into the input `identify` takes.
 *
 * @example
 * identify(fromTangled({ account, records }));
 */
export function fromTangled({
	account,
	records,
	commits,
}: TangledInput): IdentifyInput<TangledRecord> {
	const repoName = namesOf(records, account);

	// Comments and state changes point at an issue or a pull, not a repo.
	const threads = new Map<string, string>();
	for (const record of records) {
		const collection = collectionOf(record);
		if (collection === `${NSID}.repo.issue`) {
			threads.set(record.uri, repoName(record.value.repo));
		} else if (collection === `${NSID}.repo.pull`) {
			threads.set(record.uri, repoName(record.value.target?.repo));
		}
	}
	const threadRepo = (uri: string | undefined) =>
		(uri && threads.get(uri)) || "";

	const events: IdentifyEvent<TangledRecord>[] = [];
	let publicRepos = 0;
	let profileBio: string | undefined;

	for (const record of records) {
		const collection = collectionOf(record);
		const { did, rkey } = parseAtUri(record.uri);
		const value = record.value;

		if (collection === `${NSID}.git.refUpdate`) {
			// Knots write these, so the record's DID is not the pusher's.
			if (value.committerDid !== account.did) {
				continue;
			}
		} else if (did !== account.did) {
			continue;
		}

		if (NOT_ACTIVITY.has(collection)) {
			profileBio = value.description;
			continue;
		}

		const event: IdentifyEvent<TangledRecord> = {
			type: Object.hasOwn(TYPES, collection) ? TYPES[collection] : collection,
			at: value.createdAt ?? tidToIso(rkey) ?? "",
			repo: "",
			source: record,
		};

		switch (collection) {
			case `${NSID}.repo`:
				publicRepos++;
				event.type = value.source ? "fork" : "create";
				event.repo = repoName(record.uri);
				if (event.type === "create") {
					event.ref = { type: "repository" };
				}
				break;
			case `${NSID}.repo.issue`:
				event.repo = repoName(value.repo);
				event.action = "opened";
				event.issue = { title: value.title };
				break;
			case `${NSID}.repo.issue.state`:
				event.repo = threadRepo(value.issue);
				event.action = value.state?.endsWith(".closed") ? "closed" : "reopened";
				break;
			case `${NSID}.repo.pull`:
				event.repo = repoName(value.target?.repo);
				event.action = "opened";
				event.pullRequest = { isAuthor: true };
				break;
			case `${NSID}.repo.pull.status`: {
				const status = value.status?.split(".").pop();
				event.repo = threadRepo(value.pull);
				event.action =
					status === "merged" || status === "closed" ? status : "reopened";
				// A pull lives with the account that opened it.
				event.pullRequest = {
					isAuthor: parseAtUri(value.pull).did === account.did,
				};
				break;
			}
			case `${NSID}.repo.issue.comment`:
				event.repo = threadRepo(value.issue);
				event.action = "created";
				break;
			case `${NSID}.repo.pull.comment`:
				event.repo = threadRepo(value.pull);
				event.action = "created";
				break;
			case `${NSID}.feed.comment`:
			case `${NSID}.feed.reaction`:
				event.repo = threadRepo(subjectOf(value));
				break;
			case `${NSID}.feed.star`:
				event.repo = repoName(subjectOf(value));
				break;
			case `${NSID}.repo.collaborator`:
				event.repo = repoName(value.repo);
				break;
			case `${NSID}.git.refUpdate`:
				event.repo = repoName(value.repo);
				if (value.oldSha === ZERO_SHA) {
					event.type = "create";
					event.ref = refOf(value.ref);
				} else if (value.newSha === ZERO_SHA) {
					event.type = "delete";
					event.ref = refOf(value.ref);
				} else {
					event.type = "push";
				}
				break;
		}

		events.push(event);
	}

	return {
		account: {
			login: account.handle,
			createdAt: account.createdAt,
			publicRepos,
			id: account.did,
			name: account.displayName,
			bio: account.bio ?? profileBio,
			avatarUrl: account.avatarUrl,
			url: account.url,
			followers: account.followers,
			following: account.following,
		},
		events,
		commits,
	};
}
