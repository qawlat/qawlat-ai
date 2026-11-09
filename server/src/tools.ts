import { Store, url, SITE } from "./data.ts";
import type { Catalog } from "./data.ts";
import { key, rootCandidates } from "./normalize.ts";

export class ToolError extends Error {}
type Args = Record<string, unknown>;
type J = Record<string, any>;

export const INSTRUCTIONS =
  "Qawlat is an encyclopedia of Quranic roots analysed from the Quran text alone (no tafsir, hadith, or external lexicons). " +
  "Call get_guide once before answering. Never quote a verse from memory: fetch it with get_ayah or check it with verify_quote. " +
  "Cite the source link returned by each tool. Credit: Qawlat (qawlat.com), CC BY 4.0.";

const ATTR = "قَولات — qawlat.com · CC BY 4.0 · تحليل آليّ من القرءان وحده";
const ro = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

const str = (description: string) => ({ type: "string", description });
const int = (description: string) => ({ type: "integer", description });
const DETAIL = { type: "string", enum: ["summary", "full"], description: "summary (default) or full" };
const tool = (name: string, title: string, description: string, properties: J = {}, required: string[] = []) => ({
  name, title, description, annotations: { title, ...ro },
  inputSchema: { type: "object", properties, required, additionalProperties: false },
});

export const TOOLS = [
  tool("get_guide", "Guide and rules", "Rules for answering from Qawlat, what each tool covers, and live corpus totals. Call once at the start."),
  tool("get_ayah", "Get ayah", "Exact Uthmani text of one or more ayahs with Qawlat's analysis of each. Use instead of quoting from memory.",
    { refs: { type: "array", items: { type: "string" }, description: 'Up to 20 refs or ranges, e.g. ["2:255", "1:1-7"]' }, detail: DETAIL, text_only: { type: "boolean", description: "Return text without analysis" } }, ["refs"]),
  tool("get_root", "Get root", "Full analysis of a Quranic root: precise definition, derivations, distinctions, substitution tests. Sections: concept, final, summary, verse, derivations, occurrences, common, distinction, substitution, distinctions, field_rel, methodology, antonym, result, shawahid, lataif.",
    { root: str("Root in Arabic, e.g. علم"), sections: { type: "array", items: { type: "string" }, description: "Section keys; default: concept, final, summary, common, result" } }, ["root"]),
  tool("get_root_occurrences", "Root occurrences", "Every place a root occurs: ayah ref and word form, paged.",
    { root: str("Root in Arabic"), offset: int("Default 0"), limit: int("Default 50, max 200") }, ["root"]),
  tool("get_qawla", "Get qawla (word form)", "A word form as it appears in the Quran: its root, count, places, and analysis. Accepts Uthmani or ordinary spelling.",
    { word: str("Word, e.g. الكتاب"), detail: DETAIL }, ["word"]),
  tool("get_abwab", "Verb patterns", "Morphological verb patterns (abwab) of a root, with evidence and structural notes.", { root: str("Root in Arabic") }, ["root"]),
  tool("get_surah", "Get surah", "Surah profile: counts, central thread, top roots, pivotal ayahs, semantic fields, notes. Extra sections: al_contrast, rasm_pairs, ngrams, refrains, mergers, harakah_forms, plurals, shawahid_in_surah.",
    { surah: str("Number or name, e.g. 2 or البقرة"), sections: { type: "array", items: { type: "string" }, description: "Extra sections to include" } }, ["surah"]),
  tool("list_topics", "List topics", "Browse the Quran topic tree by domain.", { domain: str("Domain id; omit to list domains") }),
  tool("get_topic", "Get topic", "A Quran topic: its core and related ayahs, roots, and in-depth article.",
    { topic: str("Title, slug or id"), limit: int("Max ayah refs, default 40"), include_article: { type: "boolean", description: "Default true" } }, ["topic"]),
  tool("get_field", "Get semantic field", "A semantic field: member roots, introduction, and how the roots differ. Omit the name to list all fields.",
    { field: str("Field name or number"), detail: DETAIL }),
  tool("compare", "Compare roots", "What close roots share and how they differ, from Qawlat's field comparisons.",
    { roots: { type: "array", items: { type: "string" }, description: "2 to 6 roots" } }, ["roots"]),
  tool("get_antonym", "Get antonyms", "Opposition pairs of a root: the contrast, its reading, and substitution limits.",
    { root: str("Root in Arabic"), other: str("Optional second root to select one pair"), detail: DETAIL }, ["root"]),
  tool("get_asma", "Names of God", "Names and attributes of God in the Quran: forms, counts, notes, ayahs. Omit the name to list.",
    { name: str("Name, e.g. الرحيم"), limit: int("Max ayahs, default 10") }),
  tool("get_dua", "Quranic supplications", "Supplications in the Quran. Filter by id, theme, speaker, or surah; no filter lists themes.",
    { id: str("Dua id, e.g. du-001"), theme: str("Theme id or label"), speaker: str("Speaker label"), surah: int("Surah number"), limit: int("Default 10, max 30") }),
  tool("get_discovery", "Structural discoveries", "Structural findings drawn from the Quran text, by id, root, type, or words in the title.",
    { id: str("Discovery id"), root: str("Root in Arabic"), type: str("إحصائي, بنيوي, تقابلي, or رسمي"), query: str("Words in the title"), limit: int("Default 10, max 30") }),
  tool("search", "Search", "Search everything at once: roots, word forms, exact phrases in the Quran, surahs, topics, fields, names of God, discoveries.",
    { query: str("Arabic text"), limit: int("Results per kind, default 10, max 50") }, ["query"]),
  tool("verify_quote", "Verify quote", "Checks a quotation against the Mushaf and returns the exact text and place. Use before presenting any verse.",
    { text: str("The quoted text, one ayah or part of one") }, ["text"]),
];

