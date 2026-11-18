import { LIMITS } from "./limits";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function own(record: Record<string, unknown>, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
}

function stripControlChars(value: string): string {
  let cleaned = "";
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31) || code === 127) continue;
    cleaned += char;
  }
  return cleaned;
}

export function cleanPlainText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  const normalized = stripControlChars(value).replace(/\r\n?/g, "\n").trim();
  return Array.from(normalized).slice(0, max).join("");
}

export function parseTags(value: unknown): string[] {
  const parts: string[] = [];
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "string") parts.push(item);
    }
  } else if (typeof value === "string") {
    parts.push(...value.split(/[,，、\s]+/));
  }
  const tags: string[] = [];
  const seen = new Set<string>();
  for (const part of parts) {
    const tag = cleanPlainText(part, LIMITS.tag);
    if (!tag) continue;
    const key = tag.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length >= LIMITS.tags) break;
  }
  return tags;
}

export function readStringMap(value: unknown, keyMax: number, valueMax: number, maxEntries: number): Record<string, string> {
  if (!isRecord(value)) return {};
  const out: Record<string, string> = {};
  for (const key of Object.keys(value)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    const name = cleanPlainText(key, keyMax);
    const text = cleanPlainText(own(value, key), valueMax);
    if (!name || !text) continue;
    out[name] = text;
    if (Object.keys(out).length >= maxEntries) break;
  }
  return out;
}

export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

export function formatDate(iso: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(iso);
  return match?.[1] ?? "";
}

export function nowIso(): string {
  return new Date().toISOString();
}
