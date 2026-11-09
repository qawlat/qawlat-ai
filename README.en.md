# Qawlat for AI assistants

A public [MCP](https://modelcontextprotocol.io) server and plugin for Claude and Codex that bring the [Qawlat encyclopedia](https://qawlat.com) into your assistant: exact Quran text, analysis of roots and word forms, surahs, topics, semantic fields, opposites, names of God, supplications, structural findings, and verification of any quotation. The analysis is built from the Quran text alone, with no tafsir or external lexicons.

**Free, no account, read-only.** [العربيّة](README.md) · [Install guide](https://qawlat.com/ai/)

## Install

Server URL: `https://qawlat.com/mcp`

| Client | How |
|---|---|
| Claude (web and desktop) | Settings → Connectors → Add custom connector, then paste the URL |
| Claude Code (full plugin) | `/plugin marketplace add qawlat/qawlat-ai`, then `/plugin install qawlat@qawlat` |
| Claude Code (tools only) | `claude mcp add --transport http qawlat https://qawlat.com/mcp` |
| Codex | `codex mcp add qawlat --url https://qawlat.com/mcp` |

## Tools

`get_guide` · `get_ayah` · `get_root` · `get_root_occurrences` · `get_qawla` · `get_abwab` · `get_surah` · `list_topics` · `get_topic` · `get_field` · `compare` · `get_antonym` · `get_asma` · `get_dua` · `get_discovery` · `search` · `verify_quote`

## Privacy and license

Queries are not stored and no account is needed: [privacy policy](https://qawlat.com/privacy.html). Code is MIT. Data is [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); please credit Qawlat.

Feedback and bugs: [Issues](https://github.com/qawlat/qawlat-ai/issues).
