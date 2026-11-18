import type { Account, AccountStatus, LibraryMeta, LibraryState, WatchStatus, Work } from "../types";
import { isLockedSeedId, isSafeId } from "./id";
import { LIMITS } from "./limits";
import { createEmptyState, createSeedState, lockedHomepageSet, SEED_TIME } from "./seed";
import { cleanPlainText, isRecord, own, parseTags, readStringMap } from "./text";
import { canonicalDouyinUrl, canonicalHttpUrl, parseAccountHomepage } from "./url";

export const STORAGE_KEY = "videomaster.library.v1";
export const GUIDE_KEY = "videomaster.guide.v1";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type LoadIssue =
  | { code: "unavailable" }
  | { code: "quota" }
  | { code: "corrupt"; raw: string }
  | { code: "repaired"; dropped: number };

export interface LoadResult {
  state: LibraryState;
  persisted: boolean;
  issue: LoadIssue | null;
}

export type SaveResult = { ok: true } | { ok: false; code: "unavailable" | "quota" };

function storageFailure(error: unknown): "quota" | "unavailable" {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED") return "quota";
  return "unavailable";
}

export function browserStorage(): StorageLike | null {
  try {
    const probe = "__videomaster_probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

export function saveLibrary(state: LibraryState, storage: StorageLike | null): SaveResult {
  if (!storage) return { ok: false, code: "unavailable" };
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    return { ok: true };
  } catch (error) {
    return { ok: false, code: storageFailure(error) };
  }
}

function readTime(value: unknown, fallback: string): string {
  if (typeof value !== "string" || value.length > 40) return fallback;
  const time = Date.parse(value);
  if (Number.isNaN(time)) return fallback;
  return new Date(time).toISOString();
}

function readStatus(value: unknown): AccountStatus {
  if (value === "paused" || value === "archived" || value === "tracking") return value;
  return "tracking";
}

function readWatchStatus(value: unknown): WatchStatus {
  if (value === "watched" || value === "reference" || value === "todo") return value;
  return "todo";
}

function readOrigin(id: string, homepage: string, claimed: unknown): Account["origin"] {
  if (lockedHomepageSet().has(homepage)) return "seed";
  if (claimed === "seed" && isLockedSeedId(id)) return "seed";
  return "user";
}

function readRating(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 5) return null;
  return value;
}

function sanitizeMeta(value: unknown): LibraryMeta {
  const meta = isRecord(value) ? value : {};
  const sourceUrl = own(meta, "sourceUrl");
  return {
    sourceTitle: cleanPlainText(own(meta, "sourceTitle"), LIMITS.sourceTitle),
    sourceUrl: typeof sourceUrl === "string" ? (canonicalHttpUrl(sourceUrl) ?? "") : "",
    seedExportedAt: cleanPlainText(own(meta, "seedExportedAt"), 80),
    notes: cleanPlainText(own(meta, "notes"), LIMITS.metaNote),
    fields: readStringMap(own(meta, "fields"), LIMITS.fieldKey, LIMITS.fieldValue, LIMITS.fields),
  };
}

function sanitizeAccount(value: unknown, now: string): Account | null {
  if (!isRecord(value)) return null;
  const id = own(value, "id");
  if (typeof id !== "string" || !isSafeId(id)) return null;
  const name = cleanPlainText(own(value, "name"), LIMITS.name);
  const homepageRaw = own(value, "homepage");
  if (!name || typeof homepageRaw !== "string") return null;
  const homepage = parseAccountHomepage(homepageRaw);
  if (!homepage) return null;
  return {
    id,
    name,
    homepage: homepage.href,
    homepageKind: homepage.kind,
    track: cleanPlainText(own(value, "track"), LIMITS.track) || "未分组",
    batch: cleanPlainText(own(value, "batch"), LIMITS.batch),
    tags: parseTags(own(value, "tags")),
    status: readStatus(own(value, "status")),
    note: cleanPlainText(own(value, "note"), LIMITS.note),
    origin: readOrigin(id, homepage.href, own(value, "origin")),
    createdAt: readTime(own(value, "createdAt"), now),
    updatedAt: readTime(own(value, "updatedAt"), now),
  };
}

