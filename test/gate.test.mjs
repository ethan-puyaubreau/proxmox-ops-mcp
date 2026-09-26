import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { reported } from '../src/gate.mjs';

describe('reported', () => {
  it('passes results through', async () => {
    const result = { content: [{ type: 'text', text: 'ok' }] };
    assert.deepEqual(await reported(async () => result)({}), result);
  });

  it('turns a thrown error into a tool error result', async () => {
    const result = await reported(async () => { throw new Error('ssh timeout'); })({});
    assert.equal(result.isError, true);
    assert.equal(result.content[0].text, 'Error: ssh timeout');
  });
});
