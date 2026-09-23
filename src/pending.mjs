// Approval queue for Tier-2 actions.
// requestApproval(summary) -> Promise<{approved, reason}>
//   - Gjallarhorn not configured  -> { approved: false } (FAIL-SAFE)
//   - Telegram approve/reject     -> per the button tap
//   - No response within 5 min    -> { approved: false, reason: 'timeout' }
//   - Text too long to display    -> { approved: false } without asking
// Every decision is appended to an append-only local audit log.
// createApprovalQueue() builds the same queue around any channel, for tests.

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import { sendApprovalRequest, startPolling, gjallarhornConfigured } from './gjallarhorn.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUDIT_LOG = process.env.AUDIT_LOG || path.resolve(__dirname, '../heimdall-decisions.log');
const TIMEOUT_MS = 5 * 60 * 1000;
const MAX_TEXT = 3500; // Telegram caps a message at 4096 characters

export function audit(entry) {
  try {
    fs.appendFileSync(AUDIT_LOG, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n');
  } catch (_) {}
}

export function describeAction(toolName, args) {
  const lines = [`tool: ${toolName}`];
  for (const [key, value] of Object.entries(args)) {
    lines.push(`${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`);
  }
  return lines.join('\n');
}

// channel: { configured(), send(id, text) -> Promise<messageId|null>, startPolling(onDecision) }
export function createApprovalQueue({ channel, audit, timeoutMs }) {
  const pending = new Map(); // id -> { decide, timer, summary }
  let started = false;

  function ensurePolling() {
    if (started) return;
    started = true;
    channel.startPolling((id, approved) => {
      const p = pending.get(id);
      if (!p) return;
      clearTimeout(p.timer);
      pending.delete(id);
      audit({ id, action: p.summary, decision: approved ? 'approved' : 'rejected', via: 'gjallarhorn' });
      p.decide(approved, approved ? 'approved via Gjallarhorn' : 'rejected via Gjallarhorn');
    });
  }

  return function requestApproval(summary) {
    if (!channel.configured()) {
      audit({ action: summary, decision: 'denied', via: 'fail-safe (Gjallarhorn not configured)' });
      return Promise.resolve({
        approved: false,
        reason: 'Gjallarhorn not configured (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID missing) — Tier-2 denied by default (fail-safe).',
      });
    }
    if (summary.length > MAX_TEXT) {
      audit({ action: summary, decision: 'denied', via: 'fail-safe (action too long)' });
      return Promise.resolve({ approved: false, reason: 'action too long to display for approval' });
    }
    ensurePolling();
    const id = randomUUID();
    audit({ id, action: summary, decision: 'pending', via: 'gjallarhorn' });
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        audit({ id, action: summary, decision: 'timeout' });
        resolve({ approved: false, reason: `timeout (${timeoutMs / 60000} min) — no response on Gjallarhorn` });
      }, timeoutMs);
      pending.set(id, {
        summary,
        timer,
        decide: (approved, reason) => resolve({ approved, reason }),
      });
      channel.send(id, summary).catch(() => {});
    });
  };
}

export const requestApproval = createApprovalQueue({
  channel: { configured: gjallarhornConfigured, send: sendApprovalRequest, startPolling },
  audit,
  timeoutMs: TIMEOUT_MS,
});