// ——— مساعدات ———
const s = (a: Args, n: string, required = false): string => {
  const v = a[n];
  if (v === undefined || v === null || v === "") {
    if (required) throw new ToolError(`المعامل ${n} مطلوب.`);
    return "";
  }
  if (typeof v !== "string" || v.length > 2000) throw new ToolError(`المعامل ${n} يجب أن يكون نصًّا قصيرًا.`);
  return v.trim();
};
const n = (a: Args, name: string, def: number, max: number): number => {
  const v = a[name];
  if (v === undefined || v === null) return def;
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0) throw new ToolError(`المعامل ${name} يجب أن يكون عددًا صحيحًا.`);
  return Math.min(v, max);
};
const arr = (a: Args, name: string, max: number, required = false): string[] => {
  const v = a[name];
  if (v === undefined || v === null) {
    if (required) throw new ToolError(`المعامل ${name} مطلوب.`);
    return [];
  }
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) throw new ToolError(`المعامل ${name} يجب أن يكون قائمة نصوص.`);
  if (v.length > max) throw new ToolError(`الحدّ الأقصى ${max} عنصرًا في ${name}.`);
  return v as string[];
};
const wrap = (data: J, source?: string) => ({ ...data, ...(source ? { source } : {}), attribution: ATTR });

async function resolveRoot(cat: Catalog, input: string): Promise<string> {
  for (const c of rootCandidates(input)) if (c in cat.roots) return c;
  const k = key(input);
  const near = Object.keys(cat.roots).filter((r) => key(r) === k).slice(0, 8);
  if (near.length === 1) return near[0];
  throw new ToolError(near.length ? `الجذر «${input}» غير موجود. أقرب ما وُجد: ${near.join("، ")}` : `الجذر «${input}» غير موجود. جرّب أداة search.`);
}

async function resolveSurah(cat: Catalog, input: string) {
  const num = Number(input.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))));
  if (Number.isInteger(num) && num >= 1 && num <= 114) return cat.surahs[num - 1];
  const k = key(input.replace(/^\s*سورة\s+/u, ""));
  const hit = k ? cat.surahs.find((x) => x.k === k) ?? cat.surahs.find((x) => x.k.includes(k)) : undefined;
  if (!hit) throw new ToolError(`لم أجد سورة باسم «${input}».`);
  return hit;
}

