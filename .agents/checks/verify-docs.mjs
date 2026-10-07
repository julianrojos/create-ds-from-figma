#!/usr/bin/env node
/**
 * verify-docs: the kit's instructions point at files and commands, and a pointer that goes nowhere
 * produces no error anywhere else. This reports links, kit paths and commands in the Markdown that
 * resolve to nothing.
 *
 *   link     a relative Markdown link to a file that does not exist
 *   path     a backticked `.agents/...` path (or a references/, scripts/, evals/ or plantillas/ path
 *            relative to its skill) that does not exist
 *   command  `node <script>.mjs` naming a missing script, or `npm run <name>` / `npm test` missing from package.json
 *
 * It is a report: it exits 0 unless --strict is passed, so false positives can be tuned before it blocks.
 * Paths with placeholders (<Nombre>, *, {}, ...) and paths of the generated design system (design-system/, src/)
 * are not checked, and fenced blocks are skipped except shell blocks, whose commands are checked.
 * The scripts dev, build and preview are added to package.json by the first import (Vite), so they are
 * not reported while the kit is still blank.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const skipDirectories = new Set(["node_modules", ".git", "INSPIRATION", "dist", "build"]);
const shellFences = new Set(["bash", "sh", "shell", "console", "zsh"]);
const scriptsAddedByFirstImport = new Set(["dev", "build", "preview"]);

function markdownFiles(root) {
  const found = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (skipDirectories.has(entry.name)) continue;
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile() && entry.name.endsWith(".md")) found.push(full);
    }
  };
  for (const name of ["README.md", "AGENTS.md"]) if (existsSync(path.join(root, name))) found.push(path.join(root, name));
  if (existsSync(path.join(root, ".agents"))) visit(path.join(root, ".agents"));
  return found;
}

function skillDirectory(root, file) {
  for (let directory = path.dirname(file); directory.startsWith(root); directory = path.dirname(directory)) {
    if (existsSync(path.join(directory, "SKILL.md"))) return directory;
    if (directory === root) break;
  }
  return null;
}

const placeholder = /[<>*{}…]|\.\.\.|\s/;

export function verifyDocs(root) {
  const findings = [];
  let scripts = {};
  try {
    scripts = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).scripts ?? {};
  } catch {
    scripts = {};
  }
  for (const file of markdownFiles(root)) {
    const relative = path.relative(root, file);
    const skill = skillDirectory(root, file);
    const report = (line, kind, message) => findings.push({ file: relative, line, kind, message });
    const exists = (target, bases) => bases.some((base) => base && existsSync(path.resolve(base, target)));
    let fence = null;
    readFileSync(file, "utf8").split(/\r?\n/).forEach((text, index) => {
      const line = index + 1;
      const fenceMatch = /^\s*(```+|~~~+)\s*([\w-]*)/.exec(text);
      if (fenceMatch) {
        fence = fence ? null : { language: fenceMatch[2].toLowerCase() };
        return;
      }
      const checkCommands = (source) => {
        for (const match of source.matchAll(/\bnode\s+(?:--[\w-]+\s+)*["']?([^\s"'`]+\.mjs)\b/g)) {
          if (!placeholder.test(match[1]) && !existsSync(path.resolve(root, match[1]))) report(line, "command", `script ${match[1]} does not exist`);
        }
        for (const match of source.matchAll(/\bnpm\s+run\s+([\w:-]+)/g)) {
          if (!Object.hasOwn(scripts, match[1]) && !scriptsAddedByFirstImport.has(match[1])) report(line, "command", `npm script ${match[1]} is not defined in package.json`);
        }
        if (/\bnpm\s+test\b/.test(source) && !Object.hasOwn(scripts, "test")) report(line, "command", "npm test is not defined in package.json");
      };
      if (fence) {
        if (shellFences.has(fence.language)) checkCommands(text);
        return;
      }
      for (const match of text.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
        const target = match[1].split("#")[0];
        if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("/")) continue;
        if (!existsSync(path.resolve(path.dirname(file), target))) report(line, "link", `link target ${target} does not exist`);
      }
      for (const match of text.matchAll(/`([^`\n]+)`/g)) {
        const span = match[1].trim();
        checkCommands(span);
        if (placeholder.test(span)) continue;
        if (span.startsWith(".agents/")) {
          if (!existsSync(path.resolve(root, span))) report(line, "path", `${span} does not exist`);
        } else if (/^(?:\.\.\/)?(?:references|scripts|evals|plantillas)\/[^\s]+$|^\.\.\/SKILL\.md$/.test(span)) {
          if (!exists(span, [path.dirname(file), skill])) report(line, "path", `${span} does not exist beside the document or in its skill`);
        }
      }
    });
  }
  return { findings };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const strict = args.includes("--strict");
  const root = path.resolve(args.find((arg) => !arg.startsWith("--")) || ".");
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    console.error(`verify-docs: ${root} is not a directory`);
    process.exitCode = 2;
  } else {
    const { findings } = verifyDocs(root);
    for (const item of findings) console.log(`${strict ? "FAIL" : "REPORT"} ${item.kind} ${item.file}:${item.line}: ${item.message}`);
    console.log(`${findings.length ? (strict ? "FAIL" : "REPORT") : "PASS"}: ${findings.length} finding(s)`);
    if (strict && findings.length) process.exitCode = 1;
  }
}
