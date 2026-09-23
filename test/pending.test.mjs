import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { createApprovalQueue, describeAction } from '../src/pending.mjs';

function setup({ configured = true, timeoutMs = 1000, deliver = async () => 1 } = {}) {
  const channel = {
    sent: [],
    onDecision: null,
    configured: () => configured,
    send: async (id, text) => { channel.sent.push({ id, text }); return deliver(); },
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

  it('denies an action too long to display without contacting the channel', async () => {
    const { channel, requestApproval } = setup();
    const text = describeAction('node_exec', { node: 'node-a', cmd: 'echo ' + 'a'.repeat(4000) });
    const result = await requestApproval(text);
    assert.equal(result.approved, false);
    assert.match(result.reason, /too long/);
    assert.equal(channel.sent.length, 0);
  });

  it('denies at once when the channel reports no message', async () => {
    const { entries, requestApproval } = setup({ deliver: async () => null });
    const result = await requestApproval('node_exec [node-a] reboot');
    assert.equal(result.approved, false);
    assert.match(result.reason, /could not be delivered/);
    assert.equal(entries.at(-1).via, 'delivery failed');
  });

  it('denies at once when sending fails', async () => {
    const { requestApproval } = setup({ deliver: async () => { throw new Error('network unreachable'); } });
    const result = await requestApproval('node_exec [node-a] reboot');
    assert.equal(result.approved, false);
    assert.match(result.reason, /could not be delivered/);
  });
});

describe('describeAction', () => {
  it('lists every argument in full', () => {
    const cmd = 'apt-get install -y ' + Array.from({ length: 60 }, (_, i) => `package-${i}`).join(' ');
    assert.equal(
      describeAction('node_exec', { node: 'node-a', cmd, timeout: 30000 }),
      `tool: node_exec\nnode: node-a\ncmd: ${cmd}\ntimeout: 30000`,
    );
  });
});
