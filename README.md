# قَولات في مساعدك الذكيّ

خادم [MCP](https://modelcontextprotocol.io) عامّ وحزمة لـClaude وCodex، يضعان [موسوعة قَولات](https://qawlat.com) داخل مساعدك: نصّ الآيات حرفيًّا، وتحليل الجذور والقَولات، والسور والموضوعات والحقول والأضداد وأسماء الله والأدعية والاكتشافات البنيويّة، والتحقّق من أيّ اقتباس. التحليل مبنيّ من نصّ القرءان وحده، بلا تفسير ولا معاجم خارجيّة.

**مجّانيّ، بلا حساب، وللقراءة فقط.** [English](README.en.md) · [دليل التثبيت](https://qawlat.com/ai/)

## التثبيت

العنوان: `https://qawlat.com/mcp`

| البرنامج | الطريقة |
|---|---|
| Claude (المتصفّح وسطح المكتب) | Settings ⟵ Connectors ⟵ Add custom connector، ثمّ الصق العنوان |
| Claude Code (الحزمة الكاملة) | `/plugin marketplace add qawlat/qawlat-ai` ثمّ `/plugin install qawlat@qawlat` |
| Claude Code (الأدوات وحدها) | `claude mcp add --transport http qawlat https://qawlat.com/mcp` |
| Codex | `codex mcp add qawlat --url https://qawlat.com/mcp` |

## الأدوات

`get_guide` · `get_ayah` · `get_root` · `get_root_occurrences` · `get_qawla` · `get_abwab` · `get_surah` · `list_topics` · `get_topic` · `get_field` · `compare` · `get_antonym` · `get_asma` · `get_dua` · `get_discovery` · `search` · `verify_quote`

الأوامر في الحزمة: `/qawlat:ayah` · `/qawlat:root` · `/qawlat:qawla` · `/qawlat:search` · `/qawlat:compare` · `/qawlat:verify`

## البنية

- `server/`: عاملٌ على Cloudflare Workers، عديم الحالة، يقرأ شظايا منشورة على qawlat.com فتبقى إجاباته بحداثة الموقع.
- `plugin/skills/qawlat/`: مهارة قواعد الإجابة، بمعيار Agent Skills.
- `plugin/commands/`: الأوامر المائلة.
- `manifest.source.json`: المصدر الواحد لملفّات تعريف المنصّات (`node scripts/gen_manifests.mjs`).

## الخصوصيّة والرخصة

لا تُحفظ الأسئلة ولا يُطلب حساب: [سياسة الخصوصيّة](https://qawlat.com/privacy.html). الشيفرة برخصة MIT، والبيانات برخصة [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) مع نسبة العمل إلى قَولات.

الملاحظات والأعطال: [Issues](https://github.com/qawlat/qawlat-ai/issues).
