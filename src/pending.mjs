// Approval queue for Tier-2 actions.
// requestApproval(summary, { signal }) -> Promise<{approved, reason}>
//   - Gjallarhorn not configured  -> { approved: false } (FAIL-SAFE)
//   - Telegram approve/reject     -> per the button tap
//   - No response within 5 min    -> { approved: false, reason: 'timeout' }
//   - Text too long to display    -> { approved: false } without asking
//   - Request not delivered       -> { approved: false } at once
//   - signal aborted by client    -> { approved: false }, later taps ignored
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
  const pending = new Map(); // id -> settle(approved, reason, auditFields)
  let started = false;

  function ensurePolling() {
    if (started) return;
    started = true;
    channel.startPolling((id, approved) => {
      const settle = pending.get(id);
      if (!settle) return;
      const decision = approved ? 'approved' : 'rejected';
      settle(approved, `${decision} via Gjallarhorn`, { decision, via: 'gjallarhorn' });
    });
  }

  return function requestApproval(summary, { signal } = {}) {
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
    if (signal?.aborted) {
      audit({ action: summary, decision: 'cancelled', via: 'client' });
      return Promise.resolve({ approved: false, reason: 'cancelled by client' });
    }
    ensurePolling();
    const id = randomUUID();
    audit({ id, action: summary, decision: 'pending', via: 'gjallarhorn' });
    return new Promise((resolve) => {
      // Only the first outcome counts: decision, timeout, failed delivery or abort.
      const settle = (approved, reason, auditFields) => {
        if (!pending.delete(id)) return;
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        audit({ id, action: summary, ...auditFields });
        resolve({ approved, reason });
      };
      const timer = setTimeout(
        () => settle(false, `timeout (${timeoutMs / 60000} min) — no response on Gjallarhorn`, { decision: 'timeout' }),
        timeoutMs,
      );
      const undelivered = () =>
        settle(false, 'approval request could not be delivered', { decision: 'denied', via: 'delivery failed' });
      const onAbort = () => settle(false, 'cancelled by client', { decision: 'cancelled', via: 'client' });
      pending.set(id, settle);
      signal?.addEventListener('abort', onAbort);
      channel.send(id, summary).then((messageId) => { if (messageId == null) undelivered(); }, undelivered);
    });
  };
}

export const requestApproval = createApprovalQueue({
  channel: { configured: gjallarhornConfigured, send: sendApprovalRequest, startPolling },
  audit,
  timeoutMs: TIMEOUT_MS,
});
