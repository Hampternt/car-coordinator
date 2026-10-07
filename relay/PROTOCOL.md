# carsync wire protocol

The contract between the relay (`relay/`, Rust) and the app (`docs/sync.js`).
Both sides are built to this file; neither changes it alone. The manifest is
`manifests/2026-10-07-shared-plan.md`; where this file is more precise than the
manifest's Wire protocol section, this file wins.

Words: **MUST** is checked by a test, **SHOULD** is expected but not tested.

## 1. Keys and encoding

All binary values on the wire and in links are **base64url without padding**
(RFC 4648 §5, `=` stripped). Lengths below are in characters.

| Name | Bytes | Chars | What |
|---|---|---|---|
| `secret` | 32 | 43 | random (`crypto.getRandomValues`), carried only in the invite link |
| `roomId` | 16 | 22 | names the room; in the URL path |
| `token` | 32 | 43 | proves the client holds the link; sent in `hello`/`create` |
| `encKey` | 32 | — | AES-GCM-256 key; never leaves the browser, never encoded |

Derivation, HKDF-SHA256 (RFC 5869) with:
- IKM = the 32 decoded `secret` bytes;
- salt = empty (zero-length; RFC 5869 treats it as 32 zero bytes);
- info = the UTF-8 bytes of the string below; L = the length in the table.

| Output | info | L |
|---|---|---|
| `roomId` | `carsync room-id` | 16 |
| `token` | `carsync auth-token` | 32 |
| `encKey` | `carsync enc-key` | 32 |

In the browser `encKey` is a **non-extractable** WebCrypto `CryptoKey`
(`deriveKey` → `{name:"AES-GCM", length:256}`).

The relay stores only `sha256(token bytes)` — the hash of the **32 decoded
bytes**, not of the 43-character string — and compares it in constant time.

### Test vectors

`secret` = the bytes 0x00, 0x01, … 0x1f:

```
secret        AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8
roomId        WC4euC74o8kDhATEpCnxOA
token         oLAfzK7Ly0MaXxZIV1VTNuD4uhKZtKKZ75X47f2mYdQ
encKey (hex)  8e42d03a5ad791748f1c130bf21023a94e71ecc7c51bf7e2627a260146211e65
sha256(token) e4ae2254a6c8b354cf887032d5c3214092b59c9877ad361f8e330fd97b559dbb
```

