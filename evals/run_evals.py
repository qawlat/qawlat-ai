#!/usr/bin/env python3
"""قياس أثر حزمة قَولات: كلّ سؤالٍ يُشغَّل مرّتين بـ`claude -p` ويُصحَّح بفحوصٍ حتميّة.

  with_plugin  الحزمة كاملة (المهارة + الأوامر + خادم MCP على qawlat.com/mcp)
  baseline     النموذج وحده: بلا حزمة ولا MCP

كلا التشغيلين في مجلّدٍ فارغ، بلا أدوات ويب ولا ملفّات، وبإعدادات المشروع وحدها، فلا يتسرّب
CLAUDE.md أو مهارات المستخدم. للعزل التامّ شغّله بـ`--config-dir` مجلّدِ إعدادٍ مستقلّ سُجّل فيه
الدخول مرّة (`CLAUDE_CONFIG_DIR=<dir> claude` ثمّ /login).

  python3 evals/run_evals.py --claude "$(which claude)" --config-dir ~/.claude-evals
  python3 evals/run_evals.py --only fake-quote-china --configs with_plugin
  python3 evals/run_evals.py --grade-only evals/results/<run>   # إعادة التصحيح بلا تشغيل
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PLUGIN = ROOT / "plugin"
EVALS = Path(__file__).resolve().parent / "evals.json"
MCP_URL = "https://qawlat.com/mcp"
DENY = ["Bash", "Read", "Write", "Edit", "Glob", "Grep", "WebFetch", "WebSearch", "Agent", "Task", "NotebookEdit"]


# ── التشغيل ──────────────────────────────────────────────────────────────────
def run_one(claude: str, prompt: str, config: str, model: str, config_dir: str | None, timeout: int) -> list[dict]:
    with tempfile.TemporaryDirectory(prefix="qawlat-eval-") as work:
        mcp = {"mcpServers": {"qawlat": {"type": "http", "url": MCP_URL}}} if config == "with_plugin" else {"mcpServers": {}}
        mcp_file = Path(work) / "mcp.json"
        mcp_file.write_text(json.dumps(mcp))
        cmd = [
            claude, "-p", prompt,
            "--model", model,
            "--output-format", "stream-json", "--verbose",
            "--no-session-persistence",
            "--setting-sources", "project",
            "--strict-mcp-config", "--mcp-config", str(mcp_file),
            "--disallowedTools", *DENY,
        ]
        if config == "with_plugin":
            cmd += ["--plugin-dir", str(PLUGIN), "--allowedTools", "mcp__qawlat__*"]
        env = dict(os.environ)
        if config_dir:
            env["CLAUDE_CONFIG_DIR"] = os.path.expanduser(config_dir)
        proc = subprocess.run(cmd, cwd=work, env=env, capture_output=True, text=True, timeout=timeout)
        events = []
        for line in proc.stdout.splitlines():
            try:
                events.append(json.loads(line))
            except json.JSONDecodeError:
                continue
        if not events:
            raise RuntimeError(f"لا مخرَج من claude ({config}): {proc.stderr.strip()[:300] or proc.stdout.strip()[:300]}")
        return events


# ── التصحيح ──────────────────────────────────────────────────────────────────
def transcript(events: list[dict]) -> tuple[list[str], str]:
    """أسماء الأدوات المستدعاة (بلا بادئة mcp__x__) ونصّ الجواب كلّه."""
    tools, texts, final = [], [], ""
    for ev in events:
        if ev.get("type") == "assistant":
            for block in (ev.get("message") or {}).get("content") or []:
                if block.get("type") == "tool_use":
                    tools.append(block.get("name", "").split("__")[-1])
                elif block.get("type") == "text":
                    texts.append(block.get("text", ""))
        elif ev.get("type") == "result":
            final = ev.get("result") or ""
    return tools, final or "\n".join(texts)


def grade(checks: list[dict], tools: list[str], text: str) -> list[dict]:
    out = []
    for c in checks:
        kind = c["kind"]
        if kind == "tool_any":
            ok = any(t in tools for t in c["tools"])
        elif kind == "tool_count":
            ok = tools.count(c["tool"]) >= c["min"]
        elif kind == "must":
            ok = re.search(c["pattern"], text, re.S) is not None
        elif kind == "must_not":
            ok = re.search(c["pattern"], text, re.S) is None
        else:
            raise ValueError(f"نوع فحصٍ مجهول: {kind}")
        out.append({**c, "pass": ok})
    return out


# ── التقرير ──────────────────────────────────────────────────────────────────
def summarize(results: dict, evals: list[dict], model: str) -> str:
    configs = sorted({cfg for r in results.values() for cfg in r})
    lines = [f"# نتائج القياس ({dt.date.today().isoformat()}، النموذج {model})", ""]
    # baseline بلا أدوات يسقط فحوص الأدوات بنيويًّا؛ فالعمود الثاني يعدّ فحوص نصّ الجواب وحدها —
    # المقارنة العادلة لما يقرؤه المستخدم.
    lines += ["| الإعداد | كلّ الفحوص | فحوص نصّ الجواب وحدها |", "|---|---|---|"]
    pct = lambda p, n: f"{p}/{n} ({round(100 * p / n) if n else 0}٪)"
    for cfg in configs:
        allc = [c for r in results.values() if cfg in r for c in r[cfg]["checks"]]
        textc = [c for c in allc if c["kind"] in ("must", "must_not")]
        lines.append(f"| {cfg} | {pct(sum(c['pass'] for c in allc), len(allc))} | "
                     f"{pct(sum(c['pass'] for c in textc), len(textc))} |")
    lines += ["", "| السؤال | الصنف | " + " | ".join(configs) + " |", "|---|---|" + "---|" * len(configs)]
    for e in evals:
        r = results.get(e["id"])
        if not r:
            continue
        cells = [f"{sum(c['pass'] for c in r[cfg]['checks'])}/{len(r[cfg]['checks'])}" if cfg in r else "—" for cfg in configs]
        lines.append(f"| {e['id']} | {e['category']} | " + " | ".join(cells) + " |")
    lines += ["", "## الفحوص الساقطة", ""]
    for e in evals:
        for cfg, r in (results.get(e["id"]) or {}).items():
            for c in r["checks"]:
                if not c["pass"]:
                    lines.append(f"- {e['id']} ({cfg}): {c['kind']} — {c['why']}")
    return "\n".join(lines) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--claude", default="claude")
    ap.add_argument("--config-dir", help="مجلّد إعدادٍ مستقلّ (CLAUDE_CONFIG_DIR) سُجّل فيه الدخول")
    ap.add_argument("--model", default="sonnet")
    ap.add_argument("--configs", default="with_plugin,baseline")
    ap.add_argument("--only", help="معرّفات أسئلةٍ مفصولة بفواصل")
    ap.add_argument("--timeout", type=int, default=600)
    ap.add_argument("--grade-only", help="مجلّد تشغيلٍ سابق: أعد التصحيح من transcripts/ بلا تشغيل")
    args = ap.parse_args()

    evals = json.loads(EVALS.read_text(encoding="utf-8"))["evals"]
    if args.only:
        wanted = set(args.only.split(","))
        evals = [e for e in evals if e["id"] in wanted]
        if missing := wanted - {e["id"] for e in evals}:
            sys.exit(f"معرّفات مجهولة: {', '.join(sorted(missing))}")
    configs = args.configs.split(",")

    run_dir = Path(args.grade_only) if args.grade_only else (
        Path(__file__).resolve().parent / "results" / dt.datetime.now().strftime("%Y-%m-%d-%H%M"))
    tdir = run_dir / "transcripts"
    tdir.mkdir(parents=True, exist_ok=True)

    results: dict[str, dict] = {}
    for e in evals:
        for cfg in configs:
            tf = tdir / f"{e['id']}.{cfg}.jsonl"
            if args.grade_only:
                if not tf.exists():
                    continue
                events = [json.loads(l) for l in tf.read_text(encoding="utf-8").splitlines() if l.strip()]
            else:
                print(f"• {e['id']} [{cfg}] …", flush=True)
                events = run_one(args.claude, e["prompt"], cfg, args.model, args.config_dir, args.timeout)
                tf.write_text("\n".join(json.dumps(ev, ensure_ascii=False) for ev in events) + "\n", encoding="utf-8")
            tools, text = transcript(events)
            results.setdefault(e["id"], {})[cfg] = {"tools": tools, "checks": grade(e["checks"], tools, text)}

    if not results:
        sys.exit("لا نتائج — لا تشغيل ولا نصوص محفوظة")
    (run_dir / "results.json").write_text(json.dumps(results, ensure_ascii=False, indent=1), encoding="utf-8")
    summary = summarize(results, evals, args.model)
    (run_dir / "summary.md").write_text(summary, encoding="utf-8")
    print(summary)
    return 0


if __name__ == "__main__":
    sys.exit(main())
