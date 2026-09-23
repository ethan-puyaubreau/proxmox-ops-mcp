import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import { describe, it } from 'node:test';
import { TOOLS } from '../src/tools.mjs';
import { classify, READONLY_TOOLS } from '../src/classifier.mjs';

const names = TOOLS.map(t => t.name);

describe('tool table', () => {
  it('has unique names', () => {
    assert.equal(new Set(names).size, names.length);
  });

  it('only lists tools the classifier recognizes', () => {
    for (const name of names) {
      assert.doesNotMatch(classify(name, {}).reason, /unrecognized tool/, name);
    }
  });

  it('marks exactly the classifier read-only tools as read-only', () => {
    for (const { name, annotations } of TOOLS) {
      assert.equal(annotations.readOnlyHint, READONLY_TOOLS.has(name), name);
    }
  });

  it('matches the README tools table', () => {
    const readme = fs.readFileSync(new URL('../README.md', import.meta.url), 'utf8');
    const documented = [...readme.matchAll(/^\| `(\w+)` \|/gm)].map(m => m[1]);
    assert.deepEqual(new Set(documented), new Set(names));
  });
});
