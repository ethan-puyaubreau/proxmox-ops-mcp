import { strict as assert } from 'node:assert';
import { EventEmitter } from 'node:events';
import { describe, it } from 'node:test';
import { exec, isRetryable } from '../src/pool.mjs';

function fakeConn() {
  const stream = new EventEmitter();
  stream.stderr = new EventEmitter();
  stream.signals = [];
  stream.closed = false;
  stream.signal = (name) => { stream.signals.push(name); };
  stream.close = () => { stream.closed = true; };
  return { stream, exec: (cmd, cb) => cb(null, stream) };
}

describe('exec', () => {
  it('kills and rejects a command that never finishes', async () => {
    const conn = fakeConn();
    await assert.rejects(exec(conn, 'sleep 60', { timeout: 20 }), { code: 'ECMDTIMEOUT' });
    assert.deepEqual(conn.stream.signals, ['KILL']);
    assert.equal(conn.stream.closed, true);
  });

  it('resolves with the exit code and trimmed output', async () => {
    const conn = fakeConn();
    const result = exec(conn, 'uptime');
    conn.stream.emit('data', Buffer.from(' up 3 days\n'));
    conn.stream.stderr.emit('data', Buffer.from('warning\n'));
    conn.stream.emit('close', 0);
    assert.deepEqual(await result, { code: 0, stdout: 'up 3 days', stderr: 'warning' });
  });
});

describe('isRetryable', () => {
  it('never retries a command that timed out', () => {
    const err = Object.assign(new Error('timed out'), { code: 'ECMDTIMEOUT' });
    assert.equal(isRetryable(err), false);
  });

  it('retries when the channel could not be opened', () => {
    assert.equal(isRetryable(new Error('Channel open failure')), true);
  });
});
