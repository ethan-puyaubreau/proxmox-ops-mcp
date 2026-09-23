# proxmox-ops-mcp

An MCP server for operating a Proxmox cluster. Tools cover cluster status, container and VM management, service restarts, Docker operations, Prometheus queries, and journal log access. There is also an optional tool for a standalone server outside the cluster.

## Two-tier execution model

Every tool call goes through a classifier before execution. Tier-1 commands (read, diagnose, benign repair) run immediately. Tier-2 commands (destructive, sensitive, or unrecognized) are queued and require out-of-band approval via a Telegram bot (Gjallarhorn) before anything executes.

The classifier is deny-by-default on arbitrary shell execution: each segment of a command must start with an allow-listed verb, and for multi-purpose binaries (`systemctl`, `docker`, `pct`, `zfs`, ...) the subcommand must also be on an allow-list. Write redirects, command substitution, and network egress (`curl`/`wget`) are always Tier 2. The goal: a prompt-injection attack requesting something destructive hits the out-of-band approval step and cannot self-approve, because it does not control the Telegram channel.

The approval message shows the tool name and every argument in full, so the approver sees exactly what will run. An action too long to fit in one Telegram message is denied without asking. If the approval request cannot be delivered, the action is denied at once instead of waiting for the timeout. If the MCP client cancels the tool call, the pending request is dropped and a later approval does not run the action.

If Telegram credentials are not configured, Tier-2 actions are denied by default (fail-safe).

## Configuration

```
cp config.example.json config.json
cp .env.example .env
```

Edit `config.json` with your node hostnames, SSH key paths, and optional host fingerprints. Edit `.env` with your Telegram bot token and chat ID.

`PROXMOX_MCP_CONFIG` environment variable overrides the default config path (`./config.json`).

### Host key pinning

Populate `fingerprints` in `config.json` for each node to enable host key verification. Collect fingerprints with:

```
ssh-keyscan -t ed25519,rsa <host> | ssh-keygen -lf -
```

Leave `fingerprints: []` to skip pinning (accepts any key, standard ssh-like behavior).

## Running

```
npm install
node index.mjs
```

Configure in your MCP client:

```json
{
  "mcpServers": {
    "proxmox-ops": {
      "command": "node",
      "args": ["/path/to/proxmox-ops-mcp/index.mjs"],
      "env": {
        "PROXMOX_MCP_CONFIG": "/path/to/config.json",
        "TELEGRAM_BOT_TOKEN": "...",
        "TELEGRAM_CHAT_ID": "..."
      }
    }
  }
}
```

## Tools

| Tool | Tier | Description |
|------|------|-------------|
| `cluster_status` | 1 | Health status for all nodes: RAM, disk, load, uptime, quorum |
| `list_cts` | 1 | List all CTs/VMs with VMID, name, status, type, and host node |
| `node_exec` | 1/2 | Shell command on a node, classified by command |
| `ct_exec` | 1/2 | Shell command in a CT via pct exec, auto-resolves host node |
| `node_resources` | 1 | Parsed RAM, disk, CPU, LVM thin pool usage per node |
| `docker_ps` | 1 | Docker containers in a CT |
| `docker_logs` | 1 | Docker container logs from a CT |
| `service_restart` | 1/2 | Restart a systemd service or Docker container, with post-restart check |
| `standalone_exec` | 1/2 | Shell command on the configured standalone server |
| `refresh_routing` | 1 | Force refresh of the CTID-to-node routing map |
| `prometheus_query` | 1 | PromQL instant query, or range query with `start`, `end` and `step` |
| `journalctl` | 1 | systemd journal logs from a node or CT |

## What is not included

Inventory files (node specs, service lists, network topology) used as MCP resources in the original deployment. Those are environment-specific and are not part of this repository.

## License

MIT. See LICENSE.
