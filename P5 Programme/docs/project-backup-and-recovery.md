# Project backup and recovery

The complete portable backup is one `.passiona` download. Hub, Academy, Planner,
City, Workshop and Studio use `city-common/backup-coordinator.js`. Cloud codes
remain **City snapshots**, with the existing 1 MB API limit. A cloud code does
not carry editable Workshop/Studio work, the project wallet, or model binaries.

## Saving

Workspace adapters implement `flush`, `capture`, `restore` and `suspend`.
Flush waits for editor writes and challenge reward commits. Capture uses the
reviewed persistable representation, including the Champion session’s unfamiliar
sections. Camera/microphone data and session-only teaching material remain out
of the backup; Workshop retains its reattachment explanation.

The project archive contains City compatibility state, editable Champion work,
wallet and ownership, equipped items, capabilities/installations, run evidence,
achievements, and referenced custom-model/Champion GLBs. References map model IDs
to deduplicated binary entries with byte lengths and corruption checks. Missing
required binaries abort the download with a reattachment message. Existing size
limits remain: 80 MiB archive, 64 MiB Champion GLB, 12 MiB per custom model and
36 MiB custom-model library. Corruption checks are not authenticity signatures.

## Restoring and switching

Restore validates the archive and its references, flushes current work, stages
model bytes and Champion records under a **new local project identity**, and
retains the current project as recovery data. Activation replaces project-specific
compatibility keys, clearing absent values while retaining language. Failed
staging never activates the incoming project. Failed compatibility writes roll
back; storage errors are surfaced instead of reporting success.

Imports preserve capability identifiers, installations and reward claims. They
never overwrite a same-ID local project. Existing project archives, City Champion
Files and Workshop Champion Files are recognized by content type. Old files carry
only the data they actually contain; they cannot invent missing learning evidence
or binaries. City snapshots also open as new projects rather than merging into an
unrelated wallet.

Switching flushes adapters and saves a recovery checkpoint before suspending old
writers. Reload binds new editor instances. Store mutations carry their bound
project identity and workspace generation; outdated tabs show a reload control.
Workshop/Studio records and custom model/Champion binaries are project-scoped.
Original legacy records remain available and are associated with one project only.

## Learning and Market handoffs

New driving publications record their source machine. Improving an installed
skill resumes that machine when available; older publications offer saved driving
machines or an explicit starter button. Badge eligibility is unchanged. Cards
separate held-out example counts, driving steps and installation counts, and show
unavailable rates as unmeasured.

Challenge completion exposes its reward persistence promise. Backup/navigation
wait for it; a failed save offers replay-safe Retry. Market purchases and equipment
changes validate ownership in the bound project. Purchased decorations enter the
normal City placement preview with collision checks and cancellation.

## Regression checks

`project-economy.test.mjs` covers stale exports/checkpoints, revision/import
recovery, migration precedence/provenance, pending mutations and equipment.
`project-integration.spec.mjs` exercises project switching, complete model backup,
Hub download/upload into an empty browser, corrupt references and failed restore.
It runs on Chromium and WebKit alongside `two-tab-wallet.spec.mjs`.

Run unit, import, library, source integration and built integration checks before
release. Built Studio tests are required: source-only runs intentionally skip them.

Current implementation review groups and release-check limitations are recorded
in [integration-hardening-verification.md](integration-hardening-verification.md).
