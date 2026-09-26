import { z } from 'zod';

import { clusterStatus } from './tools/cluster_status.mjs';
import { listCts } from './tools/list_cts.mjs';
import { nodeExecTool } from './tools/node_exec.mjs';
import { ctExecTool } from './tools/ct_exec.mjs';
import { nodeResourcesTool } from './tools/node_resources.mjs';
import { dockerPsTool } from './tools/docker_ps.mjs';
import { dockerLogsTool } from './tools/docker_logs.mjs';
import { serviceRestartTool } from './tools/service_restart.mjs';
import { standaloneExecTool } from './tools/standalone_exec.mjs';
import { refreshRoutingTool } from './tools/refresh_routing.mjs';
import { prometheusQueryTool } from './tools/prometheus_query.mjs';
import { journalctlTool } from './tools/journalctl.mjs';

// MCP tool annotations are hints for the client; the gate enforces the tiers.
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const EXEC = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false };
const RESTART = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false };

export const TOOLS = [
  {
    name: 'cluster_status',
    title: 'Cluster status',
    description: 'Returns structured health status for all configured nodes: RAM, disk, load, uptime, PVE quorum. One call replaces N individual SSH commands.',
    annotations: READ_ONLY,
    inputSchema: {},
    handler: clusterStatus,
  },
  {
    name: 'list_cts',
    title: 'List containers and VMs',
    description: 'List all containers and VMs in the cluster with VMID, name, status, type (ct/vm), and host node. Optionally filter by node or status.',
    annotations: READ_ONLY,
    inputSchema: {
      node: z.string().optional().describe('Filter by node name'),
      status: z.enum(['running', 'stopped']).optional().describe('Filter by status'),
    },
    handler: listCts,
  },
  {
    name: 'node_exec',
    title: 'Run a command on a node',
    description: 'Execute a shell command on a Proxmox node by name.',
    annotations: EXEC,
    inputSchema: {
      node: z.string().describe('Node name (as defined in config.json)'),
      cmd: z.string().describe('Shell command to run'),
      timeout: z.number().optional().default(30000).describe('Timeout in ms (default 30000)'),
    },
    handler: nodeExecTool,
  },
  {
    name: 'ct_exec',
    title: 'Run a command in a container',
    description: 'Execute a shell command inside a container or VM by CTID. Automatically resolves the host node and wraps the command in pct exec.',
    annotations: EXEC,
    inputSchema: {
      ctid: z.number().int().describe('Container or VM ID'),
      cmd: z.string().describe('Shell command to run inside the CT'),
      timeout: z.number().optional().default(30000).describe('Timeout in ms (default 30000)'),
    },
    handler: ctExecTool,
  },
  {
    name: 'node_resources',
    title: 'Node resources',
    description: 'Returns parsed RAM, disk, CPU load, and LVM thin pool usage for one or all nodes.',
    annotations: READ_ONLY,
    inputSchema: {
      node: z.string().optional().describe('Node name (omit for all nodes)'),
    },
    handler: nodeResourcesTool,
  },
  {
    name: 'docker_ps',
    title: 'List Docker containers',
    description: 'List Docker containers in a CT by CTID. Automatically resolves the host node.',
    annotations: READ_ONLY,
    inputSchema: {
      ctid: z.number().int().describe('CT ID running Docker'),
      all: z.boolean().optional().default(false).describe('Include stopped containers (docker ps -a)'),
    },
    handler: dockerPsTool,
  },
  {
    name: 'docker_logs',
    title: 'Docker container logs',
    description: 'Fetch logs from a Docker container in a CT.',
    annotations: READ_ONLY,
    inputSchema: {
      ctid: z.number().int().describe('CT ID running Docker'),
      container: z.string().describe('Container name or ID'),
      lines: z.number().int().min(1).max(10000).optional().default(50).describe('Number of lines to return (default 50)'),
    },
    handler: dockerLogsTool,
  },
  {
    name: 'service_restart',
    title: 'Restart a service',
    description: 'Restart a systemd service or Docker container on a node or CT, with a post-restart status check. target is a node name or a CTID string.',
    annotations: RESTART,
    inputSchema: {
      target: z.string().describe('Node name or CTID string (e.g. "101")'),
      service: z.string().describe('systemd unit name or Docker container name'),
      type: z.enum(['systemd', 'docker', 'auto']).optional().default('auto').describe('Service type (default: auto-detect)'),
    },
    handler: serviceRestartTool,
  },
  {
    name: 'standalone_exec',
    title: 'Run a command on the standalone server',
    description: 'Execute a shell command on the configured standalone server (see config.json `standalone` section).',
    annotations: EXEC,
    inputSchema: {
      cmd: z.string().describe('Shell command to run'),
      timeout: z.number().optional().default(30000).describe('Timeout in ms (default 30000)'),
    },
    handler: standaloneExecTool,
  },
  {
    name: 'refresh_routing',
    title: 'Refresh CT routing',
    description: 'Force a refresh of the CTID-to-node map. Use after creating or migrating a CT.',
    annotations: READ_ONLY,
    inputSchema: {},
    handler: refreshRoutingTool,
  },
  {
    name: 'prometheus_query',
    title: 'Prometheus query',
    description: 'Run a PromQL query against the configured Prometheus endpoint. Pass start, end and step together for a range query.',
    annotations: READ_ONLY,
    inputSchema: {
      query: z.string().describe('PromQL query (e.g. "up", "node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes * 100")'),
      start: z.string().optional().describe('Range start: unix timestamp or RFC 3339 (e.g. "2026-01-01T00:00:00Z")'),
      end: z.string().optional().describe('Range end: unix timestamp or RFC 3339 (e.g. "2026-01-02T00:00:00+02:00")'),
      step: z.string().optional().describe('Range resolution: seconds or a Prometheus duration (e.g. "60", "5m", "1h")'),
    },
    handler: prometheusQueryTool,
  },
  {
    name: 'journalctl',
    title: 'Journal logs',
    description: 'Read systemd journal logs from a PVE node or a CT.',
    annotations: READ_ONLY,
    inputSchema: {
      target: z.string().describe('Node name or CTID string (e.g. "134")'),
      unit: z.string().describe('systemd unit name (e.g. "docker", "nginx")'),
      lines: z.number().int().min(1).max(10000).optional().default(50).describe('Number of lines to return (default 50)'),
    },
    handler: journalctlTool,
  },
];
