import { useState } from "react";
import type { LibraryState } from "./types";
import { AccountsView } from "./components/AccountsView";
import { BackupView } from "./components/BackupView";
import { WorksView } from "./components/WorksView";
import { createSeedState } from "./lib/seed";
import { GUIDE_KEY, browserStorage, loadLibrary, saveLibrary, type LoadIssue, type StorageLike } from "./lib/storage";
import { downloadText } from "./lib/download";

const UNAVAILABLE_TEXT = "浏览器存储不可用。当前内容只在这次打开期间有效，刷新或关闭后不会保留，也没有云同步。";
const QUOTA_TEXT = "浏览器存储空间不足，最近的修改可能没有写进去。请导出 JSON 备份，并清理站点数据后重试。";

type Tab = "accounts" | "works" | "backup";

interface UndoState {
  label: string;
  snapshot: LibraryState;
}

function bannerFor(issue: LoadIssue | null): string | null {
  if (!issue) return null;
  if (issue.code === "unavailable") return UNAVAILABLE_TEXT;
  if (issue.code === "quota") return QUOTA_TEXT;
  if (issue.code === "repaired") {
    return `本地数据里有 ${issue.dropped} 条无法读取的记录，已暂时跳过。其余内容还在。点击「保存可读数据」后才会覆盖原来的记录。`;
  }
  return null;
}

