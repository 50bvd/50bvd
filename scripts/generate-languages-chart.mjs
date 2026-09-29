#!/usr/bin/env node
// Generates an SVG card showing the programming languages used across every
// public, non-fork repository owned by OWNER.
//
// This does not rely on the GET /repos/{owner}/{repo}/languages endpoint:
// it walks each repo's full file tree and classifies files by extension,
// counting bytes from the tree API's blob `size` field. Only actual
// programming languages are counted — markup, styling, data and config
// files (HTML, CSS, JSON, YAML, Markdown, INI...) are ignored.
//
// Two variants are written (dark and light) so the README can pick the one
// matching the viewer's GitHub theme through a <picture> element.
//
// Usage: node generate-languages-chart.mjs
// Requires: Node 18+ (built-in fetch). GITHUB_TOKEN env var is optional but
// recommended to avoid the unauthenticated API rate limit (60 req/h).

import { writeFileSync } from "node:fs";

const OWNER = process.env.LANG_CHART_OWNER || "50bvd";
const TOKEN = process.env.GITHUB_TOKEN || process.env.METRICS_TOKEN || "";
const API = "https://api.github.com";
const OUTPUT_FILE = process.env.LANG_CHART_OUTPUT || "languages-chart.svg";
const OUTPUT_FILE_LIGHT = OUTPUT_FILE.replace(/\.svg$/, "-light.svg");
// Languages shown individually; the rest are grouped under "Other".
const MAX_LANGS = Number(process.env.LANG_CHART_MAX || 8);

const HEADERS = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": `${OWNER}-languages-chart`,
  ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
};

// Extension -> language. Only programming languages are listed; anything
// not listed (markup, styles, data, config, images, binaries...) is skipped.
const EXT_LANG = {
  ".js": "JavaScript", ".mjs": "JavaScript", ".cjs": "JavaScript", ".jsx": "JavaScript",
  ".ts": "TypeScript", ".tsx": "TypeScript",
  ".ps1": "PowerShell", ".psm1": "PowerShell", ".psd1": "PowerShell",
  ".py": "Python",
  ".rb": "Ruby",
  ".cs": "C#",
  ".pl": "Perl", ".pm": "Perl",
  ".sh": "Shell", ".bash": "Shell", ".zsh": "Shell",
  ".bat": "Batchfile", ".cmd": "Batchfile",
  ".sql": "SQL",
  ".go": "Go",
  ".rs": "Rust",
  ".java": "Java",
  ".c": "C", ".h": "C",
  ".cpp": "C++", ".cc": "C++", ".hpp": "C++",
  ".php": "PHP",
  ".lua": "Lua",
};

// Directories to ignore entirely (dependencies / build artifacts, not your
// own written code).
const SKIP_DIR_RE = /(^|\/)(node_modules|vendor|dist|build|bin|obj|packages|\.git)(\/|$)/i;

// Minified bundles are generated, not written by hand.
const SKIP_FILE_RE = /\.min\.js$/i;

// Based on GitHub linguist colors, adjusted where they clash or lack
// contrast on a dark background.
const COLORS = {
  JavaScript: "#f1e05a",
  TypeScript: "#3178c6",
  PowerShell: "#4fc3f7",
  Shell: "#89e051",
  Ruby: "#f85149",
  Python: "#a371f7",
  "C#": "#178600",
  Batchfile: "#C1F12E",
  Perl: "#0298c3",
  SQL: "#e38c00",
  Go: "#00ADD8",
  Rust: "#dea584",
  Java: "#b07219",
  C: "#555555",
  "C++": "#f34b7d",
  PHP: "#4F5D95",
  Lua: "#6e7bff",
};
const OTHER_COLOR = "#8b949e";
const FALLBACK_COLOR = "#959da5";

const THEMES = {
  dark: { bg: "#0d1117", border: "#30363d", title: "#e6edf3", text: "#c9d1d9", muted: "#8b949e", track: "#21262d" },
  light: { bg: "#ffffff", border: "#d0d7de", title: "#1f2328", text: "#1f2328", muted: "#656d76", track: "#eaeef2" },
};

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

