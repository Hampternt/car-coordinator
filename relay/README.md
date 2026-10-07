# carsync relay

Stores and forwards Car Coordinator's shared plan. Every body it holds is
encrypted in the browser with a key the relay never sees; it keeps only
ciphertext, sizes, times and sequence numbers. The wire contract is
[`PROTOCOL.md`](PROTOCOL.md); the plan behind it is
`manifests/2026-10-07-shared-plan.md`.

It runs on the Hetzner cx23 that serves `portfolio.dblo.net`, as its own
`carsync` user on `127.0.0.1:3010`, behind the existing nginx server block at
`location /carsync/`. That needs no new DNS record and no new certificate.

**The owner runs the server steps below.** Nothing here is applied
automatically, and Claude does not touch the server without asking.

## Run it locally

```bash
cargo test --manifest-path relay/Cargo.toml          # the whole suite
RELAY_DATA=/tmp/carsync-dev RELAY_CREATE_CODE=dev \
  cargo run --manifest-path relay/Cargo.toml          # serves 127.0.0.1:3010
curl http://127.0.0.1:3010/health                     # → ok
```

The app reaches a local relay through the pref `carcoord:pref:relay`
(`ws://127.0.0.1:3010`). With no `RELAY_ORIGINS` set, only the production
origins and connections with no `Origin` are allowed. The browser sends the
page's address exactly as it was opened, so add the dev server's: `npm run dev`
prints `http://localhost:5173/`, and both spellings are listed here in case it
is opened as `127.0.0.1`:

```bash
RELAY_DATA=/tmp/carsync-dev RELAY_CREATE_CODE=dev \
RELAY_ORIGINS=https://hampternt.github.io,http://tauri.localhost,http://localhost:5173,http://127.0.0.1:5173 \
  cargo run --manifest-path relay/Cargo.toml
```

## Deploy

The files are in [`deploy/`](deploy/):

| File | Goes to |
|---|---|
| `carsync.service` | `/etc/systemd/system/carsync.service` |
| `carsync.env.example` | `/opt/carsync/.env`, filled in, mode 600 |
| `nginx-carsync-http.conf` | `/etc/nginx/conf.d/carsync.conf` (http level: the `limit_req` zone and the upgrade `map`) |
| `nginx-carsync-location.conf` | inside the `listen 443` server block of `/etc/nginx/sites-available/portfolio` |
| `nginx-check.conf` | nowhere; it checks the two snippets locally (step 1) |

