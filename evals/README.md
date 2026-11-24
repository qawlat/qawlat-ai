# القياس

يقيس أثر حزمة قَولات: كلّ سؤالٍ في `evals.json` يُشغَّل مرّتين بـ`claude -p`، ويُصحَّح بفحوصٍ حتميّة بلا نموذجٍ حَكَم.

| الإعداد | ما يُحمَّل |
|---|---|
| `with_plugin` | الحزمة كاملة: المهارة والأوامر وخادم MCP (`qawlat.com/mcp`) |
| `baseline` | النموذج وحده |

كلاهما في مجلّدٍ فارغ، بلا أدوات ويب ولا ملفّات، وبإعدادات المشروع وحدها.

| نوع الفحص | المعنى |
|---|---|
| `tool_any` · `tool_count` | استُدعيت الأداة (من سجلّ التشغيل) |
| `must` · `must_not` | تعبيرٌ نمطيّ في نصّ الجواب |

التقرير يعرض نسبتين: كلّ الفحوص، وفحوص نصّ الجواب وحدها (العادلة، لأنّ `baseline` بلا أدوات أصلًا).

## التشغيل

```bash
CLAUDE_CONFIG_DIR=~/.claude-evals claude   # مرّةً واحدة: /login ثمّ خروج — إعدادٌ نظيف بلا CLAUDE.md ولا مهارات
python3 evals/run_evals.py --claude "$(which claude)" --config-dir ~/.claude-evals
python3 evals/run_evals.py --only fake-quote-china --configs with_plugin
python3 evals/run_evals.py --grade-only evals/results/<run>
```

النتائج في `results/<التاريخ>/`: `summary.md` و`results.json` ونصّ كلّ تشغيل في `transcripts/`.