function topLanguages(stats) {
  const sorted = Object.entries(stats).sort((a, b) => b[1] - a[1]);
  if (sorted.length <= MAX_LANGS) return sorted;
  const top = sorted.slice(0, MAX_LANGS - 1);
  const other = sorted.slice(MAX_LANGS - 1).reduce((sum, [, bytes]) => sum + bytes, 0);
  return [...top, ["Other", other]];
}

function renderSVG(stats, total, theme = "dark") {
  const t = THEMES[theme];
  const langs = topLanguages(stats);
  const colorOf = (name) => (name === "Other" ? OTHER_COLOR : COLORS[name] || FALLBACK_COLOR);

  const width = 480;
  const padding = 24;
  const barY = 58;
  const barHeight = 10;
  const colCount = 2;
  const rowHeight = 26;
  const legendY = barY + barHeight + 30;
  const rows = Math.ceil(langs.length / colCount);
  const height = legendY + (rows - 1) * rowHeight + padding + 4;
  const barWidth = width - padding * 2;

  // Segments are drawn inside a rounded clip path so the bar has smooth
  // ends; a 2px gap separates each segment.
  let segments = "";
  let x = padding;
  langs.forEach(([name, bytes], i) => {
    let w = (bytes / total) * barWidth;
    if (i === langs.length - 1) w = padding + barWidth - x;
    const gap = i < langs.length - 1 ? 2 : 0;
    segments += `<rect x="${x.toFixed(2)}" y="${barY}" width="${Math.max(w - gap, 0).toFixed(2)}" height="${barHeight}" fill="${colorOf(name)}" />`;
    x += w;
  });

  const colWidth = barWidth / colCount;
  let legend = "";
  langs.forEach(([name, bytes], i) => {
    const pct = ((bytes / total) * 100).toFixed(1);
    const lx = padding + (i % colCount) * colWidth;
    const ly = legendY + Math.floor(i / colCount) * rowHeight;
    legend += `
    <circle cx="${(lx + 5).toFixed(1)}" cy="${ly}" r="5" fill="${colorOf(name)}" />
    <text x="${(lx + 18).toFixed(1)}" y="${ly + 4}" font-size="13" fill="${t.text}">${escapeXML(name)} <tspan fill="${t.muted}">${pct}%</tspan></text>`;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans',Helvetica,Arial,sans-serif">
  <defs>
    <clipPath id="bar"><rect x="${padding}" y="${barY}" width="${barWidth}" height="${barHeight}" rx="${barHeight / 2}" /></clipPath>
  </defs>
  <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="10" fill="${t.bg}" stroke="${t.border}" />
  <text x="${padding}" y="36" font-size="15" font-weight="600" fill="${t.title}">Most used languages</text>
  <rect x="${padding}" y="${barY}" width="${barWidth}" height="${barHeight}" rx="${barHeight / 2}" fill="${t.track}" />
  <g clip-path="url(#bar)">${segments}</g>
  <g>${legend}
  </g>
</svg>
`;
}

export function renderSVGForTest(stats, total, theme) {
  return renderSVG(stats, total, theme);
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
      if (SKIP_FILE_RE.test(entry.path)) continue;
      const lang = classify(entry.path);
      if (!lang) continue;
      totals[lang] = (totals[lang] || 0) + (entry.size || 0);
      seen.add(lang);
    }
    console.error(`  ${repo.name}: ${[...seen].join(", ") || "(no programming languages)"}`);
  }

  const total = Object.values(totals).reduce((a, b) => a + b, 0);
  if (total === 0) {
    throw new Error("No languages collected — aborting to avoid committing an empty chart");
  }

  writeFileSync(OUTPUT_FILE, renderSVG(totals, total, "dark"));
  writeFileSync(OUTPUT_FILE_LIGHT, renderSVG(totals, total, "light"));
  console.error(`Wrote ${OUTPUT_FILE} and ${OUTPUT_FILE_LIGHT} — ${Object.keys(totals).length} languages, ${total} bytes total`);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