`ssh hetzner` below stands for however you log in to the server. Every block
says where it runs: **on this PC** (in the repo's root) or **on the server**
(after `ssh hetzner`).

### 1. Build, and check the snippets

The server is x86_64. A binary built on this PC runs there only if the server's
glibc is at least as new as this PC's. Compare the two first.

On this PC:

```bash
ldd --version | head -1                 # this PC
ssh hetzner 'ldd --version | head -1'   # the server: must be the same or newer
cargo build --release --locked --manifest-path relay/Cargo.toml
# → relay/target/release/carsync-relay
```

If the server's glibc is older, build there instead. The portfolio's emergency
update builds there, so it has a toolchain, but this crate needs Rust 1.85 or
newer (edition 2024) and a C compiler (SQLite is compiled in). On this PC:

```bash
ssh hetzner 'rustc --version; cc --version | head -1'   # rustc 1.85+, and any cc
rsync -a --exclude target relay/ hetzner:/tmp/carsync-src/
ssh hetzner 'cd /tmp/carsync-src && cargo build --release --locked'
# → /tmp/carsync-src/target/release/carsync-relay on the server
```

Check the nginx snippets with any nginx container before they go near the
server. On this PC:

```bash
docker run --rm -v "$PWD/relay/deploy:/etc/nginx/carsync:ro" nginx:stable \
  nginx -t -c /etc/nginx/carsync/nginx-check.conf
# → syntax is ok / test is successful
```

### 2. First install on the server

On this PC, copy the binary and the two files over. If the binary was built on
the server, skip its line and use `/tmp/carsync-src/target/release/carsync-relay`
on the server below instead of `/tmp/carsync-relay`.

```bash
scp relay/target/release/carsync-relay hetzner:/tmp/
scp relay/deploy/carsync.env.example hetzner:/tmp/carsync.env
scp relay/deploy/carsync.service hetzner:/tmp/
```

On the server:

```bash
# The user and the directories. The data directory holds only ciphertext,
# but it is still nobody else's business.
sudo useradd --system --home-dir /opt/carsync --shell /usr/sbin/nologin carsync
sudo install -d -o root -g root -m 755 /opt/carsync
sudo install -d -o carsync -g carsync -m 700 /opt/carsync/data
sudo install -o root -g root -m 755 /tmp/carsync-relay /opt/carsync/carsync-relay

# The settings. Make a fresh create code and paste it after RELAY_CREATE_CODE=;
# you type it once in the app when creating the shared plan.
openssl rand -base64 24
sudo install -o root -g root -m 600 /tmp/carsync.env /opt/carsync/.env
sudo nano /opt/carsync/.env
rm /tmp/carsync.env

# The service.
sudo install -o root -g root -m 644 /tmp/carsync.service /etc/systemd/system/carsync.service
sudo systemctl daemon-reload
sudo systemctl enable --now carsync
systemctl status carsync --no-pager              # active (running)
curl http://127.0.0.1:3010/health                # → ok
```

Port 3010 listens on 127.0.0.1 only, so the firewall needs no change.

### 3. nginx

nginx is not deployed by anything automatic. As with the portfolio, **`diff -u`
the live file against what you are about to install, and never copy blind.**

On this PC:

```bash
scp relay/deploy/nginx-carsync-http.conf relay/deploy/nginx-carsync-location.conf hetzner:/tmp/
```

On the server:

```bash
# a. Neither name may exist yet (a duplicate zone or map fails `nginx -t`), and
#    conf.d must be included inside `http`. Ubuntu's stock nginx.conf does both.
grep -rn 'zone=carsync\|carsync_connection' /etc/nginx/        # expect nothing
grep -n 'conf.d' /etc/nginx/nginx.conf                         # include /etc/nginx/conf.d/*.conf;

# b. The site file with the location added. Put the contents of
#    /tmp/nginx-carsync-location.conf inside the `listen 443` server block
#    (the one with the certbot lines), for example just above `location / {`.
#    Leave every certbot line and both `listen [::]` lines as they are.
cp /etc/nginx/sites-available/portfolio /tmp/portfolio.new
nano /tmp/portfolio.new
diff -u /etc/nginx/sites-available/portfolio /tmp/portfolio.new  # only the new location

# c. Apply both with a backup, and restore both automatically if the test fails.
STAMP=$(date +%Y%m%d-%H%M)
sudo cp /etc/nginx/sites-available/portfolio /etc/nginx/sites-available/portfolio.bak-$STAMP
sudo cp /tmp/nginx-carsync-http.conf /etc/nginx/conf.d/carsync.conf
sudo cp /tmp/portfolio.new /etc/nginx/sites-available/portfolio
{ sudo nginx -t && sudo systemctl reload nginx; } \
  || { sudo cp /etc/nginx/sites-available/portfolio.bak-$STAMP /etc/nginx/sites-available/portfolio;
       sudo rm /etc/nginx/conf.d/carsync.conf; echo 'restored; nothing changed'; }
```

### 4. Check it from outside

On this PC:

```bash
curl https://portfolio.dblo.net/carsync/health                 # → ok
curl -s -o /dev/null -w '%{http_code}\n' https://portfolio.dblo.net/            # the portfolio still answers

# A WebSocket upgrade over HTTP/1.1: 101 from the app's origin, 403 from another.
KEY=$(openssl rand -base64 16)
for ORIGIN in https://hampternt.github.io https://example.com; do
  curl -s --http1.1 -o /dev/null -w "$ORIGIN %{http_code}\n" --max-time 3 \
    -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' \
    -H "Sec-WebSocket-Key: $KEY" -H "Origin: $ORIGIN" \
    https://portfolio.dblo.net/carsync/rooms/AAAAAAAAAAAAAAAAAAAAAA/ws
done
# → https://hampternt.github.io 101   (curl then waits; --max-time ends it)
# → https://example.com 403
```

Logs: `journalctl -u carsync`. The relay never logs tokens or bodies.

### Updating

Build as in step 1, then on this PC:

```bash
scp relay/target/release/carsync-relay hetzner:/tmp/
ssh hetzner 'sudo install -o root -g root -m 755 /tmp/carsync-relay /opt/carsync/carsync-relay && sudo systemctl restart carsync'
```

A restart closes every connection with 1001; the app reconnects and catches up
on its own. The database (`/opt/carsync/data/carsync.db`) moves forward on its
own when a new version needs a new schema, and never back. Before an update
that changes the schema, copy the data directory while the service is stopped.

### Removing it

On the server:

```bash
sudo systemctl disable --now carsync
sudo rm /etc/systemd/system/carsync.service /etc/nginx/conf.d/carsync.conf
# take the `location /carsync/` block out of the site file (diff -u, backup, nginx -t, reload, as above)
sudo rm -r /opt/carsync && sudo userdel carsync
```

Each PC keeps its own copy of the plan and its Backups. Removing the relay
removes only the shared copy.
