/**
 * Daily shop shelves (v32). Independent of Threads, article generation and daily trivia.
 * Ranking facts are from Rakuten API; a future-trend prediction is never passed off as a fact.
 */
import { currentJstDay } from './daily.js';

const API = 'https://openapi.rakuten.co.jp/ichibaranking/api/IchibaItem/Ranking/20220601';
const AI_MODEL = '@cf/google/gemma-4-26b-a4b-it';
const MAX_TOPICS = 40;
const MAX_AGE_MS = 20 * 60 * 1000;
const RETRY_MS = 60 * 60 * 1000;
const DECLINE = /はちみつ|蜂蜜|ハニー|腕時計|ウォッチ|時計|福袋だけ|金券|商品券|ギフトカード|クーポン|引換券|ふるさと納税|アダルト|タバコ|電子タバコ|ビール|日本酒|焼酎|ワイン|ウイスキー|シャンパン/i;
const SEGMENTS = [
  { id: 'overall1', name: '総合', page: 1 },
  { id: 'overall2', name: '総合', page: 2 },
  { id: '20f', name: '20代女性', age: 20, sex: 1 },
  { id: '20m', name: '20代男性', age: 20, sex: 0 },
  { id: '30f', name: '30代女性', age: 30, sex: 1 },
  { id: '30m', name: '30代男性', age: 30, sex: 0 }
];
const secret = (value) => typeof value === 'string' ? value.trim().replace(/^("|')(.*)\1$/, '$2').trim() : '';
const normalized = value => String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value);
const priceOf = value => {
  const cleaned = normalized(value).replace(/[¥￥,円\s]/g, '');
  const parsed = Number(cleaned);
  return cleaned && Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
};
const cleanName = value => normalized(value)
  .replace(/^\s*(?:【[^】]{0,40}】|\[[^\]]{0,40}\]|\([^)]{0,35}\))\s*/g, '')
  .replace(/\s*(?:★|☆){2,}.*$/, '')
  .slice(0, 85).trim();
const trimUtf8 = (value, limit = 110) => {
  let out = '';
  for (const char of value) {
    if (new TextEncoder().encode(out + char).length > limit) break;
    out += char;
  }
  return out.trim();
};
const safeOrigin = value => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.pathname === '/' && !url.username && !url.password && !url.search && !url.hash ? url.origin : null;
  } catch { return null; }
};

export const canStartDailyPicksRefresh = (latest, japanHour) => Boolean(!latest.current && (!latest.day || japanHour >= 6));

