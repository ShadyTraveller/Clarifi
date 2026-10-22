// Deterministic catalog matcher — shared by the auto-estimate agent route
// (app/api/agents/estimate-auto) and the Billdr-style sectioned estimate
// generator (app/lib/section-templates.ts).
//
// Moved verbatim on 2026-10-21 from app/api/agents/estimate-auto/route.ts so
// both flows use ONE matcher. Behaviour is unchanged: keyword overlap
// (IDF-weighted) between a line label + job text and each candidate's
// name/brand. No network calls, no API keys, no cost. The matcher may only
// return ids from the provided candidate list — never invented products.
// Anything below the confidence threshold returns null so the office picks.

export interface CatalogMaterial {
  id: string;
  name: string;
  brand: string | null;
  public_price_cents: number;
  retailer: string | null;
  source_url: string | null;
  unit: string;
  notes: string | null;
}

export interface PickResult {
  material_id: string | null;
  quantity: number;
}

const MATCH_STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'for', 'to', 'of', 'on', 'in', 'with',
  'is', 'are', 'was', 'were', 'be', 'been', 'it', 'its', 'this', 'that',
  'i', 'we', 'you', 'he', 'she', 'they', 'my', 'our', 'your', 'his', 'her',
  'their', 'me', 'us', 'him', 'them', 'at', 'by', 'from', 'as',
  'how', 'much', 'need', 'needs', 'needed', 'want', 'wants', 'wanted',
  'please', 'hi', 'hello', 'thanks', 'thank', 'just', 'like', 'new',
]);
const MATCH_GENERIC = new Set(['set', 'kit', 'pack', 'pair']);
const MATCH_CONCEPTS: Array<{ concept: string[]; triggers: string[] }> = [
  {
    concept: ['security'],
    triggers: [
      'explosion-proof', 'explosionproof', 'shatterproof',
      'shatter-proof', 'safety', 'protective', '8mil', '12mil',
    ],
  },
  { concept: ['squeegee'], triggers: ['squeegee', 'squeegees'] },
];
const MATCH_THRESHOLD = 6.0;

function matchStem(w: string): string {
  for (const suf of ['ing', 'ies', 'es', 'ed', 's']) {
    if (w.length > suf.length + 2 && w.endsWith(suf)) {
      return suf === 'ies' ? w.slice(0, -3) + 'y' : w.slice(0, -suf.length);
    }
  }
  return w;
}

function matchTokens(text: string): string[] {
  const words = text.toLowerCase().match(/[a-z0-9]+/g) || [];
  return words.map(matchStem).filter(w => !MATCH_STOPWORDS.has(w) && w.length > 1);
}

function matchCandidateTokens(c: CatalogMaterial): Set<string> {
  const toks = new Set(matchTokens(`${c.name} ${c.brand || ''}`));
  for (const { concept, triggers } of MATCH_CONCEPTS) {
    for (const trig of triggers) {
      const trigToks = matchTokens(trig);
      if (trigToks.length > 0 && trigToks.every(t => toks.has(t))) {
        concept.forEach(t => toks.add(t));
        break;
      }
    }
  }
  return toks;
}

export function pickMaterial(opts: {
  jobText: string;
  lineLabel: string;
  templateQty: number;
  candidates: CatalogMaterial[];
}): PickResult | null {
  const n = opts.candidates.length;
  if (n === 0) return null;
  const labelToks = matchTokens(opts.lineLabel);
  const jobToks = matchTokens(opts.jobText);
  const toksets = opts.candidates.map(matchCandidateTokens);
  const df = new Map<string, number>();
  for (const toks of toksets) {
    for (const t of toks) df.set(t, (df.get(t) || 0) + 1);
  }
  const idf = (t: string) => Math.log(n / (1 + (df.get(t) || 0))) + 1;
  const scored = opts.candidates.map((c, i) => {
    const toks = toksets[i];
    let s = 0;
    for (const t of new Set(labelToks)) {
      if (toks.has(t)) s += (MATCH_GENERIC.has(t) ? 1 : 2) * idf(t);
    }
    for (const t of new Set(jobToks)) {
      if (toks.has(t)) s += 0.5 * idf(t);
    }
    return { s, c };
  });
  scored.sort((a, b) => b.s - a.s || a.c.public_price_cents - b.c.public_price_cents);
  if (scored[0].s < MATCH_THRESHOLD) return null;
  return { material_id: scored[0].c.id, quantity: opts.templateQty };
}
