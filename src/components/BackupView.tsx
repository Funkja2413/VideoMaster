import { useState, type ChangeEvent } from "react";
import type { LibraryState } from "../types";
import { IMPORT_ERROR, applyImport, exportFilename, exportLibrary, previewImport, type ImportPreview } from "../lib/backup";
import { downloadText } from "../lib/download";
import { LIMITS } from "../lib/limits";
import { nowIso } from "../lib/text";
import { HttpLink } from "./DouyinLink";

export function BackupView({
  state,
  onCommit,
}: {
  state: LibraryState;
  onCommit: (next: LibraryState, undoLabel?: string) => void;
}) {
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");

  function exportBackup() {
    const exportedAt = nowIso();
    const payload = exportLibrary(state, exportedAt);
    downloadText(exportFilename(exportedAt), JSON.stringify(payload, null, 2));
  }

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > LIMITS.importBytes) {
      setPreview(null);
      setError(IMPORT_ERROR["too-large"]);
      return;
    }
    let text: string;
    try {
      text = await file.text();
    } catch {
      setPreview(null);
      setError("无法读取这个文件。");
      return;
    }
    const result = previewImport(state, text, nowIso());
    if (!result.ok) {
      setPreview(null);
      setError(IMPORT_ERROR[result.code]);
      return;
    }
    setFileName(file.name);
    setPreview(result.preview);
    setError(null);
  }

  const canMerge = preview !== null && (preview.accountsToAdd.length > 0 || preview.worksToAdd.length > 0);

  return (
    <section aria-labelledby="backup-heading">
      <div className="section-head">
        <div>
          <p className="kicker">备份</p>
          <h2 id="backup-heading">导出与合并导入</h2>
        </div>
        <button type="button" className="primary" onClick={exportBackup}>
          导出 JSON
        </button>
      </div>
      <div className="card backup-card">
        <p>导出的文件包含 accounts 数组、works 数组，以及来源、备注、分轨和批次计数。可以再导入本页，也可以导入当初的已锁账号 JSON。</p>
        <p>导入只会合并。相同主页、相同作品链接会跳过，不会覆盖你改过的内容，也不会删除已有收藏。备注里的剧名不会变成收藏。</p>
        <dl className="meta-list">
          <div>
            <dt>来源</dt>
            <dd>{state.meta.sourceTitle || "无"}</dd>
          </div>
          <div>
            <dt>来源链接</dt>
            <dd>{state.meta.sourceUrl ? <HttpLink href={state.meta.sourceUrl}>{state.meta.sourceUrl}</HttpLink> : "无"}</dd>
          </div>
          <div>
            <dt>种子导出时间</dt>
            <dd>{state.meta.seedExportedAt || "无"}</dd>
          </div>
          <div>
            <dt>说明</dt>
            <dd>{state.meta.notes || "无"}</dd>
          </div>
        </dl>
        <label className="file-field">
          <span>选择 JSON 文件</span>
          <input aria-label="选择 JSON 文件" type="file" accept="application/json,.json" onChange={(event) => void onFile(event)} />
        </label>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        {preview ? (
          <div className="preview">
            <p>
              {fileName ? `${fileName}：` : null}将新增账号 {preview.accountsToAdd.length}，跳过重复 {preview.duplicateAccounts}，无法导入{" "}
              {preview.invalidAccounts.length}。将新增收藏 {preview.worksToAdd.length}，跳过重复 {preview.duplicateWorks}，无法导入{" "}
              {preview.invalidWorks.length}。
            </p>
            {preview.warnings.map((warning) => (
              <p key={warning} className="hint">
                {warning}
              </p>
            ))}
            {[...preview.invalidAccounts, ...preview.invalidWorks].slice(0, 6).map((row) => (
              <p key={`${row.index}-${row.message}`} className="hint">
                {row.message}
              </p>
            ))}
            {canMerge ? (
              <button
                type="button"
                className="primary"
                onClick={() => {
                  onCommit(applyImport(state, preview), "已合并导入");
                  setPreview(null);
                }}
              >
                确认合并导入
              </button>
            ) : (
              <p>没有新的账号或收藏需要合并。</p>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}
