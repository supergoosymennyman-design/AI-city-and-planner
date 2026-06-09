/**
 * sync-agents.mjs — generate per-tool agent + skill dirs from the canonical source (plan §6/§7).
 *
 * WHY: agents AND skills are authored ONCE under `.ai/` (the portable source of truth) and
 * generated into each tool's directory, so a mixed-tool team (Claude Code, opencode, …) shares
 * the exact same reviewers + skills. The committed `.ai/**` is the artifact; the generated dirs
 * are derived. Same philosophy as CI: the artifact is portable even when the runtime isn't.
 *
 * - **Agents** (`.ai/agents/*.md`): single MD+frontmatter files, authored in Claude Code's agent
 *   format (`name`/`description`/`tools`/`model: inherit`). Generated into:
 *     - `.claude/agents/` — verbatim (Claude Code reads this format natively).
 *     - `.opencode/agent/` — **frontmatter-translated** (see `toOpencodeAgent`). opencode has a
 *       DIFFERENT agent schema (`mode: subagent`, `permission:` blocks, `provider/model` models).
 *       Copying the Claude format verbatim used to ship `model: inherit` (no opencode equivalent)
 *       and no `mode:`, which opencode chokes on at startup — that was the real cause of the
 *       "delete the whole .opencode folder" confusion. We translate instead of duplicate.
 *   Both dirs are clean-regenerated so a deleted canonical agent doesn't linger in a tool dir.
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
 * Translate a canonical (Claude Code format) agent `.md` into opencode's agent schema.
 *
 * WHY: opencode and Claude Code share the markdown-with-frontmatter shape but NOT the frontmatter
 * fields. Shipping the Claude file verbatim to `.opencode/agent/` sends `model: inherit` (opencode
 * resolves `provider/model` and has no `inherit`) and omits `mode:` — opencode then fails provider/
 * agent resolution at startup. We surgically rewrite ONLY the frontmatter; the prompt body (the
 * actual agent behaviour) is copied untouched.
 *
 * Mapping (opencode docs: /docs/agents, /docs/permissions; v2 deprecates the lossy `tools:` map in
 * favour of `permission:`):
 * - `name:`   → dropped. opencode derives the agent name from the FILENAME.
 * - `model:`  → dropped. `inherit` has no opencode analog; omitting it uses the session default
 *               model, which IS opencode's equivalent of "inherit the parent's model".
 * - `mode:`   → added as `subagent` (these are Task-dispatched specialists, never the primary).
 * - `tools: Read, Write, …` (Claude allow-list of tool NAMES) → `permission:` block gating ACTIONS:
 *     edit  = allow iff the agent was granted Write or Edit, else deny (read-only reviewer);
 *     bash  = allow iff granted Bash, else deny;
 *     webfetch = allow iff granted WebFetch/WebSearch, else deny.
 *   read/grep/glob are always available in opencode (not permission-gated), matching the reviewers'
 *   need to read the repo. This preserves exactly what each agent was trusted to do in Claude.
 *
 * The `description:` line is preserved VERBATIM (not re-serialized) so em-dashes/quotes/parens in
 * the human-written descriptions can't be mangled by naive YAML emission. Assumes single-line
 * `description:` (true for every `.ai/agents/*.md` today); a multi-line block would need real YAML.
 *
 * @param raw - full canonical agent file (frontmatter + body)
 * @param file - source filename, used only for a loud error if the frontmatter is malformed
 * @returns the opencode-formatted agent markdown
 */
function toOpencodeAgent(raw, file) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  // Make failure loud (AGENTS code style): a canonical agent MUST have parseable frontmatter.
  if (!m) throw new Error(`[sync-agents] ${file}: missing/!malformed frontmatter (expected leading ---\\n…\\n---)`);
  const [, frontmatter, body] = m;

  let descriptionLine = null;
  let toolsCsv = '';
  for (const line of frontmatter.split('\n')) {
    if (line.startsWith('description:')) descriptionLine = line;
    else if (line.startsWith('tools:')) toolsCsv = line.slice('tools:'.length);
  }

  const tools = toolsCsv.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
  const can = (t) => tools.includes(t);
  const perm = (yes) => (yes ? 'allow' : 'deny');

  const out = ['---'];
  if (descriptionLine) out.push(descriptionLine);
  out.push('mode: subagent');
  out.push('permission:');
  out.push(`  edit: ${perm(can('write') || can('edit'))}`);
  out.push(`  bash: ${perm(can('bash'))}`);
  out.push(`  webfetch: ${perm(can('webfetch') || can('websearch'))}`);
  out.push('---');
  return `${out.join('\n')}\n${body}`;
}

/**
 * The generation plan, computed once and consumed by BOTH write and check modes so the two can
 * never disagree. Each fully-owned target dir is clean-regenerated, so check mode must also flag
 * stray on-disk files (ones the write path would delete) — not just changed/missing content.
 */
const plan = []; // { dir: absolute owned dir, files: Map<relPath, content> }

// --- Agents: single .md files → both tool dirs (each dir fully owned / clean-regenerate) ---
// Claude Code gets the canonical bytes; opencode gets a frontmatter translation (different schema).
const agentsSrc = join(root, '.ai', 'agents');
const claudeAgentsDir = join(root, '.claude', 'agents');
const opencodeAgentsDir = join(root, '.opencode', 'agent');
const agentTargets = [claudeAgentsDir, opencodeAgentsDir];
if (existsSync(agentsSrc)) {
  const files = readdirSync(agentsSrc).filter((f) => f.endsWith('.md'));
  for (const target of agentTargets) {
    const toOpencode = target === opencodeAgentsDir;
    const map = new Map(
      files.map((f) => {
        const raw = readFileSync(join(agentsSrc, f), 'utf8');
        return [f, toOpencode ? toOpencodeAgent(raw, f) : raw];
      }),
    );
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
