import { nodeExec } from './pool.mjs';
import { PVE_NODES } from './config.mjs';
import { parseCtList } from './parsers.mjs';

// ctid (string) -> nodeName (string)
let ctMap = new Map();
let lastRefresh = 0;
const CACHE_TTL = 60_000;

export async function buildCtMap(force = false) {
  if (!force && Date.now() - lastRefresh < CACHE_TTL) return;

  const results = await Promise.allSettled(
    PVE_NODES.map(async node => {
      const [cts, vms] = await Promise.allSettled([
        nodeExec(node, 'pct list 2>/dev/null || true', { timeout: 10000 }),
        nodeExec(node, 'qm list 2>/dev/null || true', { timeout: 10000 }),
      ]);
      return {
        node,
        ctOut: cts.status === 'fulfilled' ? cts.value.stdout : '',
        vmOut: vms.status === 'fulfilled' ? vms.value.stdout : '',
      };
    })
  );

  const newMap = new Map();
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    const { node, ctOut, vmOut } = r.value;
    const items = parseCtList(ctOut, vmOut, node);
    for (const item of items) {
      newMap.set(String(item.vmid), node);
    }
  }

  ctMap = newMap;
  lastRefresh = Date.now();
}

export async function resolveNode(ctid) {
  await buildCtMap();
  const node = ctMap.get(String(ctid));
  if (!node) {
    throw new Error(`CT/VM ${ctid} not found on any node. Use refresh_routing if recently created.`);
  }
  return node;
}

export function getCachedMap() {
  return Object.fromEntries(ctMap);
}

/** List all CTs/VMs from all nodes with full details. */
export async function listAllCts(filterNode = null, filterStatus = null) {
  await buildCtMap();

  const results = await Promise.allSettled(
    PVE_NODES
      .filter(n => !filterNode || n === filterNode)
      .map(async node => {
        const [cts, vms] = await Promise.allSettled([
          nodeExec(node, 'pct list 2>/dev/null || true', { timeout: 10000 }),
          nodeExec(node, 'qm list 2>/dev/null || true', { timeout: 10000 }),
        ]);
        const ctOut = cts.status === 'fulfilled' ? cts.value.stdout : '';
        const vmOut = vms.status === 'fulfilled' ? vms.value.stdout : '';
        return parseCtList(ctOut, vmOut, node);
      })
  );

  const all = [];
  for (const r of results) {
    if (r.status === 'fulfilled') all.push(...r.value);
  }

  return filterStatus ? all.filter(i => i.status === filterStatus) : all;
}
