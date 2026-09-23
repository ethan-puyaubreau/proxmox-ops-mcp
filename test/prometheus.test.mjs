import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { buildPromUrl } from '../src/tools/prometheus_query.mjs';

const BASE = 'http://192.0.2.30:9090';

describe('buildPromUrl', () => {
  it('builds an instant query', () => {
    assert.equal(buildPromUrl(BASE, { query: 'up' }), 'http://192.0.2.30:9090/api/v1/query?query=up');
  });

  it('builds a range query', () => {
    const url = new URL(buildPromUrl(BASE, {
      query: 'up', start: '2026-01-01T00:00:00+02:00', end: '1767225600', step: '5m',
    }));
    assert.equal(url.pathname, '/api/v1/query_range');
    assert.equal(url.searchParams.get('start'), '2026-01-01T00:00:00+02:00');
    assert.equal(url.searchParams.get('end'), '1767225600');
    assert.equal(url.searchParams.get('step'), '5m');
  });

  it('rejects a partial range', () => {
    assert.throws(() => buildPromUrl(BASE, { query: 'up', start: '1767225600' }), /start, end and step/);
  });

  it('rejects a bad step', () => {
    assert.throws(
      () => buildPromUrl(BASE, { query: 'up', start: '1767225600', end: '1767229200', step: '5min' }),
      /invalid step/,
    );
  });

  it('keeps a path prefix on the base URL', () => {
    assert.equal(
      buildPromUrl(`${BASE}/prometheus`, { query: 'up' }),
      'http://192.0.2.30:9090/prometheus/api/v1/query?query=up',
    );
  });

  it('percent-encodes quotes and spaces in the query', () => {
    const query = 'sum by (instance) (rate(node_cpu_seconds_total{mode!="idle"}[5m]))';
    const url = buildPromUrl(BASE, { query });
    assert.doesNotMatch(url, /[\s"']/);
    assert.equal(new URL(url).searchParams.get('query'), query);
  });
});
