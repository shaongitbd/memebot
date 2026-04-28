import { log } from '../log.js';

// Encoding rules per https://memegen.link spec — order matters. The dash and
// underscore swaps must run first so they don't collide with the underscores
// introduced by the space replacement.
const ENCODE_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['-', '--'],
  ['_', '__'],
  [' ', '_'],
  ['?', '~q'],
  ['&', '~a'],
  ['%', '~p'],
  ['#', '~h'],
  ['/', '~s'],
  ['\\', '~b'],
  ['"', "''"],
  ['\n', '~n'],
  ['<', '~l'],
  ['>', '~g'],
];

export function encodeMemeText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '_';
  let out = trimmed;
  for (const [from, to] of ENCODE_PAIRS) {
    out = out.split(from).join(to);
  }
  return out;
}

export interface MemegenTemplate {
  id: string;
  name: string;
  lines: number;
  example: string[];
  source?: string;
}

const MEMEGEN_BASE = 'https://api.memegen.link';
const TEMPLATE_CACHE_MS = 6 * 60 * 60 * 1000;

let cachedTemplates: MemegenTemplate[] = [];
let cachedAt = 0;

interface RawTemplate {
  id?: string;
  name?: string;
  lines?: number;
  example?: { text?: string[] };
  source?: string;
}

export async function getTemplates(): Promise<MemegenTemplate[]> {
  const now = Date.now();
  if (cachedTemplates.length > 0 && now - cachedAt < TEMPLATE_CACHE_MS) {
    return cachedTemplates;
  }
  try {
    const res = await fetch(`${MEMEGEN_BASE}/templates`, {
      headers: { 'User-Agent': 'zorium-meme-bot/1.0' },
    });
    if (!res.ok) throw new Error(`memegen templates failed (${res.status})`);
    const json = (await res.json()) as RawTemplate[];
    cachedTemplates = json
      .filter((t): t is RawTemplate & { id: string } => typeof t.id === 'string')
      .map((t) => ({
        id: t.id.split('/').pop() ?? t.id,
        name: t.name ?? t.id,
        lines: t.lines ?? 2,
        example: t.example?.text ?? [],
        source: t.source,
      }));
    cachedAt = now;
    log.info({ count: cachedTemplates.length }, 'Loaded memegen templates');
  } catch (err) {
    log.warn({ err }, 'memegen templates fetch failed — keeping previous cache');
  }
  return cachedTemplates;
}

export async function findTemplate(query: string): Promise<MemegenTemplate | null> {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const resolved = ALIASES[q] ?? q;
  const list = await getTemplates();
  const exact = list.find((t) => t.id.toLowerCase() === resolved);
  if (exact) return exact;
  return (
    list.find(
      (t) => t.name.toLowerCase() === resolved || t.id.toLowerCase().startsWith(resolved),
    ) ?? null
  );
}

export async function searchTemplates(query: string, limit = 15): Promise<MemegenTemplate[]> {
  const list = await getTemplates();
  const q = query.trim().toLowerCase();
  if (!q) return list.slice(0, limit);
  return list
    .filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q),
    )
    .slice(0, limit);
}

export interface BuildMemeOptions {
  templateId: string;
  lines: string[];
  extension?: 'png' | 'jpg' | 'gif' | 'webp';
}

// Build a memegen.link image URL. Empty `lines` returns a blank-template
// preview; empty individual entries become "_" placeholders so the image still
// renders without that caption.
export function buildMemeUrl({ templateId, lines, extension = 'png' }: BuildMemeOptions): string {
  const segments = lines.length === 0
    ? ['_', '_']
    : lines.map((line) => encodeMemeText(line));
  return `${MEMEGEN_BASE}/images/${templateId}/${segments.join('/')}.${extension}`;
}

// Curated short-list shown by !memetemplates and used as the catalog the LLM
// picks from in !aimeme. IDs match memegen.link's canonical template IDs.
export interface CuratedTemplate {
  id: string;
  name: string;
  lines: 1 | 2;
  description: string;
}

// IDs verified against memegen.link's canonical template list. The handler
// validates against the live /templates response too, so a typo here surfaces
// as a "template not found" reply rather than a broken image embed.
export const CURATED: readonly CuratedTemplate[] = [
  { id: 'drake', name: 'Drake Hotline Bling', lines: 2, description: 'reject (top) / approve (bottom)' },
  { id: 'fine', name: 'This Is Fine', lines: 2, description: 'denial in a burning room' },
  { id: 'cmm', name: 'Change My Mind', lines: 1, description: 'sign on a table; provocative claim' },
  { id: 'fry', name: 'Futurama Fry', lines: 2, description: '"not sure if X — or Y"' },
  { id: 'rollsafe', name: 'Roll Safe', lines: 2, description: '"can\'t fail X if you don\'t Y"' },
  { id: 'success', name: 'Success Kid', lines: 2, description: 'small triumphant win' },
  { id: 'fwp', name: 'First World Problems', lines: 2, description: 'overprivileged complaint' },
  { id: 'facepalm', name: 'Picard Facepalm', lines: 2, description: 'embarrassment / disbelief' },
  { id: 'aag', name: 'Ancient Aliens', lines: 2, description: 'wild claim with conspiracy energy' },
  { id: 'doge', name: 'Doge', lines: 2, description: '"such X. very Y. wow."' },
  { id: 'buzz', name: 'Buzz Lightyear', lines: 2, description: '"X, X everywhere"' },
  { id: 'ebw', name: 'Expanding Brain', lines: 2, description: 'galaxy-brained progression of takes' },
  { id: 'mocking', name: 'Mocking SpongeBob', lines: 1, description: 'AlTeRnAtInG cAsE quote' },
  { id: 'philosoraptor', name: 'Philosoraptor', lines: 2, description: 'pseudo-deep question' },
  { id: 'spikachu', name: 'Surprised Pikachu', lines: 2, description: 'shock at predictable outcome' },
  { id: 'mordor', name: 'One Does Not Simply', lines: 2, description: '"one does not simply X"' },
  { id: 'yuno', name: 'Y U No Guy', lines: 2, description: 'frustrated demand: "Y U NO X"' },
  { id: 'wyac', name: 'Woman Yelling at Cat', lines: 2, description: 'angry accusation / smug reply' },
  { id: 'harold', name: 'Hide The Pain Harold', lines: 2, description: 'forced smile through suffering' },
  { id: 'stonks', name: 'Stonks', lines: 1, description: 'questionable financial decision' },
];

// Friendly-name aliases so users can type either the canonical memegen ID or
// the common name. Resolved by findTemplate before the live catalog lookup.
export const ALIASES: Readonly<Record<string, string>> = {
  change: 'cmm',
  brain: 'ebw',
  expanding: 'ebw',
  picard: 'facepalm',
  firstworld: 'fwp',
  spongebob: 'mocking',
  aliens: 'aag',
  pikachu: 'spikachu',
  surprised: 'spikachu',
  simply: 'mordor',
  pain: 'harold',
  yelling: 'wyac',
  cat: 'wyac',
};
