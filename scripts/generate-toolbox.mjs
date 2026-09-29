#!/usr/bin/env node
// Generates the "Toolbox" icon rows shown in the README (toolbox-*.svg).
//
// Icons are embedded directly in the SVGs so the README does not depend on
// a third-party icon service. Sources: Devicon (MIT) and Simple Icons (CC0).
//
// Usage:
//   npm i --no-save devicon simple-icons
//   node scripts/generate-toolbox.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const simpleIcons = require("simple-icons");
const deviconDir = require.resolve("devicon/package.json").replace(/package\.json$/, "icons");

// Each icon: { name, devicon } | { name, simple } | { name, text, color } |
// { name, svg } (inline markup drawn on a 24x24 grid).
// `fill` recolors monochrome logos that would be invisible on a dark tile;
// `size` enlarges wide wordmark logos.
const ROWS = {
  systems: [
    { name: "Linux", simple: "siLinux", fill: "#ffffff" },
    { name: "Windows", devicon: "windows11/windows11-original" },
    { name: "VMware", simple: "siVmware", fill: "#ffffff", size: 44 },
    { name: "Docker", devicon: "docker/docker-original" },
    // Oracle's capsule symbol; Devicon only ships a heavy wordmark.
    { name: "Oracle", svg: '<rect x="1.5" y="6" width="21" height="12" rx="6" fill="none" stroke="#c74634" stroke-width="3"/>' },
  ],
  languages: [
    { name: "Bash", devicon: "bash/bash-plain", fill: "#ffffff" },
    { name: "PowerShell", devicon: "powershell/powershell-original" },
    { name: "JavaScript", devicon: "javascript/javascript-original" },
    { name: "TypeScript", devicon: "typescript/typescript-original" },
    { name: "C", devicon: "c/c-original" },
    { name: "C#", devicon: "csharp/csharp-original" },
    { name: "Ruby", devicon: "ruby/ruby-original" },
    { name: "Perl", devicon: "perl/perl-original" },
    { name: "Assembly", text: "ASM", color: "#6e9eff" },
  ],
  tooling: [
    { name: "Git", devicon: "git/git-original" },
    { name: "GitHub", devicon: "github/github-original", fill: "#ffffff" },
    { name: "GitHub Actions", devicon: "githubactions/githubactions-original" },
  ],
};

const TILE = 52;
const ICON = 30;
const GAP = 14;
const LABEL_H = 22;
const TILE_BG = "#161b22";
const TILE_BORDER = "#30363d";
const LABEL_COLOR = "#8b949e";

function escapeXML(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Returns { viewBox, body } for an icon, with ids prefixed to avoid clashes
// between icons that share gradient ids.
function loadIcon(icon, prefix) {
  if (icon.svg) return { viewBox: "0 0 24 24", body: icon.svg };
  if (icon.simple) {
    const si = simpleIcons[icon.simple];
    const fill = icon.fill || `#${si.hex}`;
    return { viewBox: "0 0 24 24", body: `<path fill="${fill}" d="${si.path}"/>` };
  }
  const raw = readFileSync(`${deviconDir}/${icon.devicon}.svg`, "utf8");
  const viewBox = raw.match(/viewBox="([^"]+)"/)[1];
  let body = raw.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
  body = body
    .replace(/id="([^"]+)"/g, `id="${prefix}-$1"`)
    .replace(/url\(#([^)]+)\)/g, `url(#${prefix}-$1)`)
    .replace(/(xlink:)?href="#([^"]+)"/g, `$1href="#${prefix}-$2"`);
  if (icon.fill) {
    body = body.replace(/fill="[^"]*"/g, `fill="${icon.fill}"`);
    body = `<g fill="${icon.fill}">${body}</g>`;
  }
  return { viewBox, body };
}

function renderRow(key, icons) {
  const width = icons.length * TILE + (icons.length - 1) * GAP + 2;
  const height = TILE + LABEL_H + 2;
  let tiles = "";
  icons.forEach((icon, i) => {
    const x = 1 + i * (TILE + GAP);
    const cx = x + TILE / 2;
    const size = icon.size || ICON;
    const off = (TILE - size) / 2;
    let inner;
    if (icon.text) {
      inner = `<text x="${cx}" y="${1 + TILE / 2 + 5}" font-size="15" font-weight="700" fill="${icon.color}" text-anchor="middle" font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace">${escapeXML(icon.text)}</text>`;
    } else {
      const { viewBox, body } = loadIcon(icon, `${key}${i}`);
      inner = `<svg x="${x + off}" y="${1 + off}" width="${size}" height="${size}" viewBox="${viewBox}">${body}</svg>`;
    }
    tiles += `
  <g>
    <title>${escapeXML(icon.name)}</title>
    <rect x="${x}" y="1" width="${TILE}" height="${TILE}" rx="12" fill="${TILE_BG}" stroke="${TILE_BORDER}" />
    ${inner}
    <text x="${cx}" y="${TILE + LABEL_H - 4}" font-size="11" fill="${LABEL_COLOR}" text-anchor="middle">${escapeXML(icon.name.replace("GitHub Actions", "Actions"))}</text>
  </g>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans',Helvetica,Arial,sans-serif">${tiles}
</svg>
`;
}

for (const [key, icons] of Object.entries(ROWS)) {
  const file = `toolbox-${key}.svg`;
  writeFileSync(file, renderRow(key, icons));
  console.error(`Wrote ${file} (${icons.length} icons)`);
}
