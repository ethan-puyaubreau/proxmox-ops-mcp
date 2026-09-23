import { nodeExec } from '../pool.mjs';
import { resolveNode } from '../routing.mjs';
import { PVE_NODES } from '../config.mjs';
import { assertName, shellQuote, toInt, pctExec } from '../shell.mjs';

// Read systemd journal logs from a PVE node or a CT inside one.
// target: node name OR CTID as number/string
export async function journalctlTool({ target, unit, lines = 50 }) {
  const safeUnit = shellQuote(assertName('unit', unit));
  const n = toInt(lines, { min: 1, max: 10000, fallback: 50 });
  const t = String(target);
  const isNode = PVE_NODES.includes(t);

  if (!isNode && !/^\d+$/.test(t)) {
    return { content: [{ type: 'text', text: `Invalid target "${target}" — must be a node name or CTID` }] };
  }

  let node, cmd;
  if (isNode) {
    node = t;
    cmd = `journalctl -u ${safeUnit} --no-pager -n ${n} 2>&1`;
  } else {
    const inner = `journalctl -u ${safeUnit} --no-pager -n ${n} 2>&1 || journalctl --no-pager -n ${n} 2>&1`;
    cmd = pctExec(t, inner);
    node = await resolveNode(Number(t));
  }

  const result = await nodeExec(node, cmd, { timeout: 30000 });
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({ target, unit, node, ...result }, null, 2),
    }],
  };
}
