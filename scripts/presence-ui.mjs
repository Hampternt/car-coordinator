// Round 3, pack 4: who is editing (docs/presence.js), checked with two
// browsers on one fake relay, the way scripts/sync-ui.mjs does.
// Run: node scripts/presence-ui.mjs
//
// SCAFFOLD: pack 4 writes the checks here, from the manifest's pack 4
// done-when line (manifests/2026-10-07-shared-plan.md):
//   - the row the other is in is tinted, with their name tag, and the box is
//     outlined, within a second of their focus moving;
//   - entering a row the other is in shows the quiet note, and never blocks;
//   - marks clear on leave and after the timeout;
//   - the top bar says who is here and on which tab;
//   - the fake relay never stores presence;
//   - a browser in no shared plan sends and draws nothing.
console.log(' FAIL  presence-ui: no checks written yet (scaffold)');
process.exit(1);
