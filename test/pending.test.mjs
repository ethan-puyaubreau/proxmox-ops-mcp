import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { createApprovalQueue } from '../src/pending.mjs';

function setup({ configured = true, timeoutMs = 1000 } = {}) {
  const channel = {
    sent: [],
    onDecision: null,
    configured: () => configured,
    send: async (id, text) => { channel.sent.push({ id, text }); return 1; },
    startPolling: (onDecision) => { channel.onDecision = onDecision; },
  };
  const entries = [];
  const requestApproval = createApprovalQueue({ channel, audit: (e) => entries.push(e), timeoutMs });
  return { channel, entries, requestApproval };
}

describe('approval queue', () => {
  it('denies at once when the channel is not configured', async () => {
    const { channel, entries, requestApproval } = setup({ configured: false });
    const result = await requestApproval('node_exec [node-a] reboot');
    assert.equal(result.approved, false);
    assert.equal(entries[0].decision, 'denied');
    assert.equal(channel.sent.length, 0);
  });

  it('approves when the approver taps approve', async () => {
    const { channel, requestApproval } = setup();
    const result = requestApproval('node_exec [node-a] reboot');
    channel.onDecision(channel.sent[0].id, true);
    assert.equal((await result).approved, true);
  });

  it('refuses when the approver taps reject', async () => {
    const { channel, requestApproval } = setup();
    const result = requestApproval('node_exec [node-a] reboot');
    channel.onDecision(channel.sent[0].id, false);
    assert.equal((await result).approved, false);
  });

  it('refuses when nobody answers in time', async () => {
    const { entries, requestApproval } = setup({ timeoutMs: 20 });
    const result = await requestApproval('node_exec [node-a] reboot');
    assert.equal(result.approved, false);
    assert.match(result.reason, /^timeout/);
    assert.equal(entries.at(-1).decision, 'timeout');
  });

  it('ignores a decision for an unknown id', async () => {
    const { channel, requestApproval } = setup();
    const result = requestApproval('node_exec [node-a] reboot');
    channel.onDecision('unknown-id', true);
    channel.onDecision(channel.sent[0].id, false);
    assert.equal((await result).approved, false);
  });
});
