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
 */
import {
  readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, cpSync, statSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// --- Agents: single .md files → both tool dirs (clean-regenerate) ---
const agentsSrc = join(root, '.ai', 'agents');
const agentTargets = [join(root, '.claude', 'agents'), join(root, '.opencode', 'agent')];
let agentCount = 0;
if (existsSync(agentsSrc)) {
  const files = readdirSync(agentsSrc).filter((f) => f.endsWith('.md'));
  agentCount = files.length;
  for (const target of agentTargets) {
    if (existsSync(target)) rmSync(target, { recursive: true, force: true });
    mkdirSync(target, { recursive: true });
    for (const f of files) writeFileSync(join(target, f), readFileSync(join(agentsSrc, f), 'utf8'));
  }
}

// --- Skills: directories with a SKILL.md → Claude Code skills dir (recursive copy) ---
const skillsSrc = join(root, '.ai', 'skills');
const skillsTarget = join(root, '.claude', 'skills');
let skillCount = 0;
if (existsSync(skillsSrc)) {
  // A real skill is a dir holding SKILL.md; this filter skips eval workspaces and stray files.
  const skillDirs = readdirSync(skillsSrc).filter((name) => {
    const p = join(skillsSrc, name);
    return statSync(p).isDirectory() && existsSync(join(p, 'SKILL.md'));
  });
  skillCount = skillDirs.length;
  for (const name of skillDirs) {
    const dst = join(skillsTarget, name);
    // Regenerate only this skill (preserve any other skills already in the target dir).
    if (existsSync(dst)) rmSync(dst, { recursive: true, force: true });
    cpSync(join(skillsSrc, name), dst, { recursive: true });
  }
}

console.log(
  `[sync-agents] ${agentCount} agent(s) → .claude/agents, .opencode/agent · ` +
    `${skillCount} skill(s) → .claude/skills`,
);
