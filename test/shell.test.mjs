import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { shellQuote, assertName, toInt, pctExec } from '../src/shell.mjs';

describe('shellQuote', () => {
  it('wraps plain text in single quotes', () => {
    assert.equal(shellQuote('df -h /'), `'df -h /'`);
  });

  it('closes, escapes and reopens around single quotes', () => {
    assert.equal(shellQuote(`grep 'error' app.log`), `'grep '\\''error'\\'' app.log'`);
  });
});

describe('assertName', () => {
  it('accepts service, unit and container names', () => {
    for (const name of ['nginx', 'my-app.service', 'wg-quick@wg0']) {
      assert.equal(assertName('service', name), name);
    }
  });

  it('rejects anything outside the allowed characters', () => {
    for (const name of ['', 'my app', 'nginx;', 'app$1', `it's`]) {
      assert.throws(() => assertName('service', name), /invalid service/, JSON.stringify(name));
    }
  });
});

describe('toInt', () => {
  const opts = { min: 1, max: 100, fallback: 50 };

  it('keeps integers in range', () => {
    assert.equal(toInt(20, opts), 20);
    assert.equal(toInt('20', opts), 20);
  });

  it('clamps to min and max', () => {
    assert.equal(toInt(0, opts), 1);
    assert.equal(toInt(5000, opts), 100);
  });

  it('falls back on non-integers', () => {
    assert.equal(toInt('abc', opts), 50);
    assert.equal(toInt(2.5, opts), 50);
    assert.equal(toInt(undefined, opts), 50);
  });
});

describe('pctExec', () => {
  it('wraps the command for pct exec', () => {
    assert.equal(pctExec(101, 'uptime'), `pct exec 101 -- bash -c 'uptime'`);
    assert.equal(pctExec('101', `echo 'ok'`), `pct exec 101 -- bash -c 'echo '\\''ok'\\'''`);
  });

  it('rejects a ctid that is not a positive integer', () => {
    for (const ctid of ['abc', 1.5, 0, -1]) {
      assert.throws(() => pctExec(ctid, 'uptime'), /invalid ctid/, String(ctid));
    }
  });
});