export async function ensureDailyPicksTable(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS daily_shop_picks (
    day TEXT PRIMARY KEY, topics_json TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  )`).run();
}

export async function getLatestDailyPicks(env, { date = currentJstDay() } = {}) {
  if (!validDate(date) || !env.DB?.prepare) return { topics: [], day: null, updatedAt: null, current: false };
  await ensureDailyPicksTable(env);
  const row = await env.DB.prepare("SELECT day,topics_json,updated_at FROM daily_shop_picks WHERE day<=? AND status='published' ORDER BY day DESC LIMIT 1").bind(date).first();
  if (!row) return { topics: [], day: null, updatedAt: null, current: false };
  try {
    const topics = JSON.parse(row.topics_json);
    if (!Array.isArray(topics) || topics.length !== MAX_TOPICS || topics.some(t => !t || typeof t.name !== 'string' || typeof t.keyword !== 'string' || typeof t.reason !== 'string' || typeof t.basis !== 'string')) throw Error('bad daily snapshot');
    return { topics, day: row.day, updatedAt: row.updated_at, current: row.day === date };
  } catch {
    console.error('Daily shop picks snapshot is invalid');
    return { topics: [], day: null, updatedAt: null, current: false };
  }
}

function normalizeRankings(payload, segment) {
  if (payload?.error || payload?.errors) return [];
  const list = Array.isArray(payload?.Items) ? payload.Items : Array.isArray(payload?.items) ? payload.items : [];
  return list.map((wrapper, offset) => {
    const item = wrapper?.Item ?? wrapper?.item ?? wrapper;
    const title = cleanName(item?.itemName);
    const code = normalized(item?.itemCode);
    const rank = Number(item?.rank);
    const price = priceOf(item?.itemPrice);
    const genreId = normalized(item?.genreId);
    if (!title || title.length < 4 || DECLINE.test(title) || !Number.isInteger(rank) || rank < 1 || rank > 1000 || !price) return null;
    const keyword = trimUtf8(title.replace(/\s*[-|／｜].*$/, '').trim(), 105);
    if (!keyword || new TextEncoder().encode(keyword).byteLength > 128) return null;
    return { id: `${segment.id}:${offset}`, code: code || `${genreId}:${title.slice(0, 45)}`, title, keyword, rank, genreId, price, segment: segment.name, updatedAt: typeof payload.lastBuildDate === 'string' ? payload.lastBuildDate.slice(0, 50) : null };
  }).filter(Boolean);
}

export function selectDailyTopics(candidates, { aiIndices = [], date = currentJstDay(), fallbackTopics = [] } = {}) {
  const byId = new Map(candidates.map(c => [c.id, c]));
  const requested = Array.isArray(aiIndices) ? aiIndices.map(x => byId.get(String(x))).filter(Boolean) : [];
  const sorted = [...candidates].sort((a, b) => {
    const aScore = (1001-a.rank) + Math.min(60, Math.round(12000 / (a.price + 200))) + (a.segment === '総合' ? 10 : 0);
    const bScore = (1001-b.rank) + Math.min(60, Math.round(12000 / (b.price + 200))) + (b.segment === '総合' ? 10 : 0);
    return bScore-aScore || a.id.localeCompare(b.id);
  });
  const ordered = [...requested, ...sorted];
  const chosen = [];
  const codes = new Set(), titles = new Set(), genres = new Map();
  const add = (candidate, genreLimit) => {
    if (chosen.length >= MAX_TOPICS) return;
    const titleKey = candidate.title.replace(/[\s!！★☆・。、［］\[\]（）()]/g, '').slice(0, 30);
    if (codes.has(candidate.code) || titles.has(titleKey)) return;
    const genre = candidate.genreId || 'unknown';
    if ((genres.get(genre) || 0) >= genreLimit) return;
    codes.add(candidate.code); titles.add(titleKey);
    genres.set(genre, (genres.get(genre) || 0) + 1);
    chosen.push(candidate);
  };
  for (const limit of [2, 4, 40]) for (const candidate of ordered) add(candidate, limit);
  const topics = chosen.slice(0, MAX_TOPICS).map(candidate => ({
    name: candidate.title.length > 39 ? candidate.title.slice(0, 38) + '…' : candidate.title,
    keyword: candidate.keyword,
    basis: '楽天ランキング',
    reason: `楽天${candidate.segment}ランキング${candidate.rank}位の商品から選定。${candidate.price.toLocaleString('ja-JP')}円（取得時）`,
    // Internal grounding fields for inspecting trends; no fabricated popularity statistics.
    itemCode: candidate.code,
    genreId: candidate.genreId,
    rank: candidate.rank,
    segment: candidate.segment
  }));
  // Only fill missing entries with editorial themes; never label them as sales leaders.
  const starting = Array.isArray(fallbackTopics) ? fallbackTopics : [];
  const offset = Number(date.replaceAll('-', '')) % Math.max(1, starting.length);
  for (let i = 0; i < starting.length && topics.length < MAX_TOPICS; i++) {
    const candidate = starting[(offset + i) % starting.length];
    if (!candidate || !candidate.name || !candidate.keyword || topics.some(t => t.keyword === candidate.keyword)) continue;
    topics.push({ name: String(candidate.name).slice(0, 65), keyword: trimUtf8(String(candidate.keyword), 110), reason: 'ランキングで十分な候補が集まらなかったため維持した編集候補', basis: '編集候補' });
  }
  return topics;
}

function parseAIIds(value, validIds) {
  const raw = typeof value?.response === 'string' ? value.response : typeof value?.result?.response === 'string' ? value.result.response : '';
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return [];
  try {
    const data = JSON.parse(match[0]);
    if (!Array.isArray(data.ids)) return [];
    return [...new Set(data.ids.map(String))].filter(id => validIds.has(id)).slice(0, MAX_TOPICS);
  } catch { return []; }
}

export async function refreshDailyPicks(env, { date = currentJstDay(), origin = env.RAKUTEN_SITE_ORIGIN, fetcher = fetch, fallbackTopics = [] } = {}) {
  if (!validDate(date)) return { ok: false, reason: 'INVALID_DATE' };
  if (!env.DB?.prepare) return { ok: false, reason: 'DB_UNAVAILABLE' };
  const applicationId = secret(env.RAKUTEN_APP_ID), accessKey = secret(env.RAKUTEN_ACCESS_KEY);
  const affiliateId = secret(env.RAKUTEN_AFFILIATE_ID), allowedOrigin = safeOrigin(origin);
  if (!applicationId || !accessKey || !allowedOrigin) return { ok: false, reason: 'RANKING_SETTINGS_MISSING' };
  await ensureDailyPicksTable(env);
  const state = await env.DB.prepare('SELECT status,updated_at FROM daily_shop_picks WHERE day=?').bind(date).first();
  if (state?.status === 'published') return { ok: true, alreadyExists: true };
  const elapsed = state?.updated_at ? Date.now() - Date.parse(state.updated_at) : Number.POSITIVE_INFINITY;
  if (state?.status === 'generating' && elapsed < MAX_AGE_MS) return { ok: false, reason: 'BUSY' };
  if (state?.status === 'failed' && elapsed < RETRY_MS) return { ok: false, reason: 'RETRY_COOLDOWN' };
  const now = new Date().toISOString();
  const lock = await env.DB.prepare("INSERT INTO daily_shop_picks(day,topics_json,status,created_at,updated_at) VALUES(?,'[]','generating',?,?) ON CONFLICT(day) DO UPDATE SET status='generating',updated_at=excluded.updated_at WHERE status!='published' AND (status!='generating' OR updated_at<?) AND (status!='failed' OR updated_at<?)")
    .bind(date, now, now, new Date(Date.now()-MAX_AGE_MS).toISOString(), new Date(Date.now()-RETRY_MS).toISOString()).run();
  if (!lock.meta?.changes) return { ok: false, reason: 'BUSY' };
  try {
    const data = [];
    let limited = false;
    for (const segment of SEGMENTS) {
      if (limited) break;
      const params = new URLSearchParams({ format: 'json', formatVersion: '2', applicationId });
      if (affiliateId) params.set('affiliateId', affiliateId);
      if (segment.page) params.set('page', String(segment.page));
      if (segment.age) { params.set('age', String(segment.age)); params.set('sex', String(segment.sex)); }
      let response;
      try {
        response = await fetcher(`${API}?${params}`, { method: 'GET', headers: { Accept: 'application/json', accessKey, Origin: allowedOrigin, Referer: `${allowedOrigin}/` }, signal: AbortSignal.timeout(15000) });
      } catch { console.error('Daily shop ranking request failed', { segment: segment.id, kind: 'network' }); continue; }
      if (!response.ok) {
        console.error('Daily shop ranking API status', { segment: segment.id, status: response.status });
        if (response.status === 429 || response.status === 403) limited = true;
        continue;
      }
      try { data.push(...normalizeRankings(await response.json(), segment)); }
      catch { console.error('Daily shop ranking JSON invalid', { segment: segment.id }); }
    }
    if (data.length < 16) throw new Error('INSUFFICIENT_RANKING_DATA');
    let aiIndices = [];
    if (env.AI?.run) {
      try {
        const shortlist = [...data].sort((a, b) => a.rank-b.rank).slice(0, 115);
        const result = await env.AI.run(AI_MODEL, {
          messages: [
            {role:'system',content:'あなたは商品紹介サイトの選定担当です。与えられた楽天ランキングの商品候補だけを評価してください。ジャンルの多様性、楽天での順位、価格のバランスを重視し、宣伝文句や推測の売上を作らないでください。返答はJSONのみで {"ids":["id",...]} の形式。最大40件。異なるジャンルから選び、重複商品を選ばないでください。'},
            {role:'user',content:JSON.stringify(shortlist.map(c => ({ id:c.id, name:c.title.slice(0, 48), rank:c.rank, price:c.price, genreId:c.genreId, source:c.segment })))}
          ], max_completion_tokens:650, temperature:0.2, chat_template_kwargs:{enable_thinking:false}
        });
        aiIndices = parseAIIds(result, new Set(data.map(c => c.id)));
      } catch { console.error('Daily shop AI selection unavailable; deterministic fallback'); }
    }
    const topics = selectDailyTopics(data, { aiIndices, date, fallbackTopics });
    if (topics.length !== MAX_TOPICS) throw new Error('NOT_ENOUGH_UNIQUE_TOPICS');
    const changed = await env.DB.prepare("UPDATE daily_shop_picks SET topics_json=?,status='published',updated_at=? WHERE day=? AND status='generating'")
      .bind(JSON.stringify(topics), new Date().toISOString(), date).run();
    if (!changed.meta?.changes) throw new Error('DAILY_PICKS_PUBLISH_RACE');
    return { ok: true, date, count: topics.length, ranked: topics.filter(t => t.basis === '楽天ランキング').length, selectedByAI: aiIndices.length > 0 };
  } catch (error) {
    await env.DB.prepare("UPDATE daily_shop_picks SET status='failed',updated_at=? WHERE day=? AND status='generating'").bind(new Date().toISOString(), date).run();
    console.error('Daily shop shelf refresh failed', { reason: error instanceof Error ? error.message.replace(/[^A-Z_]/g, '').slice(0, 40) : 'UNKNOWN' });
    return { ok: false, reason: 'RANKING_REFRESH_FAILED' };
  }
}
