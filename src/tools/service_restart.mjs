import { nodeExec } from '../pool.mjs';
import { resolveNode } from '../routing.mjs';
import { PVE_NODES } from '../config.mjs';
import { assertName, pctExec } from '../shell.mjs';

async function runOn(target, cmd, timeout = 30000) {
  if (PVE_NODES.includes(target)) {
    return nodeExec(target, cmd, { timeout });
  }
  const ctid = parseInt(target);
  if (isNaN(ctid)) throw new Error(`Invalid target: ${target}. Use a node name or CT ID.`);
  const node = await resolveNode(ctid);
  return nodeExec(node, pctExec(ctid, cmd), { timeout });
}

async function detectServiceType(target, service) {
  try {
    const r = await runOn(target, `systemctl is-active ${service} 2>/dev/null || true`, 10000);
    if (r.stdout && !r.stdout.includes('not-found') && r.stdout.trim() !== '') return 'systemd';
  } catch (_) {}
  try {
    const r = await runOn(target, `docker inspect ${service} --format '{{.State.Status}}' 2>/dev/null || true`, 10000);
    if (r.stdout && !r.stdout.includes('No such')) return 'docker';
  } catch (_) {}
  return null;
}

export async function serviceRestartTool({ target, service, type = 'auto' }) {
  // Validate target/service (anti-injection — interpolated into systemctl/docker/pct).
  assertName('target', target);
  assertName('service', service);
  const resolvedType = type === 'auto' ? await detectServiceType(target, service) : type;

  if (!resolvedType) {
    throw new Error(`Service '${service}' not found as systemd unit or Docker container on target '${target}'.`);
  }

  let restartCmd, statusCmd;
  if (resolvedType === 'systemd') {
    restartCmd = `systemctl restart ${service}`;
    statusCmd = `systemctl is-active ${service}`;
  } else {
    restartCmd = `docker restart ${service}`;
    statusCmd = `docker inspect ${service} --format '{{.State.Status}}'`;
  }

  const restartResult = await runOn(target, restartCmd, 30000);
  await new Promise(r => setTimeout(r, 3000));
  const statusResult = await runOn(target, statusCmd, 10000);

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        target,
        service,
        type: resolvedType,
        restartCode: restartResult.code,
        restartOutput: restartResult.stdout || restartResult.stderr,
        status: statusResult.stdout,
        ok: restartResult.code === 0,
      }, null, 2),
    }],
  };
}
