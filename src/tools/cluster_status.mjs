import { nodeExec } from '../pool.mjs';
import { PVE_NODES } from '../config.mjs';
import { parseFreeMemory, parseDf, parseLoadAvg, parsePvecmStatus, parseUptime } from '../parsers.mjs';

export async function clusterStatus() {
  const results = await Promise.allSettled(
    PVE_NODES.map(async node => {
      const { stdout } = await nodeExec(node,
        'free -m && echo "---DF---" && df -h / && echo "---LOAD---" && cat /proc/loadavg && echo "---UPTIME---" && uptime && echo "---PVECM---" && pvecm status 2>/dev/null || true',
        { timeout: 20000 }
      );
      const sections = stdout.split(/---(\w+)---/);
      const get = (name) => {
        const idx = sections.indexOf(name);
        return idx !== -1 ? sections[idx + 1]?.trim() : '';
      };
      return {
        node,
        reachable: true,
        ram: parseFreeMemory(get('free -m') || sections[0]),
        disk: parseDf(get('DF') || stdout),
        load: parseLoadAvg(get('LOAD') || ''),
        uptime: parseUptime(get('UPTIME') || ''),
        pvecm: parsePvecmStatus(get('PVECM') || stdout),
      };
    })
  );

  const nodes = {};
  for (let i = 0; i < PVE_NODES.length; i++) {
    const r = results[i];
    if (r.status === 'fulfilled') {
      nodes[PVE_NODES[i]] = r.value;
    } else {
      nodes[PVE_NODES[i]] = { node: PVE_NODES[i], reachable: false, error: r.reason?.message };
    }
  }

  const reachable = Object.values(nodes).filter(n => n.reachable).length;
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({ nodes, summary: { total: PVE_NODES.length, reachable }, timestamp: new Date().toISOString() }, null, 2),
    }],
  };
}
