// Approval queue for Tier-2 actions.
// requestApproval(summary) -> Promise<{approved, reason}>
//   - Gjallarhorn not configured  -> { approved: false } (FAIL-SAFE)
//   - Telegram approve/reject     -> per the button tap
//   - No response within 5 min    -> { approved: false, reason: 'timeout' }
// Every decision is appended to an append-only local audit log.

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import { sendApprovalRequest, startPolling, gjallarhornConfigured } from './gjallarhorn.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUDIT_LOG = process.env.AUDIT_LOG || path.resolve(__dirname, '../heimdall-decisions.log');
const TIMEOUT_MS = 5 * 60 * 1000;

const pending = new Map(); // id -> { decide, timer, summary }
let started = false;

export function audit(entry) {
  try {
    fs.appendFileSync(AUDIT_LOG, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n');
  } catch (_) {}
}

function ensurePolling() {
  if (started) return;
  started = true;
  startPolling((id, approved) => {
    const p = pending.get(id);
    if (!p) return;
    clearTimeout(p.timer);
    pending.delete(id);
    audit({ id, action: p.summary, decision: approved ? 'approved' : 'rejected', via: 'gjallarhorn' });
    p.decide(approved, approved ? 'approved via Gjallarhorn' : 'rejected via Gjallarhorn');
  });
}

export function requestApproval(summary) {
  if (!gjallarhornConfigured()) {
    audit({ action: summary, decision: 'denied', via: 'fail-safe (Gjallarhorn not configured)' });
    return Promise.resolve({
      approved: false,
      reason: 'Gjallarhorn not configured (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID missing) — Tier-2 denied by default (fail-safe).',
    });
  }
  ensurePolling();
  const id = randomUUID();
  audit({ id, action: summary, decision: 'pending', via: 'gjallarhorn' });
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      audit({ id, action: summary, decision: 'timeout' });
      resolve({ approved: false, reason: 'timeout (5 min) — no response on Gjallarhorn' });
    }, TIMEOUT_MS);
    pending.set(id, {
      summary,
      timer,
      decide: (approved, reason) => resolve({ approved, reason }),
    });
    sendApprovalRequest(id, summary).catch(() => {});
  });
}
