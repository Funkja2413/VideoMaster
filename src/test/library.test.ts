import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyImport, exportLibrary, previewImport } from "../lib/backup";
import { filterAccounts, filterWorks } from "../lib/filter";
import { createAccount, createWork, deleteAccount, updateAccount, updateWork } from "../lib/model";
import { createEmptyState, createSeedState, getSeedFile } from "../lib/seed";
import { STORAGE_KEY, loadLibrary, parseStoredLibrary, saveLibrary } from "../lib/storage";
import { byteLength } from "../lib/text";
import { memoryStorage } from "./helpers";

const NOW = "2026-11-18T08:00:00.000Z";
const SEARCH_NAMES = ["AIGC十三", "Mx-Shell", "可乐居士ColaJuice", "热心市民杨生", "草帽小蔡"];

function must<T extends { ok: boolean }>(result: T): Extract<T, { ok: true }> {
  if (!result.ok) throw new Error("expected ok");
  return result as Extract<T, { ok: true }>;
}

describe("已锁账号只预载一次", () => {
  it("首次读到 40 个已锁账号，收藏为空，分组和入口类型保持原样", () => {
    const state = createSeedState();
    const file = getSeedFile();
    expect(state.accounts).toHaveLength(40);
    expect(state.works).toEqual([]);
    expect(state.seedApplied).toBe(true);
    expect(state.accounts.filter((account) => account.track === "头部精品")).toHaveLength(20);
    expect(state.accounts.filter((account) => account.track === "怪异特异")).toHaveLength(16);
    expect(state.accounts.filter((account) => account.track === "观察")).toHaveLength(4);
    expect(state.accounts.filter((account) => account.homepageKind === "search").map((account) => account.name).sort()).toEqual([...SEARCH_NAMES].sort());
    expect(state.accounts.filter((account) => account.homepageKind === "user")).toHaveLength(35);
    expect(state.accounts.every((account) => account.origin === "seed" && account.status === "tracking")).toBe(true);
    expect(state.accounts.map((account) => account.note)).toEqual(file.accounts.map((account) => account.note));
    expect(state.accounts.map((account) => account.batch)).toEqual(file.accounts.map((account) => account.batch));
    expect(state.accounts[0]?.note).toContain("2026-11-18");
    expect(state.meta.sourceTitle).toBe("AI短剧对标账号池");
    expect(state.works.some((work) => work.url.includes("非妖哉"))).toBe(false);
  });

  it("删除后刷新不会重新种回", () => {
    const storage = memoryStorage();
    const first = loadLibrary(storage, NOW);
    expect(first.state.accounts).toHaveLength(40);
    expect(first.persisted).toBe(true);
    let cleared = first.state;
    for (const account of first.state.accounts) cleared = deleteAccount(cleared, account.id, { deleteWorks: false }, NOW);
    expect(saveLibrary(cleared, storage).ok).toBe(true);
    const second = loadLibrary(storage, NOW);
    expect(second.state.accounts).toHaveLength(0);
    expect(second.state.works).toHaveLength(0);
    expect(second.state.seedApplied).toBe(true);
    expect(second.issue).toBeNull();
  });

  it("损坏的本地数据不会被覆盖，也不会自动种回", () => {
    const storage = memoryStorage({ [STORAGE_KEY]: "{" });
    const loaded = loadLibrary(storage, NOW);
    expect(loaded.issue?.code).toBe("corrupt");
    expect(loaded.state.accounts).toHaveLength(0);
    expect(loaded.persisted).toBe(false);
    expect(storage.getItem(STORAGE_KEY)).toBe("{");
  });

  it("存储不可用时只放在内存里", () => {
    const loaded = loadLibrary(null, NOW);
    expect(loaded.issue?.code).toBe("unavailable");
    expect(loaded.persisted).toBe(false);
    expect(loaded.state.accounts).toHaveLength(40);
    expect(saveLibrary(loaded.state, null)).toEqual({ ok: false, code: "unavailable" });
  });
});

