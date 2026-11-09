/** The owner part of "owner/name": everything before the last slash. */
export function ownerOf(repo: string): string {
	const slash = repo.lastIndexOf("/");

	return slash === -1 ? repo : repo.slice(0, slash);
}

/** The name part of "owner/name": everything after the last slash. */
export function nameOf(repo: string): string | undefined {
	const slash = repo.lastIndexOf("/");

	return slash === -1 ? undefined : repo.slice(slash + 1);
}

/** True when the account owns the repository. Logins ignore letter case. */
export function isOwnRepo(repo: string, login: string): boolean {
	return ownerOf(repo).toLowerCase() === login.toLowerCase();
}

/** True when the repository belongs to someone other than the account. */
export function isExternalRepo(repo: string, login: string): boolean {
	return ownerOf(repo) !== "" && !isOwnRepo(repo, login);
}
