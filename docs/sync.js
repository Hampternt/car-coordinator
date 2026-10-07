'use strict';
/* The shared plan's client side: the room's keys, encryption, the invite link
   and the connection to the relay.

   The wire contract is relay/PROTOCOL.md; the relay (relay/, Rust) is built
   to the same file. In short: the invite link carries a 32-byte secret after
   the '#', which no server ever sees. HKDF turns it into the room's id, the
   token that proves the link to the relay, and an AES-GCM key that never
   leaves this browser. The relay stores and forwards only ciphertext.

   Plaintexts are JSON objects, and every one carries `schema` (Store's data
   version), so an older build can tell it is looking at a newer plan and stay
   read-only rather than drop fields it does not know:
     snapshot, version   {schema, plan}       pack 2 fixes what `plan` holds
     label               {schema, name}       a version's name, "Monday final"
     op                  pack 3
     presence            pack 4

   The secret is kept per browser under carcoord:pref:room (Store.pref('room')),
   never in carcoord:v1, so Export, Backups, Archives and recover.html never
   hold it.

   Nothing here touches the network until connect() is called: a browser that
   has not joined a room makes no network calls at all.

   Exposed as window.Sync. */

const Sync = (() => {
  // nginx strips /carsync in front of the relay (PROTOCOL.md §3).
  const RELAY = 'wss://portfolio.dblo.net/carsync';
  // Full localStorage keys; Store.pref('relay') and Store.pref('room') read
  // the same two.
  const RELAY_PREF = 'carcoord:pref:relay';
  const ROOM_PREF = 'carcoord:pref:room';
  // The AAD kinds (PROTOCOL.md §2). A body sealed as one never opens as another.
  const KINDS = Object.freeze(['snapshot', 'op', 'version', 'label', 'presence']);
  // HKDF info strings (PROTOCOL.md §1).
  const INFO = Object.freeze({ roomId: 'carsync room-id', token: 'carsync auth-token', encKey: 'carsync enc-key' });
  // Close codes the relay uses (PROTOCOL.md §5).
  const CLOSE = Object.freeze({
    BAD_FRAME: 4400, NOT_ALLOWED: 4401, WRONG_CREATE_CODE: 4403, HELLO_TIMEOUT: 4408,
    ROOM_EXISTS: 4409, TOO_LARGE: 4413, RATE_LIMITED: 4429, FULL: 4507,
  });

  const notYet = (name) => { throw new Error(`Sync.${name}: not implemented`); };

  /* ---------- where ---------- */

  // relayUrl() -> string
  //   The pref carcoord:pref:relay when it holds a ws:// or wss:// address
  //   (trimmed, any trailing '/' dropped), else RELAY. Reads localStorage
  //   inside a try: a browser that refuses storage gets RELAY.
  function relayUrl() { return notYet('relayUrl'); }

  // roomUrl(roomId) -> string
  //   `${relayUrl()}/rooms/${roomId}/ws`
  function roomUrl(roomId) { return notYet('roomUrl'); }

  /* ---------- keys ---------- */

  // newSecret() -> string
  //   32 bytes from crypto.getRandomValues, base64url without padding (43 chars).
  function newSecret() { return notYet('newSecret'); }

  // async deriveKeys(secret) -> {roomId, token, encKey}
  //   HKDF-SHA256 over the 32 decoded bytes of `secret`, empty salt:
  //     roomId  base64url of 16 bytes (22 chars), info 'carsync room-id'
  //     token   base64url of 32 bytes (43 chars), info 'carsync auth-token'
  //     encKey  a non-extractable AES-GCM-256 CryptoKey, info 'carsync enc-key'
  //   Rejects with a TypeError when `secret` is not 43 base64url characters.
  async function deriveKeys(secret) { return notYet('deriveKeys'); }

  /* ---------- ciphertext ---------- */

  // async seal(keys, kind, obj) -> string
  //   base64url(iv[12] ‖ AES-GCM(keys.encKey, iv, utf8(JSON.stringify(obj)),
  //   aad = utf8(keys.roomId + ':' + kind))), a fresh random iv every call.
  //   Throws a TypeError for a kind not in KINDS, or an obj without an integer
  //   `schema`.
  async function seal(keys, kind, obj) { return notYet('seal'); }

  // async open(keys, kind, body) -> object
  //   The inverse of seal. Rejects on a wrong key, a different kind, any
  //   tampering or truncation, or a body that is not base64url. Throws a
  //   TypeError for a kind not in KINDS.
  async function open(keys, kind, body) { return notYet('open'); }

  /* ---------- invite link ---------- */

  // inviteLink(secret) -> string
  //   `${location.origin}${location.pathname}#join=${secret}`
  function inviteLink(secret) { return notYet('inviteLink'); }

  // readInvite(hash) -> string | null
  //   `hash` is location.hash. For '#join=…' it first strips the fragment
  //   (history.replaceState(null, '', location.pathname + location.search)),
  //   as Share.readHash does, whether or not the secret is well-formed, then
  //   returns the secret, or null when it is not 43 base64url characters.
  //   Any other hash: null, and nothing is stripped.
  function readInvite(hash) { return notYet('readInvite'); }

  /* ---------- connection ---------- */

  // connect({keys, create, url, WebSocket}) -> Connection
  //   keys       from deriveKeys
  //   create     {createCode} to make the room (first frame `create`), or
  //              absent to join it (`hello`)
  //   url        defaults to roomUrl(keys.roomId)
  //   WebSocket  defaults to the browser's; tests pass their own
  //
  // Connection
  //   .status        'connecting' | 'connected' | 'offline' | 'refused' | 'closed'
  //   .seq           the room's seq from the last welcome
  //   .on(type, fn)  -> unsubscribe function. Types:
  //                    'status' fn(status, closeCode)
  //                    'frame'  fn(frame) for every server frame after welcome
  //   .send(frame)   a protocol frame object, bodies already sealed; returns
  //                  false (and sends nothing) unless connected
  //   .close()       closes and stops reconnecting; status 'closed'
  //
  //   On a network error, 1001, 1006, 4429 or 4507: 'offline', and it
  //   reconnects with backoff, saying hello again. On 4400, 4401, 4403, 4409
  //   or 4413: 'refused', with no retry. Pack 2 owns this shape; packs 3 and 4
  //   build on it.
  function connect(opts) { return notYet('connect'); }

  return {
    RELAY, RELAY_PREF, ROOM_PREF, KINDS, INFO, CLOSE,
    relayUrl, roomUrl, newSecret, deriveKeys, seal, open, inviteLink, readInvite, connect,
  };
})();