describe("账号与收藏", () => {
  it("可以增改账号，删除时默认保留收藏", () => {
    let state = createSeedState();
    const added = must(createAccount(state, {
      name: "新追踪",
      homepage: "https://www.douyin.com/user/MS4wNEWACCOUNT",
      track: "观察",
      batch: "五批",
      tags: "手工，手工",
      status: "paused",
      note: "<b>备注</b>",
    }, NOW, "user-1"));
    state = added.state;
    const created = state.accounts.find((account) => account.id === "user-1");
    expect(created?.origin).toBe("user");
    expect(created?.tags).toEqual(["手工"]);
    expect(created?.note).toBe("<b>备注</b>");
    expect(created?.status).toBe("paused");

    const edited = must(updateAccount(state, "user-1", {
      name: "新追踪改",
      homepage: "https://www.douyin.com/search/新追踪",
      track: "观察",
      batch: "五批",
      tags: [],
      status: "tracking",
      note: "改后备注",
    }, NOW));
    expect(edited.state.accounts.find((account) => account.id === "user-1")?.homepageKind).toBe("search");

    const work = must(createWork(state, {
      url: "https://v.douyin.com/manualDemo1/",
      title: "手动标题",
      authorName: "",
      accountId: "locked-01",
      folder: "待拆解",
      tags: "镜头，参考",
      rating: 4,
      starred: true,
      note: "笔记甲",
      watchStatus: "todo",
    }, NOW, "work-1"));
    state = work.state;
    const updated = must(updateWork(state, "work-1", {
      url: "https://www.douyin.com/video/7123456789012345678",
      title: "手动标题",
      authorName: "手填作者",
      accountId: null,
      folder: "待拆解",
      tags: ["重点"],
      rating: 5,
      starred: false,
      note: "改后的笔记",
      watchStatus: "reference",
    }, NOW));
    const saved = updated.state.works[0];
    expect(saved?.watchStatus).toBe("reference");
    expect(saved?.note).toBe("改后的笔记");
    expect(saved?.tags).toEqual(["重点"]);
    expect(saved?.rating).toBe(5);
    expect(saved?.accountId).toBeNull();

    state = work.state;
    const removed = deleteAccount(state, "locked-01", { deleteWorks: false }, NOW);
    expect(removed.accounts.some((account) => account.id === "locked-01")).toBe(false);
    expect(removed.works).toHaveLength(1);
    expect(removed.works[0]?.accountId).toBeNull();
    expect(removed.works[0]?.authorName).toBe("不吃榨菜AIGC");
    const wiped = deleteAccount(state, "locked-01", { deleteWorks: true }, NOW);
    expect(wiped.works).toHaveLength(0);
  });

  it("搜索和筛选账号、收藏", () => {
    const state = createSeedState();
    expect(filterAccounts(state.accounts, { text: "《零号档案》", track: "", batch: "", status: "", homepageKind: "" }).map((account) => account.name)).toEqual(["白袋子"]);
    expect(filterAccounts(state.accounts, { text: "mx-shell", track: "头部精品", batch: "一批", status: "tracking", homepageKind: "search" })).toHaveLength(1);
    expect(filterAccounts(state.accounts, { text: "", track: "怪异特异", batch: "", status: "", homepageKind: "" })).toHaveLength(16);

    const withWork = must(createWork(state, {
      url: "https://v.douyin.com/filterDemo/",
      title: "样例标题",
      authorName: "手动作者",
      accountId: null,
      folder: "待拆解",
      tags: "参考镜头",
      rating: null,
      starred: true,
      note: "只是笔记",
      watchStatus: "todo",
    }, NOW, "work-filter")).state;
    const base = { text: "", watchStatus: "" as const, folder: "", starredOnly: false, accountId: "" };
    expect(filterWorks(withWork.works, withWork.accounts, { ...base, text: "参考镜头" })).toHaveLength(1);
    expect(filterWorks(withWork.works, withWork.accounts, { ...base, text: "只是笔记", watchStatus: "watched" })).toHaveLength(0);
    expect(filterWorks(withWork.works, withWork.accounts, { ...base, folder: "待拆解", starredOnly: true, accountId: "none" })).toHaveLength(1);
  });

  it("拒绝非法作品链接，并允许不关联账号", () => {
    const state = createEmptyState();
    expect(createWork(state, {
      url: "javascript:alert(1)",
      title: "x",
      authorName: "",
      accountId: null,
      folder: "",
      tags: [],
      rating: null,
      starred: false,
      note: "",
      watchStatus: "todo",
    }, NOW).ok).toBe(false);
    const saved = must(createWork(state, {
      url: "https://www.iesdouyin.com/share/video/55",
      title: "",
      authorName: "独立作者",
      accountId: null,
      folder: "",
      tags: "",
      rating: 9,
      starred: false,
      note: "",
      watchStatus: "watched",
    }, NOW, "solo"));
    expect(saved.state.works[0]?.accountId).toBeNull();
    expect(saved.state.works[0]?.rating).toBeNull();
    expect(saved.state.accounts).toHaveLength(0);
  });
});

