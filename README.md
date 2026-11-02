# xdcode Remote

Self-hosted remote control for coding agents on your own Linux machines. Bind a
machine once, then create and manage multiple xdcode sessions from a phone or
web browser. Choose each session’s project directory, model provider, model and
reasoning level. Code execution stays on the selected client machine.

## Start here

Follow [the deployment guide](docs/xdcode-deployment.md) to start the server with
Docker Compose, enable HTTPS, authenticate a Linux client and run its daemon.
The default trial serves the web UI and encrypted relay from one container with
an embedded database and persistent local uploads.

```bash
# Linux client, after installing dependencies and configuring the server URLs
bash scripts/install-client.sh
export PATH="$HOME/.local/bin:$PATH"
xdcode-remote auth login --web
xdcode-remote daemon start
```

Open your server in the phone browser, create a session, select the online
machine and xdcode, and choose a project and model. Repeat for more sessions.

## xdcode support

- xdcode 0.165.0+ through the bidirectional stdio app-server protocol.
- Machine detection and phone-created sessions, with independent local agent
  processes and working directories.
- Model catalog selection including providers and supported reasoning levels.
- Streaming conversation events, tools, remote approvals, interruption and
  resuming sessions created through this client.
- Existing Claude Code and Codex adapters remain available.

Existing xdcode TUI sessions are not automatically imported. This version
creates and controls xdcode sessions through the machine daemon. Compatible
third-party xdcode builds must provide the model catalog and thread settings
API used by this client.

## Development

Use Node.js 22/24 and pnpm 10.11.0:

```bash
pnpm install --frozen-lockfile
pnpm --filter happy build
pnpm --filter happy exec vitest run --project unit
pnpm --filter happy-app typecheck
```

Private configuration, credentials, test state and deployment `.env` files must
remain outside version control. Publish reproducible deployments from a clean
`main` matching a freshly fetched `origin/main`.

## License and attribution

Based on [Happy](https://github.com/slopus/happy), under the MIT license. Original
copyright notices and dependency license notices are retained. This repository
adds xdcode integration and a self-hosted deployment workflow; it is independently
maintained. See [LICENSE](LICENSE) and the notices shipped with individual packages.