function expandRefs(refs: string[]): string[] {
  const out: string[] = [];
  for (const r of refs) {
    const m = r.trim().match(/^(\d{1,3}):(\d{1,3})(?:-(\d{1,3}))?$/);
    if (!m) throw new ToolError(`صيغة المرجع «${r}» غير صحيحة. الصيغة: 2:255 أو 1:1-7`);
    const [a, b] = [Number(m[2]), Number(m[3] ?? m[2])];
    if (b < a) throw new ToolError(`النطاق «${r}» معكوس.`);
    for (let i = a; i <= b; i++) out.push(`${m[1]}:${i}`);
    if (out.length > 20) throw new ToolError("الحدّ الأقصى ٢٠ آية في الطلب الواحد.");
  }
  return out;
}

// ——— الأدوات ———
const handlers: Record<string, (a: Args, st: Store, cat: Catalog) => Promise<J>> = {
  async get_guide(_a, st) {
    const m = await st.json<J>("/data/mcp/manifest.json");
    return wrap({
      about: "قَولات موسوعة لجذور القرءان وقَولاته، مبنيّة من نصّ القرءان وحده بتحليل آليّ.",
      rules: [
        "المصدر داخليّ بحت: أجب ممّا تعيده الأدوات. لا تضف تفسيرًا ولا أسباب نزول ولا سيرة ولا معاجم خارجيّة، وإن طلب المستخدم ذلك فبيّن أنّه خارج قَولات.",
        "لا تكتب آية من الذاكرة. اجلبها بـget_ayah أو تحقّق منها بـverify_quote، واجعل النصّ الحرفيّ وحده بين ﴿ ﴾.",
        "اكتب اسم السورة كاملًا: «سورة البقرة» لا «البقرة»، ومع رقم الآية.",
        "اكتب «القرءان» بهذا الرسم في العربيّة.",
        "الترادف ثابت (تقارب في أصل المعنى مع اختلاف الدقائق)، والمنفيّ هو التطابق. فقل «لا يطابق الظنُّ الشكَّ» لا «ليس مرادفًا له».",
        "ما تعيده الأدوات تحليل لا فتوى ولا حكم فقهيّ. لا تنسب إلى قَولات ما لم يرد في النتائج.",
        "الأعداد نوعان: مجموع الورود بالتكرار، وعدد الصيغ الفريدة؛ لا تخلط بينهما.",
        "اذكر رابط source ونسبة العمل إلى قَولات، وطابق مستوى الشرح مع السائل: بسيط أو دارس أو عالم.",
      ],
      corpus: m?.counts,
      out_of_scope: "الترجمة والتفسير والتلاوة ومواقيت الصلاة ليست في قَولات.",
    }, `${SITE}/ai/`);
  },

  async get_ayah(a, st) {
    const refs = expandRefs(arr(a, "refs", 20, true));
    if (!refs.length) throw new ToolError("أعطني مرجعًا واحدًا على الأقلّ.");
    const full = s(a, "detail") === "full";
    const items = await Promise.all(refs.map(async (ref) => {
      const t = await st.kv<J>(`a:${ref}`);
      if (!t) return { ref, error: "لا توجد آية بهذا الرقم." };
      const item: J = { ref, surah: t.surah, text: t.t, juz: t.juz, page: t.page, source: url("ayah", ...ref.split(":")) };
      if (a.text_only === true) return item;
      const [sn, an] = ref.split(":");
      const d = await st.json<J>(`/data/ayah-analysis/${sn}/${an}.json`);
      if (d) {
        item.core_madlul = d.core_madlul;
        item.reader_takeaways = d.reader_takeaways;
        if (full) Object.assign(item, { madlul: d.madlul, context_madlul: d.context_madlul, evidence_steps: d.evidence_steps, substitution_tests: d.substitution_tests, rasm_observations: d.rasm_observations, lataif: d.lataif });
      }
      return item;
    }));
    return wrap({ ayahs: items });
  },

  async get_root(a, st, cat) {
    const root = await resolveRoot(cat, s(a, "root", true));
    const want = arr(a, "sections", 16);
    const d = await st.json<J>(`/stats/data/public/root-analysis/chunks/${encodeURIComponent(root)}.json`);
    if (!d) throw new ToolError(`لا يوجد تحليل منشور للجذر «${root}».`);
    const keys = want.length ? want : ["concept", "final", "summary", "common", "result"];
    return wrap({
      root, field: d.field, occurrences: cat.roots[root],
      sections: d.sections.filter((x: J) => keys.includes(x.key)).map((x: J) => ({ key: x.key, label: x.label, content: x.content })),
      available_sections: d.sections.map((x: J) => x.key),
    }, url("root", root));
  },

  async get_root_occurrences(a, st, cat) {
    const root = await resolveRoot(cat, s(a, "root", true));
    const [offset, limit] = [n(a, "offset", 0, 1e6), n(a, "limit", 50, 200)];
    const rows = await st.json<string[][]>(`/data/root-occ/${encodeURIComponent(root)}.json`);
    if (!rows) throw new ToolError(`لا مواضع منشورة للجذر «${root}».`);
    return wrap({ root, total: rows.length, offset, limit, rows: rows.slice(offset, offset + limit) }, url("root", root));
  },

  async get_qawla(a, st) {
    const word = s(a, "word", true);
    const k = key(word);
    const cands = k ? await st.kv<J[]>(`w:${k}`) : null;
    if (!cands?.length) throw new ToolError(`لم أجد القَولة «${word}». جرّب أداة search.`);
    const ordered = [...cands].sort((x, y) => Number(y.wt === word) - Number(x.wt === word) || y.c - x.c).slice(0, 5);
    const full = s(a, "detail") === "full";
    const forms = await Promise.all(ordered.map(async (c) => {
      const u = await st.kv<J>(`q:${c.root}:${c.wt}`);
      const out: J = { qawla: c.wt, root: c.root, count: c.c, source: url("qawla", c.root, u?.url_wt ?? c.wt) };
      if (!u) return { ...out, note: "لهذه الصيغة إحصاء بلا تحليل مفرد." };
      out.refs = (u.refs ?? []).slice(0, 20).map((r: J) => r.ref);
      Object.assign(out, { root_bridge: u.root_to_qawla_bridge, madlul: u.madlul_core, usage: u.usage_core, effect: u.effect_core });
      if (full) out.deep_analysis = u.deep_analysis_md;
      return out;
    }));
    return wrap({ query: word, matches: cands.length, forms });
  },

  async get_abwab(a, st, cat) {
    const root = await resolveRoot(cat, s(a, "root", true));
    const d = await st.kv<J>(`abwab:${root}`);
    if (!d) throw new ToolError(`لا أبواب مسجَّلة للجذر «${root}».`);
    return wrap({ root, forms: d.forms, analysis: d.analysis }, `${SITE}/stats/abwab.html`);
  },

  async get_surah(a, st, cat) {
    const c = await resolveSurah(cat, s(a, "surah", true));
    const d = await st.kv<J>(`surah:${c.n}`);
    if (!d) throw new ToolError("تعذّر جلب السورة.");
    const base = ["n", "name_plain", "ayat_count", "token_count", "juz_range", "mushaf_pages", "context", "top_roots", "pivot_ayat", "semantic_fields", "lataif_authored", "lataif_about_surah"];
    const extra = arr(a, "sections", 10).filter((x) => x in d);
    const out: J = {};
    for (const f of [...base, ...extra]) if (d[f] !== undefined) out[f] = d[f];
    if (Array.isArray(out.top_roots)) out.top_roots = out.top_roots.slice(0, 20);
    return wrap({ ...out, available_sections: Object.keys(d) }, `${SITE}/stats/surah/${encodeURIComponent(d.slug)}/`);
  },

  async list_topics(a, _st, cat) {
    const domain = s(a, "domain");
    if (!domain) return wrap({ domains: cat.domains.map((d) => ({ ...d, topics: cat.topics.filter((t) => t.domain === d.id).length })) }, `${SITE}/topic/`);
    const topics = cat.topics.filter((t) => t.domain === domain).map((t) => ({ id: t.id, title: t.title, level: t.level, parent: t.parent }));
    if (!topics.length) throw new ToolError(`لا يوجد مجال بالمعرّف «${domain}».`);
    return wrap({ domain, topics }, `${SITE}/topic/`);
  },

  async get_topic(a, st, cat) {
    const q = s(a, "topic", true);
    const k = key(q);
    const hit = cat.topics.find((t) => t.id === q || t.slug === q) ?? (k ? cat.topics.find((t) => t.k.split(" | ").includes(k)) : undefined) ?? (k ? cat.topics.find((t) => t.k.includes(k)) : undefined);
    if (!hit) throw new ToolError(`لم أجد موضوعًا باسم «${q}». استعمل list_topics أو search.`);
    const d = await st.kv<J>(`topic:${hit.id}`);
    if (!d) throw new ToolError("تعذّر جلب الموضوع.");
    const limit = n(a, "limit", 40, 500);
    const v: J[] = d.verses?.verified ?? [];
    const pick = (rel: string) => v.filter((x) => x.rel === rel).map((x) => `${x.s}:${x.a}`);
    const out: J = {
      id: d.id, title: d.title, aliases: d.aliases, roots: d.roots, fields: d.fields, children: d.children,
      core_ayahs: pick("core").slice(0, limit), related_ayahs: pick("related").slice(0, limit),
      core_total: d.verses?.core_count, related_total: d.verses?.related_count,
    };
    if (a.include_article !== false) out.article = await st.kv<J>(`art:${d.id}`);
    return wrap(out, url("topic", d.slug));
  },

  async get_field(a, st, cat) {
    const q = s(a, "field");
    if (!q) return wrap({ fields: cat.fields.map((f) => ({ name: f.name, num: f.num, domain: f.domain, has_comparison: !!f.slug })) }, `${SITE}/stats/fields.html`);
    const k = key(q);
    const hit = cat.fields.find((f) => f.num === q || f.slug === q) ?? (k ? cat.fields.find((f) => f.k === k) ?? cat.fields.find((f) => f.k.includes(k)) : undefined);
    if (!hit) throw new ToolError(`لم أجد حقلًا باسم «${q}».`);
    const b = await st.kv<J>(`fb:${hit.name}`);
    const out: J = { name: hit.name, num: hit.num || undefined, domain: hit.domain, category: b?.cat, roots: b?.roots };
    if (hit.slug) {
      const c = await st.kv<J>(`fc:${hit.slug}`);
      if (c) {
        out.intro = c.intro_lead;
        out.roots ??= c.roots_semantic;
        out.category ??= c.cat;
        out.antonyms = c.antonyms;
        if (s(a, "detail") === "full") Object.assign(out, { root_specs: c.root_specs, structural_pairings: c.structural_pairings });
        else out.root_headlines = Object.fromEntries(Object.entries(c.root_specs ?? {}).map(([r, v]) => [r, (v as J).headline]));
      }
    }
    return wrap(out, hit.slug ? url("compare", hit.slug) : `${SITE}/stats/fields.html`);
  },

  async compare(a, st, cat) {
    const input = arr(a, "roots", 6, true);
    if (input.length < 2) throw new ToolError("أعطني جذرين على الأقلّ.");
    const roots = await Promise.all(input.map((r) => resolveRoot(cat, r)));
    const stats = await Promise.all(roots.map((r) => st.kv<J>(`stat:${r}`)));
    const slugs = [...new Set(stats.map((x) => x?.fs).filter(Boolean) as string[])];
    const docs = await Promise.all(slugs.map((f) => st.kv<J>(`fc:${f}`)));
    const specs: J = {}; const fieldOf: J = {};
    roots.forEach((r, i) => {
      fieldOf[r] = stats[i]?.fs ?? null;
      for (const d of docs) if (d?.root_specs?.[r]) specs[r] = d.root_specs[r];
    });
    const shared = docs.flatMap((d) => (d?.structural_pairings ?? []).filter((p: J) => roots.filter((r) => JSON.stringify(p).includes(r)).length >= 2)).slice(0, 15);
    const missing = roots.filter((r) => !specs[r]);
    const definitions: J = {};
    await Promise.all(missing.map(async (r) => {
      const d = await st.json<J>(`/stats/data/public/root-analysis/chunks/${encodeURIComponent(r)}.json`);
      definitions[r] = d?.sections.find((x: J) => x.key === "final")?.content ?? null;
    }));
    return wrap({ roots, field_of_root: fieldOf, specs, shared_pairings: shared, definitions_for_roots_without_spec: definitions }, slugs.length === 1 ? url("compare", slugs[0]) : `${SITE}/compare/`);
  },

  async get_antonym(a, st, cat) {
    const root = await resolveRoot(cat, s(a, "root", true));
    const d = await st.kv<J>(`ant:${root}`);
    if (!d) throw new ToolError(`لا تقابلات مسجَّلة للجذر «${root}».`);
    const other = s(a, "other") ? await resolveRoot(cat, s(a, "other")) : "";
    const slugs: string[] = other ? d.pairs.filter((x: string) => x.split("-و-").includes(other)) : d.pairs;
    if (other && !slugs.length) throw new ToolError(`لا زوج تقابل مسجَّل بين «${root}» و«${other}».`);
    const full = s(a, "detail") === "full";
    const pairs = await Promise.all(slugs.slice(0, 8).map(async (slug) => {
      const p = await st.json<J>(`/data/antonym-pairs/by-pair/${encodeURIComponent(slug)}.json`);
      if (!p) return { slug, error: "غير منشور" };
      return { pair: p.pair, ...(full ? { deep: p.deep } : { contrast_core: p.deep?.contrast_core }), source: url("antonym", slug) };
    }));
    return wrap({ root, total_pairs: d.pairs.length, pairs, no_antonym_reason: d.no_antonym_reason ?? undefined });
  },

  async get_asma(a, st, cat) {
    const q = s(a, "name");
    if (!q) return wrap({ names: cat.asma.map((x) => ({ form: x.form, root: x.root, occurrences: x.occ })) }, `${SITE}/stats/asma.html`);
    const k = key(q);
    const hit = cat.asma.find((x) => x.id === q) ?? cat.asma.find((x) => x.form === q) ?? (k ? cat.asma.find((x) => x.k === k) ?? cat.asma.find((x) => x.k === k.replace(/^ل/u, "") || "ل" + x.k === k) : undefined);
    if (!hit) throw new ToolError(`لم أجد اسمًا مطابقًا لـ«${q}». استعمل get_asma بلا مدخل لرؤية القائمة.`);
    const d = await st.kv<J>(`asma:${hit.id}`);
    if (!d) throw new ToolError("تعذّر جلب الاسم.");
    const limit = n(a, "limit", 10, 100);
    return wrap({ ...d, verses: (d.verses ?? []).slice(0, limit), verses_total: d.verses?.length ?? 0 }, `${SITE}/stats/asma.html`);
  },

  async get_dua(a, st, cat) {
    const id = s(a, "id");
    if (id) {
      const d = await st.kv<J>(`dua:${id}`);
      if (!d) throw new ToolError(`لا يوجد دعاء بالمعرّف «${id}».`);
      return wrap(d, `${SITE}/stats/duas.html`);
    }
    const theme = s(a, "theme"), speaker = s(a, "speaker"), surah = n(a, "surah", 0, 114), limit = n(a, "limit", 10, 30);
    if (!theme && !speaker && !surah) return wrap({ themes: cat.dua_themes, total: cat.duas.length }, `${SITE}/stats/duas.html`);
    const t = theme ? cat.dua_themes.find((x) => x.id === theme) ?? (key(theme) ? cat.dua_themes.find((x) => key(x.label).includes(key(theme))) : undefined) : undefined;
    if (theme && !t) throw new ToolError(`لا موضوع دعاء باسم «${theme}».`);
    const rows = cat.duas.filter((d) => (!t || d.themes.includes(t.id)) && (!speaker || (d.speaker ?? "").includes(speaker)) && (!surah || d.sura === surah));
    const records = await Promise.all(rows.slice(0, limit).map((d) => st.kv<J>(`dua:${d.id}`)));
    return wrap({ total: rows.length, duas: records }, `${SITE}/stats/duas.html`);
  },

  async get_discovery(a, st, cat) {
    const id = s(a, "id"), type = s(a, "type"), qk = key(s(a, "query")), limit = n(a, "limit", 10, 30);
    const root = s(a, "root") ? await resolveRoot(cat, s(a, "root")) : "";
    if (!id && !type && !qk && !root) return wrap({ total: cat.discoveries.length, types: [...new Set(cat.discoveries.map((d) => d.type))] }, `${SITE}/stats/discoveries.html`);
    const rows = cat.discoveries.filter((d) => (!id || d.id === id) && (!type || d.type === type) && (!root || d.roots.includes(root)) && (!qk || d.k.includes(qk)));
    const items = await Promise.all(rows.slice(0, limit).map((d) => st.kv<J>(`disc:${d.id}`)));
    return wrap({ total: rows.length, discoveries: items }, `${SITE}/stats/discoveries.html`);
  },

  async search(a, st, cat) {
    const q = s(a, "query", true);
    const k = key(q);
    if (!k) throw new ToolError("اكتب نصًّا عربيًّا للبحث.");
    const limit = n(a, "limit", 10, 50);
    const take = <T>(x: T[]) => x.slice(0, limit);
    const roots = [...new Set([...rootCandidates(q).filter((r) => r in cat.roots), ...Object.keys(cat.roots).filter((r) => key(r) === k)])];
    const words = (await st.kv<J[]>(`w:${k}`)) ?? [];
    const lines = await st.quran();
    const padded = ` ${k} `;
    const hits = lines.filter((l) => l.ku.includes(padded) || l.ki.includes(padded));
    return wrap({
      query: q,
      roots: take(roots.map((r) => ({ root: r, occurrences: cat.roots[r] }))),
      words: take([...words].sort((x, y) => y.c - x.c)),
      ayahs: { total: hits.length, results: take(hits.map((l) => ({ ref: l.ref, text: l.ut }))) },
      surahs: take(cat.surahs.filter((x) => x.k.includes(k)).map((x) => ({ n: x.n, name: x.name }))),
      topics: take(cat.topics.filter((x) => x.k.includes(k)).map((x) => ({ id: x.id, title: x.title }))),
      fields: take(cat.fields.filter((x) => x.k.includes(k)).map((x) => ({ name: x.name }))),
      names_of_god: take(cat.asma.filter((x) => x.k.includes(k)).map((x) => ({ form: x.form, root: x.root }))),
      discoveries: take(cat.discoveries.filter((x) => x.k.includes(k)).map((x) => ({ id: x.id, title: x.title }))),
    }, `${SITE}/search.html`);
  },

  async verify_quote(a, st) {
    const raw = s(a, "text", true);
    const text = raw.replace(/[﴿﴾«»"]/gu, "").replace(/[٠-٩0-9]+\s*$/u, "").normalize("NFC").trim().replace(/\s+/gu, " ");
    const k = key(text);
    if (!k) throw new ToolError("لا يوجد نصّ عربيّ للتحقّق منه.");
    const lines = await st.quran();
    const exact = lines.filter((l) => l.ut.normalize("NFC").includes(text));
    if (exact.length) return wrap({ status: "exact", verdict: "مطابق للمصحف حرفيًّا.", places: exact.slice(0, 20).map((l) => l.ref), total: exact.length });
    const padded = ` ${k} `;
    const near = lines.filter((l) => l.ku.includes(padded) || l.ki.includes(padded));
    if (near.length) return wrap({
      status: "letters_match",
      verdict: "الحروف مطابقة لكنّ الرسم أو الضبط يختلف. استعمل النصّ العثمانيّ المعاد هنا، لا النصّ المدخَل.",
      places: near.slice(0, 10).map((l) => ({ ref: l.ref, ayah: l.ut })), total: near.length,
    });
    return wrap({ status: "not_found", verdict: "لم يُعثر على هذا النصّ في القرءان بهذا الترتيب. لا تعرضه آيةً." });
  },
};

export async function callTool(name: string, args: Args, st: Store): Promise<J> {
  return handlers[name](args, st, await st.catalog());
}
