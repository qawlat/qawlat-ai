import { fnv1a } from "./normalize.ts";

export type Fetcher = (path: string) => Promise<Response>;
export const SITE = "https://qawlat.com";
const BUCKETS = 2048;
const TTL_MS = 10 * 60 * 1000;
const MAX_CACHED_BUCKETS = 12;

// القيم المحلولة وحدها تُحفظ بين الطلبات: وعود طلبٍ لا تُستعمل في طلبٍ آخر داخل Workers.
type Slot<T> = { at: number; value: T };

export interface QuranLine { ref: string; ut: string; ku: string; ki: string }
export interface Catalog {
  surahs: { n: number; name: string; slug: string; ayat: number; k: string }[];
  roots: Record<string, number>;
  domains: { id: string; title: string }[];
  topics: { id: string; slug: string; title: string; domain: string; parent: string | null; level: number; aliases: string[]; k: string }[];
  fields: { name: string; num: string; domain: string; slug: string | null; k: string }[];
  asma: { id: string; form: string; root: string; occ: number; k: string }[];
  dua_themes: { id: string; label: string }[];
  duas: { id: string; sura: number; a1: number; a2: number; themes: string[]; speaker: string | null }[];
  discoveries: { id: string; type: string; title: string; roots: string[]; k: string }[];
}

export class Store {
  private fetcher: Fetcher;
  private json_ = new Map<string, Slot<unknown>>();
  private lines?: Slot<QuranLine[]>;
  constructor(fetcher: Fetcher) { this.fetcher = fetcher; }

  private fresh<T>(s: Slot<T> | undefined): s is Slot<T> {
    return !!s && Date.now() - s.at < TTL_MS;
  }

  async json<T>(path: string): Promise<T | null> {
    const hit = this.json_.get(path) as Slot<T> | undefined;
    if (this.fresh(hit)) return hit.value;
    const res = await this.fetcher(path);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`upstream ${res.status}`);
    const value = (await res.json()) as T;
    if (this.json_.size >= MAX_CACHED_BUCKETS) {
      const oldest = this.json_.keys().next().value as string;
      if (oldest !== "/data/mcp/catalog.json") this.json_.delete(oldest);
    }
    this.json_.set(path, { at: Date.now(), value });
    return value;
  }

  async kv<T>(k: string): Promise<T | null> {
    const b = (fnv1a(k) % BUCKETS).toString(16).padStart(3, "0");
    const doc = await this.json<Record<string, T>>(`/data/mcp/kv/${b}.json`);
    return doc?.[k] ?? null;
  }

  async catalog(): Promise<Catalog> {
    const c = await this.json<Catalog>("/data/mcp/catalog.json");
    if (!c) throw new Error("catalog missing");
    return c;
  }

  async quran(): Promise<QuranLine[]> {
    if (this.fresh(this.lines)) return this.lines.value;
    const res = await this.fetcher("/data/mcp/quran.txt");
    if (!res.ok) throw new Error(`upstream ${res.status}`);
    const value = (await res.text()).split("\n").map((l) => {
      const [ref, ut, ku, ki] = l.split("\t");
      return { ref, ut, ku: ` ${ku} `, ki: ` ${ki} ` }; // مبطَّنان بمسافة لمطابقة حدود الكلمة بلا كلفة لكلّ بحث
    });
    this.lines = { at: Date.now(), value };
    return value;
  }
}

export const enc = (s: string) => encodeURIComponent(s);
export const url = (...parts: string[]) => `${SITE}/${parts.map(enc).join("/")}/`;
