import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import {
  PVE_NODES, SENSITIVE_CTIDS, STANDALONE, PROMETHEUS_URL, PROMETHEUS_NODE,
} from '../src/config.mjs';

describe('config — fixture', () => {
  it('loads nodes, standalone host and prometheus settings', () => {
    assert.deepEqual(PVE_NODES, ['node-a', 'node-b']);
    assert.ok(SENSITIVE_CTIDS.has(110));
    assert.equal(STANDALONE.host, '192.0.2.20');
    assert.equal(PROMETHEUS_URL, 'http://192.0.2.30:9090');
    assert.equal(PROMETHEUS_NODE, 'node-a');
  });
});
