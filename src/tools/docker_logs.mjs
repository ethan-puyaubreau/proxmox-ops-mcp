import { nodeExec } from '../pool.mjs';
import { resolveNode } from '../routing.mjs';
import { assertName, toInt } from '../shell.mjs';

export async function dockerLogsTool({ ctid, container, lines = 50 }) {
  if (!Number.isInteger(Number(ctid))) throw new Error(`invalid ctid: ${ctid}`);
  assertName('container name', container);
  const safeLines = toInt(lines, { min: 1, max: 10000, fallback: 50 });
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
