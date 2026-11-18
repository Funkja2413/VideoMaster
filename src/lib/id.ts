export function createId(): string {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === "function") return cryptoObj.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function isSafeId(value: string): boolean {
  return /^[A-Za-z0-9_-]{1,80}$/.test(value);
}

export function isLockedSeedId(value: string): boolean {
  return /^locked-(0[1-9]|[1-3]\d|40)$/.test(value);
}