(Computed with node's `crypto.hkdfSync('sha256', secret, Buffer.alloc(0), info, L)`.)

## 2. Ciphertext (`body` and `label`)

```
body = base64url( iv[12] ‖ AES-GCM-256(encKey, iv, plaintext, aad) )
```

- `iv`: 12 fresh random bytes per seal.
- AES-GCM tag: 128 bits, appended to the ciphertext (WebCrypto's default).
- `plaintext` = UTF-8 of `JSON.stringify(obj)`. `obj` is always a JSON object
  with an integer `schema` (the app's data schema version, `Store`'s `v`).
- `aad` = UTF-8 of `roomId + ":" + kind`, e.g. `WC4euC74o8kDhATEpCnxOA:snapshot`.
- `kind` is one of `snapshot`, `op`, `version`, `label`, `presence`, matching
  the frame (or field) that carries it. A body sealed as one kind does not open
  as another, so the relay cannot pass a version off as a snapshot.

Plaintext shapes per kind belong to the app and are documented in
`docs/sync.js`, except `label`, which is `{schema, name, nonce}` (the version's
name, e.g. "Monday final", and a random string fresh for each push). The
version body it names is `{schema, plan, name, nonce}` with the same `name` and
`nonce`: AAD binds a body to its kind, not to one version, so this is what
stops a relay pairing one version's label with another's body. A client MUST
refuse a version body whose `name` or `nonce` differs from its label's, or that
lacks them. The relay never decrypts anything.

## 3. Where

- App default: `wss://portfolio.dblo.net/carsync`, a constant in `docs/sync.js`.
  One browser can override it with the pref `carcoord:pref:relay` (dev and
  tests: `ws://127.0.0.1:<port>`). nginx strips `/carsync`, so the relay serves:
- `GET /health` → `200`, body `ok`.
- `GET /rooms/{roomId}/ws` → WebSocket upgrade.
- Anything else → `404`.

Before the upgrade the relay refuses, with a plain HTTP status and no upgrade:
- `{roomId}` not matching `^[A-Za-z0-9_-]{22}$` → `404`.
- an `Origin` header present and not exactly (byte for byte) one of the
  allow list `RELAY_ORIGINS` → `403`. **A missing `Origin` is allowed**: the
  check exists to stop other web pages using a visitor's browser, every
  browser sends `Origin` on a WebSocket, and a non-browser client could
  forge it anyway. The token is the real gate.

Allow-list entries are `scheme://host[:port]`, no trailing slash. Production:
`https://hampternt.github.io,http://tauri.localhost`.

## 4. Frames

Every message is one WebSocket **text** frame holding one JSON object with a
string `type`. Fields not listed are ignored (room to grow). A field that is
missing or has the wrong JSON type is a bad frame (`4400`). Integers (`seq`,
`since`, `id`, `at`) are non-negative and below 2^53.

### 4.1 Opening: `hello` or `create`

The first frame MUST arrive within the hello timeout (default 10 s), else the
relay closes `4408`.

`{type:"hello", token}` joins an existing room.
- `token` not 43 base64url chars → `4400`.
- No such room, or the token's hash does not match → `4401` (one code for
  both, so a stranger cannot probe which rooms exist).
- Otherwise the relay answers `{type:"welcome", seq}`, `seq` being the room's
  latest op seq (0 when it has had no ops).

`{type:"create", token, createCode}` makes the room. Checked in this order:
1. shape: `token` 43 base64url chars, `createCode` a string → else `4400`;
2. `createCode` equals the relay's `RELAY_CREATE_CODE` (constant-time) → else
   `4403`. When `RELAY_CREATE_CODE` is unset or empty, every create gets `4403`;
3. the room does not exist → else `4409`;
4. room count below the cap, disk below the cap → else `4507`.

On success the relay stores `sha256(token)` and answers `{type:"created"}`
followed by `{type:"welcome", seq:0}`; the connection is then exactly as if it
had said `hello`.

Before `welcome`, any other well-formed frame closes `4401`. After it, a
second `hello` or `create` closes `4400`.

### 4.2 After `welcome`

| Client sends | Relay does | Sender receives | Others in the room receive |
|---|---|---|---|
| `{type:"snapshot", seq, body}` | see 4.3 | `{type:"ack", seq}` | nothing |
| `{type:"op", body}` | assigns `seq` = latest + 1, stores | `{type:"ack", seq}` | `{type:"op", seq, body}` |
| `{type:"version", body, label}` | stores with a new `id` and `at`; keeps the newest 50 | `{type:"ack", id, at}` | `{type:"version", id, at, label}` |
| `{type:"getVersion", id}` | — | `{type:"version", id, at, label, body}`, or `{type:"noVersion", id}` if it does not exist (never stored, or pruned) | nothing |
| `{type:"catchup", since}` | — | `{type:"catchup", seq, snapshot, ops, versions}` (4.4) | nothing |
| `{type:"presence", body}` | forwards; **never stores or logs it** | nothing | `{type:"presence", body}` |

- `body` (every kind) and `label` are non-empty strings of base64url
  characters; anything else is `4400`. The relay does not decode them.
- `id`: an integer per room, starting at 1, increasing, never reused, even
  after pruning.
- `at`: the relay's clock when the version was stored, in **unix
  milliseconds**.
- Pruning keeps the 50 versions with the highest `id`.

### 4.3 Snapshot rules

`{type:"snapshot", seq, body}` says: this is the whole plan after every op up
to and including `seq`.
- `seq` greater than the room's latest seq → `4400` (a client cannot snapshot
  ops it has not seen).
- `seq` lower than the stored snapshot's seq → not stored (a stale race, not
  an error).
- Otherwise it replaces the stored snapshot (an equal `seq` replaces too) and
  every stored op with `seq ≤` the snapshot's `seq` is deleted.

The ack's `seq` is the stored snapshot's seq **after** handling the frame: equal
to what was sent means it was stored, higher means a newer one already was.
The room's latest seq never goes down.

