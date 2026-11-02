# Deploy xdcode Remote

The server relays encrypted sessions. Each Linux client runs the coding agents
and edits its own local projects. Bind a machine once, then create multiple
xdcode sessions from a phone browser, selecting the directory, model and effort
for each session.

## Requirements

- Server: Linux x86-64 or ARM64 with Docker Engine and the Docker Compose plugin.
  Use local SSD storage for the database volume. Allow at least 4 GB RAM for the
  first source build; a small runtime can use much less.
- Client: Node.js 22 or 24, pnpm 10.11.0 and xdcode 0.165.0 or newer, with a working
  local model configuration. xdcode itself is installed separately.
- Public deployment: a domain pointing to the server, with TCP ports 80 and 443
  reachable for Caddy's automatic HTTPS.

## Public server with a domain

Clone on the server:

```bash
git clone https://github.com/xxddccaa/xdcode-remote.git
cd xdcode-remote
cp deploy/.env.example deploy/.env
```

Edit `deploy/.env` to use your domain:

```dotenv
HAPPY_DOMAIN=happy.example.com
HAPPY_PUBLIC_URL=https://happy.example.com
```

Build and start:

```bash
docker compose --env-file deploy/.env -f deploy/compose.yaml --profile public up -d --build
docker compose --env-file deploy/.env -f deploy/compose.yaml --profile public ps
docker compose --env-file deploy/.env -f deploy/compose.yaml logs --tail=100 server
```

Open `https://happy.example.com` yourself immediately after deployment. The first
successful setup creates the administrator: choose a username and password and
confirm the password. After setup, account creation requires an invitation.

Open **Settings → 管理** (or `/admin`) to generate invitation links. Set a label,
usage count (default 1) and validity period (default 7 days). Copy the link and
share it with the intended person. They choose their own username and password.
Used, expired or revoked invitations cannot create more accounts. Invitations
can be revoked in the same management page. Regular users cannot manage invites
or change site settings.

The site title is **Happy**. The public page displays only initialization/login
forms and the filing footer, with no coding-agent introduction. The default
footer displays `京ICP备2025125963号-1` and `京公网安备11010502056950号`, with the
public-security logo stored locally and links to the filing query sites. The
administrator can edit the filing numbers and links in `/admin`.

Passwords remain in the browser. A separate derived login proof is verified
against a salted scrypt hash on the server. The account recovery secret is
encrypted in the browser with a password-derived key; password login restores
the same secret so sessions remain decryptable on another browser. Save the
account recovery secret from the account backup controls as well.

The first startup runs database migrations and creates a random master secret
inside the persistent `server-data` volume. Restarts reuse that secret. The same
container serves the web UI, API, uploads and realtime connection; Caddy handles
HTTPS and WebSocket forwarding. The internal API is bound only to server
loopback on the host.

The Compose deployment enables `HAPPY_PRIVATE_SITE=true`. Unknown accounts
cannot be created through the original public-key login endpoint. Existing
registered accounts can continue to use recovery-key login and device pairing.
Only the first successful initialization may create an administrator. Complete
that setup before sharing the address. Do not set `HAPPY_PRIVATE_SITE=false` on
your public deployment; that explicit compatibility option restores the old
open registration flow.

## Trial without a domain

Run only the server:

```bash
docker compose -f deploy/compose.yaml up -d --build
```

On your workstation, forward the server port:

```bash
ssh -N -L 3005:127.0.0.1:3005 your-server
```

Open `http://localhost:3005` on that workstation. Set the client URLs below to
`http://localhost:3005`, keeping the SSH tunnel open. Phone access is easiest with
the domain/HTTPS deployment; a phone would otherwise need its own SSH tunnel.

## Install the Linux machine client

Clone this repository on the machine whose projects you want to operate. Install
pnpm 10.11.0 (with a Node distribution providing Corepack):

```bash
corepack enable
corepack prepare pnpm@10.11.0 --activate
git clone https://github.com/xxddccaa/xdcode-remote.git
cd xdcode-remote
bash scripts/install-client.sh
export PATH="$HOME/.local/bin:$PATH"
xdcode --version
```

Set the service URLs and authenticate:

```bash
export HAPPY_SERVER_URL=https://happy.example.com
export HAPPY_WEBAPP_URL=https://happy.example.com
xdcode-remote auth login --web
```

