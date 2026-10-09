'use strict';
/* Who is editing: the shared plan's presence (manifests/2026-10-07-shared-plan.md,
   round 3, pack 4).

   Each browser in a shared plan says, inside the encryption, which tab it is
   on and which row and box it is in; the other screen tints that row in the
   sender's colour, tags it with their name, and outlines the box. Nothing
   here is ever stored by the relay, and nothing here ever blocks an edit:
   clicking into a row someone else is in only shows a quiet note.

   The message (sealed as kind `presence` by the app, see roomSendPresence):
     { schema, who: { id, name, color }, tab, at: { kind, id, field } | null, t, bye? }
   `who.id` is random per tab, so two tabs of one browser are two people here.

   The app calls, and nothing else of the app is touched from here:
     Presence.attach(api)     once at start; api = { live() -> bool,
                              send(plain) -> Promise<bool>, rerender() }
     Presence.receive(plain)  each presence message the room delivers, opened
     Presence.decorate()      after every render(), to put the marks back
     Presence.settingsHtml()  -> html for the Shared plan card: name and colour
     Presence.pillText()      -> '' or e.g. 'Kari is here · Day plan'

   SCAFFOLD: every function below is a safe no-op so the app runs unchanged
   until pack 4 fills them in. */
const Presence = (() => {
  let api = null;

  // attach(api): keep the app's hooks; start listening for focus and tab
  // changes, and the heartbeat, once api.live() is true.
  function attach(given) { api = given; }

  // receive(plain): another tab's or PC's presence. Ignores its own id.
  function receive(plain) { void plain; }

  // decorate(): put the row tints, name tags, box outlines and the quiet note
  // back after a redraw.
  function decorate() {}

  // settingsHtml(): the name and colour this browser shows to the other.
  function settingsHtml() { return ''; }

  // pillText(): who else is here, for the top bar beside the Shared plan pill.
  function pillText() { return ''; }

  return Object.freeze({ attach, receive, decorate, settingsHtml, pillText, get api() { return api; } });
})();
