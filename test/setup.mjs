// Preloaded by `npm test` so config-dependent modules load a fixture.
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.PROXMOX_MCP_CONFIG ??= fileURLToPath(new URL('./fixtures/config.json', import.meta.url));
delete process.env.TELEGRAM_BOT_TOKEN;
delete process.env.TELEGRAM_CHAT_ID;
process.env.AUDIT_LOG = path.join(os.tmpdir(), 'proxmox-ops-mcp-test-audit.log');
