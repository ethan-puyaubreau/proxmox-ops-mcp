#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { warmPool } from './src/pool.mjs';
import { buildCtMap } from './src/routing.mjs';
import { PVE_NODES } from './src/config.mjs';
import { gated } from './src/gate.mjs';
import { TOOLS } from './src/tools.mjs';

const server = new McpServer({ name: 'proxmox-ops-mcp', version: '1.0.0' });

// Registering through the gate is the only path, so no tool can skip it.
for (const { name, description, inputSchema, handler } of TOOLS) {
  server.tool(name, description, inputSchema, gated(name, handler));
}

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
