import { nodeExec } from '../pool.mjs';
import { PVE_NODES } from '../config.mjs';
import { parseFreeMemory, parseDf, parseLoadAvg } from '../parsers.mjs';

async function getNodeResources(node) {
  const { stdout } = await nodeExec(node,
    'free -m && echo "---" && df -h / && echo "---" && cat /proc/loadavg && echo "---" && nproc',
    { timeout: 15000 }
  );
  const parts = stdout.split(/\n---\n/);
  const ram = parseFreeMemory(parts[0] || '');
  const disk = parseDf(parts[1] || '');
  const load = parseLoadAvg(parts[2] || '');
  const cores = parseInt((parts[3] || '').trim()) || null;

  let lvmThin = null;
  try {
    const lvm = await nodeExec(node, 'vgs --noheadings --units g -o vg_name,vg_size,vg_free 2>/dev/null || true', { timeout: 10000 });
    if (lvm.stdout) {
      const lvmParts = lvm.stdout.trim().split(/\s+/);
      lvmThin = { vg: lvmParts[0], size: lvmParts[1], free: lvmParts[2] };
    }
  } catch (_) {}

  return { node, ram, disk, load, cores, lvmThin };
}

export async function nodeResourcesTool({ node } = {}) {
  const nodes = node ? [node] : PVE_NODES;
  const results = await Promise.allSettled(nodes.map(n => getNodeResources(n)));
  const data = {};
  for (let i = 0; i < nodes.length; i++) {
    const r = results[i];
    data[nodes[i]] = r.status === 'fulfilled' ? r.value : { node: nodes[i], error: r.reason?.message };
  }
  return {
    content: [{
      type: 'text',
      text: JSON.stringify(node ? data[node] : data, null, 2),
    }],
  };
}
