import type { Account, AccountInput, AccountStatus, LibraryState, WatchStatus, Work, WorkInput } from "../types";
import { createId, isLockedSeedId } from "./id";
import { LIMITS } from "./limits";
import { lockedHomepageSet } from "./seed";
import { cleanPlainText, parseTags } from "./text";
import { canonicalDouyinUrl, parseAccountHomepage } from "./url";

export interface MutationOk {
  ok: true;
  state: LibraryState;
}

export interface MutationError {
  ok: false;
  error: string;
}

export type MutationResult = MutationOk | MutationError;

function originForHomepage(homepage: string, current?: Account["origin"], id?: string): Account["origin"] {
  if (lockedHomepageSet().has(homepage)) return "seed";
  if (current === "seed" && id && isLockedSeedId(id)) return "seed";
  return "user";
}

export function accountInputFromAccount(account: Account): AccountInput {
  return {
    name: account.name,
    homepage: account.homepage,
    track: account.track,
    batch: account.batch,
    tags: account.tags,
    status: account.status,
    note: account.note,
  };
}

function buildAccount(input: AccountInput, id: string, origin: Account["origin"], createdAt: string, updatedAt: string): Account | MutationError {
  const name = cleanPlainText(input.name, LIMITS.name);
  if (!name) return { ok: false, error: "请填写账号名称。" };
  const homepage = parseAccountHomepage(input.homepage);
  if (!homepage) {
    return { ok: false, error: "主页只接受 douyin.com 或 iesdouyin.com 上的 /user 或 /search 链接。" };
  }
  const track = cleanPlainText(input.track, LIMITS.track) || "未分组";
  return {
    id,
    name,
    homepage: homepage.href,
    homepageKind: homepage.kind,
    track,
    batch: cleanPlainText(input.batch, LIMITS.batch),
    tags: parseTags(input.tags),
    status: input.status,
    note: cleanPlainText(input.note, LIMITS.note),
    origin,
    createdAt,
    updatedAt,
  };
}

export function createAccount(state: LibraryState, input: AccountInput, now: string, id = createId()): MutationResult {
  if (state.accounts.length >= LIMITS.accounts) return { ok: false, error: "账号数量已达上限。" };
  const account = buildAccount(input, id, "user", now, now);
  if ("ok" in account) return account;
  if (state.accounts.some((item) => item.homepage === account.homepage)) {
    return { ok: false, error: "已经有相同主页链接的账号。" };
  }
  return {
    ok: true,
    state: {
      ...state,
      accounts: [...state.accounts, { ...account, origin: originForHomepage(account.homepage) }],
    },
  };
}

export function updateAccount(state: LibraryState, id: string, input: AccountInput, now: string): MutationResult {
  const current = state.accounts.find((account) => account.id === id);
  if (!current) return { ok: false, error: "找不到这个账号。" };
  const account = buildAccount(input, id, current.origin, current.createdAt, now);
  if ("ok" in account) return account;
  if (state.accounts.some((item) => item.id !== id && item.homepage === account.homepage)) {
    return { ok: false, error: "已经有相同主页链接的账号。" };
  }
  return {
    ok: true,
    state: {
      ...state,
      accounts: state.accounts.map((item) =>
        item.id === id ? { ...account, origin: originForHomepage(account.homepage, current.origin, id) } : item,
      ),
    },
  };
}

export function deleteAccount(state: LibraryState, id: string, options: { deleteWorks: boolean }, now: string): LibraryState {
  const account = state.accounts.find((item) => item.id === id);
  if (!account) return state;
  const accounts = state.accounts.filter((item) => item.id !== id);
  const works = options.deleteWorks
    ? state.works.filter((work) => work.accountId !== id)
    : state.works.map((work) => {
        if (work.accountId !== id) return work;
        return {
          ...work,
          accountId: null,
          authorName: work.authorName || account.name,
          updatedAt: now,
        };
      });
  return { ...state, accounts, works };
}

function buildWork(input: WorkInput, id: string, createdAt: string, updatedAt: string, state: LibraryState): Work | MutationError {
  const href = canonicalDouyinUrl(input.url);
  if (!href) return { ok: false, error: "作品链接只接受 http 或 https 的 douyin.com、iesdouyin.com 链接。" };
  if (input.accountId && !state.accounts.some((account) => account.id === input.accountId)) {
    return { ok: false, error: "关联账号不存在。可以不关联账号，直接保存收藏。" };
  }
  const rating = normalizeRating(input.rating);
  return {
    id,
    url: href,
    title: cleanPlainText(input.title, LIMITS.title),
    authorName: cleanPlainText(input.authorName, LIMITS.author),
    accountId: input.accountId,
    folder: cleanPlainText(input.folder, LIMITS.folder),
    tags: parseTags(input.tags),
    rating,
    starred: Boolean(input.starred),
    note: cleanPlainText(input.note, LIMITS.note),
    watchStatus: input.watchStatus,
    createdAt,
    updatedAt,
  };
}

function normalizeRating(rating: number | null): number | null {
  if (rating === null) return null;
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return null;
  return rating;
}

export function createWork(state: LibraryState, input: WorkInput, now: string, id = createId()): MutationResult {
  if (state.works.length >= LIMITS.works) return { ok: false, error: "收藏数量已达上限。" };
  const work = buildWork(input, id, now, now, state);
  if ("ok" in work) return work;
  if (state.works.some((item) => item.url === work.url)) return { ok: false, error: "已经收藏过相同链接。" };
  return { ok: true, state: { ...state, works: [...state.works, work] } };
}

export function updateWork(state: LibraryState, id: string, input: WorkInput, now: string): MutationResult {
  const current = state.works.find((work) => work.id === id);
  if (!current) return { ok: false, error: "找不到这条收藏。" };
  const work = buildWork(input, id, current.createdAt, now, state);
  if ("ok" in work) return work;
  if (state.works.some((item) => item.id !== id && item.url === work.url)) {
    return { ok: false, error: "已经收藏过相同链接。" };
  }
  return { ok: true, state: { ...state, works: state.works.map((item) => (item.id === id ? work : item)) } };
}

export function deleteWork(state: LibraryState, id: string): LibraryState {
  if (!state.works.some((work) => work.id === id)) return state;
  return { ...state, works: state.works.filter((work) => work.id !== id) };
}

export function countBy(items: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const key = item || "未填写";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

export function isAccountStatus(value: string): value is AccountStatus {
  return value === "tracking" || value === "paused" || value === "archived";
}

export function isWatchStatus(value: string): value is WatchStatus {
  return value === "todo" || value === "watched" || value === "reference";
}
