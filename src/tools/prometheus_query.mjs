import { nodeExec } from '../pool.mjs';
import { PROMETHEUS_URL, PROMETHEUS_NODE } from '../config.mjs';

// Run a PromQL query against the configured Prometheus endpoint.
// The query is executed via curl from a cluster node (the node is assumed to have
// network access to the Prometheus host; the MCP server itself may not).
export async function prometheusQueryTool({ query, range }) {
  if (!PROMETHEUS_URL || !PROMETHEUS_NODE) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: 'Prometheus not configured (missing prometheus.url / prometheus.node in config.json).' }) }],
    };
  }

  const endpoint = range
    ? `/api/v1/query_range?query=${encodeURIComponent(query)}&${range}`
    : `/api/v1/query?query=${encodeURIComponent(query)}`;

  const cmd = `curl -sf "${PROMETHEUS_URL}${endpoint}"`;
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
