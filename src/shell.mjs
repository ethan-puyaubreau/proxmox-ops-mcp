// Helpers for building remote shell commands from tool arguments.

export const NAME_RE = /^[A-Za-z0-9_.:@-]+$/;

export function shellQuote(value) {
  return "'" + String(value).replace(/'/g, "'\\''") + "'";
}

export function assertName(kind, value) {
  const s = String(value);
  if (!NAME_RE.test(s)) throw new Error(`invalid ${kind}: "${s}" (allowed: A-Za-z0-9 _ . : @ -)`);
  return s;
}

export function toInt(value, { min, max, fallback }) {
  const n = Number(value);
  if (!Number.isInteger(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function pctExec(ctid, innerCmd) {
  const id = Number(ctid);
  if (!Number.isInteger(id) || id <= 0) throw new Error(`invalid ctid: ${ctid}`);
  return `pct exec ${id} -- bash -c ${shellQuote(innerCmd)}`;
}
