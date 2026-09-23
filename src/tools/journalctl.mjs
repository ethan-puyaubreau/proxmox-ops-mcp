import { nodeExec } from '../pool.mjs';
import { resolveNode } from '../routing.mjs';
import { NODES } from '../config.mjs';
import { pctExec } from '../shell.mjs';

// Read systemd journal logs from a PVE node or a CT inside one.
// target: node name OR CTID as number/string
export async function journalctlTool({ target, unit, lines = 50 }) {
  const ctid = parseInt(target, 10);
  const isNode = isNaN(ctid) && String(target) in NODES;

  if (!isNode && isNaN(ctid)) {
    return { content: [{ type: 'text', text: `Invalid target "${target}" — must be a node name or CTID` }] };
  }

  let node, cmd;
  if (isNode) {
    node = String(target);
    cmd = `journalctl -u '${unit}' --no-pager -n ${lines} 2>&1`;
  } else {
    node = await resolveNode(ctid);
    const inner = `journalctl -u '${unit}' --no-pager -n ${lines} 2>&1 || journalctl --no-pager -n ${lines} 2>&1`;
    cmd = pctExec(ctid, inner);
  }

  const result = await nodeExec(node, cmd, { timeout: 30000 });
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({ target, unit, node, ...result }, null, 2),
    }],
  };
}
