# Privacy policy

proxmox-ops-mcp runs on your own machine and talks to your MCP client over stdio. It opens no network listener, has no telemetry, and sends nothing to the author.

## What it sends, and where

- **Your Proxmox nodes and standalone server**: the commands you run through the tools, over SSH, to the hosts listed in your `config.json`.
- **Your Prometheus endpoint**: the PromQL queries passed to `prometheus_query`, if an endpoint is configured.
- **Telegram**: when a call needs approval, the tool name and its arguments are sent to the Telegram Bot API (`api.telegram.org`), to the chat set in `TELEGRAM_CHAT_ID`. If Telegram is not configured, nothing is sent and those calls are refused.

## What it stores

Every gated call is appended to a local audit log (`AUDIT_LOG`, or `heimdall-decisions.log` next to the server by default), with the tool name, its arguments and the decision. The file stays on your machine.

## Credentials

`TELEGRAM_BOT_TOKEN` and the SSH keys named in `config.json` are read locally and only used to reach the services above.

## Contact

Questions or concerns: open an issue at https://github.com/ethan-puyaubreau/proxmox-ops-mcp/issues.
