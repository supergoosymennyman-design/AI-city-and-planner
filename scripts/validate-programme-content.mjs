import fs from "node:fs";

const root = new URL("../Passiona.ai/", import.meta.url);
const source = fs.readFileSync(new URL("lib/programme-content.ts", root), "utf8");
const en = JSON.parse(fs.readFileSync(new URL("messages/en.json", root), "utf8"));
const zh = JSON.parse(fs.readFileSync(new URL("messages/zh.json", root), "utf8"));
const lessons = (source.match(/^  \["[^\n]+$/gm) ?? []).filter((line) => !line.includes('"unit-'));
const unitIds = [...source.matchAll(/\["(unit-\d\d)"/g)].map((match) => match[1]);
const errors = [];
if (lessons.length !== 20) errors.push(`expected 20 lesson rows, found ${lessons.length}`);
if (unitIds.length !== 5 || new Set(unitIds).size !== 5) errors.push("expected five unique programme units");
for (const locale of [en, zh]) {
  if (!locale.Agent || !locale.Programme) errors.push("both locales need Agent and Programme labels");
  if (!Array.isArray(locale.Tools?.items) || locale.Tools.items.length !== 4) errors.push("both locales need four tool cards");
}
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
console.log(`Programme content valid: ${unitIds.length} units, ${lessons.length} lessons, 2 locales.`);
