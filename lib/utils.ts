const SEED_START = 20260820;
let seed = SEED_START;

export const resetSeed = (): void => { seed = SEED_START; };
export const rnd = (): number => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
export const rint = (a: number, b: number): number => Math.floor(a + rnd() * (b - a + 1));
export const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));
export const uid = (p: string): string => `${p}_${Math.random().toString(36).slice(2, 9)}`;
export const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export const pad = (n: number): string => String(n).padStart(2, "0");

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const fmtTime = (d: number | Date): string => {
  const x = new Date(d);
  return `${pad(x.getHours())}:${pad(x.getMinutes())}`;
};
export const fmtDate = (d: number | Date): string => {
  const x = new Date(d);
  return `${pad(x.getDate())} ${MONTHS[x.getMonth()]} ${x.getFullYear()}`;
};
export const fmtShort = (d: number | Date): string => {
  const x = new Date(d);
  return `${pad(x.getDate())} ${MONTHS[x.getMonth()]}`;
};

export const timeAgo = (ts: number): string => {
  if (!ts) return "never";
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 3) return "just now";
  if (s < 60) return `${s} seconds ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} minute${m > 1 ? "s" : ""} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h > 1 ? "s" : ""} ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d > 1 ? "s" : ""} ago`;
};

export const fmtUptime = (sec: number): string => {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m ${pad(s)}s` : `${m}m ${pad(s)}s`;
};

export const dayKey = (d: number | Date): string => new Date(d).toISOString().slice(0, 10);