Open the printed Web authentication URL in the same logged-in web
account. For a remote Linux machine, copy that URL into your workstation browser.
After approving the machine:

```bash
xdcode-remote daemon start
xdcode-remote daemon status
```

In the phone browser, create a new session, choose the Linux machine, choose
xdcode, enter a project path on that machine, and select a model and effort.
Repeat to run more sessions. Each session has independent history and a local
agent process. For parallel edits of the same repository, use the worktree
picker to give the sessions separate working directories.

The model menu is read from `xdcode models list --json`. Distinct catalog entries
stay distinct even when they use the same API model name on different providers.
The daemon republishes catalog changes after its short cache expires (about
30 seconds). An incompatible catalog entry is excluded. Credentials and API
endpoints are not published in the model menu and remain on the client machine.

Set `HAPPY_XDCODE_PATH` if xdcode is not on the daemon's PATH. Set `XDCODE_HOME`
if you use a nondefault xdcode configuration directory. Remote-created sessions
use a separate stdio app-server process per session; attaching pre-existing
standalone xdcode TUI sessions is not implemented in this version.

## Keep the client online after SSH logout and reboot

Create a private environment file:

```bash
mkdir -p ~/.config/xdcode-remote ~/.config/systemd/user
install -m 600 /dev/null ~/.config/xdcode-remote/client.env
```

Edit `~/.config/xdcode-remote/client.env`:

```dotenv
HAPPY_SERVER_URL=https://happy.example.com
HAPPY_WEBAPP_URL=https://happy.example.com
PATH=/home/your-user/.local/bin:/usr/local/bin:/usr/bin:/bin
HAPPY_XDCODE_PATH=/home/your-user/.local/bin/xdcode
```

Add the environment variables required by your local xdcode provider to this
private file, or use its existing credential store. Use actual absolute paths
for your machine. Never put credentials or this file in the repository. The
default xdcode configuration is `~/.xdcode/config.toml`.

Install and start the user service after authenticating:

```bash
xdcode-remote daemon stop
cp deploy/xdcode-remote-client.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now xdcode-remote-client
sudo loginctl enable-linger "$USER"
systemctl --user status xdcode-remote-client
journalctl --user -u xdcode-remote-client -n 100
```

For containers or machines without systemd, run
`xdcode-remote daemon start-sync` under your existing process supervisor with
the same environment.

## Restart, update and backup

Restart the service without changing data:

```bash
docker compose --env-file deploy/.env -f deploy/compose.yaml restart server
```

Before an update, stop the server and back up the entire `server-data` volume,
including `master-secret`, the `pglite` directory and uploaded files. Then pull
your clean `main`, rebuild and start with the same Compose command. Avoid
`docker compose down -v`, which deletes persistent data.

For a reproducible deployment, fetch immediately before deploying and confirm
that local `main` matches `origin/main` and `git status --porcelain` is empty.
Record the deployed commit. After startup, verify `/health`, the browser page,
machine online status, creating a session, sending a task and receiving a reply.

## Troubleshooting

- Machine missing: check that phone and CLI use the same server and account,
  then check `xdcode-remote daemon status` and the user service logs.
- xdcode missing from the picker: confirm the daemon's PATH or
  `HAPPY_XDCODE_PATH`; run `xdcode models list --json` on the Linux machine.
- Web page connects to the wrong service: correct `HAPPY_PUBLIC_URL`, restart
  the container, and clear any previously selected custom server in the browser.
- HTTPS failure: check domain DNS, firewall rules, ports 80/443 and Caddy logs.
- Model change rejected: preserve the rejection and select an available catalog
  entry; the client does not silently switch to a different provider or replay
  a failed inference request.

Legacy Gemini OAuth login, if needed, requires your own `GEMINI_OAUTH_CLIENT_ID`
and `GEMINI_OAUTH_CLIENT_SECRET` in the client environment. No upstream OAuth
client credentials are included in this repository. xdcode uses its own
configured providers and does not require these variables.

## Updating an existing trial

Pull the new `main`, then rebuild with the same Compose command. Startup applies
the additional account/invitation tables without deleting existing data. If the
browser already holds your old account secret, the first setup binds the new
admin username and password to that account. Other pre-setup accounts require
invitation registration. Keep the persistent volume and your recovery secret.
