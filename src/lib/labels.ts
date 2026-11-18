import type { AccountStatus, HomepageKind, WatchStatus } from "../types";

export const TRACK_PRESETS = ["头部精品", "怪异特异", "观察"] as const;

export const BATCH_PRESETS = ["一批", "二批", "三批", "四批"] as const;

export const STATUS_LABEL: Record<AccountStatus, string> = {
  tracking: "追踪中",
  paused: "暂停",
  archived: "已归档",
};

export const WATCH_LABEL: Record<WatchStatus, string> = {
  todo: "待看",
  watched: "已看",
  reference: "重点参考",
};

export const KIND_LABEL: Record<HomepageKind, string> = {
  user: "账号主页",
  search: "搜索入口",
};

export const ACCOUNT_STATUSES: AccountStatus[] = ["tracking", "paused", "archived"];

export const WATCH_STATUSES: WatchStatus[] = ["todo", "watched", "reference"];
