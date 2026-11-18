import seedFile from "../data/locked-accounts.json";
import type { Account, LibraryMeta, LibraryState } from "../types";
import { LIMITS } from "./limits";
import { cleanPlainText, readStringMap } from "./text";
import { canonicalHttpUrl, parseAccountHomepage } from "./url";

export const SEED_TIME = "2026-11-18T02:02:43.000Z";

interface SeedAccountFile {
  name: string;
  homepage: string;
  track: string;
  batch: string;
  note: string;
  homepageKind: "user" | "search";
}

interface SeedFile {
  sourceTitle?: string;
  sourceUrl?: string;
  exportedAt?: string;
  notes?: string;
  fields?: Record<string, string>;
  accounts: SeedAccountFile[];
  batchCounts?: Record<string, number>;
  trackCounts?: Record<string, number>;
}

const seed = seedFile as SeedFile;

export function getSeedFile(): SeedFile {
  return seed;
}

export function seedMeta(): LibraryMeta {
  return {
    sourceTitle: cleanPlainText(seed.sourceTitle, LIMITS.sourceTitle),
    sourceUrl: canonicalHttpUrl(seed.sourceUrl ?? "") ?? "",
    seedExportedAt: cleanPlainText(seed.exportedAt, 80),
    notes: cleanPlainText(seed.notes, LIMITS.metaNote),
    fields: readStringMap(seed.fields, LIMITS.fieldKey, LIMITS.fieldValue, LIMITS.fields),
  };
}

export function createSeedState(now = SEED_TIME): LibraryState {
  const accounts: Account[] = seed.accounts.map((raw, index) => {
    const homepage = parseAccountHomepage(raw.homepage);
    if (!homepage) throw new Error(`预载账号主页无效：${raw.name}`);
    if (homepage.kind !== raw.homepageKind) {
      throw new Error(`预载账号入口类型与链接不一致：${raw.name}`);
    }
    return {
      id: `locked-${String(index + 1).padStart(2, "0")}`,
      name: raw.name,
      homepage: homepage.href,
      homepageKind: homepage.kind,
      track: raw.track,
      batch: raw.batch,
      tags: [],
      status: "tracking",
      note: raw.note,
      origin: "seed",
      createdAt: now,
      updatedAt: now,
    };
  });
  return {
    version: 1,
    seedApplied: true,
    meta: seedMeta(),
    accounts,
    works: [],
  };
}

let lockedHomepages: Set<string> | null = null;

export function lockedHomepageSet(): Set<string> {
  if (!lockedHomepages) {
    lockedHomepages = new Set(createSeedState().accounts.map((account) => account.homepage));
  }
  return lockedHomepages;
}

export function createEmptyState(): LibraryState {
  return {
    version: 1,
    seedApplied: true,
    meta: {
      sourceTitle: "",
      sourceUrl: "",
      seedExportedAt: "",
      notes: "",
      fields: {},
    },
    accounts: [],
    works: [],
  };
}
