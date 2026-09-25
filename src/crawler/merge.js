// Normalise raw coupons, merge duplicates across sources, score them and diff against the table.
// Depends on text.js + catalog.js.

const STALE_HOURS = 72;          // not seen for this long -> inactive
const TOUCH_HOURS = 12;          // refresh last_seen at most this often
const PURGE_DAYS = 30;           // inactive rows older than this are deleted

function rank(src) {
  const i = SOURCE_RANK.indexOf(src);
  return i < 0 ? 99 : i;
}

function cleanTitle(t) {
  return oneLine(String(t || '')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{20E3}\u{200D}]/gu, '')
    .replace(/^[\s\-–—:|•]+|[\s\-–—:|•]+$/g, ''), 140);
}

function titleKey(t) {
  return compact(t)
    .replace(/\d+/g, (d) => String(+d))
    .replace(/کدتخفیف|تخفیف|تومانی|تومان|درصدی|درصد|هزار|میلیون|برای|ویژه|تمامی|همه|کاربران/g, '');
}

function isDirectLink(link, src) {
  if (!/^https?:\/\//.test(link || '')) return false;
  const host = (/^https?:\/\/([^/]+)/.exec(link) || [])[1] || '';
  return !/(mopon|offch|ofch\.ir|offerdaily|takhfife|takhfifhot|storecode|boodgeh|bdge\.ir|offerjo|t\.me)/.test(host) || src === 'x';
}

// Telegram items are parsed without the catalog. Brand: hashtag of the block > brand named in the title >
// post-level hashtag. Channel posts about unknown apps are mostly referral spam: keep only recognisable
// brands (or posts that link a shop page on a coupon site).
function resolveTelegram(raw) {
  if (!raw.tgCheck) return raw;
  const srcBrand = raw.srcBrand || (matchAlias(raw.title || '') ? '' : raw.tgPostTag || '');
  if (!matchAlias([srcBrand, raw.srcSlug || '', raw.title || ''].join(' ')) && !raw.srcSlug) return null;
  let title = raw.title || '';
  if (srcBrand && !compact(title).includes(compact(srcBrand))) title = title ? title + ' — ' + srcBrand : 'کد تخفیف ' + srcBrand;
  const out = Object.assign({}, raw, { srcBrand, title: oneLine(title, 120) });
  delete out.tgCheck;
  delete out.tgPostTag;
  return out;
}

// Raw coupon -> normalised candidate (still one per source reference).
function normalizeRaw(input, now) {
  const raw = resolveTelegram(input);
  if (!raw) return null;
  const cls = classify(raw);
  const code = raw.code ? String(raw.code).trim() : '';
  const kind = code ? 'code' : raw.kind === 'code' ? 'unique' : raw.kind || 'deal';
  const title = cleanTitle(raw.title) || (cls.brandFa ? 'تخفیف ' + cls.brandFa : 'پیشنهاد ویژه');
  const moneyText = [raw.discountText, title].filter(Boolean).join(' ');
  const money = parseMoney(moneyText);
  let expiresAt = raw.expiresAt || null;
  if (!expiresAt && raw.expiryText) {
    const e = parseExpiry(raw.expiryText, now);
    if (e.expired) return null;
    expiresAt = e.iso;
  }
  if (expiresAt && Date.parse(expiresAt) < now.getTime()) return null;
  const ckey = code
    ? cls.brand + '|' + code.toUpperCase()
    : cls.brand + '|~' + hash(titleKey(title) + '|' + (cls.service || ''));
  return {
    ckey, brand: cls.brand, brand_fa: cls.brandFa, service: cls.service || '', category: cls.category, known: cls.known,
    code, alt_codes: (raw.altCodes || []).filter(looksLikeCode).join(','), title,
    descr: oneLine(stripDupTitle(htmlToText(raw.desc || ''), title), 600),
    discount: discountLabel(money.pct, money.toman, raw.discountText), pct: money.pct, toman: money.toman,
    conditions: oneLine(raw.conditions || '', 160), expires_at: expiresAt, link: raw.link || '', src_url: raw.url || '',
    source: raw.source, ref: raw.ref, kind, hidden: !!raw.hidden, likes: +raw.likes || 0, dislikes: +raw.dislikes || 0,
  };
}

function stripDupTitle(desc, title) {
  const d = String(desc || '').trim();
  return d.startsWith(title) ? d.slice(title.length).trim() : d;
}

function pickBy(list, fn) {
  for (const x of list) { const v = fn(x); if (v) return v; }
  return '';
}

// Merge candidates sharing a ckey.
function mergeGroup(cands) {
  const byRank = cands.slice().sort((a, b) => rank(a.source) - rank(b.source));
  const top = byRank[0];
  const services = {};
  for (const c of byRank) if (c.service) services[c.service] = (services[c.service] || 0) + 1 + (rank(c.source) < 3 ? 0.5 : 0);
  const service = Object.keys(services).sort((a, b) => services[b] - services[a])[0] || top.service;
  const kind = byRank.some((c) => c.kind === 'code') ? 'code' : byRank.some((c) => c.kind === 'unique') ? 'unique' : 'deal';
  const expiries = byRank.map((c) => c.expires_at).filter(Boolean).sort();
  // Best-ranked source first (its text is usually the cleanest); a very short one gives way to a fuller text.
  const descs = byRank.map((c) => c.descr).filter(Boolean);
  const descr = descs.find((d) => d.length >= 40) || descs.sort((a, b) => b.length - a.length)[0] || '';
  return {
    ckey: top.ckey, brand: top.brand, brand_fa: pickBy(byRank, (c) => (c.known || /[\u0600-\u06FF]/.test(c.brand_fa) ? c.brand_fa : '')) || top.brand_fa,
    service, category: top.category, code: pickBy(byRank, (c) => c.code), alt_codes: pickBy(byRank, (c) => c.alt_codes),
    title: top.title, descr, discount: pickBy(byRank, (c) => c.discount),
    pct: Math.max(...byRank.map((c) => c.pct || 0)), toman: Math.max(...byRank.map((c) => c.toman || 0)),
    conditions: pickBy(byRank, (c) => c.conditions), expires_at: expiries.length ? expiries[expiries.length - 1] : null,
    link: pickBy(byRank, (c) => (isDirectLink(c.link) ? c.link : '')) || pickBy(byRank, (c) => c.link),
    src_url: pickBy(byRank, (c) => c.src_url),
    sources: [...new Set(byRank.map((c) => c.source))], refs: [...new Set(byRank.map((c) => c.ref))],
    kind, hidden: byRank.some((c) => c.hidden) && byRank.every((c) => c.hidden || c.source === 'telegram'),
    likes: Math.max(...byRank.map((c) => c.likes || 0)), dislikes: Math.max(...byRank.map((c) => c.dislikes || 0)),
  };
}

function scoreRow(r, firstSeen, now) {
  let s = 50;
  s += r.kind === 'code' ? 25 : r.kind === 'unique' ? 8 : 0;
  s += Math.min(3, (r.sources.length || 1) - 1) * 10;
  s += r.pct ? Math.min(15, r.pct / 5) : r.toman ? Math.min(15, r.toman / 50000) : 0;
  if (r.likes + r.dislikes > 3) s += 6 * (r.likes / (r.likes + r.dislikes)) - 2;
  if (firstSeen && now.getTime() - Date.parse(firstSeen) < 72 * 3600e3) s += 8;
  if (r.hidden) s += 4;
  if (r.brand.startsWith('x_')) s -= 5;
  return Math.round(s * 10) / 10;
}

function bestRank(sources) {
  return Math.min(99, ...sources.map(rank));
}

function splitList(s) {
  return String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
}

function rowSig(r) {
  return hash([r.brand, r.service, r.code, r.title, r.descr, r.discount, r.expires_at || '', r.link, r.kind, r.active, r.sources, r.score].join('|'));
}

// found: RawCoupon[]; known: table rows; seenRefs/expiredRefs: string[].
// Returns { upserts, deletes, alerts, stats }.
function mergeAll(found, known, seenRefs, expiredRefs, nowIso) {
  const now = nowIso ? new Date(nowIso) : new Date();
  const nowS = now.toISOString();
  const cands = [];
  for (const raw of found) {
    const c = normalizeRaw(raw, now);
    if (c) cands.push(c);
  }
  const groups = {};
  for (const c of cands) (groups[c.ckey] = groups[c.ckey] || []).push(c);

  const byKey = {};
  const byRef = {};
  for (const row of known) {
    byKey[row.ckey] = row;
    for (const ref of splitList(row.refs)) byRef[ref] = row;
  }
  const expired = new Set(expiredRefs || []);
  // A refreshed reveal that reports the coupon expired outweighs "known, so seen".
  const seen = new Set((seenRefs || []).filter((r) => !expired.has(r)));

  const upserts = [];
  const alerts = [];
  const touched = new Set();
  const stats = { found: found.length, candidates: cands.length, merged: 0, created: 0, updated: 0, deactivated: 0, touched: 0 };

  for (const key of Object.keys(groups)) {
    const m = mergeGroup(groups[key]);
    // Same source reference already stored under another key (e.g. code changed): reuse that row.
    const prev = byKey[key] || m.refs.map((r) => byRef[r]).find(Boolean) || null;
    const firstSeen = prev && prev.first_seen ? prev.first_seen : nowS;
    const refs = [...new Set(m.refs.concat(prev ? splitList(prev.refs) : []))].slice(0, 12);
    const sources = [...new Set(m.sources.concat(prev ? splitList(prev.sources) : []))];
    // A run may re-find a stored coupon through only some of its sources (list-only sources come every run,
    // revealed ones twice a day): keep the text of a better-ranked source and fill what this run did not see.
    const p = prev || {};
    const keepText = prev && prev.title && bestRank(splitList(prev.sources)) < bestRank(m.sources);
    const prevExpiry = p.expires_at && Date.parse(p.expires_at) > now.getTime() ? p.expires_at : null;
    const money = m.discount || !p.discount ? m : p; // discount label, pct and toman travel together
    const row = {
      ckey: prev ? prev.ckey : key, brand: m.brand, brand_fa: m.brand_fa, service: m.service, category: m.category,
      code: m.code, alt_codes: m.alt_codes || p.alt_codes || '', title: keepText ? p.title : m.title,
      descr: (keepText ? p.descr : m.descr) || m.descr || p.descr || '',
      discount: money.discount || '', pct: +money.pct || 0, toman: +money.toman || 0,
      conditions: m.conditions || p.conditions || '', expires_at: m.expires_at || prevExpiry, link: m.link || p.link || '',
      src_url: m.src_url || p.src_url || '', sources: sources.join(','),
      refs: refs.join(','), kind: m.kind, hidden: m.hidden, first_seen: firstSeen, last_seen: nowS, active: true,
    };
    row.score = scoreRow(Object.assign({}, m, { sources, pct: row.pct, toman: row.toman }), firstSeen, now);
    row.sig = rowSig(row);
    touched.add(row.ckey);
    stats.merged++;
    if (!prev) {
      stats.created++;
      upserts.push(row);
      if (row.kind === 'code') alerts.push(row);
    } else if (prev.sig !== row.sig || !prev.active || hoursSince(prev.last_seen, now) >= TOUCH_HOURS) {
      stats.updated++;
      upserts.push(row);
    }
  }

  for (const row of known) {
    if (touched.has(row.ckey)) continue;
    const refs = splitList(row.refs);
    const isSeen = refs.some((r) => seen.has(r));
    const isExpired = !isSeen && refs.some((r) => expired.has(r));
    const pastExpiry = row.expires_at && Date.parse(row.expires_at) < now.getTime();
    if (row.active && (isExpired || pastExpiry || (!isSeen && hoursSince(row.last_seen, now) >= STALE_HOURS))) {
      upserts.push(Object.assign({}, row, { active: false, sig: rowSig(Object.assign({}, row, { active: false })) }));
      stats.deactivated++;
    } else if (row.active && isSeen && hoursSince(row.last_seen, now) >= TOUCH_HOURS) {
      upserts.push(Object.assign({}, row, { last_seen: nowS }));
      stats.touched++;
    }
  }

  const purgeBefore = new Date(now.getTime() - PURGE_DAYS * 86400e3).toISOString();
  return { upserts, alerts, purgeBefore, stats };
}

// Snapshot the bot reads for its menus (brand/service counts) instead of scanning the table.
function buildStats(known, upserts, run, nowIso) {
  const byKey = {};
  for (const r of known) byKey[r.ckey] = r;
  for (const r of upserts) byKey[r.ckey] = r;
  const brands = {};
  const sources = {};
  let total = 0, codes = 0;
  for (const r of Object.values(byKey)) {
    if (!r.active) continue;
    total++;
    if (r.kind === 'code') codes++;
    const b = brands[r.brand] || (brands[r.brand] = { fa: r.brand_fa, cat: r.category, n: 0, c: 0, s: {} });
    b.n++;
    if (r.kind === 'code') b.c++;
    if (r.service) b.s[r.service] = (b.s[r.service] || 0) + 1;
    for (const s of splitList(r.sources)) sources[s] = (sources[s] || 0) + 1;
  }
  return { updatedAt: nowIso || new Date().toISOString(), total, codes, brands, sources, run: run || {} };
}

function hoursSince(iso, now) {
  const t = Date.parse(iso || '');
  return Number.isFinite(t) ? (now.getTime() - t) / 3600e3 : 1e9;
}

// @export-start
if (typeof module !== 'undefined') {
  module.exports = { normalizeRaw, mergeGroup, mergeAll, scoreRow, buildStats };
}
// @export-end
