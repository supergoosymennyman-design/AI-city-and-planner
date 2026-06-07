/**
 * sync-agents.mjs — generate per-tool agent + skill dirs from the canonical source (plan §6/§7).
 *
 * WHY: agents AND skills are authored ONCE under `.ai/` (the portable source of truth) and
 * generated into each tool's directory, so a mixed-tool team (Claude Code, opencode, …) shares
 * the exact same reviewers + skills. The committed `.ai/**` is the artifact; the generated dirs
 * are derived. Same philosophy as CI: the artifact is portable even when the runtime isn't.
 *
 * - **Agents** (`.ai/agents/*.md`): single MD+frontmatter files → `.claude/agents/` AND
 *   `.opencode/agent/` (both tools read this format). Clean-regenerated so a deleted canonical
 *   agent doesn't linger in a tool dir.
 * - **Skills** (`.ai/skills/<name>/` containing a `SKILL.md`): copied recursively → Claude
 *   Code's `.claude/skills/<name>/`. opencode has no skills concept today, so skills are
 *   Claude-only. Dirs WITHOUT a SKILL.md (e.g. `*-workspace/` eval artifacts) are skipped, and
 *   only the skills we own are regenerated — we don't wipe skills another tool may have added.
 *
 * MODES:
 * - default (write): regenerate the tool dirs from `.ai/**`.
 * - `--check`: write nothing; exit non-zero if any generated file is stale (missing, changed, or
 *   a stray file that a clean regenerate would remove). This is the DRIFT GATE — `npm run validate`
 *   runs it so a hand-edit of a generated dir, or a forgotten `npm run sync`, fails the build
 *   instead of silently shipping `.claude`/`.opencode` that disagree with the canonical `.ai/**`.
 */
import {
  readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, statSync,
} from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const checkOnly = process.argv.includes('--check');

/** Recursively list every file under `dir` as paths relative to `dir` (POSIX-normalized). */
function listFilesRel(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = entry.name;
    if (entry.isDirectory()) {
      for (const sub of listFilesRel(join(dir, rel))) out.push(`${rel}/${sub}`);
    } else {
      out.push(rel);
    }
  }
  return out.map((p) => p.split('\\').join('/'));
}

/**
 * The generation plan, computed once and consumed by BOTH write and check modes so the two can
 * never disagree. Each fully-owned target dir is clean-regenerated, so check mode must also flag
 * stray on-disk files (ones the write path would delete) — not just changed/missing content.
 */
const plan = []; // { dir: absolute owned dir, files: Map<relPath, content> }

// --- Agents: single .md files → both tool dirs (each dir fully owned / clean-regenerate) ---
const agentsSrc = join(root, '.ai', 'agents');
const agentTargets = [join(root, '.claude', 'agents'), join(root, '.opencode', 'agent')];
if (existsSync(agentsSrc)) {
  const files = readdirSync(agentsSrc).filter((f) => f.endsWith('.md'));
  for (const target of agentTargets) {
    const map = new Map(files.map((f) => [f, readFileSync(join(agentsSrc, f), 'utf8')]));
    plan.push({ dir: target, files: map });
  }
}

// --- Skills: dirs with a SKILL.md → Claude Code skills dir (each owned skill subdir regenerated) ---
const skillsSrc = join(root, '.ai', 'skills');
const skillsTarget = join(root, '.claude', 'skills');
if (existsSync(skillsSrc)) {
  // A real skill is a dir holding SKILL.md; this filter skips eval workspaces and stray files.
  const skillDirs = readdirSync(skillsSrc).filter((name) => {
    const p = join(skillsSrc, name);
    return statSync(p).isDirectory() && existsSync(join(p, 'SKILL.md'));
  });
  for (const name of skillDirs) {
    const src = join(skillsSrc, name);
    const map = new Map(listFilesRel(src).map((rel) => [rel, readFileSync(join(src, rel), 'utf8')]));
    // Only this skill's subdir is owned; sibling skills from other tools are preserved.
    plan.push({ dir: join(skillsTarget, name), files: map });
  }
}

const agentCount = agentTargets.reduce(
  (n, t) => n + (plan.find((p) => p.dir === t)?.files.size ?? 0),
  0,
) / Math.max(agentTargets.length, 1);
const skillCount = plan.filter((p) => p.dir.startsWith(skillsTarget + (process.platform === 'win32' ? '\\' : '/'))).length;

if (checkOnly) {
  const stale = [];
  for (const { dir, files } of plan) {
    // Missing or changed generated files.
    for (const [rel, content] of files) {
      const abs = join(dir, rel);
      if (!existsSync(abs)) stale.push(`${relative(root, abs)} (missing — run \`npm run sync\`)`);
      else if (readFileSync(abs, 'utf8') !== content) {
        stale.push(`${relative(root, abs)} (out of date vs .ai/** — run \`npm run sync\`)`);
      }
    }
    // Stray files a clean regenerate would delete (the dir is fully owned).
    for (const rel of listFilesRel(dir)) {
      if (!files.has(rel)) stale.push(`${relative(root, join(dir, rel))} (stray — not in .ai/**; run \`npm run sync\`)`);
    }
  }
  if (stale.length) {
    console.error(
      `[sync-agents] DRIFT: ${stale.length} generated file(s) disagree with canonical .ai/**:\n` +
        stale.map((s) => `  - ${s}`).join('\n') +
        `\nGenerated dirs (.claude, .opencode) are derived — edit .ai/** then run \`npm run sync\`.`,
    );
    process.exit(1);
  }
  console.log('[sync-agents] check OK — .claude/.opencode match canonical .ai/**');
} else {
  for (const { dir, files } of plan) {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    for (const [rel, content] of files) {
      const abs = join(dir, rel);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, content);
    }
  }
  console.log(
    `[sync-agents] ${agentCount} agent(s) → .claude/agents, .opencode/agent · ` +
      `${skillCount} skill(s) → .claude/skills`,
  );
}
