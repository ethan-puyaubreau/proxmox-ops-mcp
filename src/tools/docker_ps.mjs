import { nodeExec } from '../pool.mjs';
import { resolveNode } from '../routing.mjs';
import { parseDockerPs } from '../parsers.mjs';

export async function dockerPsTool({ ctid, all = false }) {
  const node = await resolveNode(ctid);
  const dockerCmd = all ? 'docker ps -a' : 'docker ps';
  const pctCmd = `pct exec ${ctid} -- ${dockerCmd}`;
  const result = await nodeExec(node, pctCmd, { timeout: 15000 });
  const containers = parseDockerPs(result.stdout);
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({ ctid, node, containers, count: containers.length }, null, 2),
    }],
  };
}
