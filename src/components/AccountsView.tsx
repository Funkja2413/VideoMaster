import { useCallback, useState, type FormEvent } from "react";
import type { Account, AccountInput, AccountStatus, HomepageKind, LibraryState } from "../types";
import { filterAccounts, uniqueValues } from "../lib/filter";
import { ACCOUNT_STATUSES, BATCH_PRESETS, KIND_LABEL, STATUS_LABEL, TRACK_PRESETS } from "../lib/labels";
import { accountInputFromAccount, createAccount, deleteAccount, updateAccount } from "../lib/model";
import { nowIso } from "../lib/text";
import { displayUrl, parseAccountHomepage } from "../lib/url";
import { Dialog } from "./Dialog";
import { DouyinLink } from "./DouyinLink";

type DialogState =
  | { mode: "create" }
  | { mode: "edit"; id: string }
  | { mode: "delete"; id: string }
  | null;

export function AccountsView({
  state,
  onCommit,
}: {
  state: LibraryState;
  onCommit: (next: LibraryState, undoLabel?: string) => void;
}) {
  const [text, setText] = useState("");
  const [track, setTrack] = useState("");
  const [batch, setBatch] = useState("");
  const [status, setStatus] = useState<AccountStatus | "">("");
  const [homepageKind, setHomepageKind] = useState<HomepageKind | "">("");
  const [dialog, setDialog] = useState<DialogState>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const closeDialog = useCallback(() => setDialog(null), []);

  const tracks = uniqueValues(state.accounts.map((account) => account.track));
  const batches = uniqueValues(state.accounts.map((account) => account.batch));
  const trackChoices = uniqueValues([...TRACK_PRESETS, ...tracks]);
  const batchChoices = uniqueValues([...BATCH_PRESETS, ...batches]);
  const visible = filterAccounts(state.accounts, { text, track, batch, status, homepageKind });
  const editing = dialog?.mode === "edit" ? state.accounts.find((account) => account.id === dialog.id) : undefined;
  const deleting = dialog?.mode === "delete" ? state.accounts.find((account) => account.id === dialog.id) : undefined;

  function saveAccount(input: AccountInput, id?: string): string | null {
    const result = id ? updateAccount(state, id, input, nowIso()) : createAccount(state, input, nowIso());
    if (!result.ok) return result.error;
    onCommit(result.state);
    setDialog(null);
    return null;
  }

  function changeStatus(account: Account, next: AccountStatus) {
    if (next === account.status) return;
    const result = updateAccount(state, account.id, { ...accountInputFromAccount(account), status: next }, nowIso());
    if (result.ok) onCommit(result.state);
  }

  return (
    <section aria-labelledby="accounts-heading">
      <div className="section-head">
        <div>
          <p className="kicker">账号池</p>
          <h2 id="accounts-heading">追踪中的抖音账号</h2>
        </div>
        <button type="button" className="primary" onClick={() => setDialog({ mode: "create" })}>
          新增账号
        </button>
      </div>

      <div className="toolbar">
        <input
          aria-label="搜索账号"
          placeholder="搜索名称、备注、剧名、主页"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <ChipRow label="分组" value={track} onChange={setTrack} options={tracks.map((item) => ({ value: item, label: item }))} />
        <ChipRow label="批次" value={batch} onChange={setBatch} options={batches.map((item) => ({ value: item, label: item }))} />
        <ChipRow
          label="入口"
          value={homepageKind}
          onChange={(value) => setHomepageKind(value as HomepageKind | "")}
          options={[
            { value: "user", label: "账号主页" },
            { value: "search", label: "搜索入口" },
          ]}
        />
        <ChipRow
          label="状态"
          value={status}
          onChange={(value) => setStatus(value as AccountStatus | "")}
          options={ACCOUNT_STATUSES.map((item) => ({ value: item, label: STATUS_LABEL[item] }))}
        />
        <p className="result-count">
          显示 {visible.length} / {state.accounts.length}
        </p>
      </div>

      {visible.length === 0 ? (
        <div className="empty">
          <h3>没有符合条件的账号</h3>
          <p>可以清空筛选，或新增一个主页、搜索入口。</p>
        </div>
      ) : (
        <div className="list">
          {visible.map((account) => (
            <article key={account.id} className={account.homepageKind === "search" ? "card search-card" : "card"}>
              <div className="account-grid">
                <div>
                  <h3>{account.name}</h3>
                  <div className="badges">
                    {account.origin === "seed" ? <span className="badge locked">已锁</span> : null}
                    <span className={`badge ${trackClass(account.track)}`}>{account.track}</span>
                    {account.batch ? <span className="badge">{account.batch}</span> : null}
                    <span className={account.homepageKind === "search" ? "badge search" : "badge"}>
                      {KIND_LABEL[account.homepageKind]}
                    </span>
                    {account.tags.map((tag) => (
                      <span key={tag} className="badge">
                        {tag}
                      </span>
                    ))}
                  </div>
                  <label className="inline-select">
                    <span>追踪状态</span>
                    <select
                      aria-label={`${account.name}的追踪状态`}
                      value={account.status}
                      onChange={(event) => changeStatus(account, event.target.value as AccountStatus)}
                    >
                      {ACCOUNT_STATUSES.map((item) => (
                        <option key={item} value={item}>
                          {STATUS_LABEL[item]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div>
                  {account.homepageKind === "search" ? <p className="search-note">不是已核实的作者主页</p> : null}
                  <p className="url-line">{displayUrl(account.homepage)}</p>
                  {account.note ? (
                    <>
                      <p className="note-label">历史备注，非实时数据</p>
                      <p className={expanded[account.id] ? "note" : "note clamped"}>{account.note}</p>
                      {account.note.length > 72 ? (
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => setExpanded((current) => ({ ...current, [account.id]: !current[account.id] }))}
                        >
                          {expanded[account.id] ? "收起备注" : "展开备注"}
                        </button>
                      ) : null}
                    </>
                  ) : (
                    <p className="note-label">没有备注</p>
                  )}
                </div>
              </div>
              <div className="actions">
                <DouyinLink
                  href={account.homepage}
                  className="button"
                  label={account.homepageKind === "search" ? `打开搜索：${account.name}` : `打开主页：${account.name}`}
                >
                  {account.homepageKind === "search" ? "打开搜索" : "打开主页"}
                </DouyinLink>
                <button type="button" className="ghost" aria-label={`编辑${account.name}`} onClick={() => setDialog({ mode: "edit", id: account.id })}>
                  编辑
                </button>
                <button type="button" className="danger" aria-label={`删除${account.name}`} onClick={() => setDialog({ mode: "delete", id: account.id })}>
                  删除
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {dialog?.mode === "create" || editing ? (
        <Dialog title={editing ? `编辑${editing.name}` : "新增账号"} onClose={closeDialog}>
          <AccountForm
            key={editing?.id ?? "create"}
            initial={editing}
            tracks={trackChoices}
            batches={batchChoices}
            onCancel={closeDialog}
            onSave={(input) => saveAccount(input, editing?.id)}
          />
        </Dialog>
      ) : null}

      {deleting ? (
        <DeleteAccountDialog
          account={deleting}
          linkedWorks={state.works.filter((work) => work.accountId === deleting.id).length}
          onClose={closeDialog}
          onConfirm={(deleteWorks) => {
            onCommit(
              deleteAccount(state, deleting.id, { deleteWorks }, nowIso()),
              deleteWorks ? `已删除账号「${deleting.name}」及其收藏` : `已删除账号「${deleting.name}」，收藏已保留`,
            );
            setDialog(null);
          }}
        />
      ) : null}
    </section>
  );
}

function trackClass(track: string): string {
  if (track === "头部精品") return "track-head";
  if (track === "怪异特异") return "track-odd";
  if (track === "观察") return "track-watch";
  return "";
}

function ChipRow({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="chip-row">
      <span>{label}</span>
      <div className="chips">
        <button type="button" className="chip" aria-pressed={value === ""} onClick={() => onChange("")}>
          全部
        </button>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className="chip"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function AccountForm({
  initial,
  tracks,
  batches,
  onSave,
  onCancel,
}: {
  initial?: Account;
  tracks: string[];
  batches: string[];
  onSave: (input: AccountInput) => string | null;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [homepage, setHomepage] = useState(initial?.homepage ?? "");
  const [track, setTrack] = useState(initial?.track ?? "");
  const [batch, setBatch] = useState(initial?.batch ?? "");
  const [tags, setTags] = useState(initial?.tags.join("，") ?? "");
  const [status, setStatus] = useState<AccountStatus>(initial?.status ?? "tracking");
  const [note, setNote] = useState(initial?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const parsed = parseAccountHomepage(homepage);

  function submit(event: FormEvent) {
    event.preventDefault();
    const message = onSave({ name, homepage, track, batch, tags, status, note });
    setError(message);
  }

  return (
    <form className="form" onSubmit={submit}>
      <label className="field">
        <span>名称</span>
        <input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} />
      </label>
      <label className="field">
        <span>主页链接</span>
        <input
          value={homepage}
          onChange={(event) => setHomepage(event.target.value)}
          placeholder="https://www.douyin.com/user/… 或 /search/…"
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
      </label>
      <p className="hint">
        {homepage.trim()
          ? parsed
            ? `入口类型由链接决定，将保存为${parsed.kind === "search" ? "搜索入口" : "账号主页"}。不能把搜索页改标成作者主页。`
            : "只接受 http 或 https 的 douyin.com、iesdouyin.com，且路径必须是 /user 或 /search。"
          : "账号主页填 /user 链接。没有稳定主页时，填抖音搜索页，会标成搜索入口。"}
      </p>
      <div className="row-2">
        <label className="field">
          <span>分组</span>
          <input value={track} onChange={(event) => setTrack(event.target.value)} list="track-presets" placeholder="例如：头部精品" />
          <datalist id="track-presets">
            {tracks.map((item) => (
              <option key={item} value={item} />
            ))}
          </datalist>
        </label>
        <label className="field">
          <span>批次</span>
          <input value={batch} onChange={(event) => setBatch(event.target.value)} list="batch-presets" placeholder="例如：一批" />
          <datalist id="batch-presets">
            {batches.map((item) => (
              <option key={item} value={item} />
            ))}
          </datalist>
        </label>
      </div>
      <label className="field">
        <span>标签</span>
        <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="用逗号或空格分隔" />
      </label>
      <label className="field">
        <span>追踪状态</span>
        <select value={status} onChange={(event) => setStatus(event.target.value as AccountStatus)}>
          {ACCOUNT_STATUSES.map((item) => (
            <option key={item} value={item}>
              {STATUS_LABEL[item]}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>备注</span>
        <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={5} placeholder="可写下剧名、历史粉丝数。这些文字不会变成实时数据或收藏。" />
      </label>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="actions">
        <button type="submit" className="primary">
          保存账号
        </button>
        <button type="button" className="ghost" onClick={onCancel}>
          取消
        </button>
      </div>
    </form>
  );
}

function DeleteAccountDialog({
  account,
  linkedWorks,
  onConfirm,
  onClose,
}: {
  account: Account;
  linkedWorks: number;
  onConfirm: (deleteWorks: boolean) => void;
  onClose: () => void;
}) {
  const [deleteWorks, setDeleteWorks] = useState(false);
  return (
    <Dialog title={`删除${account.name}`} onClose={onClose}>
      <div className="form">
        <p>
          {deleteWorks
            ? `将删除账号「${account.name}」，并删除 ${linkedWorks} 条关联收藏。`
            : linkedWorks > 0
              ? `将删除账号「${account.name}」。${linkedWorks} 条关联收藏会保留，并解除关联。`
              : `将删除账号「${account.name}」。没有关联收藏。`}
        </p>
        {linkedWorks > 0 ? (
          <label className="check">
            <input type="checkbox" checked={deleteWorks} onChange={(event) => setDeleteWorks(event.target.checked)} />
            <span>同时删除关联收藏</span>
          </label>
        ) : null}
        <div className="actions">
          <button type="button" className="danger" onClick={() => onConfirm(deleteWorks)}>
            确认删除
          </button>
          <button type="button" className="ghost" onClick={onClose}>
            取消
          </button>
        </div>
      </div>
    </Dialog>
  );
}
