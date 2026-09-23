# Workshop–Studio local demo

Implemented locally on 2026-09-23. Canonical Passiona sources are
`buddy-kit/client/workshop/` and `buddy-kit/client/studio/`; the shared Champion
store and controls live under `workshop/toolbox/`. Studio imports those same
modules. `deploy/` is generated. The City–Studio GLB editing integration remains
queued; this demo connects Workshop and Studio through the Champion File.

## Run

From the repository root:

```sh
npm run demo:prepare
PASSIONA_DEMO_PORT=8378 npm run demo:start
```

Open http://localhost:8378/workshop/ or the local Hub. The verification server was
left running on port 8378; pre-existing servers on other ports were not stopped.
Keep the exact same hostname and port. The build installs missing Studio/Buddy
dependencies from their lockfiles. Provider configuration comes from the existing,
gitignored `buddy-kit/server/.env`; credentials must never be put in a Champion File.
Live links remain unchanged outside localhost. Nothing was deployed.

## Twelve demo steps

1. Open or create a named Champion in Workshop. Its name opens the file menu.
2. Ask Buddy to inspect the machine; it receives current blocks, connections and settings.
3. Ask for a reversible edit, such as “Add a lamp named Demo light.” It applies once.
4. Use Undo to reverse that edit.
5. Inspect a held-out result and ask Buddy to explain it. Training teaches, Dev helps
   tune, and Test is reserved for a final check. Inspect errors; accuracy is not mastery.
6. Ask Buddy to remember an explicitly chosen explanation style. Review, correct or
   forget it in **Buddy memory**. Name, language, tone, wording and learning context
   also have bounded editable fields. Accessory preferences do not establish ownership.
7. Open **Credits & Owned Gear**. First use: set a local teacher PIN. Enter an activity,
   positive whole-number award, and PIN; confirm the displayed Champion. Repeating the
   same displayed award retries its existing ID. Use **Start another award** deliberately
   for a new award, including another award with the same title and amount.
8. **Save** the Champion File. It contains the machines, memory, balance and ownership.
9. **Open Studio** from the same menu. At tablet widths, expand the Model Shop with its
   toggle. Buy **Rocket Cone** for 40 credits; a 100-credit award leaves 60.
10. Place it twice for free. Undo/redo changes the document, not ownership or credits.
11. **Save Champion File** in Studio. Geometry, supported appearance, tapped skeleton
    and fitted wardrobe GLBs travel in a versioned section with explicit binary encoding.
12. **Return to Workshop**. Ask Buddy what is owned and what credits remain. On another
    device/origin, Open the latest downloaded Champion File instead.

The automated routine uses synthetic private examples and a real held-out evaluation,
scripted Buddy replies, actual controls, purchases, placement and downloads. It never
uses existing browser profiles or student saves.

## Recovery and storage

- Opening a file **replaces** a snapshot; it never adds balances. Save before switching.
- IndexedDB is authoritative. Every document, memory and economy write participates in
  atomic transactions and revision checks. Web Locks are retained; IndexedDB also
  protects concurrent tabs without Web Locks. A stale tab must reload before editing.
- When another tab changes the Champion, use **Save recovery copy** if this tab has
  unsaved work, then reload. A recovery file may carry an older balance; it is a snapshot.
- Original `workshop.champion`, per-machine localStorage saves, legacy Studio IndexedDB
  saves and `studio.shop.v1` remain intact. The shared database also archives the initial
  input and prior snapshots on replacement. Do not clear site data to recover work.
- **Import legacy owned gear once** is explicit in Studio’s credits panel. Legacy coins
  stay archived; only ownership is added. The legacy source record is not modified.
- Invalid outer files cannot overwrite the current Champion. Unknown nested project,
  economy and preference versions travel intact and are read-only.
- Failed purchases or awards change no stored balance or ownership. Failed serialization
  is reported instead of exporting a silently incomplete file.

The teacher PIN is a **classroom convenience**, not tamper-proof financial security.
Its salted PBKDF2 verifier stays in a separate browser record, outside exported files
and Buddy context. A new browser needs its own teacher setup. Teacher judgment is the
only award source; Buddy has no award, PIN, completion or developer-level action.
Champion Files are editable snapshots, not a central accounting ledger.

## Context and limitations

Using Buddy sends the configured provider bounded machine structure, settings, observed
result summaries, approved memory, balance and actual catalog ownership, including in
private-data sessions. Raw datasets, photos and audio are not automatically attached.
Private learning/results remain session-only and may need new data after reopening.
Privacy hardening is intentionally deferred for this demo.

Context bounds: up to 200 block/wire entries and 100 owned gear IDs, settings for the first 20 blocks, six
findings, and 120 characters per free-text preference. Unsupported complex material
texture channels (for example normal maps) produce an explicit save error; retain a GLB
backup. The supported base-colour appearance is preserved. Tablet checks use Chromium
emulation, not a physical tablet. The City project’s legacy save format remains separate.
Vite reports a large-chunk advisory for the existing Studio bundle.

## Verification

```sh
npm run test:unit
npm run test:studio
npm run test:demo                 # server must be running at localhost:8378
node tests/workshop-live-demo.mjs # optional: calls the configured live provider
npm run test:library
```

Set `DEMO_ORIGIN` to test another local port. See [verification.md](verification.md)
for results, source commits and working-tree notes.
