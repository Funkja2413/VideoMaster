import type { Account, AccountStatus, HomepageKind, WatchStatus, Work } from "../types";

export interface AccountQuery {
  text: string;
  track: string;
  batch: string;
  status: AccountStatus | "";
  homepageKind: HomepageKind | "";
}

export interface WorkQuery {
  text: string;
  watchStatus: WatchStatus | "";
  folder: string;
  starredOnly: boolean;
  accountId: string;
}

export function filterAccounts(accounts: Account[], query: AccountQuery): Account[] {
  const text = query.text.trim().toLocaleLowerCase();
  return accounts.filter((account) => {
    if (query.track && account.track !== query.track) return false;
    if (query.batch && account.batch !== query.batch) return false;
    if (query.status && account.status !== query.status) return false;
    if (query.homepageKind && account.homepageKind !== query.homepageKind) return false;
    if (!text) return true;
    const haystack = [account.name, account.note, account.track, account.batch, account.tags.join(" "), account.homepage]
      .join("\n")
      .toLocaleLowerCase();
    return haystack.includes(text);
  });
}

export function filterWorks(works: Work[], accounts: Account[], query: WorkQuery): Work[] {
  const text = query.text.trim().toLocaleLowerCase();
  return [...works]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id))
    .filter((work) => {
      if (query.watchStatus && work.watchStatus !== query.watchStatus) return false;
      if (query.starredOnly && !work.starred) return false;
      if (query.folder && (work.folder || "未分类") !== query.folder) return false;
      if (query.accountId === "none" && work.accountId) return false;
      if (query.accountId && query.accountId !== "none" && work.accountId !== query.accountId) return false;
      if (!text) return true;
      const accountName = accounts.find((account) => account.id === work.accountId)?.name ?? "";
      const haystack = [work.title, work.authorName, work.note, work.folder, work.tags.join(" "), work.url, accountName]
        .join("\n")
        .toLocaleLowerCase();
      return haystack.includes(text);
    });
}

export function uniqueValues(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}
