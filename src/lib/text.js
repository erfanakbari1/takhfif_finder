// Text helpers shared by the crawler and the bot (inlined into n8n Code nodes).
// Pure JS, no dependencies: the n8n Code sandbox has no DOM parser or npm modules.

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';

function toEnDigits(s) {
  return String(s == null ? '' : s).replace(/[۰-۹٠-٩]/g, (d) => {
    const i = FA_DIGITS.indexOf(d);
    return String(i >= 0 ? i : AR_DIGITS.indexOf(d));
  });
}

function toFaDigits(s) {
  return String(s == null ? '' : s).replace(/[0-9]/g, (d) => FA_DIGITS[+d]);
}

// Canonical Persian: Arabic yeh/kaf -> Persian, digits -> ASCII, ZWNJ/NBSP -> space.
function normFa(s) {
  return toEnDigits(s)
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[ۀة]/g, 'ه')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[\u200c\u200d\u00a0\u200e\u200f\u202a-\u202e\ufeff]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Lowercase + drop every separator: "اسنپ\u200cفود", "اسنپ فود", "snapp-food" -> "اسنپفود" / "snappfood".
function compact(s) {
  return normFa(s).toLowerCase().replace(/[\s\-_.،,:;|/\\()[\]{}«»"'`!?؟+*#@]+/g, '');
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', zwnj: '\u200c', ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };

function decodeEntities(s) {
  return String(s == null ? '' : s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    const v = ENTITIES[e.toLowerCase()];
    return v !== undefined ? v : m;
  });
}

// HTML -> readable plain text (keeps line breaks for <br>, </p>, </li>, headings).
function htmlToText(html) {
  return decodeEntities(String(html == null ? '' : html)
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|h[1-6]|div|tr)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/(?:[ \t\u00a0]*\u200c[ \t\u00a0]*){2,}|[ \t\u00a0]+\u200c+|\u200c+[ \t\u00a0]+/g, ' ')
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function oneLine(s, max) {
  const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  return max && t.length > max ? t.slice(0, max - 1).trim() + '…' : t;
}

function attr(tag, name) {
  const m = new RegExp('\\s' + name + '\\s*=\\s*("([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i').exec(tag);
  return m ? decodeEntities(m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4]) : null;
}

// Opening tags that contain the given attribute, e.g. openTags(html, 'data-coupon-id').
function openTags(html, attrName) {
  const re = new RegExp('<[a-z][a-z0-9]*\\b[^>]*\\s' + attrName + '\\s*=[^>]*>', 'gi');
  return String(html).match(re) || [];
}

// Split HTML into chunks that each start with a match of `startRe` (used for card lists).
function splitBlocks(html, startRe) {
  const out = [];
  const re = new RegExp(startRe.source, startRe.flags.includes('g') ? startRe.flags : startRe.flags + 'g');
  const idx = [];
  let m;
  while ((m = re.exec(html))) { idx.push(m.index); if (m[0].length === 0) re.lastIndex++; }
  for (let i = 0; i < idx.length; i++) out.push(html.slice(idx[i], i + 1 < idx.length ? idx[i + 1] : undefined));
  return out;
}

function firstMatch(s, re, group) {
  const m = re.exec(s);
  return m ? m[group || 1] : null;
}

// Resolve a link against the page URL. No URL global here: n8n's Code-node sandbox does not provide it.
function absUrl(href, base) {
  if (!href) return '';
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return href;
  const m = /^(https?:)\/\/([^/?#]+)([^?#]*)/i.exec(base || '');
  if (!m) return href;
  if (href.startsWith('//')) return m[1] + href;
  if (href.startsWith('/')) return m[1] + '//' + m[2] + href;
  if (href.startsWith('?') || href.startsWith('#')) return m[1] + '//' + m[2] + (m[3] || '/') + href;
  return m[1] + '//' + m[2] + (m[3] || '/').replace(/[^/]*$/, '') + href;
}

// Fast non-cryptographic hash (FNV-1a 32 bit) -> base36.
function hash(s) {
  let h = 0x811c9dc5;
  const str = String(s);
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

// Read a JSON value (array/object) that starts at text[start] by bracket matching.
function readJsonAt(text, start) {
  const open = text[start];
  const close = open === '[' ? ']' : open === '{' ? '}' : null;
  if (!close) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '[' || c === '{') depth++;
    else if (c === ']' || c === '}') {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(text.slice(start, i + 1)); } catch (e) { return null; }
      }
    }
  }
  return null;
}

