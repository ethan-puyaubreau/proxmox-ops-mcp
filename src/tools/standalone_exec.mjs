import { Client } from 'ssh2';
import { exec } from '../pool.mjs';
import { STANDALONE, makeHostVerifier } from '../config.mjs';

// Execute a command on the configured standalone server (see config.json `standalone` section).
export async function standaloneExecTool({ cmd, timeout = 30000 }) {
  if (!STANDALONE) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: 'No standalone server configured (missing `standalone` section in config.json).' }) }],
    };
  }
  const conn = await new Promise((resolve, reject) => {
    const c = new Client();
    c.on('ready', () => resolve(c))
      .on('error', reject)
      .connect({
        host: STANDALONE.host,
        username: STANDALONE.username,
        privateKey: STANDALONE.privateKey,
        readyTimeout: STANDALONE.readyTimeout ?? 15000,
        keepaliveInterval: 10000,
        hostVerifier: makeHostVerifier(STANDALONE.host),
      });
  });
  try {
    const result = await exec(conn, cmd, { timeout });
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ target: 'standalone', host: STANDALONE.host, cmd, ...result }, null, 2),
      }],
    };
  } finally {
    try { conn.end(); } catch (_) {}
  }
}
