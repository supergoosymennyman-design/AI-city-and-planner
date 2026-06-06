/**
 * sync-agents.mjs — generate per-tool agent dirs from the canonical source (plan §6/§7).
 *
 * WHY: agents are authored ONCE in `.ai/agents/` (the portable source of truth) and
 * generated into each tool's directory, so a mixed-tool team (Claude Code, opencode, …)
 * shares the exact same reviewers. The committed `.ai/agents/*.md` is the artifact; the
 * generated dirs are derived. Same philosophy as CI: the artifact is portable even when
 * the generator/runtime isn't.
 *
 * Today this is a straight copy (the canonical format is already Markdown + frontmatter,
 * which both Claude Code and opencode read). Per-tool transforms can slot in here later.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, '.ai', 'agents');
const targets = [join(root, '.claude', 'agents'), join(root, '.opencode', 'agent')];

if (!existsSync(src)) {
  console.log('[sync-agents] no .ai/agents/ — nothing to generate');
  process.exit(0);
}

const files = readdirSync(src).filter((f) => f.endsWith('.md'));
for (const target of targets) {
  // Clean-regenerate so a deleted canonical agent doesn't linger in a tool dir.
  if (existsSync(target)) rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  for (const f of files) writeFileSync(join(target, f), readFileSync(join(src, f), 'utf8'));
}

console.log(`[sync-agents] ${files.length} agent(s) → ${targets.map((t) => t.replace(root, '.')).join(', ')}`);
