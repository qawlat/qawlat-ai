#!/usr/bin/env node
// يولّد ملفّات تعريف المنصّات من manifest.source.json. --check يفشل عند أيّ انجراف.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
const m = JSON.parse(readFileSync("manifest.source.json", "utf8"));
const repo = `https://github.com/${m.owner}/qawlat-ai`;
const author = { name: "Qawlat", url: "https://qawlat.com" };
const files = {
  ".mcp.json": { mcpServers: { qawlat: { type: "http", url: m.mcpUrl } } },
  ".claude-plugin/plugin.json": {
    name: m.name, version: m.version, description: m.description, author, homepage: m.homepage,
    repository: repo, license: "MIT", keywords: m.keywords,
  },
  ".claude-plugin/marketplace.json": {
    name: m.owner, owner: { name: "Qawlat", url: "https://qawlat.com" },
    metadata: { description: m.description, version: m.version },
    plugins: [{ name: m.name, source: "./", description: m.description, version: m.version, category: "education", keywords: m.keywords }],
  },
  ".codex-plugin/plugin.json": {
    name: m.name, version: m.version, description: m.description, author, homepage: m.homepage,
    repository: repo, license: "MIT", keywords: m.keywords, skills: "./skills/", mcpServers: "./.mcp.json",
    interface: {
      displayName: m.displayName, shortDescription: m.description, longDescription: m.longDescription,
      developerName: "Qawlat", category: "Education", capabilities: ["Read"], websiteURL: m.homepage,
      privacyPolicyURL: m.privacy, defaultPrompt: m.defaultPrompt, brandColor: "#173A2F",
    },
  },
  "server.json": {
    $schema: "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
    name: `io.github.${m.owner}/${m.name}`, title: m.displayName, description: m.description.slice(0, 100),
    version: m.version, websiteUrl: m.homepage, repository: { url: repo, source: "github" },
    remotes: [{ type: "streamable-http", url: m.mcpUrl }],
  },
};
for (const p of m.defaultPrompt) if (p.length > 128) throw new Error(`defaultPrompt طويل: ${p}`);
let drift = 0;
for (const [path, obj] of Object.entries(files)) {
  const text = JSON.stringify(obj, null, 2) + "\n";
  if (process.argv.includes("--check")) {
    if (!existsSync(path) || readFileSync(path, "utf8") !== text) { console.error("انجراف:", path); drift++; }
  } else writeFileSync(path, text);
}
if (drift) process.exit(1);
console.log(process.argv.includes("--check") ? "لا انجراف" : `كُتب ${Object.keys(files).length} ملفّات`);