function sanitizeWork(value: unknown, now: string): Work | null {
  if (!isRecord(value)) return null;
  const id = own(value, "id");
  const urlRaw = own(value, "url");
  if (typeof id !== "string" || !isSafeId(id) || typeof urlRaw !== "string") return null;
  const url = canonicalDouyinUrl(urlRaw);
  if (!url) return null;
  const accountId = own(value, "accountId");
  return {
    id,
    url,
    title: cleanPlainText(own(value, "title"), LIMITS.title),
    authorName: cleanPlainText(own(value, "authorName"), LIMITS.author),
    accountId: typeof accountId === "string" && isSafeId(accountId) ? accountId : null,
    folder: cleanPlainText(own(value, "folder"), LIMITS.folder),
    tags: parseTags(own(value, "tags")),
    rating: readRating(own(value, "rating")),
    starred: own(value, "starred") === true,
    note: cleanPlainText(own(value, "note"), LIMITS.note),
    watchStatus: readWatchStatus(own(value, "watchStatus")),
    createdAt: readTime(own(value, "createdAt"), now),
    updatedAt: readTime(own(value, "updatedAt"), now),
  };
}

export function parseStoredLibrary(raw: string, now = SEED_TIME): { ok: true; state: LibraryState; dropped: number } | { ok: false } {
  let data: unknown;
  try {
    data = JSON.parse(raw) as unknown;
  } catch {
    return { ok: false };
  }
  if (!isRecord(data)) return { ok: false };
  if (data.version !== 1 || typeof data.seedApplied !== "boolean") return { ok: false };
  if (!Array.isArray(data.accounts) || !Array.isArray(data.works)) return { ok: false };
  if (data.accounts.length > LIMITS.accounts || data.works.length > LIMITS.works) return { ok: false };

  const accounts: Account[] = [];
  const seenIds = new Set<string>();
  const seenHomepages = new Set<string>();
  let dropped = 0;
  for (const item of data.accounts) {
    const account = sanitizeAccount(item, now);
    if (!account || seenIds.has(account.id) || seenHomepages.has(account.homepage)) {
      dropped += 1;
      continue;
    }
    seenIds.add(account.id);
    seenHomepages.add(account.homepage);
    accounts.push(account);
  }

  const accountIds = new Set(accounts.map((account) => account.id));
  const works: Work[] = [];
  const seenUrls = new Set<string>();
  for (const item of data.works) {
    const work = sanitizeWork(item, now);
    if (!work || seenIds.has(work.id) || seenUrls.has(work.url)) {
      dropped += 1;
      continue;
    }
    seenIds.add(work.id);
    seenUrls.add(work.url);
    works.push(work.accountId && !accountIds.has(work.accountId) ? { ...work, accountId: null } : work);
  }

  return {
    ok: true,
    dropped,
    state: {
      version: 1,
      seedApplied: data.seedApplied,
      meta: sanitizeMeta(data.meta),
      accounts,
      works,
    },
  };
}

export function loadLibrary(storage: StorageLike | null, now = SEED_TIME): LoadResult {
  if (!storage) {
    return { state: createSeedState(now), persisted: false, issue: { code: "unavailable" } };
  }
  let raw: string | null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return { state: createSeedState(now), persisted: false, issue: { code: "unavailable" } };
  }
  if (raw === null) {
    const state = createSeedState(now);
    const saved = saveLibrary(state, storage);
    return {
      state,
      persisted: saved.ok,
      issue: saved.ok ? null : { code: saved.code },
    };
  }
  const parsed = parseStoredLibrary(raw, now);
  if (!parsed.ok) {
    return { state: createEmptyState(), persisted: false, issue: { code: "corrupt", raw } };
  }
  return {
    state: parsed.state,
    persisted: true,
    issue: parsed.dropped > 0 ? { code: "repaired", dropped: parsed.dropped } : null,
  };
}