describe("导入导出", () => {
  it("兼容已锁账号 JSON，往返不丢字段，也不把剧名变成视频", () => {
    const raw = readFileSync(join(process.cwd(), "src/data/locked-accounts.json"), "utf8");
    const file = JSON.parse(raw) as { accounts: Array<{ note: string }>; sourceTitle: string; notes: string };
    const imported = must(previewImport(createEmptyState(), raw, NOW, sequence()));
    expect(imported.preview.accountsToAdd).toHaveLength(40);
    expect(imported.preview.worksToAdd).toHaveLength(0);
    expect(imported.preview.invalidAccounts).toHaveLength(0);
    expect(imported.preview.meta.sourceTitle).toBe(file.sourceTitle);
    expect(imported.preview.meta.notes).toBe(file.notes);
    const dramas = file.accounts.flatMap((account) => [...account.note.matchAll(/《([^》]+)》/g)].map((match) => match[1]));
    expect(dramas.length).toBeGreaterThan(10);
    expect(imported.preview.worksToAdd).toHaveLength(0);

    const merged = applyImport(createEmptyState(), imported.preview);
    expect(merged.works).toEqual([]);
    expect(merged.accounts.map((account) => account.note)).toEqual(file.accounts.map((account) => account.note));
    const again = must(previewImport(merged, raw, NOW));
    expect(again.preview.accountsToAdd).toHaveLength(0);
    expect(again.preview.duplicateAccounts).toBe(40);

    const withWork = must(createWork(merged, {
      url: "https://v.douyin.com/roundtrip1/",
      title: "往返标题",
      authorName: "往返作者",
      accountId: merged.accounts[0]?.id ?? null,
      folder: "夹",
      tags: ["甲"],
      rating: 3,
      starred: true,
      note: "往返笔记",
      watchStatus: "watched",
    }, NOW, "round-1")).state;
    const exported = exportLibrary(withWork, NOW);
    expect(exported.accounts).toHaveLength(40);
    expect(exported.count).toBe(40);
    expect(exported.trackCounts).toEqual({ 头部精品: 20, 怪异特异: 16, 观察: 4 });
    expect(exported.format).toBe("videomaster-backup");
    const round = applyImport(createEmptyState(), must(previewImport(createEmptyState(), JSON.stringify(exported), NOW)).preview);
    expect(round.accounts.map((account) => [account.name, account.homepageKind, account.track, account.batch, account.note])).toEqual(
      withWork.accounts.map((account) => [account.name, account.homepageKind, account.track, account.batch, account.note]),
    );
    expect(round.works.map((work) => [work.url, work.title, work.note, work.watchStatus, work.starred, work.rating])).toEqual(
      withWork.works.map((work) => [work.url, work.title, work.note, work.watchStatus, work.starred, work.rating]),
    );
    expect(parseStoredLibrary(JSON.stringify(withWork), NOW)).toMatchObject({ ok: true, dropped: 0 });
  });

  it("不把新候选标成已锁，并拒绝坏链接和超大文件", () => {
    const raw = JSON.stringify({
      accounts: [
        {
          id: "locked-01",
          origin: "seed",
          name: "日扫候选",
          homepage: "https://www.douyin.com/user/MS4wCANDIDATE",
          homepageKind: "user",
          note: "候选不是已锁",
        },
        {
          name: "搜索被误标",
          homepage: "https://www.douyin.com/search/真实搜索",
          homepageKind: "user",
        },
        {
          name: "<script>alert(1)</script>",
          homepage: "https://evil.com/douyin.com/user/abc",
        },
      ],
      works: [{ url: "javascript:alert(1)", title: "《伪造视频》" }],
    });
    const preview = must(previewImport(createEmptyState(), raw, NOW, sequence()));
    expect(preview.preview.accountsToAdd.map((account) => account.origin)).toEqual(["user", "user"]);
    expect(preview.preview.accountsToAdd[0]?.id).not.toMatch(/^locked-/);
    expect(preview.preview.accountsToAdd[1]?.homepageKind).toBe("search");
    expect(preview.preview.accountsToAdd[0]?.name).toBe("日扫候选");
    expect(preview.preview.invalidAccounts).toHaveLength(1);
    expect(preview.preview.invalidWorks).toHaveLength(1);
    expect(preview.preview.worksToAdd).toHaveLength(0);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();

    const huge = "x".repeat(2 * 1024 * 1024 + 1);
    expect(previewImport(createEmptyState(), huge, NOW).ok).toBe(false);
    expect(byteLength(huge)).toBeGreaterThan(2 * 1024 * 1024);
  });

  it("跳过损坏条目，但不因此重新预载", () => {
    const state = createSeedState();
    const broken = {
      ...state,
      accounts: [state.accounts[0], { id: "bad", name: "坏", homepage: "javascript:alert(1)" }],
    };
    const parsed = parseStoredLibrary(JSON.stringify(broken), NOW);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.dropped).toBe(1);
    expect(parsed.state.accounts).toHaveLength(1);
    expect(parsed.state.seedApplied).toBe(true);
    expect(parsed.state.accounts).not.toHaveLength(40);
  });
});

describe("渲染层不解释 HTML", () => {
  it("源码没有不安全的 HTML 注入", () => {
    const files = walk(join(process.cwd(), "src")).filter((file) => (file.endsWith(".ts") || file.endsWith(".tsx")) && !file.includes(`${join("src", "test")}`));
    const offenders = files.filter((file) => /dangerouslySetInnerHTML|innerHTML\s*=/.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });
});

function sequence(): () => string {
  let index = 0;
  return () => `import-${index += 1}`;
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walk(path);
    return [path];
  });
}