export function App({ storage }: { storage?: StorageLike | null }) {
  const [boot] = useState(() => {
    const store = storage === undefined ? browserStorage() : storage;
    const result = loadLibrary(store);
    let guide = true;
    if (store) {
      try {
        guide = store.getItem(GUIDE_KEY) !== "1";
      } catch {
        guide = true;
      }
    }
    return { store, result, guide };
  });
  const [state, setState] = useState(boot.result.state);
  const [persisted, setPersisted] = useState(boot.result.persisted);
  const [banner, setBanner] = useState<string | null>(bannerFor(boot.result.issue));
  const [needsSave, setNeedsSave] = useState(boot.result.issue?.code === "repaired");
  const [corruptRaw, setCorruptRaw] = useState(boot.result.issue?.code === "corrupt" ? boot.result.issue.raw : null);
  const [guideOpen, setGuideOpen] = useState(boot.guide);
  const [tab, setTab] = useState<Tab>("accounts");
  const [undo, setUndo] = useState<UndoState | null>(null);

  const searchCount = state.accounts.filter((account) => account.homepageKind === "search").length;
  const storageLabel = corruptRaw ? "已停止写入" : needsSave ? "有跳过的记录" : persisted ? "已写入本机" : "未写入本机";

  function commit(next: LibraryState, undoLabel?: string) {
    if (corruptRaw) return;
    setUndo(undoLabel ? { label: undoLabel, snapshot: state } : null);
    setState(next);
    const saved = saveLibrary(next, boot.store);
    setPersisted(saved.ok);
    if (!saved.ok) {
      setBanner(saved.code === "quota" ? QUOTA_TEXT : UNAVAILABLE_TEXT);
      return;
    }
    setNeedsSave(false);
    setBanner(null);
  }

  function dismissGuide() {
    setGuideOpen(false);
    try {
      boot.store?.setItem(GUIDE_KEY, "1");
    } catch {
      // Dismissal still applies for this visit.
    }
  }

  function replaceStored(next: LibraryState) {
    const saved = saveLibrary(next, boot.store);
    if (!saved.ok) {
      setBanner(saved.code === "quota" ? QUOTA_TEXT : UNAVAILABLE_TEXT);
      return;
    }
    setState(next);
    setCorruptRaw(null);
    setPersisted(true);
    setNeedsSave(false);
    setBanner(null);
    setUndo(null);
  }

  return (
    <div className="app">
      <a className="skip" href="#content">
        跳到内容
      </a>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand-row">
            <div className="brand">
              <span className="mark" aria-hidden="true">
                片
              </span>
              <div>
                <p className="kicker">VideoMaster</p>
                <h1>片库</h1>
              </div>
            </div>
            <p className={`storage-pill ${persisted && !needsSave && !corruptRaw ? "ok" : "warn"}`}>{storageLabel}</p>
          </div>
          <p className="persist-note">仅保存在当前浏览器。清除缓存或站点数据会丢失，不会自动跨设备，也没有云同步。</p>
          <p className="stats">
            <strong>{state.accounts.length}</strong> 个账号
            <span>{state.accounts.length - searchCount} 个主页</span>
            <span>{searchCount} 个搜索入口</span>
            <span>{state.works.length} 条收藏</span>
          </p>
          <div className="tabs" role="tablist" aria-label="栏目">
            <button type="button" role="tab" aria-selected={tab === "accounts"} onClick={() => setTab("accounts")}>
              账号
            </button>
            <button type="button" role="tab" aria-selected={tab === "works"} onClick={() => setTab("works")}>
              收藏
            </button>
            <button type="button" role="tab" aria-selected={tab === "backup"} onClick={() => setTab("backup")}>
              备份
            </button>
          </div>
        </div>
      </header>
      <main id="content" className="shell">
        {guideOpen ? <Guide onDismiss={dismissGuide} /> : (
          <div className="guide-reopen">
            <button type="button" className="text-button" onClick={() => setGuideOpen(true)}>
              使用说明
            </button>
          </div>
        )}
        {banner ? (
          <div className="banner" role="status">
            <p>{banner}</p>
            {needsSave ? (
              <button type="button" className="ghost" onClick={() => commit(state)}>
                保存可读数据
              </button>
            ) : null}
          </div>
        ) : null}
        {corruptRaw !== null ? (
          <CorruptPanel
            onDownload={() => downloadText("videomaster-corrupt.json", corruptRaw)}
            onReset={() => replaceStored(createSeedState())}
            onEmpty={() => replaceStored({ ...createSeedState(), accounts: [], works: [] })}
          />
        ) : tab === "accounts" ? (
          <AccountsView state={state} onCommit={commit} />
        ) : tab === "works" ? (
          <WorksView state={state} onCommit={commit} />
        ) : (
          <BackupView state={state} onCommit={commit} />
        )}
        <p className="footer-note">片库不会连接抖音服务器，也不会上传数据。备注里的粉丝数和剧名只是当时写下的文字。</p>
      </main>
      {undo ? (
        <div className="toast" role="status">
          <span>{undo.label}</span>
          <button type="button" onClick={() => commit(undo.snapshot)}>
            撤销
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Guide({ onDismiss }: { onDismiss: () => void }) {
  return (
    <section className="guide" aria-labelledby="guide-title">
      <div className="section-head">
        <div>
          <p className="kicker">初次使用</p>
          <h2 id="guide-title">本机账号池已经备好</h2>
        </div>
        <button type="button" className="ghost" onClick={onDismiss}>
          知道了
        </button>
      </div>
      <ul>
        <li>首次打开时放入 40 个已锁账号：头部精品 20、怪异特异 16、观察 4。收藏夹是空的。删除后再刷新，不会自动种回去。</li>
        <li>其中 5 个是搜索入口，会单独标出。那是看板给出的搜索页，不是已核实的作者主页。</li>
        <li>备注里的粉丝数、作品数和剧名是 2026-11-18 前后的历史记录，只作为带日期的备注，不是实时统计，也不是已收藏视频。</li>
        <li>数据只在当前浏览器。清除缓存会丢失，换设备不会跟着走。需要留底时，到「备份」导出 JSON。</li>
        <li>删除账号默认保留收藏。作品只打开抖音原链接，本页不播放、不下载、不抓取。</li>
      </ul>
    </section>
  );
}

function CorruptPanel({ onDownload, onReset, onEmpty }: { onDownload: () => void; onReset: () => void; onEmpty: () => void }) {
  return (
    <section className="card corrupt">
      <p className="kicker">无法读取</p>
      <h2>本地数据无法解析</h2>
      <p>为避免覆盖损坏内容，片库已停止写入。原始文本还在浏览器里，可以先下载。</p>
      <div className="actions">
        <button type="button" className="primary" onClick={onDownload}>
          下载损坏的原文
        </button>
        <button type="button" className="ghost" onClick={onReset}>
          重置为 40 个已锁账号
        </button>
        <button type="button" className="danger" onClick={onEmpty}>
          从空库开始
        </button>
      </div>
    </section>
  );
}
