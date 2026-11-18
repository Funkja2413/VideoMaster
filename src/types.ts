export const LIBRARY_VERSION = 1;

export type HomepageKind = "user" | "search";

export type AccountStatus = "tracking" | "paused" | "archived";

export type WatchStatus = "todo" | "watched" | "reference";

export type AccountOrigin = "seed" | "user";

export interface Account {
  id: string;
  name: string;
  homepage: string;
  homepageKind: HomepageKind;
  track: string;
  batch: string;
  tags: string[];
  status: AccountStatus;
  note: string;
  origin: AccountOrigin;
  createdAt: string;
  updatedAt: string;
}

export interface Work {
  id: string;
  url: string;
  title: string;
  authorName: string;
  accountId: string | null;
  folder: string;
  tags: string[];
  rating: number | null;
  starred: boolean;
  note: string;
  watchStatus: WatchStatus;
  createdAt: string;
  updatedAt: string;
}

export interface LibraryMeta {
  sourceTitle: string;
  sourceUrl: string;
  seedExportedAt: string;
  notes: string;
  fields: Record<string, string>;
}

export interface LibraryState {
  version: typeof LIBRARY_VERSION;
  seedApplied: boolean;
  meta: LibraryMeta;
  accounts: Account[];
  works: Work[];
}

export interface AccountInput {
  name: string;
  homepage: string;
  track: string;
  batch: string;
  tags: string[] | string;
  status: AccountStatus;
  note: string;
}

export interface WorkInput {
  url: string;
  title: string;
  authorName: string;
  accountId: string | null;
  folder: string;
  tags: string[] | string;
  rating: number | null;
  starred: boolean;
  note: string;
  watchStatus: WatchStatus;
}
