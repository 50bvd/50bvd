#!/usr/bin/env node
// Generates an SVG chart showing ALL languages used across every public,
// non-fork repository owned by OWNER (no artificial display limit, unlike
// lowlighter/metrics' plugin_languages which caps at 8 entries).
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

// Official GitHub linguist colors. Extend this map if a new language
// appears and you want a specific color instead of the gray fallback.
const COLORS = {
  JavaScript: "#f1e05a",
  TypeScript: "#3178c6",
  PowerShell: "#012456",
  HTML: "#e34c26",
  CSS: "#663399",
  SCSS: "#c6538c",
  Shell: "#89e051",
  Ruby: "#701516",
  Python: "#3572A5",
  "C#": "#178600",
  Dockerfile: "#384d54",
  Batchfile: "#C1F12E",
  Perl: "#0298c3",
  C: "#555555",
  "C++": "#f34b7d",
  Go: "#00ADD8",
  Rust: "#dea584",
  Java: "#b07219",
  PHP: "#4F5D95",
  Vue: "#41b883",
  SQL: "#e38c00",
  Makefile: "#427819",
  Assembly: "#6E4C13",
  YAML: "#cb171e",
  XML: "#0060ac",
  JSON: "#292929",
  Markdown: "#083fa1",
  INI: "#d1dbe0",
  TOML: "#9c4221",
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
  // type=owner: only repos owned by the account (excludes orgs/collabs)
  while (true) {
    const batch = await fetchJSON(
      `${API}/users/${OWNER}/repos?per_page=100&page=${page}&type=owner`,
    );
    repos.push(...batch);
    if (batch.length < 100) break;
    page++;
  }
  // Keep archived repos (still real languages used), exclude forks (not
  // your own code).
  return repos.filter((r) => !r.fork);
}

async function getLanguages(repoName) {
  return fetchJSON(`${API}/repos/${OWNER}/${repoName}/languages`);
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
    // avoid sub-pixel rounding leaving a gap on the last segment
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
  <text x="${width - padding}" y="${height - 10}" font-size="10" font-style="italic" fill="#666" text-anchor="end">${sorted.length} languages · ${repoCount} repositories · ${(total / 1024).toFixed(1)} kB total · updated ${updated}</text>
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
    const langs = await getLanguages(repo.name);
    for (const [lang, bytes] of Object.entries(langs)) {
      totals[lang] = (totals[lang] || 0) + bytes;
    }
    console.error(`  ${repo.name}: ${Object.keys(langs).join(", ") || "(no code detected)"}`);
  }

  const total = Object.values(totals).reduce((a, b) => a + b, 0);
  if (total === 0) {
    throw new Error("No language data collected — aborting to avoid committing an empty chart");
  }

  const svg = renderSVG(totals, total, repos.length);
  writeFileSync(OUTPUT_FILE, svg);
  console.error(`Wrote ${OUTPUT_FILE} — ${Object.keys(totals).length} languages, ${total} bytes total`);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
