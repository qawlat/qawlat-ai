// مفتاح مطابقة بلا تشكيل ولا ألف ولا همز — يطابق key() في scripts/mcp/build_mcp_shards.py حرفيًّا.
const LETTERS = new Set("بتثجحخدذرزسشصضطظعغفقكلمنهوي");
const MAP: Record<string, string> = { "ة": "ه", "ى": "ي", "ی": "ي", "ک": "ك", "ہ": "ه" };

export function key(text: string): string {
  let out = "";
  for (let ch of text) {
    ch = MAP[ch] ?? ch;
    if (LETTERS.has(ch)) out += ch;
    else if (/\s/u.test(ch) && out && !out.endsWith(" ")) out += " ";
  }
  return out.trim();
}

export function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (const b of new TextEncoder().encode(text)) {
    h = Math.imul(h ^ b, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// الجذور مكتوبة بهمزةٍ مفردة (ءله)، والمستخدم قد يكتب: أله · إله · آله.
export function rootCandidates(input: string): string[] {
  const clean = input.replace(/[\sً-ْٰ\-–.]/gu, "");
  return [...new Set([clean, clean.replace(/[أإآؤئٱ]/gu, "ء"), clean.replace(/ا/gu, "ء")])];
}