// Concatenate the Next.js app-router flight payload (self.__next_f.push([1,"..."])).
function nextFlight(html) {
  let out = '';
  const re = /self\.__next_f\.push\((\[[\s\S]*?\])\)<\/script>/g;
  let m;
  while ((m = re.exec(html))) {
    try {
      const arr = JSON.parse(m[1]);
      if (arr.length > 1 && typeof arr[1] === 'string') out += arr[1];
    } catch (e) { /* skip malformed chunk */ }
  }
  return out;
}

// "۱۰۰ هزار تومان" / "2 میلیون" / "250,000 تومان" -> toman amount; "۳۰٪" / "30 درصد" -> percent.
function parseMoney(text) {
  const t = normFa(text).replace(/٬|,/g, '');
  const res = { toman: 0, pct: 0 };
  const pct = /(\d+(?:\.\d+)?)\s*(?:%|٪|درصد)|(?:%|٪)\s*(\d+(?:\.\d+)?)/.exec(t);
  if (pct) res.pct = Math.min(100, parseFloat(pct[1] || pct[2]));
  const mil = /(\d+(?:\.\d+)?)\s*میلیون/.exec(t);
  const hez = /(\d+(?:\.\d+)?)\s*هزار/.exec(t);
  if (mil) res.toman = Math.round(parseFloat(mil[1]) * 1e6 + (hez && hez.index > mil.index ? parseFloat(hez[1]) * 1e3 : 0));
  else if (hez) res.toman = Math.round(parseFloat(hez[1]) * 1e3);
  else {
    const raw = /(\d{4,9})\s*(?:تومان|تومن|ت\b)/.exec(t);
    if (raw) res.toman = parseInt(raw[1], 10);
    else {
      const rial = /(\d{5,10})\s*ریال/.exec(t);
      if (rial) res.toman = Math.round(parseInt(rial[1], 10) / 10);
    }
  }
  return res;
}

function fmtToman(n) {
  if (!n) return '';
  if (n >= 1e6) {
    const m = n / 1e6;
    return toFaDigits(Number.isInteger(m) ? String(m) : m.toFixed(1).replace(/\.0$/, '')) + ' میلیون تومان';
  }
  if (n >= 1e3) return toFaDigits(String(Math.round(n / 1e3))) + ' هزار تومان';
  return toFaDigits(String(n)) + ' تومان';
}

function discountLabel(pct, toman, fallback) {
  if (pct) return toFaDigits(String(pct)) + '٪';
  if (toman) return fmtToman(toman);
  return fallback ? oneLine(fallback, 40) : '';
}

// Gregorian month names as written on Persian sites ("سپتامبر 27, 2026").
const G_MONTHS = { 'ژانویه': 1, 'ژانویهٔ': 1, 'فوریه': 2, 'مارس': 3, 'آوریل': 4, 'مه': 5, 'می': 5, 'ژوئن': 6, 'ژوئیه': 7, 'جولای': 7, 'اوت': 8, 'آگوست': 8, 'سپتامبر': 9, 'اکتبر': 10, 'نوامبر': 11, 'دسامبر': 12 };
const J_MONTHS = { 'فروردین': 1, 'اردیبهشت': 2, 'خرداد': 3, 'تیر': 4, 'مرداد': 5, 'شهریور': 6, 'مهر': 7, 'آبان': 8, 'آذر': 9, 'دی': 10, 'بهمن': 11, 'اسفند': 12 };

function div(a, b) { return Math.floor(a / b); }

// Jalali -> Gregorian (algorithm from jalaali-js, public domain).
function jalaliToDate(jy, jm, jd) {
  const breaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
  const gy = jy + 621;
  let leapJ = -14, jp = breaks[0], jump = 0;
  for (let i = 1; i < breaks.length; i++) {
    const jmIdx = breaks[i];
    jump = jmIdx - jp;
    if (jy < jmIdx) break;
    leapJ = leapJ + div(jump, 33) * 8 + div(jump % 33, 4);
    jp = jmIdx;
  }
  let n = jy - jp;
  leapJ = leapJ + div(n, 33) * 8 + div((n % 33) + 3, 4);
  if (jump % 33 === 4 && jump - n === 4) leapJ += 1;
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;
  const dayOfYear = (jm <= 7 ? (jm - 1) * 31 : 186 + (jm - 7) * 30) + jd - 1;
  const d = new Date(Date.UTC(gy, 2, march));
  d.setUTCDate(d.getUTCDate() + dayOfYear);
  return d;
}

function currentJalaliYear(now) {
  const d = now || new Date();
  const y = d.getUTCFullYear();
  const nowruz = jalaliToDate(y - 621, 1, 1);
  return d >= nowruz ? y - 621 : y - 622;
}

