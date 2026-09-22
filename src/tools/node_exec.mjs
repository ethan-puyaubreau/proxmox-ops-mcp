import { nodeExec as _nodeExec } from '../pool.mjs';

export async function nodeExecTool({ node, cmd, timeout = 30000 }) {
  const result = await _nodeExec(node, cmd, { timeout });
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({ node, cmd, ...result }, null, 2),
    }],
  };
}
