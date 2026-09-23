#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { warmPool } from './src/pool.mjs';
import { buildCtMap, getCachedMap } from './src/routing.mjs';
import { PVE_NODES, SENSITIVE_CTIDS } from './src/config.mjs';
import { classify } from './src/classifier.mjs';
import { requestApproval, audit } from './src/pending.mjs';

import { clusterStatus } from './src/tools/cluster_status.mjs';
import { listCts } from './src/tools/list_cts.mjs';
import { nodeExecTool } from './src/tools/node_exec.mjs';
import { ctExecTool } from './src/tools/ct_exec.mjs';
import { nodeResourcesTool } from './src/tools/node_resources.mjs';
import { dockerPsTool } from './src/tools/docker_ps.mjs';
import { dockerLogsTool } from './src/tools/docker_logs.mjs';
import { serviceRestartTool } from './src/tools/service_restart.mjs';
import { standaloneExecTool } from './src/tools/standalone_exec.mjs';
import { prometheusQueryTool } from './src/tools/prometheus_query.mjs';
import { journalctlTool } from './src/tools/journalctl.mjs';

// Two-tier gate (Heimdall classifier + Gjallarhorn out-of-band approval).
// Tier 1 (read/repair) executes immediately. Tier 2 (destructive/sensitive/unrecognized)
// is queued and requires an explicit approval from a separate channel (Telegram).
// A prompt-injection attack requesting something destructive cannot self-approve.
function gated(toolName, handler) {
  return async (args, extra) => {
    const { tier, reason } = classify(toolName, args, { sensitiveCtids: SENSITIVE_CTIDS });
    if (tier === 1) {
      try {
        audit({
          tier: 1,
          action: `${toolName} [${args.node ?? args.ctid ?? args.target ?? 'standalone'}] ${String(args.cmd ?? args.service ?? '').slice(0, 200)}`.trim(),
          decision: 'auto',
        });
      } catch (_) {}
      return handler(args, extra);
    }
    const summary = `${toolName} [${args.node ?? args.ctid ?? args.target ?? 'standalone'}] ${args.cmd ?? args.service ?? ''}`.trim().slice(0, 300);
    const { approved, reason: decision } = await requestApproval(summary);
    if (!approved) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            blocked: true, tier: 2, classifier_reason: reason, decision, action: summary,
            hint: 'Tier-2 action blocked — approve via Gjallarhorn (Telegram) then retry.',
          }, null, 2),
        }],
      };
    }
    return handler(args, extra);
  };
}

const server = new McpServer({ name: 'proxmox-ops-mcp', version: '1.0.0' });

// ─── Tools ────────────────────────────────────────────────────────────────────

server.tool(
  'cluster_status',
  'Returns structured health status for all configured nodes: RAM, disk, load, uptime, PVE quorum. One call replaces N individual SSH commands.',
  {},
  clusterStatus
);

server.tool(
  'list_cts',
  'List all containers and VMs in the cluster with VMID, name, status, type (ct/vm), and host node. Optionally filter by node or status.',
  {
    node: z.string().optional().describe('Filter by node name'),
    status: z.enum(['running', 'stopped']).optional().describe('Filter by status'),
  },
  listCts
);

server.tool(
  'node_exec',
  'Execute a shell command on a Proxmox node by name.',
  {
    node: z.string().describe('Node name (as defined in config.json)'),
    cmd: z.string().describe('Shell command to run'),
    timeout: z.number().optional().default(30000).describe('Timeout in ms (default 30000)'),
  },
  gated('node_exec', nodeExecTool)
);

server.tool(
  'ct_exec',
  'Execute a shell command inside a container or VM by CTID. Automatically resolves the host node and wraps the command in pct exec.',
  {
    ctid: z.number().int().describe('Container or VM ID'),
    cmd: z.string().describe('Shell command to run inside the CT'),
    timeout: z.number().optional().default(30000).describe('Timeout in ms (default 30000)'),
  },
  gated('ct_exec', ctExecTool)
);

server.tool(
  'node_resources',
  'Returns parsed RAM, disk, CPU load, and LVM thin pool usage for one or all nodes.',
  {
    node: z.string().optional().describe('Node name (omit for all nodes)'),
  },
  nodeResourcesTool
);

server.tool(
  'docker_ps',
  'List Docker containers in a CT by CTID. Automatically resolves the host node.',
  {
    ctid: z.number().int().describe('CT ID running Docker'),
    all: z.boolean().optional().default(false).describe('Include stopped containers (docker ps -a)'),
  },
  dockerPsTool
);

server.tool(
  'docker_logs',
  'Fetch logs from a Docker container in a CT.',
  {
    ctid: z.number().int().describe('CT ID running Docker'),
    container: z.string().describe('Container name or ID'),
    lines: z.number().int().min(1).max(10000).optional().default(50).describe('Number of lines to return (default 50)'),
  },
  dockerLogsTool
);

server.tool(
  'service_restart',
  'Restart a systemd service or Docker container on a node or CT, with a post-restart status check. target is a node name or a CTID string.',
  {
    target: z.string().describe('Node name or CTID string (e.g. "101")'),
    service: z.string().describe('systemd unit name or Docker container name'),
    type: z.enum(['systemd', 'docker', 'auto']).optional().default('auto').describe('Service type (default: auto-detect)'),
  },
  gated('service_restart', serviceRestartTool)
);

server.tool(
  'standalone_exec',
  'Execute a shell command on the configured standalone server (see config.json `standalone` section).',
  {
    cmd: z.string().describe('Shell command to run'),
    timeout: z.number().optional().default(30000).describe('Timeout in ms (default 30000)'),
  },
  gated('standalone_exec', standaloneExecTool)
);

server.tool(
  'refresh_routing',
  'Force a refresh of the CTID-to-node map. Use after creating or migrating a CT.',
  {},
  async () => {
    await buildCtMap(true);
    const map = getCachedMap();
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ refreshed: true, ctCount: Object.keys(map).length, map, timestamp: new Date().toISOString() }, null, 2),
      }],
    };
  }
);

server.tool(
  'prometheus_query',
  'Run a PromQL query against the configured Prometheus endpoint.',
  {
    query: z.string().describe('PromQL query (e.g. "up", "node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes * 100")'),
    range: z.string().optional().describe('Range query params (e.g. "start=2024-01-01T00:00:00Z&end=2024-01-02T00:00:00Z&step=1h")'),
  },
  prometheusQueryTool
);

server.tool(
  'journalctl',
  'Read systemd journal logs from a PVE node or a CT.',
  {
    target: z.string().describe('Node name or CTID string (e.g. "134")'),
    unit: z.string().describe('systemd unit name (e.g. "docker", "nginx")'),
    lines: z.number().int().min(1).max(10000).optional().default(50).describe('Number of lines to return (default 50)'),
  },
  journalctlTool
);

// ─── Startup ──────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.stderr.write('[proxmox-mcp] MCP server started (stdio)\n');

  Promise.allSettled([warmPool(), buildCtMap(true)]).then(([poolRes]) => {
    const ok = poolRes.value?.filter(r => r.ok).length ?? 0;
    process.stderr.write(`[proxmox-mcp] SSH pool: ${ok}/${PVE_NODES.length} nodes reachable\n`);
  });
}

main().catch(err => {
  process.stderr.write(`[proxmox-mcp] Fatal: ${err.message}\n${err.stack}\n`);
  process.exit(1);
});
