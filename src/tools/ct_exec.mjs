import { nodeExec } from '../pool.mjs';
import { resolveNode } from '../routing.mjs';

export async function ctExecTool({ ctid, cmd, timeout = 30000 }) {
  const node = await resolveNode(ctid);
  const escaped = cmd.replace(/'/g, `'\\''`);
  const pctCmd = `pct exec ${ctid} -- bash -c '${escaped}'`;
  const result = await nodeExec(node, pctCmd, { timeout });
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({ ctid, node, cmd, ...result }, null, 2),
    }],
  };
}
