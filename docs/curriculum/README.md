# Curriculum — taxonomy, numbering & naming

The lesson curriculum is **two-dimensional**: every lesson is identified by a **`(band, lesson)`**
pair, **not** by lesson number alone. Lesson numbers **reset per band**, so `lesson: 3` is
ambiguous on its own — K2 #3 is *Color the Rainbow*, K3 #3 is *AI Architect*. Some titles even
repeat across bands (*Play-Doh Fruits* is both K2 #12 and K3 #12).

## Bands

| Track | Bands | Lessons per band | Phases |
|---|---|---|---|
| `kindergarten` | `k2`, `k3` | 1–20 | Phase 1 = 1–10, Phase 2 = 11–20 |
| `primary` | `p1`–`p6` | TBD (lesson cut) | TBD |

**Phase is derived**, never stored: `lesson <= 10 → phase 1`, else phase 2. The only place the
rule lives is the registry generator, so it can't drift.

## The naming rule — `{band}-{NN}-{slug}`

One rule for every curriculum surface, both tracks:

- **`band`** — `k2` `k3` (KG) / `p1`…`p6` (primary), lowercase
- **`NN`** — the lesson number within the band, zero-padded to 2 digits (`01`–`20`)
- **`slug`** — kebab-case of the canonical title

| Surface | Path / value |
|---|---|
| Source intake (Gate 0) | `source/<track>/<band>-<NN>-<slug>/` |
| Blueprint (curriculum) | `docs/curriculum/<track>-<band>-<NN>-<slug>.md` |
| Game | `games/<track>/<band>-<NN>-<slug>/` |
| Manifest `id` | `<band>-<NN>-<slug>` (1:1 with the game folder) |
| Manifest `ageBand` | the band in caps — `K2` / `K3` / `P1`…`P6` |
| npm package name | `@edu/game-<band>-<NN>-<slug>` |

Putting `band` first keeps a plain `ls` grouped and ordered exactly like the source curriculum.
The band-prefixed **flat** slug (not a `k2/` sub-folder) is deliberate: the npm workspaces glob is
`games/<track>/*`, so a nested band folder would silently drop games out of the workspace.

## Single source of truth — [`lessons.json`](./lessons.json)

`lessons.json` is the canonical registry of every `(band, lesson)`: title, slug, phase, the
platform tool it needs, and build status. It is derived from the course designer's master index
(`source/kindergarten/English AI Discovery.pdf`). When the designer's index and the per-lesson
scripts disagree, the registry records the resolved canonical title (`title`) and the alternate
(`altTitle`) so nothing is lost.

## Why blueprints live here, not in `games/`

The blueprint (`docs/curriculum/<track>-<band>-NN-<slug>.md`) is the **pedagogical spec**, and
it lives under `docs/curriculum/` — with the registry and this README — on purpose. An artifact
lives where its **owner and lifecycle** are, not next to whatever consumes it:

- **It exists before the game — and often without one.** The blueprint is authored and
  human-approved (Gate 1) *before* any code is written; at that point there is no `games/<id>/`
  folder. And the registry holds all 40 lessons while only a few are built — most blueprints would
  have nowhere to live under `games/`.
- **The Education SME owns it, not the devs.** Curriculum is reviewed for *coverage across
  lessons* (gap analysis via `lessons.json`) and carries SME frontmatter (`smeReviewed`/`reviewer`/
  `owner`). `docs/curriculum/**` and `games/**` can be CODEOWNERS-gated to different people.
- **Spec vs implementation (altitude).** `docs/` = *what/why to teach*; `games/` = *how it's
  coded*. The game's `manifest.ts` pedagogy fields **trace back to** the blueprint, and
  `pedagogy-reviewer`/`contract-reviewer` check the built game *against* it — two artifacts with a
  dependency arrow, kept apart on purpose.

The rule isn't "specs go in docs" — it's "the artifact lives with its owner." The contrast proves
it: the **technical** implementation plan (the `game-architect`'s output) lives *inside* the game
at `games/primary/<id>/PLAN.md` — engineer-owned, written *after* the blueprint, churns with the
code. Pedagogy → curriculum (docs); implementation → code (games). (Same split as
[PLAN.md](../PLAN.md) "why" vs [PROGRESS.md](../PROGRESS.md) "what's done".)

## Source documents (course designer's, in `source/`)

- **`English AI Discovery.pdf`** — the curriculum **master index** (K2 1–20 + K3 1–20: title,
  objective, tool, details). Drives `lessons.json`.
- **`This is how the Kindergarten games should work.docx`** — the detailed **25-minute teacher
  scripts** (Part A/B/C dialogue), **K2 only**. These are the pre-blueprint intake the
  `blueprint` skill consumes; split one per `source/kindergarten/k2-<NN>-<slug>/lesson.md`.
  > **K3 has no scripts yet** — only the PDF one-liners. K3 games can't pass Gate 0 until the
  > designer authors K3 teacher scripts.
