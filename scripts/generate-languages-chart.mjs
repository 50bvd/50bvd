#!/usr/bin/env node
// Generates an SVG chart showing ALL file types used across every public,
// non-fork repository owned by OWNER.
//
// Unlike GitHub's own "Languages" stats (and lowlighter/metrics' plugin),
// this does NOT rely on the GET /repos/{owner}/{repo}/languages endpoint.
// That endpoint is powered by GitHub's Linguist tool, which by design only
// counts files of type "programming" or "markup" — types like "data"
// (YAML, JSON, TOML...) and "prose" (Markdown) are excluded UNLESS the repo
// owner opts in per-repo via a `.gitattributes` linguist-detectable rule.
// See: https://github.com/github-linguist/linguist/blob/main/docs/overrides.md
//
// Instead, this script walks each repo's full file tree directly and
// classifies every file by its extension/filename using its own mapping
// below, counting bytes from the tree API's blob `size` field. This way
// every type of file you actually wrote — YAML, XAML (grouped here under
// its own label, not bucketed into XML), JSON, Markdown, etc. — is counted.
//
// Usage: node generate-languages-chart.mjs
// Requires: Node 18+ (built-in fetch). GITHUB_TOKEN env var is optional but
// recommended to avoid the unauthenticated API rate limit (60 req/h).

import { writeFileSync } from "node:fs";

const OWNER = process.env.LANG_CHART_OWNER || "50bvd";
const TOKEN = process.env.GITHUB_TOKEN || process.env.METRICS_TOKEN || "";
const API = "https://api.github.com";
const OUTPUT_FILE = process.env.LANG_CHART_OUTPUT || "languages-chart.svg";

const HEADERS = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": `${OWNER}-languages-chart`,
  ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
};

// Extension -> label. Add new entries here any time a new file type should
// be tracked; anything not listed is simply skipped (treated as "not code",
// e.g. images, binaries, lockfiles).
const EXT_LANG = {
  ".js": "JavaScript", ".mjs": "JavaScript", ".cjs": "JavaScript", ".jsx": "JavaScript",
  ".ts": "TypeScript", ".tsx": "TypeScript",
  ".ps1": "PowerShell", ".psm1": "PowerShell", ".psd1": "PowerShell",
  ".py": "Python",
  ".rb": "Ruby",
  ".html": "HTML", ".htm": "HTML",
  ".css": "CSS",
  ".scss": "SCSS", ".sass": "Sass",
  ".cs": "C#",
  ".pl": "Perl", ".pm": "Perl",
  ".sh": "Shell", ".bash": "Shell", ".zsh": "Shell",
  ".bat": "Batchfile", ".cmd": "Batchfile",
  ".yml": "YAML", ".yaml": "YAML",
  ".xaml": "XAML",
  ".xml": "XML", ".xsd": "XML", ".xsl": "XML", ".xslt": "XML",
  ".json": "JSON", ".jsonc": "JSON",
  ".md": "Markdown", ".markdown": "Markdown",
  ".toml": "TOML",
  ".ini": "INI", ".cfg": "INI", ".conf": "INI",
  ".sql": "SQL",
  ".go": "Go",
  ".rs": "Rust",
  ".java": "Java",
  ".c": "C", ".h": "C",
  ".cpp": "C++", ".cc": "C++", ".hpp": "C++",
  ".php": "PHP",
  ".vue": "Vue",
  ".lua": "Lua",
};

// Exact filenames (no extension) mapped to a label.
const FILENAME_LANG = {
  Dockerfile: "Dockerfile",
  dockerfile: "Dockerfile",
  Makefile: "Makefile",
  makefile: "Makefile",
};

// Directories to ignore entirely (dependencies / build artifacts, not your
// own written code).
const SKIP_DIR_RE = /(^|\/)(node_modules|vendor|dist|build|bin|obj|packages|\.git)(\/|$)/i;

// Auto-generated dependency lockfiles. These can be huge (a single
// package-lock.json easily reaches hundreds of KB) and would otherwise
// dominate the chart under JSON/YAML without representing code you wrote.
const SKIP_FILENAMES = new Set([
  "package-lock.json",
  "npm-shrinkwrap.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "composer.lock",
  "Gemfile.lock",
  "Pipfile.lock",
  "poetry.lock",
  "Cargo.lock",
  "go.sum",
]);

// Official GitHub linguist colors where available; custom picks otherwise.
const COLORS = {
  JavaScript: "#f1e05a",
  TypeScript: "#3178c6",
  PowerShell: "#012456",
  HTML: "#e34c26",
  CSS: "#663399",
  SCSS: "#c6538c",
  Sass: "#a53b70",
  Shell: "#89e051",
  Ruby: "#701516",
  Python: "#3572A5",
  "C#": "#178600",
  Dockerfile: "#384d54",
  Batchfile: "#C1F12E",
  Perl: "#0298c3",
  Makefile: "#427819",
  YAML: "#cb171e",
  XAML: "#ff7f50",
  XML: "#0060ac",
  JSON: "#292929",
  Markdown: "#083fa1",
  TOML: "#9c4221",
  INI: "#d1dbe0",
  SQL: "#e38c00",
  Go: "#00ADD8",
  Rust: "#dea584",
  Java: "#b07219",
  C: "#555555",
  "C++": "#f34b7d",
  PHP: "#4F5D95",
  Vue: "#41b883",
  Lua: "#000080",
};
const FALLBACK_COLOR = "#959da5";

