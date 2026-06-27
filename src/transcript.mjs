// Locate and read the active Claude Code session transcript (method B).
//
// Claude Code writes one JSONL per session under
//   ~/.claude/projects/<encoded-cwd>/<session-id>.jsonl
// Each line is a JSON record; assistant turns have type:"assistant" and
// message.content[] blocks (thinking / text / tool_use).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const PROJECTS_DIR = join(homedir(), ".claude", "projects");

/** All <project>/<session>.jsonl paths, newest first. */
function allSessionFiles() {
  const out = [];
  let projects;
  try {
    projects = readdirSync(PROJECTS_DIR);
  } catch {
    return out;
  }
  for (const p of projects) {
    const dir = join(PROJECTS_DIR, p);
    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const f of entries) {
      if (!f.endsWith(".jsonl")) continue;
      const full = join(dir, f);
      try {
        out.push({ path: full, mtime: statSync(full).mtimeMs });
      } catch {
        /* race: file vanished */
      }
    }
  }
  return out.sort((a, b) => b.mtime - a.mtime).map((x) => x.path);
}

/** Read the `cwd` field from the first record that has one. */
function sessionCwd(path) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return null;
  }
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const o = JSON.parse(line);
      if (o.cwd) return o.cwd;
    } catch {
      /* skip malformed line */
    }
  }
  return null;
}

/**
 * Find the most-recently-modified session whose cwd matches `cwd`.
 * Falls back to the newest session overall if none match.
 */
export function findSessionFile(cwd = process.cwd()) {
  const files = allSessionFiles();
  for (const f of files) {
    if (sessionCwd(f) === cwd) return f;
  }
  return files[0] ?? null;
}

/**
 * Return the latest assistant message that contains prose text.
 * @returns {{id:string, text:string}|null}
 */
export function readLatestAssistantText(path) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return null;
  }
  const lines = text.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    let rec;
    try {
      rec = JSON.parse(line);
    } catch {
      continue;
    }
    if (rec.type !== "assistant" || !rec.message) continue;
    const content = rec.message.content;
    if (!Array.isArray(content)) continue;
    const prose = content
      .filter((b) => b && b.type === "text" && b.text)
      .map((b) => b.text)
      .join("\n\n");
    if (prose.trim()) return { id: rec.message.id ?? String(i), text: prose };
  }
  return null;
}
