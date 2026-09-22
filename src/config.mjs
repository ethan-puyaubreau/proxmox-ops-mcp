import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = process.env.PROXMOX_MCP_CONFIG ?? path.resolve(__dirname, '../config.json');

let raw;
try {
  raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (err) {
  process.stderr.write(`[proxmox-mcp] Cannot read config: ${configPath}\n${err.message}\n`);
  process.exit(1);
}

function resolveKey(keyPath) {
  return fs.readFileSync(keyPath.replace(/^~/, os.homedir()));
}

export const NODES = Object.fromEntries(
  Object.entries(raw.nodes ?? {}).map(([name, cfg]) => [
    name,
    {
      host: cfg.host,
      username: cfg.username,
      privateKey: resolveKey(cfg.keyPath),
      readyTimeout: 15000,
      fingerprints: cfg.fingerprints ?? [],
    },
  ])
);

export const STANDALONE = raw.standalone
  ? {
      host: raw.standalone.host,
      username: raw.standalone.username,
      privateKey: resolveKey(raw.standalone.keyPath),
      readyTimeout: 15000,
      fingerprints: raw.standalone.fingerprints ?? [],
    }
  : null;

export const PROMETHEUS_URL = raw.prometheus?.url ?? '';
export const PROMETHEUS_NODE = raw.prometheus?.node ?? Object.keys(NODES)[0] ?? '';
export const SENSITIVE_CTIDS = new Set((raw.sensitiveCtids ?? []).map(Number));
export const PVE_NODES = Object.keys(NODES);

// Returns a host-key verifier for the given host.
// If fingerprints are configured, require a match (anti-MITM).
// Empty fingerprints array = accept any key (standard ssh-like behavior).
export function makeHostVerifier(host) {
  const all = [...Object.values(NODES), ...(STANDALONE ? [STANDALONE] : [])];
  const fingerprints = all.find(c => c.host === host)?.fingerprints ?? [];
  if (!fingerprints.length) return () => true;
  return (key) => {
    const fp = 'SHA256:' + crypto.createHash('sha256').update(key).digest('base64').replace(/=+$/, '');
    return fingerprints.includes(fp);
  };
}
