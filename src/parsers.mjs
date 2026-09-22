/** Parse 'free -m' output -> { total, used, free, available, percentUsed } in MB */
export function parseFreeMemory(stdout) {
  const line = stdout.split('\n').find(l => l.startsWith('Mem:'));
  if (!line) return null;
  const [, total, used, free, , , available] = line.split(/\s+/);
  const t = parseInt(total);
  return {
    total: t,
    used: parseInt(used),
    free: parseInt(free),
    available: parseInt(available),
    percentUsed: t ? Math.round((parseInt(used) / t) * 100) : null,
  };
}

/** Parse 'df -h <path>' output -> { size, used, available, usePercent } */
export function parseDf(stdout) {
  const line = stdout.split('\n').find(l => l.includes('%'));
  if (!line) return null;
  const parts = line.trim().split(/\s+/);
  return {
    size: parts[1],
    used: parts[2],
    available: parts[3],
    usePercent: parts[4],
  };
}

/** Parse 'cat /proc/loadavg' -> { load1, load5, load15 } */
export function parseLoadAvg(stdout) {
  const parts = stdout.trim().split(/\s+/);
  return {
    load1: parseFloat(parts[0]),
    load5: parseFloat(parts[1]),
    load15: parseFloat(parts[2]),
  };
}

/**
 * Parse combined 'pct list' + 'qm list' output -> array of CT/VM objects.
 * pct list format: "VMID   Status   Lock   Name"
 * qm list format:  "      VMID Name   Status   mem(mb)..."
 */
export function parseCtList(ctOut, vmOut, nodeName) {
  const results = [];
  for (const line of (ctOut || '').split('\n').slice(1)) {
    const parts = line.trim().split(/\s+/);
    const vmid = parts[0];
    if (!vmid || !/^\d+$/.test(vmid)) continue;
    const status = parts[1] || 'unknown';
    const name = parts[parts.length - 1] !== status ? parts[parts.length - 1] : '';
    results.push({ vmid: parseInt(vmid), type: 'ct', status, name, node: nodeName });
  }
  for (const line of (vmOut || '').split('\n').slice(1)) {
    const parts = line.trim().split(/\s+/);
    const vmid = parts[0];
    if (!vmid || !/^\d+$/.test(vmid)) continue;
    const name = parts[1] || '';
    const status = parts[2] || 'unknown';
    results.push({ vmid: parseInt(vmid), type: 'vm', status, name, node: nodeName });
  }
  return results;
}

/** Parse 'pvecm status' -> { quorate, nodes, version } */
export function parsePvecmStatus(stdout) {
  const get = (pattern) => stdout.match(pattern)?.[1]?.trim();
  return {
    quorate: get(/Quorate:\s+(\w+)/) === 'Yes',
    nodes: parseInt(get(/Nodes:\s+(\d+)/) || '0'),
    version: get(/Version:\s+(\S+)/),
  };
}

/** Parse 'docker ps [--all]' output -> array of container objects. */
export function parseDockerPs(stdout) {
  const lines = stdout.split('\n').filter(Boolean);
  if (lines.length < 2) return [];
  return lines.slice(1).map(line => {
    const parts = line.split(/\s{2,}/);
    return {
      id: parts[0]?.trim(),
      image: parts[1]?.trim(),
      command: parts[2]?.trim(),
      created: parts[3]?.trim(),
      status: parts[4]?.trim(),
      ports: parts[5]?.trim() || '',
      name: parts[parts.length - 1]?.trim(),
      running: parts[4]?.includes('Up') ?? false,
    };
  });
}

/** Parse 'uptime' output -> trimmed string. */
export function parseUptime(stdout) {
  return stdout.trim().replace(/^\s*\d+:\d+:\d+\s+up\s+/, '').split(',').slice(0, 2).join(',').trim();
}
