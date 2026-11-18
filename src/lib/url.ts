import { LIMITS } from "./limits";
import { cleanPlainText } from "./text";

const DOUYIN_ROOTS = ["douyin.com", "iesdouyin.com"];

const URL_PATTERN = /https?:\/\/[^\s<>"'“”‘’]+/gi;

export function isDouyinHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (!/^[a-z0-9.-]+$/.test(host)) return false;
  if (host.startsWith(".") || host.includes("..")) return false;
  return DOUYIN_ROOTS.some((root) => host === root || host.endsWith(`.${root}`));
}

export interface ParsedDouyinUrl {
  href: string;
  kind: "user" | "search" | "content";
}

function rejectUnsafeUrlText(value: string): boolean {
  if (value.length > LIMITS.url || value.includes("\\") || /\s/.test(value)) return true;
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 32 || code === 127) return true;
  }
  return false;
}

export function parseDouyinUrl(input: string): ParsedDouyinUrl | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed || rejectUnsafeUrlText(trimmed)) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (url.port) return null;
  if (!isDouyinHostname(url.hostname)) return null;
  url.protocol = "https:";
  url.username = "";
  url.password = "";
  url.hash = "";
  url.hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
  }
  const path = url.pathname.toLowerCase();
  const kind =
    path === "/user" || path.startsWith("/user/")
      ? "user"
      : path === "/search" || path.startsWith("/search/")
        ? "search"
        : "content";
  return { href: url.href, kind };
}

export function canonicalDouyinUrl(input: string): string | null {
  return parseDouyinUrl(input)?.href ?? null;
}

export function parseAccountHomepage(input: string): { href: string; kind: "user" | "search" } | null {
  const parsed = parseDouyinUrl(input);
  if (!parsed || (parsed.kind !== "user" && parsed.kind !== "search")) return null;
  return { href: parsed.href, kind: parsed.kind };
}

export function canonicalHttpUrl(input: string): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed || rejectUnsafeUrlText(trimmed)) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (!url.hostname || !/^[a-z0-9.-]+$/i.test(url.hostname)) return null;
  url.hash = "";
  url.username = "";
  url.password = "";
  return url.href;
}

function trimUrlTail(raw: string): string {
  return raw.replace(/[)）\]】}>，。！!？?、;；,.'"]+$/g, "");
}

export function extractDouyinUrls(text: string): string[] {
  if (typeof text !== "string" || text.length > LIMITS.paste) return [];
  const found: string[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(URL_PATTERN)) {
    const parsed = parseDouyinUrl(trimUrlTail(match[0]));
    if (!parsed || seen.has(parsed.href)) continue;
    seen.add(parsed.href);
    found.push(parsed.href);
  }
  return found;
}

export interface ShareExtract {
  url: string | null;
  title: string;
  author: string;
  extraCount: number;
}

function tidyExtracted(text: string, max: number): string {
  return cleanPlainText(text, max).replace(/^[\s:：\-—~|｜]+|[\s:：\-—~|｜]+$/g, "");
}

export function extractShare(text: string): ShareExtract {
  const urls = extractDouyinUrls(text);
  const url = urls[0] ?? null;
  let author = "";
  let title = "";
  if (typeof text === "string" && text.length <= LIMITS.paste) {
    const bracket = /【([^】]{1,80})】/.exec(text);
    const inner = bracket?.[1];
    if (bracket && inner) {
      const authorMatch = /^(.{1,40}?)的(?:作品|图文|视频|直播)$/.exec(cleanPlainText(inner, 80));
      if (authorMatch?.[1]) author = cleanPlainText(authorMatch[1], LIMITS.author);
      if (url) {
        const after = text.slice(bracket.index + bracket[0].length);
        const urlIndex = after.search(/https?:\/\//);
        title = tidyExtracted(urlIndex >= 0 ? after.slice(0, urlIndex) : "", LIMITS.title);
      }
    }
  }
  return {
    url,
    title,
    author,
    extraCount: Math.max(0, urls.length - 1),
  };
}

export function displayUrl(href: string): string {
  try {
    const url = new URL(href);
    const path = decodeURIComponent(url.pathname);
    const compact = path.length > 42 ? `${path.slice(0, 36)}…` : path;
    return `${url.host}${compact}`;
  } catch {
    return href;
  }
}
