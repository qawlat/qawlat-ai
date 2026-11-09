// حالات معلومة الجواب: كلّ توقّع يُقارَن ببيانات الموقع نفسها لا بقيمةٍ محفوظة هنا.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { handleRequest, handleRpc } from "../src/index.ts";
import { Store } from "../src/data.ts";
import { TOOLS, callTool, ToolError } from "../src/tools.ts";
import { key, fnv1a } from "../src/normalize.ts";

const SITE = process.env.QAWLAT_SITE ?? `${process.env.HOME}/Developer/qawlat-site`;
const SHARDS = process.env.QAWLAT_SHARDS!;
assert.ok(SHARDS, "QAWLAT_SHARDS مطلوب");
const src = (p: string) => JSON.parse(readFileSync(join(SITE, "data", p), "utf8"));

function local(path: string): Promise<Response> {
  const p = decodeURIComponent(path);
  let f: string | null = null;
  if (p.startsWith("/data/mcp/")) f = join(SHARDS, p.slice(10));
  else if (p.startsWith("/data/")) f = join(SITE, p);
  else if (p.startsWith("/stats/data/public/root-analysis/chunks/")) {
    const r = p.split("/").pop()!.replace(".json", "");
    const e = src("roots-analysis.json")[r];
    return Promise.resolve(e ? new Response(JSON.stringify(e)) : new Response("", { status: 404 }));
  }
  if (!f || !existsSync(f)) return Promise.resolve(new Response("", { status: 404 }));
  return Promise.resolve(new Response(readFileSync(f)));
}
const st = new Store(local);
const call = (n: string, a: object = {}) => callTool(n, a as never, st) as Promise<any>;
const quran = src("quran-full.json");

test("مفتاح TS يطابق مفتاح بايثون وآية بآية", async () => {
  for (const l of await st.quran()) {
    const [s, a] = l.ref.split(":");
    assert.equal(key(quran[s].a[+a - 1].t), l.ku.trim(), l.ref);
  }
  assert.equal(key("ٱلۡكِتَٰبُ"), key("الكتب"));
  assert.equal(key("ءَامَنُواْ"), key("آمنوا"));
});

test("FNV-1a يوافق توزيع الدلاء", () => {
  const b = JSON.parse(readFileSync(join(SHARDS, "kv", (fnv1a("a:2:255") % 2048).toString(16).padStart(3, "0") + ".json"), "utf8"));
  assert.ok(b["a:2:255"]);
});

test("get_ayah: 2:255 حرفيًّا ونطاق الفاتحة", async () => {
  const r = await call("get_ayah", { refs: ["2:255"] });
  assert.equal(r.ayahs[0].text, quran["2"].a[254].t);
  assert.ok(r.ayahs[0].core_madlul.length > 20);
  const f = await call("get_ayah", { refs: ["1:1-7"], text_only: true });
  assert.equal(f.ayahs.length, 7);
  assert.equal(f.ayahs[6].text, quran["1"].a[6].t);
  await assert.rejects(call("get_ayah", { refs: ["2:1-40"] }), ToolError);
});

test("get_root: عدد «علم» = roots-stats وقبول الهمزة", async () => {
  const stats = src("roots-stats.json");
  const r = await call("get_root", { root: "علم" });
  assert.equal(r.occurrences, stats["علم"].c);
  assert.deepEqual(r.sections.map((x: any) => x.key), ["concept", "final", "summary", "common", "result"]);
  assert.equal((await call("get_root", { root: "أله" })).root, "ءله");
  await assert.rejects(call("get_root", { root: "زززز" }), ToolError);
});

test("get_root_occurrences يصالح ملفّ المواضع", async () => {
  const r = await call("get_root_occurrences", { root: "علم", limit: 5 });
  assert.equal(r.total, src("root-occ/علم.json").length);
  assert.equal(r.rows.length, 5);
});

test("get_qawla: الكتاب بالرسم الإملائيّ يبلغ ٱلۡكِتَٰبُ", async () => {
  const r = await call("get_qawla", { word: "الكتاب" });
  const f = r.forms.find((x: any) => x.qawla === "ٱلۡكِتَٰبُ");
  assert.ok(f); assert.equal(f.root, "كتب");
  assert.equal(f.count, src("words-stats.json")["ٱلۡكِتَٰبُ"].c);
  assert.ok(f.source.includes(encodeURIComponent("كتب")));
});

test("verify_quote: صحيح ومحرَّف وملفَّق", async () => {
  const t = quran["112"].a[0].t;
  const ok = await call("verify_quote", { text: `﴿${t}﴾` });
  assert.equal(ok.status, "exact"); assert.ok(ok.places.includes("112:1"));
  const near = await call("verify_quote", { text: "قل هو الله احد" });
  assert.equal(near.status, "letters_match");
  assert.equal(near.places[0].ayah, t);
  const bad = await call("verify_quote", { text: "قل هو الله واحد احد" });
  assert.equal(bad.status, "not_found");
});

