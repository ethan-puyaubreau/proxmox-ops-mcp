import { Client } from 'ssh2';
import { NODES, makeHostVerifier } from './config.mjs';

// nodeName -> { conn: Client, healthy: boolean }
const pool = new Map();

function connect(nodeName) {
  return new Promise((resolve, reject) => {
    const cfg = NODES[nodeName];
    if (!cfg) return reject(new Error(`Unknown node: ${nodeName}`));
    const c = new Client();
    c.on('ready', () => resolve(c))
      .on('error', (err) => reject(err))
      .on('close', () => {
        const entry = pool.get(nodeName);
        if (entry) entry.healthy = false;
      })
      .connect({ ...cfg, keepaliveInterval: 10000, hostVerifier: makeHostVerifier(cfg.host) });
  });
}

export async function getConn(nodeName) {
  const entry = pool.get(nodeName);
  if (entry?.healthy) return entry.conn;
  try {
    const conn = await connect(nodeName);
    pool.set(nodeName, { conn, healthy: true });
    return conn;
  } catch (err) {
    pool.delete(nodeName);
    throw err;
  }
}

export function exec(conn, cmd, { timeout = 30000 } = {}) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        const timeoutErr = new Error(`Command timed out after ${timeout / 1000}s: ${cmd.slice(0, 80)}`);
        timeoutErr.code = 'ECMDTIMEOUT';
        try { stream.signal('KILL'); } catch (_) {}
        try { stream.close(); } catch (_) {}
        reject(timeoutErr);
      }, timeout);
      stream.on('data', d => { stdout += d.toString(); });
      stream.stderr.on('data', d => { stderr += d.toString(); });
      stream.on('close', code => {
        clearTimeout(timer);
        resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() });
      });
    });
  });
}

// A timed-out command may still be running, so only retry one that never started.
export function isRetryable(err) {
  return err?.code !== 'ECMDTIMEOUT';
}

export async function nodeExec(nodeName, cmd, opts = {}) {
  const conn = await getConn(nodeName);
  try {
    return await exec(conn, cmd, opts);
  } catch (err) {
    if (!isRetryable(err)) throw err;
    const entry = pool.get(nodeName);
    if (entry) entry.healthy = false;
    const freshConn = await getConn(nodeName);
    return exec(freshConn, cmd, opts);
  }
}

/** Warm up connections to all nodes in parallel at startup. */
export async function warmPool() {
  const nodeNames = Object.keys(NODES);
  const results = await Promise.allSettled(nodeNames.map(n => getConn(n)));
  return results.map((r, i) => ({
    node: nodeNames[i],
    ok: r.status === 'fulfilled',
    error: r.reason?.message,
  }));
}

/** Return current pool health state. */
export function poolStatus() {
  return Object.fromEntries(
    Object.keys(NODES).map(n => [n, pool.get(n)?.healthy ?? false])
  );
}