async function fetchJSON(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) {
    throw new Error(`GET ${url} -> ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function getRepos() {
  const repos = [];
  let page = 1;
  while (true) {
    const batch = await fetchJSON(
      `${API}/users/${OWNER}/repos?per_page=100&page=${page}&type=owner`,
    );
    repos.push(...batch);
    if (batch.length < 100) break;
    page++;
  }
  // Keep archived repos (still real code you wrote), exclude forks.
  return repos.filter((r) => !r.fork);
}

async function getTree(repo) {
  const branch = repo.default_branch || "main";
  const data = await fetchJSON(
    `${API}/repos/${OWNER}/${repo.name}/git/trees/${branch}?recursive=1`,
  );
  if (data.truncated) {
    console.error(`  ⚠️ ${repo.name}: tree response truncated by GitHub (very large repo) — counts may be incomplete`);
  }
  return data.tree || [];
}

function classify(path) {
  const base = path.split("/").pop();
  if (FILENAME_LANG[base]) return FILENAME_LANG[base];
  const match = base.match(/\.[^.]+$/);
  if (!match) return null;
  return EXT_LANG[match[0].toLowerCase()] || null;
}

function escapeXML(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderSVG(stats, total, repoCount) {
  const sorted = Object.entries(stats).sort((a, b) => b[1] - a[1]);
  const width = 760;
  const padding = 20;
  const barY = 56;
  const barHeight = 22;
  const colCount = 2;
  const rowHeight = 24;
  const rows = Math.ceil(sorted.length / colCount);
  const legendY = barY + barHeight + 26;
  const height = legendY + rows * rowHeight + 26;

  let barSegments = "";
  let x = padding;
  const barInnerWidth = width - padding * 2;
  sorted.forEach(([name, bytes], i) => {
    const pct = bytes / total;
    let w = pct * barInnerWidth;
    if (i === sorted.length - 1) w = padding + barInnerWidth - x;
    const color = COLORS[name] || FALLBACK_COLOR;
    barSegments += `<rect x="${x.toFixed(2)}" y="${barY}" width="${Math.max(w, 0).toFixed(2)}" height="${barHeight}" fill="${color}" />`;
    x += w;
  });

  let legend = "";
  const colWidth = barInnerWidth / colCount;
  sorted.forEach(([name, bytes], i) => {
    const pct = ((bytes / total) * 100).toFixed(2);
    const col = i % colCount;
    const row = Math.floor(i / colCount);
    const lx = padding + col * colWidth;
    const ly = legendY + row * rowHeight;
    const color = COLORS[name] || FALLBACK_COLOR;
    legend += `
      <circle cx="${(lx + 5).toFixed(1)}" cy="${ly.toFixed(1)}" r="5" fill="${color}" />
      <text x="${(lx + 16).toFixed(1)}" y="${(ly + 4).toFixed(1)}" font-size="13" fill="#c9d1d9">${escapeXML(name)}</text>
      <text x="${(lx + colWidth - 8).toFixed(1)}" y="${(ly + 4).toFixed(1)}" font-size="12" fill="#8b949e" text-anchor="end">${pct}% · ${(bytes / 1024).toFixed(1)} kB</text>`;
  });

  const updated = new Date().toISOString().slice(0, 10);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif">
  <rect width="${width}" height="${height}" rx="6" fill="#0d1117" />
  <text x="${padding}" y="28" font-size="16" font-weight="700" fill="#58a6ff">Languages across all repositories</text>
  <rect x="${padding}" y="${barY}" width="${barInnerWidth}" height="${barHeight}" rx="4" fill="#21262d" />
  ${barSegments}
  <g>${legend}</g>
  <text x="${width - padding}" y="${height - 10}" font-size="10" font-style="italic" fill="#666" text-anchor="end">${sorted.length} file types · ${repoCount} repositories · ${(total / 1024).toFixed(1)} kB total · updated ${updated}</text>
</svg>`;
}

export function renderSVGForTest(stats, total, repoCount) {
  return renderSVG(stats, total, repoCount);
}

async function main() {
  const repos = await getRepos();
  console.error(`Found ${repos.length} owned, non-fork repositories`);

  const totals = {};
  for (const repo of repos) {
    const tree = await getTree(repo);
    const seen = new Set();
    for (const entry of tree) {
      if (entry.type !== "blob") continue;
      if (SKIP_DIR_RE.test(entry.path)) continue;
      const base = entry.path.split("/").pop();
      if (SKIP_FILENAMES.has(base)) continue;
      const lang = classify(entry.path);
      if (!lang) continue;
      totals[lang] = (totals[lang] || 0) + (entry.size || 0);
      seen.add(lang);
    }
    console.error(`  ${repo.name}: ${[...seen].join(", ") || "(no recognized file types)"}`);
  }

  const total = Object.values(totals).reduce((a, b) => a + b, 0);
  if (total === 0) {
    throw new Error("No file types collected — aborting to avoid committing an empty chart");
  }

  const svg = renderSVG(totals, total, repos.length);
  writeFileSync(OUTPUT_FILE, svg);
  console.error(`Wrote ${OUTPUT_FILE} — ${Object.keys(totals).length} file types, ${total} bytes total`);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