The client's side of the same rule (the relay cannot check it, since it never
reads a body): a snapshot MUST hold the result of every op up to its `seq`. A
client sends one only at a `seq` whose ops it has applied, never simply the
room's latest; otherwise the relay deletes ops the snapshot does not contain.
A client that cannot apply ops (round 1's build applies none, so its applied
seq is the snapshot's it caught up from) treats a room holding ops past that
snapshot (any in a `catchup`, a `catchup.seq` above `snapshot.seq`, or a live
`op`) as read-only, and sends it no snapshot at all.

### 4.4 Catchup reply

```
{ type: "catchup",
  seq: <room's latest op seq>,
  snapshot: { seq, body } | null,        // null when the room has none
  ops: [ { seq, body }, … ],             // every stored op with seq > since, ascending
  versions: [ { id, at, label }, … ] }   // every stored version, ascending by id
```

The snapshot is always included when one exists. A client whose `since` is
below `snapshot.seq` MUST reset to the snapshot and then apply `ops`; one at
or above it may ignore the snapshot. `since` above the room's seq is not an
error (empty `ops`).

### 4.5 Ordering

- The relay orders all writes to a room in one sequence. On every connection,
  `op` frames and the `ack`s of its own ops arrive together in ascending
  `seq`, with no gap while the connection stays open: if a client's op became
  seq 3 and another's seq 4, it sees `ack 3` before `op 4`.
- Acks of every kind reach a sender in the order of the writes they answer,
  so a client can match them first-in, first-out.
- After `welcome{seq:N}` the connection receives every other client's op with
  `seq > N` live. A `catchup` reply may overlap ops also received live; the
  client ignores an op whose `seq` it has already applied.
- The relay sends no join or leave notices. Who is present is the app's job,
  from `presence` (pack 4: send on a timer and expire the silent).

## 5. Limits and close codes

Defaults; every one is a field of the relay's `Limits` so tests can lower it.

| Limit | Default | Measured as | Close |
|---|---|---|---|
| body | 524 288 | length of the `body` string (ASCII, so bytes) | `4413` |
| label | 1 024 | length of the `label` string | `4413` |
| frame | 1 048 576 | the whole text frame; bigger frames are cut by the WebSocket library | `1009` |
| rate | burst 120, refill 30/s | token bucket per connection; every text frame costs 1, `hello`/`create` included | `4429` |
| rooms | 20 | rooms in the database, checked on `create` | `4507` |
| disk | 2 GiB | summed size of the regular files directly in `RELAY_DATA` (database, `-wal`, `-shm`), checked before every storing write (`create`, `op`, `version`) but never a `snapshot`: one replaces another and drops the ops it covers, and the relay gives the space they held back to the disk, so it is how a room at the cap gets under it again | `4507` |
| versions | 50 | per room; the oldest are pruned, not refused | — |
| hello timeout | 10 s | from upgrade to the first frame | `4408` |

All close codes:

| Code | Meaning |
|---|---|
| `4400` | bad frame: not JSON, not an object, unknown `type`, a missing or wrong-typed field, a binary frame, a malformed token, a second `hello`/`create`, a snapshot `seq` above the room's |
| `4401` | not allowed in: wrong token, no such room, or a frame other than `hello`/`create` before `welcome` |
| `4403` | wrong create code (or creation disabled) |
| `4408` | no `hello`/`create` within the hello timeout |
| `4409` | `create` for a room that exists |
| `4413` | `body` or `label` over its limit |
| `4429` | rate limit |
| `4507` | room cap or disk cap reached |
| `1001` | relay shutting down, or this connection fell too far behind (its 1024-frame queue filled) |
| `1011` | storage error on the relay |
| `1009` | frame over the frame limit (library) |

Plus, before any upgrade: HTTP `403` (Origin) and `404` (path). The close
reason text is a short English phrase for logs; clients act on the code only.

After sending a close frame the relay keeps reading, and discarding, until the
client's close reply or 5 s, and only then drops the connection. Dropping it
at once with unread frames in the socket's buffer makes the kernel reset the
TCP connection, and the client can lose the close code.

A client SHOULD NOT reconnect automatically after `4400`, `4401`, `4403`,
`4409`, `4413` (they will fail the same way); it SHOULD reconnect with backoff
after `4429`, `4507`, `1001`, `1006`, `1011` and network errors, and catch up
from its last seq on reconnect.

## 6. Keepalive

The relay SHOULD send a WebSocket ping every 30 s (browsers answer on their
own) so nginx's `proxy_read_timeout 1h` and home routers never drop an idle
room.

## 7. Relay configuration (environment)

| Variable | Meaning | Default |
|---|---|---|
| `RELAY_BIND` | listen address | `127.0.0.1:3010` |
| `RELAY_DATA` | directory holding the SQLite database | required |
| `RELAY_CREATE_CODE` | the owner's create code | unset = creation disabled |
| `RELAY_ORIGINS` | comma-separated Origin allow list | `https://hampternt.github.io,http://tauri.localhost` |
| `RELAY_MAX_ROOMS` | room cap | 20 |
| `RELAY_MAX_DISK_BYTES` | disk cap | 2147483648 |

The other limits are compiled-in defaults (section 5).

## 8. Invite link

`<origin><pathname>#join=<secret>`, built from the page's own address, so the
secret never reaches a server (fragments are not sent). On load the app reads
`#join=…`, strips the fragment with `history.replaceState` whether or not the
secret is well-formed, and ignores a secret that is not 43 base64url chars.

The secret is kept per browser under `carcoord:pref:room`, never in
`carcoord:v1`, so Export, Backups, Archives and `recover.html` never hold it.
