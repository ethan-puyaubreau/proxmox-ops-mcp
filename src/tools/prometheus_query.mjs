import { nodeExec } from '../pool.mjs';
import { PROMETHEUS_URL, PROMETHEUS_NODE } from '../config.mjs';
import { shellQuote } from '../shell.mjs';

const TIME_RE = /^(\d+(\.\d+)?|\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2}))$/;
const STEP_RE = /^(\d+(\.\d+)?|(\d+(ms|s|m|h|d|w|y))+)$/;

// Instant query URL, or a range query URL when start, end and step are given.
export function buildPromUrl(baseUrl, { query, start, end, step }) {
  const isRange = Boolean(start || end || step);
  const url = new URL(isRange ? 'api/v1/query_range' : 'api/v1/query', baseUrl.replace(/\/*$/, '/'));
  url.searchParams.set('query', query);
  if (!isRange) return url.href;

  if (!start || !end || !step) throw new Error('a range query needs start, end and step');
  if (!TIME_RE.test(start)) throw new Error(`invalid start: "${start}" (unix timestamp or RFC 3339)`);
  if (!TIME_RE.test(end)) throw new Error(`invalid end: "${end}" (unix timestamp or RFC 3339)`);
  if (!STEP_RE.test(step)) throw new Error(`invalid step: "${step}" (seconds or a duration such as 5m)`);
  url.searchParams.set('start', start);
  url.searchParams.set('end', end);
  url.searchParams.set('step', step);
  return url.href;
}

// Run a PromQL query against the configured Prometheus endpoint.
// The query is executed via curl from a cluster node (the node is assumed to have
// network access to the Prometheus host; the MCP server itself may not).
export async function prometheusQueryTool({ query, start, end, step }) {
  if (!PROMETHEUS_URL || !PROMETHEUS_NODE) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: 'Prometheus not configured (missing prometheus.url / prometheus.node in config.json).' }) }],
    };
  }

  const url = buildPromUrl(PROMETHEUS_URL, { query, start, end, step });
  const cmd = 'curl -sf -- ' + shellQuote(url);
  const result = await nodeExec(PROMETHEUS_NODE, cmd, { timeout: 15000 });

  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    return {
      content: [{
        type: 'text',
        text: result.stderr || result.stdout || 'No response from Prometheus',
      }],
    };
  }

  return {
    content: [{
      type: 'text',
      text: JSON.stringify(parsed, null, 2),
    }],
  };
}
