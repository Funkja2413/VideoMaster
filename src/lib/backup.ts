import type { Account, LibraryMeta, LibraryState, Work } from "../types";
import { createId, isLockedSeedId, isSafeId } from "./id";
import { LIMITS } from "./limits";
import { countBy } from "./model";
import { lockedHomepageSet } from "./seed";
import { byteLength, cleanPlainText, isRecord, own, parseTags, readStringMap } from "./text";
import { canonicalDouyinUrl, canonicalHttpUrl, parseAccountHomepage } from "./url";

export type ImportCode = "too-large" | "not-json" | "shape" | "too-many";

export interface InvalidRow {
  index: number;
  message: string;
}

export interface ImportPreview {
  accountsToAdd: Account[];
  duplicateAccounts: number;
  invalidAccounts: InvalidRow[];
  worksToAdd: Work[];
  duplicateWorks: number;
  invalidWorks: InvalidRow[];
  meta: LibraryMeta;
  warnings: string[];
}

export type ImportResult = { ok: true; preview: ImportPreview } | { ok: false; code: ImportCode };

function readImportMeta(data: Record<string, unknown>): LibraryMeta {
  const exportedAt = cleanPlainText(own(data, "seedExportedAt") ?? own(data, "exportedAt"), 80);
  const sourceUrl = own(data, "sourceUrl");
  return {
    sourceTitle: cleanPlainText(own(data, "sourceTitle"), LIMITS.sourceTitle),
    sourceUrl: typeof sourceUrl === "string" ? (canonicalHttpUrl(sourceUrl) ?? "") : "",
    seedExportedAt: exportedAt,
    notes: cleanPlainText(own(data, "notes"), LIMITS.metaNote),
    fields: readStringMap(own(data, "fields"), LIMITS.fieldKey, LIMITS.fieldValue, LIMITS.fields),
  };
}

function nextId(requested: unknown, homepage: string, used: Set<string>, idFactory: () => string): string {
  const official = lockedHomepageSet().has(homepage);
  if (typeof requested === "string" && isSafeId(requested) && !used.has(requested) && !(isLockedSeedId(requested) && !official)) {
    return requested;
  }
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const id = idFactory();
    if (isSafeId(id) && !used.has(id) && !(isLockedSeedId(id) && !official)) return id;
  }
  return `user-${used.size.toString(36)}-${Date.now().toString(36)}`;
}

function readStatus(value: unknown): Account["status"] {
  if (value === "paused" || value === "archived") return value;
  return "tracking";
}

function readWatch(value: unknown): Work["watchStatus"] {
  if (value === "watched" || value === "reference") return value;
  return "todo";
}

function readRating(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 5) return null;
  return value;
}

function readTime(value: unknown, fallback: string): string {
  if (typeof value !== "string" || value.length > 40 || Number.isNaN(Date.parse(value))) return fallback;
  return new Date(value).toISOString();
}

