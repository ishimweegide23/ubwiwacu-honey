import { ApiError } from '../utils/apiError.js';
import { logger } from '../utils/logger.js';

// Rwanda's administrative hierarchy (province → district → sector → cell → village)
// from the MIT-licensed `rwanda-geo` dataset. Loaded once, on first use.
const LEVELS = ['province', 'district', 'sector', 'cell', 'village'];
const SEARCH_ORDER = { district: 0, sector: 1, cell: 2, village: 3, province: 4 };

let index = null; // { byCode: Map, children: Map, searchable: [] }
let loading = null;

const norm = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

async function load() {
  let geo;
  try {
    geo = await import('rwanda-geo');
  } catch {
    throw new ApiError(
      503,
      'Location data is not installed on the server. Run "npm install rwanda-geo" in the backend folder.',
    );
  }
  const lists = [
    geo.getAllProvinces({ language: 'en' }),
    geo.getAllDistricts(),
    geo.getAllSectors(),
    geo.getAllCells(),
    geo.getAllVillages(),
  ];
  const byCode = new Map();
  const children = new Map();
  lists.forEach((units, i) => {
    for (const u of units) {
      const unit = { code: u.code, name: u.name, level: LEVELS[i], parentCode: u.parentCode || null };
      byCode.set(u.code, unit);
      const key = unit.parentCode || 'ROOT';
      if (!children.has(key)) children.set(key, []);
      children.get(key).push(unit);
    }
  });
  for (const list of children.values()) list.sort((a, b) => a.name.localeCompare(b.name));

  // Each searchable unit keeps its own name and its whole path, both normalised.
  const searchable = [];
  for (const unit of byCode.values()) {
    const path = pathOf(byCode, unit.code);
    unit.path = path;
    searchable.push({ unit, name: norm(unit.name), hay: norm(path.map((p) => p.name).join(' ')) });
  }
  logger.info(`Location data loaded: ${byCode.size} administrative units`);
  return { byCode, children, searchable };
}

function pathOf(byCode, code) {
  const out = [];
  let cur = byCode.get(code);
  while (cur) {
    out.unshift(cur);
    cur = cur.parentCode ? byCode.get(cur.parentCode) : null;
  }
  return out;
}

async function getIndex() {
  if (index) return index;
  if (!loading) {
    loading = load()
      .then((i) => (index = i))
      .finally(() => {
        loading = null;
      });
  }
  return loading;
}

/** Public shape: names for every level plus a readable label. */
function describe(unit) {
  const out = { code: unit.code, name: unit.name, level: unit.level };
  for (const p of unit.path) out[p.level] = p.name;
  out.label = [...unit.path].reverse().map((p) => p.name).join(', ');
  return out;
}

/**
 * Live search by name (any level, several words allowed, e.g. "kimihurura gasabo")
 * or by official code (e.g. "RW-S-001").
 */
export async function search(q, { limit = 12, level } = {}) {
  const { byCode, searchable } = await getIndex();
  const query = norm(q);
  if (query.length < 2) return [];

  if (/^rw-?/i.test(query)) {
    const code = query.toUpperCase();
    return [...byCode.values()]
      .filter((u) => u.code.startsWith(code) && (!level || u.level === level))
      .slice(0, limit)
      .map(describe);
  }

  const tokens = query.split(/[\s,]+/).filter(Boolean);
  const first = tokens[0];
  const hits = [];
  for (const s of searchable) {
    if (level && s.unit.level !== level) continue;
    if (!tokens.every((t) => s.hay.includes(t))) continue;
    const score = s.name === query ? 4 : s.name.startsWith(first) ? 3 : s.name.includes(first) ? 2 : 1;
    hits.push({ s, score });
  }
  hits.sort(
    (a, b) =>
      b.score - a.score ||
      SEARCH_ORDER[a.s.unit.level] - SEARCH_ORDER[b.s.unit.level] ||
      a.s.unit.name.localeCompare(b.s.unit.name),
  );
  return hits.slice(0, limit).map((h) => describe(h.s.unit));
}

/** Children of a unit (provinces when no parent) for step-by-step pickers. */
export async function childrenOf(parentCode) {
  const { byCode, children } = await getIndex();
  if (parentCode && !byCode.has(parentCode)) throw ApiError.notFound('Unknown location code');
  return (children.get(parentCode || 'ROOT') || []).map((u) => ({ code: u.code, name: u.name, level: u.level }));
}

export async function getByCode(code) {
  const { byCode } = await getIndex();
  const unit = byCode.get(String(code || '').toUpperCase());
  if (!unit) throw ApiError.notFound('Unknown location code');
  return describe(unit);
}

/**
 * For orders: turn a village code into trusted names. Returns null when the
 * dataset is not installed, so checkout still works with typed names.
 */
export async function resolveVillage(code) {
  let idx;
  try {
    idx = await getIndex();
  } catch {
    return null;
  }
  const unit = idx.byCode.get(String(code).toUpperCase());
  if (!unit || unit.level !== 'village') {
    throw ApiError.unprocessable('Choose your village from the list', [
      { field: 'delivery_location_code', message: 'Choose your village from the list' },
    ]);
  }
  return describe(unit);
}
