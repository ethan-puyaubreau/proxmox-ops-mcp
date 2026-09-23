import { nodeExec } from '../pool.mjs';
import { resolveNode } from '../routing.mjs';
import { pctExec } from '../shell.mjs';

export async function ctExecTool({ ctid, cmd, timeout = 30000 }) {
  const node = await resolveNode(ctid);
  const result = await nodeExec(node, pctExec(ctid, cmd), { timeout });
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({ ctid, node, cmd, ...result }, null, 2),
    }],
  };
}
