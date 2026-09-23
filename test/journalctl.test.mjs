import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { journalctlTool } from '../src/tools/journalctl.mjs';

describe('journalctlTool — input validation', () => {
  it('rejects an invalid unit before connecting', async () => {
    await assert.rejects(journalctlTool({ target: 'node-a', unit: 'nginx;' }), /invalid unit/);
  });

  it('rejects a target that is neither a node nor a CTID', async () => {
    const res = await journalctlTool({ target: '12abc', unit: 'nginx' });
    assert.match(res.content[0].text, /Invalid target "12abc"/);
  });
});