export function previewImport(state: LibraryState, raw: string, now: string, idFactory: () => string = createId): ImportResult {
  if (typeof raw !== "string" || raw.length > LIMITS.importBytes || byteLength(raw) > LIMITS.importBytes) {
    return { ok: false, code: "too-large" };
  }
  let data: unknown;
  try {
    data = JSON.parse(raw) as unknown;
  } catch {
    return { ok: false, code: "not-json" };
  }
  if (!isRecord(data) || !Array.isArray(data.accounts)) return { ok: false, code: "shape" };
  const workItems = data.works === undefined ? [] : data.works;
  if (!Array.isArray(workItems)) return { ok: false, code: "shape" };
  if (data.accounts.length > LIMITS.accounts || workItems.length > LIMITS.works) return { ok: false, code: "too-many" };

  const warnings: string[] = [];
  const usedIds = new Set<string>([...state.accounts.map((account) => account.id), ...state.works.map((work) => work.id)]);
  const homepages = new Set(state.accounts.map((account) => account.homepage));
  const accountsToAdd: Account[] = [];
  const invalidAccounts: InvalidRow[] = [];
  let duplicateAccounts = 0;

  data.accounts.forEach((item, index) => {
    const row = index + 1;
    if (!isRecord(item)) {
      invalidAccounts.push({ index: row, message: `第 ${row} 条账号不是对象。` });
      return;
    }
    const name = cleanPlainText(own(item, "name"), LIMITS.name);
    const homepageRaw = own(item, "homepage");
    if (!name || typeof homepageRaw !== "string") {
      invalidAccounts.push({ index: row, message: `第 ${row} 条账号缺少名称或主页。` });
      return;
    }
    const homepage = parseAccountHomepage(homepageRaw);
    if (!homepage) {
      invalidAccounts.push({ index: row, message: `第 ${row} 条「${name}」的主页不是抖音主页或搜索链接。` });
      return;
    }
    if (homepages.has(homepage.href)) {
      duplicateAccounts += 1;
      return;
    }
    const claimedKind = own(item, "homepageKind");
    if ((claimedKind === "user" || claimedKind === "search") && claimedKind !== homepage.kind && warnings.length < 20) {
      warnings.push(`「${name}」已按链接更正为${homepage.kind === "search" ? "搜索入口" : "账号主页"}。`);
    }
    const id = nextId(own(item, "id"), homepage.href, usedIds, idFactory);
    usedIds.add(id);
    homepages.add(homepage.href);
    accountsToAdd.push({
      id,
      name,
      homepage: homepage.href,
      homepageKind: homepage.kind,
      track: cleanPlainText(own(item, "track"), LIMITS.track) || "未分组",
      batch: cleanPlainText(own(item, "batch"), LIMITS.batch),
      tags: parseTags(own(item, "tags")),
      status: readStatus(own(item, "status")),
      note: cleanPlainText(own(item, "note"), LIMITS.note),
      origin: lockedHomepageSet().has(homepage.href) ? "seed" : "user",
      createdAt: readTime(own(item, "createdAt"), now),
      updatedAt: readTime(own(item, "updatedAt"), now),
    });
  });

  const accountIds = new Set([...state.accounts, ...accountsToAdd].map((account) => account.id));
  const urls = new Set(state.works.map((work) => work.url));
  const worksToAdd: Work[] = [];
  const invalidWorks: InvalidRow[] = [];
  let duplicateWorks = 0;

  workItems.forEach((item, index) => {
    const row = index + 1;
    if (!isRecord(item)) {
      invalidWorks.push({ index: row, message: `第 ${row} 条收藏不是对象。` });
      return;
    }
    const urlRaw = own(item, "url");
    if (typeof urlRaw !== "string") {
      invalidWorks.push({ index: row, message: `第 ${row} 条收藏缺少链接。` });
      return;
    }
    const url = canonicalDouyinUrl(urlRaw);
    if (!url) {
      invalidWorks.push({ index: row, message: `第 ${row} 条收藏的链接不是抖音域名。` });
      return;
    }
    if (urls.has(url)) {
      duplicateWorks += 1;
      return;
    }
    const requestedAccount = own(item, "accountId");
    const accountId = typeof requestedAccount === "string" && accountIds.has(requestedAccount) ? requestedAccount : null;
    const id = nextId(own(item, "id"), url, usedIds, idFactory);
    usedIds.add(id);
    urls.add(url);
    worksToAdd.push({
      id,
      url,
      title: cleanPlainText(own(item, "title"), LIMITS.title),
      authorName: cleanPlainText(own(item, "authorName"), LIMITS.author),
      accountId,
      folder: cleanPlainText(own(item, "folder"), LIMITS.folder),
      tags: parseTags(own(item, "tags")),
      rating: readRating(own(item, "rating")),
      starred: own(item, "starred") === true,
      note: cleanPlainText(own(item, "note"), LIMITS.note),
      watchStatus: readWatch(own(item, "watchStatus")),
      createdAt: readTime(own(item, "createdAt"), now),
      updatedAt: readTime(own(item, "updatedAt"), now),
    });
  });

  if (state.accounts.length + accountsToAdd.length > LIMITS.accounts || state.works.length + worksToAdd.length > LIMITS.works) {
    return { ok: false, code: "too-many" };
  }

  return {
    ok: true,
    preview: {
      accountsToAdd,
      duplicateAccounts,
      invalidAccounts,
      worksToAdd,
      duplicateWorks,
      invalidWorks,
      meta: readImportMeta(data),
      warnings,
    },
  };
}

export function applyImport(state: LibraryState, preview: ImportPreview): LibraryState {
  const meta: LibraryMeta = {
    sourceTitle: state.meta.sourceTitle || preview.meta.sourceTitle,
    sourceUrl: state.meta.sourceUrl || preview.meta.sourceUrl,
    seedExportedAt: state.meta.seedExportedAt || preview.meta.seedExportedAt,
    notes: state.meta.notes || preview.meta.notes,
    fields: Object.keys(state.meta.fields).length > 0 ? state.meta.fields : preview.meta.fields,
  };
  return {
    ...state,
    seedApplied: true,
    meta,
    accounts: [...state.accounts, ...preview.accountsToAdd],
    works: [...state.works, ...preview.worksToAdd],
  };
}

export interface BackupFile {
  format: "videomaster-backup";
  version: 1;
  sourceTitle: string;
  sourceUrl: string;
  exportedAt: string;
  seedExportedAt: string;
  count: number;
  batchCounts: Record<string, number>;
  trackCounts: Record<string, number>;
  fields: Record<string, string>;
  notes: string;
  accounts: Array<Record<string, unknown>>;
  works: Work[];
}

export function exportLibrary(state: LibraryState, exportedAt: string): BackupFile {
  return {
    format: "videomaster-backup",
    version: 1,
    sourceTitle: state.meta.sourceTitle,
    sourceUrl: state.meta.sourceUrl,
    exportedAt,
    seedExportedAt: state.meta.seedExportedAt,
    count: state.accounts.length,
    batchCounts: countBy(state.accounts.map((account) => account.batch)),
    trackCounts: countBy(state.accounts.map((account) => account.track)),
    fields: state.meta.fields,
    notes: state.meta.notes,
    accounts: state.accounts.map((account) => ({
      name: account.name,
      homepage: account.homepage,
      homepageKind: account.homepageKind,
      track: account.track,
      batch: account.batch,
      note: account.note,
      id: account.id,
      tags: account.tags,
      status: account.status,
      origin: account.origin,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    })),
    works: state.works,
  };
}

export function exportFilename(exportedAt: string): string {
  const day = /^(\d{4}-\d{2}-\d{2})/.exec(exportedAt)?.[1] ?? "backup";
  return `videomaster-backup-${day}.json`;
}

export const IMPORT_ERROR: Record<ImportCode, string> = {
  "too-large": "文件超过 2MB，已拒绝导入。",
  "not-json": "这不是有效的 JSON。",
  shape: "JSON 里需要有 accounts 数组。作品可以没有。",
  "too-many": "账号或收藏数量超过上限。",
};
