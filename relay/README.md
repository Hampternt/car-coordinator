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
origins and connections with no `Origin` are allowed. For a dev server, add its
origin, for example
`RELAY_ORIGINS=https://hampternt.github.io,http://tauri.localhost,http://127.0.0.1:5173`.

## Deploy

The files are in [`deploy/`](deploy/):

| File | Goes to |
|---|---|
| `carsync.service` | `/etc/systemd/system/carsync.service` |
| `carsync.env.example` | `/opt/carsync/.env`, filled in, mode 600 |
| `nginx-carsync-http.conf` | `/etc/nginx/conf.d/carsync.conf` (http level: the `limit_req` zone and the upgrade `map`) |
| `nginx-carsync-location.conf` | inside the `listen 443` server block of `/etc/nginx/sites-available/portfolio` |
| `nginx-check.conf` | nowhere; it checks the two snippets locally (step 1) |

`ssh hetzner` below stands for however you log in to the server.

### 1. Build, and check the snippets

The server is x86_64. A binary built on this PC runs there only if the server's
glibc is at least as new as this PC's. Compare the two first:

```bash
ldd --version | head -1                 # this PC
ssh hetzner 'ldd --version | head -1'   # the server: must be the same or newer
cargo build --release --locked --manifest-path relay/Cargo.toml
# → relay/target/release/carsync-relay
```

If the server's glibc is older, build there instead. It has a Rust toolchain,
which the portfolio's emergency update uses. Copy the crate over and build it:

```bash
rsync -a --exclude target relay/ hetzner:/tmp/carsync-src/
ssh hetzner 'cd /tmp/carsync-src && cargo build --release --locked'
# → /tmp/carsync-src/target/release/carsync-relay on the server
```

Check the nginx snippets with any nginx container before they go near the
server:

```bash
docker run --rm -v "$PWD/relay/deploy:/etc/nginx/carsync:ro" nginx:stable \
  nginx -t -c /etc/nginx/carsync/nginx-check.conf
# → syntax is ok / test is successful
```

### 2. First install on the server

```bash
# The user and the directories. The data directory holds only ciphertext,
# but it is still nobody else's business.
sudo useradd --system --home-dir /opt/carsync --shell /usr/sbin/nologin carsync
sudo install -d -o root -g root -m 755 /opt/carsync
sudo install -d -o carsync -g carsync -m 700 /opt/carsync/data

# The binary (from this PC; if it was built on the server, use that path).
scp relay/target/release/carsync-relay hetzner:/tmp/
ssh hetzner 'sudo install -o root -g root -m 755 /tmp/carsync-relay /opt/carsync/carsync-relay'

# The settings. Put a fresh create code in RELAY_CREATE_CODE; you type it once
# in the app when creating the shared plan.
scp relay/deploy/carsync.env.example hetzner:/tmp/carsync.env
ssh hetzner
  openssl rand -base64 24                          # the create code
  sudo install -o root -g root -m 600 /tmp/carsync.env /opt/carsync/.env
  sudo nano /opt/carsync/.env                      # paste it after RELAY_CREATE_CODE=
  rm /tmp/carsync.env

# The service.
scp relay/deploy/carsync.service hetzner:/tmp/
ssh hetzner
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

```bash
scp relay/deploy/nginx-carsync-http.conf relay/deploy/nginx-carsync-location.conf hetzner:/tmp/
ssh hetzner

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

Build as in step 1, then:

```bash
scp relay/target/release/carsync-relay hetzner:/tmp/
ssh hetzner 'sudo install -o root -g root -m 755 /tmp/carsync-relay /opt/carsync/carsync-relay && sudo systemctl restart carsync'
```

A restart closes every connection with 1001; the app reconnects and catches up
on its own. The database (`/opt/carsync/data/carsync.db`) moves forward on its
own when a new version needs a new schema, and never back. Before an update
that changes the schema, copy the data directory while the service is stopped.

### Removing it

```bash
sudo systemctl disable --now carsync
sudo rm /etc/systemd/system/carsync.service /etc/nginx/conf.d/carsync.conf
# take the `location /carsync/` block out of the site file (diff -u, backup, nginx -t, reload, as above)
sudo rm -r /opt/carsync && sudo userdel carsync
```

Each PC keeps its own copy of the plan and its Backups. Removing the relay
removes only the shared copy.
