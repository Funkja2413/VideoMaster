import { useCallback, useState, type FormEvent } from "react";
import type { Account, LibraryState, WatchStatus, Work, WorkInput } from "../types";
import { filterWorks, uniqueValues } from "../lib/filter";
import { WATCH_LABEL, WATCH_STATUSES } from "../lib/labels";
import { createWork, deleteWork, updateWork } from "../lib/model";
import { nowIso } from "../lib/text";
import { displayUrl, extractShare, parseDouyinUrl } from "../lib/url";
import { Dialog } from "./Dialog";
import { DouyinLink } from "./DouyinLink";

export function WorksView({
  state,
  onCommit,
}: {
  state: LibraryState;
  onCommit: (next: LibraryState, undoLabel?: string) => void;
}) {
  const [text, setText] = useState("");
  const [watchStatus, setWatchStatus] = useState<WatchStatus | "">("");
  const [folder, setFolder] = useState("");
  const [starredOnly, setStarredOnly] = useState(false);
  const [accountId, setAccountId] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);
  const closeCreate = useCallback(() => setCreating(false), []);
  const closeEdit = useCallback(() => setEditingId(null), []);
  const closeDelete = useCallback(() => setDeletingId(null), []);

  const folders = uniqueValues(state.works.map((work) => work.folder || "未分类"));
  const visible = filterWorks(state.works, state.accounts, { text, watchStatus, folder, starredOnly, accountId });
  const editing = state.works.find((work) => work.id === editingId);
  const deleting = state.works.find((work) => work.id === deletingId);

  function saveNew(input: WorkInput): string | null {
    const result = createWork(state, input, nowIso());
    if (!result.ok) return result.error;
    onCommit(result.state);
    setFormKey((value) => value + 1);
    setCreating(false);
    return null;
  }

  function saveEdit(input: WorkInput): string | null {
    if (!editing) return "找不到这条收藏。";
    const result = updateWork(state, editing.id, input, nowIso());
    if (!result.ok) return result.error;
    onCommit(result.state);
    setEditingId(null);
    return null;
  }

  function changeStatus(work: Work, next: WatchStatus) {
    if (work.watchStatus === next) return;
    const result = updateWork(state, work.id, workToInput(work, { watchStatus: next }), nowIso());
    if (result.ok) onCommit(result.state);
  }

  function toggleStar(work: Work) {
    const result = updateWork(state, work.id, workToInput(work, { starred: !work.starred }), nowIso());
    if (result.ok) onCommit(result.state);
  }

  return (
    <section aria-labelledby="works-heading">
      <div className="section-head">
        <div>
          <p className="kicker">收藏</p>
          <h2 id="works-heading">作品收藏</h2>
        </div>
        {state.works.length > 0 ? (
          <button type="button" className="primary" onClick={() => setCreating(true)}>
            新增收藏
          </button>
        ) : null}
      </div>

      {state.works.length === 0 ? (
        <div className="empty">
          <h3>还没有收藏作品</h3>
          <p>
            可以不先添加账号。把抖音分享文案粘贴进来，提取链接后自己填写标题、作者和笔记。这里不会生成封面或播放量，也不会把账号备注里的剧名当成视频。
          </p>
        </div>
      ) : (
        <div className="toolbar">
          <input aria-label="搜索收藏" placeholder="搜索标题、作者、笔记、标签、链接" value={text} onChange={(event) => setText(event.target.value)} />
          <div className="chips">
            <button type="button" className="chip" aria-pressed={watchStatus === ""} onClick={() => setWatchStatus("")}>
              全部状态
            </button>
            {WATCH_STATUSES.map((item) => (
              <button key={item} type="button" className="chip" aria-pressed={watchStatus === item} onClick={() => setWatchStatus(item)}>
                {WATCH_LABEL[item]}
              </button>
            ))}
            <button type="button" className="chip" aria-pressed={starredOnly} onClick={() => setStarredOnly((value) => !value)}>
              只看星标
            </button>
          </div>
          <div className="row-2">
            <label className="field">
              <span>按收藏夹筛选</span>
              <select aria-label="按收藏夹筛选" value={folder} onChange={(event) => setFolder(event.target.value)}>
                <option value="">全部收藏夹</option>
                {folders.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>按账号筛选</span>
              <select aria-label="按账号筛选" value={accountId} onChange={(event) => setAccountId(event.target.value)}>
                <option value="">全部</option>
                <option value="none">未关联</option>
                {state.accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="result-count">
            显示 {visible.length} / {state.works.length}
          </p>
        </div>
      )}

      {state.works.length === 0 ? (
        <WorkForm key={formKey} accounts={state.accounts} folders={folders} onSave={saveNew} />
      ) : null}

      {state.works.length > 0 && visible.length === 0 ? (
        <div className="empty">
          <h3>没有符合条件的收藏</h3>
          <p>换一个状态、收藏夹，或清空搜索。</p>
        </div>
      ) : null}

      <div className="list">
        {visible.map((work) => {
          const account = state.accounts.find((item) => item.id === work.accountId);
          const kind = parseDouyinUrl(work.url)?.kind;
          return (
            <article key={work.id} className="card">
              <div className="work-head">
                <h3>{work.title || "未命名作品"}</h3>
                <button type="button" className={work.starred ? "chip pressed" : "chip"} aria-pressed={work.starred} onClick={() => toggleStar(work)}>
                  {work.starred ? "已星标" : "星标"}
                </button>
              </div>
              <p className="meta-line">
                {work.authorName || "未填作者"}
                {account ? ` · 关联 ${account.name}` : " · 未关联账号"}
                {work.folder ? ` · ${work.folder}` : " · 未分类"}
                {work.rating ? ` · ${work.rating} / 5` : " · 未评分"}
              </p>
              <div className="badges">
                {work.tags.map((tag) => (
                  <span key={tag} className="badge">
                    {tag}
                  </span>
                ))}
              </div>
              <label className="inline-select">
                <span>观看状态</span>
                <select aria-label={`${work.title || "未命名作品"}的观看状态`} value={work.watchStatus} onChange={(event) => changeStatus(work, event.target.value as WatchStatus)}>
                  {WATCH_STATUSES.map((item) => (
                    <option key={item} value={item}>
                      {WATCH_LABEL[item]}
                    </option>
                  ))}
                </select>
              </label>
              {work.note ? <p className="note">{work.note}</p> : null}
              <p className="url-line">{displayUrl(work.url)}</p>
              {kind === "user" || kind === "search" ? <p className="hint">这条是主页或搜索链接。打开后去抖音，本页不播放。</p> : <p className="hint">打开抖音原链接。本页不内嵌播放，也没有封面和播放量。</p>}
              <div className="actions">
                <DouyinLink href={work.url} className="button" label={`在抖音打开：${work.title || "未命名作品"}`}>
                  在抖音打开
                </DouyinLink>
                <button type="button" className="ghost" aria-label={`编辑${work.title || "未命名作品"}`} onClick={() => setEditingId(work.id)}>
                  编辑
                </button>
                <button type="button" className="danger" aria-label={`删除${work.title || "未命名作品"}`} onClick={() => setDeletingId(work.id)}>
                  删除
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {creating ? (
        <Dialog title="新增收藏" onClose={closeCreate}>
          <WorkForm accounts={state.accounts} folders={folders} onSave={saveNew} onCancel={closeCreate} />
        </Dialog>
      ) : null}
      {editing ? (
        <Dialog title="编辑收藏" onClose={closeEdit}>
          <WorkForm accounts={state.accounts} folders={folders} initial={editing} onSave={saveEdit} onCancel={closeEdit} />
        </Dialog>
      ) : null}
      {deleting ? (
        <Dialog title="删除收藏" onClose={closeDelete}>
          <div className="form">
            <p>删除「{deleting.title || "未命名作品"}」后，可以用撤销恢复；刷新之后就不能撤销了。</p>
            <div className="actions">
              <button
                type="button"
                className="danger"
                onClick={() => {
                  onCommit(deleteWork(state, deleting.id), `已删除收藏「${deleting.title || "未命名作品"}」`);
                  setDeletingId(null);
                }}
              >
                确认删除
              </button>
              <button type="button" className="ghost" onClick={closeDelete}>
                取消
              </button>
            </div>
          </div>
        </Dialog>
      ) : null}
    </section>
  );
}

function workToInput(work: Work, patch: Partial<WorkInput> = {}): WorkInput {
  return {
    url: work.url,
    title: work.title,
    authorName: work.authorName,
    accountId: work.accountId,
    folder: work.folder,
    tags: work.tags,
    rating: work.rating,
    starred: work.starred,
    note: work.note,
    watchStatus: work.watchStatus,
    ...patch,
  };
}

function WorkForm({
  accounts,
  folders,
  initial,
  onSave,
  onCancel,
}: {
  accounts: Account[];
  folders: string[];
  initial?: Work;
  onSave: (input: WorkInput) => string | null;
  onCancel?: () => void;
}) {
  const [paste, setPaste] = useState("");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [author, setAuthor] = useState(initial?.authorName ?? "");
  const [accountId, setAccountId] = useState(initial?.accountId ?? "");
  const [folder, setFolder] = useState(initial?.folder ?? "");
  const [tags, setTags] = useState(initial?.tags.join("，") ?? "");
  const [rating, setRating] = useState<number | null>(initial?.rating ?? null);
  const [starred, setStarred] = useState(initial?.starred ?? false);
  const [note, setNote] = useState(initial?.note ?? "");
  const [watchStatus, setWatchStatus] = useState<WatchStatus>(initial?.watchStatus ?? "todo");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const folderOptions = uniqueValues([...folders, folder]);

  function applyPaste() {
    const extracted = extractShare(paste);
    if (!extracted.url) {
      setMessage("没有找到可用的抖音链接。只接受 http 或 https 的 douyin.com、iesdouyin.com 链接。");
      return;
    }
    setUrl(extracted.url);
    if (!title.trim() && extracted.title) setTitle(extracted.title);
    if (!author.trim() && extracted.author) setAuthor(extracted.author);
    setMessage(
      extracted.extraCount > 0
        ? `已提取第一个抖音链接，另有 ${extracted.extraCount} 个已忽略。请核对标题和作者后再保存。`
        : "已提取抖音链接。标题和作者来自分享文案时可改，请核对后再保存。",
    );
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const result = onSave({
      url,
      title,
      authorName: author,
      accountId: accountId || null,
      folder,
      tags,
      rating,
      starred,
      note,
      watchStatus,
    });
    setError(result);
    if (!result) setMessage(null);
  }

  return (
    <form className="form panel" onSubmit={submit}>
      <label className="field">
        <span>分享文案或链接</span>
        <textarea
          aria-label="分享文案或链接"
          value={paste}
          onChange={(event) => setPaste(event.target.value)}
          rows={3}
          placeholder="粘贴抖音分享文案，或直接粘贴 https 链接"
        />
      </label>
      <div className="actions">
        <button type="button" className="ghost" onClick={applyPaste}>
          提取链接
        </button>
      </div>
      {message ? <p className="hint">{message}</p> : null}
      <label className="field">
        <span>作品链接</span>
        <input aria-label="作品链接" value={url} onChange={(event) => setUrl(event.target.value)} inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
      </label>
      <div className="row-2">
        <label className="field">
          <span>标题</span>
          <input aria-label="标题" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} />
        </label>
        <label className="field">
          <span>作者</span>
          <input aria-label="作者" value={author} onChange={(event) => setAuthor(event.target.value)} maxLength={80} />
        </label>
      </div>
      <div className="row-2">
        <label className="field">
          <span>关联账号</span>
          <select
            aria-label="关联账号"
            value={accountId}
            onChange={(event) => {
              const next = event.target.value;
              setAccountId(next);
              if (!author.trim()) {
                const account = accounts.find((item) => item.id === next);
                if (account) setAuthor(account.name);
              }
            }}
          >
            <option value="">不关联账号</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>收藏夹</span>
          <input aria-label="收藏夹" value={folder} onChange={(event) => setFolder(event.target.value)} list="folder-presets" placeholder="例如：待拆解" />
          <datalist id="folder-presets">
            {folderOptions.map((item) => (
              <option key={item} value={item} />
            ))}
          </datalist>
        </label>
      </div>
      <label className="field">
        <span>标签</span>
        <input aria-label="收藏标签" value={tags} onChange={(event) => setTags(event.target.value)} placeholder="用逗号或空格分隔" />
      </label>
      <fieldset className="field">
        <legend>观看状态</legend>
        <div className="chips">
          {WATCH_STATUSES.map((item) => (
            <label key={item} className={watchStatus === item ? "chip pressed" : "chip"}>
              <input type="radio" name="watch-status" value={item} checked={watchStatus === item} onChange={() => setWatchStatus(item)} />
              {WATCH_LABEL[item]}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="field">
        <span>评分</span>
        <div className="chips" role="group" aria-label="评分">
          {[1, 2, 3, 4, 5].map((score) => (
            <button key={score} type="button" className="chip" aria-pressed={rating === score} onClick={() => setRating(rating === score ? null : score)}>
              {score} 星
            </button>
          ))}
        </div>
      </div>
      <label className="check">
        <input type="checkbox" checked={starred} onChange={(event) => setStarred(event.target.checked)} />
        <span>星标</span>
      </label>
      <label className="field">
        <span>笔记</span>
        <textarea aria-label="笔记" value={note} onChange={(event) => setNote(event.target.value)} rows={4} placeholder="只记录你自己的看法" />
      </label>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="actions">
        <button type="submit" className="primary">
          保存收藏
        </button>
        {onCancel ? (
          <button type="button" className="ghost" onClick={onCancel}>
            取消
          </button>
        ) : null}
      </div>
    </form>
  );
}