// Parse expiry hints to an ISO date (end of that day, Tehran ~ UTC+3:30) or null.
// Returns { iso, expired } — expired=true when the text explicitly says so.
function parseExpiry(text, now) {
  const t = normFa(text);
  const base = now || new Date();
  if (!t) return { iso: null, expired: false };
  if (/منقضی\s*شده|منقضی$|^منقضی|expired|به پایان رسید|تمام شد/.test(t) && !/شاید منقضی/.test(t)) return { iso: null, expired: true };
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(t)) {
    const direct = Date.parse(t.replace(' ', 'T'));
    if (Number.isFinite(direct)) return { iso: new Date(direct).toISOString(), expired: false };
  }
  const iso = /(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(t);
  if (iso && +iso[1] > 1900) return { iso: new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3], iso[4] ? +iso[4] : 20, iso[5] ? +iso[5] : 29)).toISOString(), expired: false };
  // End of the Tehran calendar day that contains d (23:59 Tehran = 20:29 UTC).
  const endOf = (d) => { const t = new Date(new Date(d).getTime() + 12600e3); return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), 20, 29)).toISOString(); };
  const rel = /(\d+)\s*(روز|هفته|ماه|ساعت)/.exec(t);
  if (rel && /(تا|بعد|دیگر|مانده|باقی|اعتبار)/.test(t)) {
    const n = parseInt(rel[1], 10);
    const mult = { 'ساعت': 3600e3, 'روز': 86400e3, 'هفته': 7 * 86400e3, 'ماه': 30 * 86400e3 }[rel[2]];
    // Rounded (to the hour / end of day) so the date stays stable between crawls as the countdown text changes.
    const at = base.getTime() + n * mult;
    return { iso: rel[2] === 'ساعت' ? new Date(Math.ceil(at / 3600e3) * 3600e3).toISOString() : endOf(at), expired: false };
  }
  if (/امروز|امشب/.test(t) && /(تا|فقط|اعتبار)/.test(t)) return { iso: endOf(base), expired: false };
  if (/فردا/.test(t) && /(تا|اعتبار)/.test(t)) return { iso: endOf(new Date(base.getTime() + 86400e3)), expired: false };
  const g = /([\u0600-\u06FF]+)\s+(\d{1,2}),?\s+(\d{4})/.exec(t);
  if (g && G_MONTHS[g[1]]) return { iso: endOf(new Date(Date.UTC(+g[3], G_MONTHS[g[1]] - 1, +g[2]))), expired: false };
  const j = /(\d{1,2})\s+([\u0600-\u06FF]+)(?:\s+(?:ماه\s+)?(\d{4}))?/.exec(t);
  if (j && J_MONTHS[j[2]] && /(تا|اعتبار|مهلت|انقضا|معتبر)/.test(t)) {
    let jy = j[3] ? +j[3] : currentJalaliYear(base);
    let d = jalaliToDate(jy, J_MONTHS[j[2]], +j[1]);
    if (!j[3] && d.getTime() < base.getTime() - 60 * 86400e3) d = jalaliToDate(jy + 1, J_MONTHS[j[2]], +j[1]);
    return { iso: endOf(d), expired: false };
  }
  const jd = /(14\d{2})[/\-.](\d{1,2})[/\-.](\d{1,2})/.exec(t);
  if (jd) return { iso: endOf(jalaliToDate(+jd[1], +jd[2], +jd[3])), expired: false };
  return { iso: null, expired: false };
}

// A discount code is a short token with letters and/or digits, not a URL/word/phone number.
const CODE_STOP = new Set(['http', 'https', 'www', 'com', 'ir', 'code', 'copy', 'null', 'undefined', 'true', 'false', 'none', 'link', 'offer', 'deal', 'coupon', 'discount', 'click', 'here', 'telegram', 'instagram']);
function looksLikeCode(s) {
  const c = String(s == null ? '' : s).trim();
  if (c.length < 3 || c.length > 40) return false;
  if (!/^[A-Za-z0-9][A-Za-z0-9_\-.]*[A-Za-z0-9]$/.test(c)) return false;
  if (/^\d+$/.test(c) && (c.length < 4 || c.length > 12 || /^0?9\d{9}$/.test(c))) return false;
  if (CODE_STOP.has(c.toLowerCase())) return false;
  if (/\.(ir|com|net|org|me)$/i.test(c)) return false;
  return true;
}

// @export-start
if (typeof module !== 'undefined') {
  module.exports = { toEnDigits, toFaDigits, normFa, compact, decodeEntities, htmlToText, oneLine, attr, openTags, splitBlocks, firstMatch, absUrl, hash, readJsonAt, nextFlight, parseMoney, fmtToman, discountLabel, jalaliToDate, currentJalaliYear, parseExpiry, looksLikeCode };
}
// @export-end
