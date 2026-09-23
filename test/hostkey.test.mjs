import { strict as assert } from 'node:assert';
import crypto from 'node:crypto';
import { describe, it } from 'node:test';
import { hostVerifier } from '../src/config.mjs';

const key = Buffer.from('test host key');
const fp = 'SHA256:' + crypto.createHash('sha256').update(key).digest('base64').replace(/=+$/, '');

describe('hostVerifier', () => {
  it('accepts a key matching a pinned fingerprint', () => {
    assert.equal(hostVerifier({ fingerprints: [fp] }, 'node-a')(key), true);
  });

  it('rejects a key that does not match', () => {
    assert.equal(hostVerifier({ fingerprints: ['SHA256:other'] }, 'node-a')(key), false);
  });

  it('accepts any key when unpinned and explicitly insecure', () => {
    assert.equal(hostVerifier({ insecureAcceptAnyHostKey: true }, 'node-b')(key), true);
  });

  it('rejects an unpinned host by default', () => {
    assert.equal(hostVerifier({}, 'node-c')(key), false);
  });
});