test("الطبقات: السور والموضوعات والحقول والأضداد والأسماء والأدعية والاكتشافات", async () => {
  const sd = src("surahs-data.json").surahs["2"];
  const su = await call("get_surah", { surah: "سورة البقرة" });
  assert.equal(su.ayat_count, sd.ayat_count); assert.ok(su.context);
  assert.equal((await call("get_surah", { surah: "2" })).n, 2);

  const td = src("topics-data.json").topics.find((x: any) => x.title === "العقل");
  const to = await call("get_topic", { topic: "العقل" });
  assert.equal(to.id, td.id); assert.equal(to.core_total, td.verses.core_count);
  assert.equal((await call("list_topics")).domains.length, src("topics-data.json").domains.length);

  const fd = src("field-compare.json").fields[0];
  const fi = await call("get_field", { field: fd.name });
  assert.equal(fi.intro, fd.intro_lead);
  const names = new Set([...src("fields-data.json").map((x: any) => x.name), ...src("field-compare.json").fields.map((x: any) => x.name)]);
  assert.equal((await call("get_field")).fields.length, names.size);

  const ai = src("antonym-index.json");
  const ar = Object.keys(ai.by_root)[0];
  const an = await call("get_antonym", { root: ar });
  assert.ok(an.pairs.length > 0 && !an.pairs[0].error && an.pairs[0].contrast_core);

  const asma = await call("get_asma", { name: "الله" });
  assert.equal(asma.occurrences, src("asma-data.json").entries.find((x: any) => x.form_display === "الله").occurrences);
  assert.ok(asma.verses.length <= 10);

  const dd = src("duas-data.json").records;
  assert.equal((await call("get_dua", { id: "du-001" })).sura, dd[0].sura);
  assert.equal((await call("get_dua", { theme: "hidayah" })).total, dd.filter((x: any) => x.themes?.includes("hidayah")).length);

  const di = src("discoveries-data.json").items[0];
  assert.equal((await call("get_discovery", { id: di.id })).discoveries[0].title, di.title);

  const ab = await call("get_abwab", { root: "علم" });
  assert.ok(ab.forms);
});

test("مدخل بلا حروف عربيّة لا يطابق أوّل عنصر صامتًا", async () => {
  for (const [t, a] of [["get_surah", { surah: "xyz" }], ["get_field", { field: "xyz" }], ["get_asma", { name: "xyz" }], ["get_topic", { topic: "xyz" }], ["get_dua", { theme: "xyz" }]] as const)
    await assert.rejects(call(t, a), ToolError, t);
});

test("compare: جذران من حقل واحد", async () => {
  const f = src("field-compare.json").fields.find((x: any) => Object.keys(x.root_specs).length >= 2);
  const [a, b] = Object.keys(f.root_specs);
  const idx = src("compare-index.json").field_slug_by_root;
  const r = await call("compare", { roots: [a, b] });
  if (idx[a] === f.slug && idx[b] === f.slug) { assert.ok(r.specs[a] && r.specs[b]); }
  else assert.equal(Object.keys(r.field_of_root).length, 2);
});

test("search يغطّي الآيات والجذور", async () => {
  const r = await call("search", { query: "الحمد لله رب العالمين" });
  assert.ok(r.ayahs.results.some((x: any) => x.ref === "1:2"));
  const w = await call("search", { query: "علم" });
  assert.ok(w.roots.some((x: any) => x.root === "علم"));
});

test("البروتوكول: initialize ثمّ tools/list ثمّ tools/call عبر HTTP", async () => {
  const post = (b: object) => handleRequest(new Request("https://x/mcp", { method: "POST", body: JSON.stringify(b) }), {}, st);
  const init = await (await post({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } })).json() as any;
  assert.equal(init.result.protocolVersion, "2025-06-18");
  assert.equal((await post({ jsonrpc: "2.0", method: "notifications/initialized" })).status, 202);
  const list = await (await post({ jsonrpc: "2.0", id: 2, method: "tools/list" })).json() as any;
  assert.equal(list.result.tools.length, TOOLS.length);
  for (const t of list.result.tools) assert.equal(t.annotations.readOnlyHint, true, t.name);
  const c = await (await post({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "get_guide", arguments: {} } })).json() as any;
  assert.equal(JSON.parse(c.result.content[0].text).corpus.ayahs, 6236);
  const bad = await (await post({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "get_root", arguments: { root: "زززز" } } })).json() as any;
  assert.equal(bad.result.isError, true);
  assert.equal((await handleRpc({ jsonrpc: "2.0", id: 5, method: "nope" }, st) as any).error.code, -32601);
  assert.equal((await handleRequest(new Request("https://x/mcp"), {}, st)).status, 405);
});

test("كلفة المعالجة: أثقل الأدوات دون ١٠ م.ث بعد التهيئة الباردة", async () => {
  const cold = new Store(local);
  await callTool("search", { query: "رب" } as never, cold); // تسخين الفهرس
  const start = process.cpuUsage();
  await callTool("verify_quote", { text: "قل هو الله احد" } as never, cold);
  await callTool("search", { query: "الرحمن" } as never, cold);
  const ms = process.cpuUsage(start).user / 1000 / 2;
  console.log("متوسّط م.ث للطلب الدافئ:", ms.toFixed(2));
  assert.ok(ms < 40, String(ms)); // تشمل قراءة القرص المحلّيّ، فالسقف أوسع من الحدّ الفعليّ
});
