import { nodeExec } from '../pool.mjs';
import { resolveNode } from '../routing.mjs';

export async function dockerLogsTool({ ctid, container, lines = 50 }) {
  if (!Number.isInteger(Number(ctid))) throw new Error(`invalid ctid: ${ctid}`);
  if (!/^[A-Za-z0-9_.-]+$/.test(String(container))) {
    throw new Error(`invalid container name: "${container}" (allowed: A-Za-z0-9 _ . -)`);
  }
  const safeLines = Number.isInteger(Number(lines)) ? Number(lines) : 50;
  const node = await resolveNode(ctid);
  const pctCmd = `pct exec ${ctid} -- docker logs ${container} --tail ${safeLines} 2>&1`;
  const result = await nodeExec(node, pctCmd, { timeout: 20000 });
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({ ctid, node, container, lines, logs: result.stdout, stderr: result.stderr }, null, 2),
    }],
  };
}
