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

// Brand / service taxonomy and the coupon classifier.
// Depends on text.js (normFa, compact).
//
// `aliases` identify a brand or service by name (source brand names, slugs, hashtags, titles).
// `kw` are weaker context words, only used once the brand is known.

const CATEGORIES = [
  { id: 'super', fa: 'سوپراپ\u200cها', emoji: '⭐\ufe0f' },
  { id: 'food', fa: 'غذا و سوپرمارکت', emoji: '🍔' },
  { id: 'shop', fa: 'فروشگاه اینترنتی', emoji: '🛍' },
  { id: 'fashion', fa: 'مد، پوشاک و زیبایی', emoji: '👗' },
  { id: 'travel', fa: 'سفر و اقامت', emoji: '✈\ufe0f' },
  { id: 'transport', fa: 'تاکسی، پیک و حمل\u200cونقل', emoji: '🚕' },
  { id: 'media', fa: 'فیلم، موسیقی و سرگرمی', emoji: '🎬' },
  { id: 'edu', fa: 'کتاب و آموزش', emoji: '📚' },
  { id: 'finance', fa: 'بانک، طلا و مالی', emoji: '💳' },
  { id: 'insurance', fa: 'بیمه', emoji: '🛡' },
  { id: 'telecom', fa: 'اینترنت و اپراتور', emoji: '📶' },
  { id: 'health', fa: 'سلامت و پزشکی', emoji: '🩺' },
  { id: 'services', fa: 'خدمات آنلاین و خودرو', emoji: '🧰' },
  { id: 'other', fa: 'سایر', emoji: '🗂' },
];

const BRANDS = [
  {
    id: 'snapp', fa: 'اسنپ', emoji: '🚖', cat: 'super', featured: 1, defaultService: 'ride',
    aliases: ['اسنپ', 'snapp', 'snapp.ir', 'snapp.taxi', 'snap'],
    services: [
      { id: 'ride', fa: 'اسنپ مسافر (تاکسی)', emoji: '🚕', aliases: ['اسنپ مسافر', 'اسنپ تاکسی', 'تاکسی اسنپ', 'snapp.taxi', 'اسنپ بایک', 'بایک پلاس', 'snappbike', 'اکوپلاس', 'اکو پلاس', 'اسنپ پرو', 'snapppro', 'اسنپ رز'], kw: ['سفر', 'تاکسی', 'درون شهری', 'بین شهری', 'فرودگاه', 'مسافر', 'اشتراکی', 'راننده', 'بایک', 'موتور'] },
      { id: 'food', fa: 'اسنپ\u200cفود', emoji: '🍔', aliases: ['اسنپ فود', 'snappfood', 'snapp-food', 'snapp food', 'فودرو', 'foodro', 'فود پارتی', 'فودپارتی'], kw: ['غذا', 'رستوران', 'فست فود', 'شیرینی', 'کافه', 'نانوایی', 'آبمیوه', 'بستنی', 'پیتزا', 'کباب', 'پت شاپ', 'قصابی', 'میوه'] },
      { id: 'market', fa: 'اسنپ\u200cمارکت', emoji: '🛒', aliases: ['اسنپ مارکت', 'snappmarket', 'snapp-market', 'سوپرمارکت اسنپ', 'اسنپ سوپرمارکت', 'سوپر مارکت اسنپ'], kw: ['سوپرمارکت', 'سوپر مارکت', 'لبنیات', 'خواربار', 'مارکت'] },
      { id: 'shop', fa: 'اسنپ\u200cشاپ', emoji: '🛍', aliases: ['اسنپ شاپ', 'snappshop', 'snapp-shop'], kw: ['موبایل', 'پوشاک', 'لوازم خانگی', 'آرایشی'] },
      { id: 'pay', fa: 'اسنپ\u200cپی', emoji: '💳', aliases: ['اسنپ پی', 'snapppay', 'snapp-pay', 'snapp pay'], kw: ['اقساطی', 'قسطی', 'درگاه', 'اعتباری'] },
      { id: 'doctor', fa: 'اسنپ\u200cدکتر و دارو', emoji: '🩺', aliases: ['اسنپ دکتر', 'snappdoctor', 'snapp-doctor', 'اسنپ دارو', 'داروخانه اسنپ'], kw: ['پزشک', 'دکتر', 'مشاوره پزشکی', 'دارو', 'روانشناس', 'ویزیت'] },
      { id: 'trip', fa: 'اسنپ\u200cتریپ', emoji: '✈\ufe0f', aliases: ['اسنپ تریپ', 'snapptrip', 'snapp-trip'], kw: ['هتل', 'بلیط', 'بلیت', 'پرواز', 'هواپیما', 'قطار', 'اتوبوس', 'تور'] },
      { id: 'room', fa: 'اسنپ\u200cروم (ویلا و اقامتگاه)', emoji: '🏡', aliases: ['اسنپ روم', 'snapproom', 'snapp-room'], kw: ['ویلا', 'اقامتگاه', 'سوئیت'] },
      { id: 'box', fa: 'اسنپ\u200cباکس و پیک/وانت', emoji: '📦', aliases: ['اسنپ باکس', 'snappbox', 'snapp-box', 'پیک اسنپ', 'اسنپ پیک', 'اسنپ وانت', 'وانت اسنپ', 'اسباب کشی اسنپ', 'اسنپ بار'], kw: ['پیک', 'وانت', 'اسباب کشی', 'باربری', 'کامیون', 'جابه جایی بار', 'مرسوله'] },
      { id: 'express', fa: 'اسنپ\u200cاکسپرس', emoji: '⚡\ufe0f', aliases: ['اسنپ اکسپرس', 'snappexpress', 'snapp-express'], kw: [] },
      { id: 'bime', fa: 'اسنپ\u200cبیمه', emoji: '🛡', aliases: ['اسنپ بیمه', 'snappbimeh', 'snapp-bimeh', 'snappbime'], kw: ['بیمه'] },
      { id: 'carfix', fa: 'اسنپ\u200cکارفیکس', emoji: '🔧', aliases: ['اسنپ کارفیکس', 'کارفیکس', 'snappcarfix', 'carfix'], kw: ['تعویض روغن', 'کارواش', 'تعمیر خودرو'] },
      { id: 'club', fa: 'اسنپ\u200cکلاب', emoji: '🎁', aliases: ['اسنپ کلاب', 'snappclub', 'snapp club', 'myclub.snapp'], kw: ['امتیاز'] },
    ],
  },
  {
    id: 'tapsi', fa: 'تپسی', emoji: '🚕', cat: 'super', featured: 2, defaultService: 'ride',
    aliases: ['تپسی', 'tapsi', 'tap30', 'tapsi.ir'],
    services: [
      { id: 'ride', fa: 'تپسی مسافر (تاکسی)', emoji: '🚖', aliases: ['تپسی مسافر', 'تپسی تاکسی', 'تپسی لاین', 'تپسی موتور', 'تپسی بین شهری'], kw: ['سفر', 'تاکسی', 'بین شهری', 'درون شهری', 'فرودگاه', 'راننده', 'موتور'] },
      { id: 'food', fa: 'تپسی\u200cفود', emoji: '🍕', aliases: ['تپسی فود', 'tapsifood', 'tapsi-food', 'tapsi food', 'تپ تایم'], kw: ['غذا', 'رستوران', 'پیک آف'] },
      { id: 'market', fa: 'تپسی\u200cمارکت', emoji: '🛒', aliases: ['تپسی مارکت', 'tapsimarket', 'tapsi-market'], kw: ['سوپرمارکت', 'سوپر مارکت'] },
      { id: 'shop', fa: 'تپسی\u200cشاپ', emoji: '🛍', aliases: ['تپسی شاپ', 'tapsishop', 'tapsi-shop'], kw: ['اقساطی', 'قسطی'] },
      { id: 'doctor', fa: 'تپسی\u200cدکتر', emoji: '🩺', aliases: ['تپسی دکتر', 'tapsidoctor', 'tapsi-doctor'], kw: ['پزشک', 'دکتر', 'مشاوره', 'روانشناس'] },
      { id: 'garage', fa: 'تپسی\u200cگاراژ', emoji: '🔧', aliases: ['تپسی گاراژ', 'tapsigarage', 'tapsi-garage'], kw: ['کارواش', 'لاستیک', 'باتری', 'تعویض روغن', 'خودرو'] },
      { id: 'pack', fa: 'تپسی\u200cپک و باکس (پیک)', emoji: '📦', aliases: ['تپسی باکس', 'تپسی پک', 'پیک تپسی', 'tapsipack', 'tapsi pack', 'tapsibox'], kw: ['پیک', 'مرسوله', 'مراکز پستی', 'ارسال بسته'] },
    ],
  },
  {
    id: 'digikala', fa: 'دیجی\u200cکالا', emoji: '🛒', cat: 'super', featured: 3, defaultService: 'main',
    aliases: ['دیجی کالا', 'دیجیکالا', 'digikala', 'dk'],
    services: [
      { id: 'main', fa: 'دیجی\u200cکالا (فروشگاه)', emoji: '🛒', aliases: [], kw: [] },
      { id: 'jet', fa: 'دیجی\u200cکالا جت و سوپرمارکت', emoji: '⚡\ufe0f', aliases: ['دیجی کالا جت', 'دیجیکالا جت', 'digikalajet', 'دیجی جت', 'سوپرمارکت فوری', 'سوپرمارکت دیجی کالا'], kw: ['سوپرمارکت', 'فوری'] },
      { id: 'style', fa: 'دیجی\u200cاستایل', emoji: '👗', aliases: ['دیجی استایل', 'digistyle', 'digi-style'], kw: [] },
      { id: 'pay', fa: 'دیجی\u200cپی', emoji: '💳', aliases: ['دیجی پی', 'digipay', 'mydigipay'], kw: ['اقساطی', 'اعتباری', 'قسطی'] },
      { id: 'plus', fa: 'دیجی\u200cپلاس', emoji: '⭐\ufe0f', aliases: ['دیجی پلاس', 'digiplus', 'دیجی کالا پلاس'], kw: [] },
      { id: 'club', fa: 'دیجی\u200cکلاب و دیجی\u200cکوین', emoji: '🎁', aliases: ['دیجی کلاب', 'digiclub', 'دیجی کوین', 'digicoin'], kw: ['ماموریت', 'کوین'] },
      { id: 'gold', fa: 'طلا و نقره دیجیتال', emoji: '🪙', aliases: ['طلای دیجیتال دیجی کالا'], kw: ['طلا', 'نقره', 'سکه', 'شمش'] },
    ],
  },
  // Popular single-service brands. `slugs` are the ids used by the sources (offch/offerdaily/boodgeh/...).
  { id: 'alibaba', fa: 'علی\u200cبابا', emoji: '✈\ufe0f', cat: 'travel', featured: 4, aliases: ['علی بابا', 'علیبابا', 'alibaba'] },
  { id: 'filimo', fa: 'فیلیمو', emoji: '🎬', cat: 'media', featured: 5, aliases: ['فیلیمو', 'filimo'] },
  { id: 'basalam', fa: 'باسلام', emoji: '🧺', cat: 'shop', featured: 6, aliases: ['باسلام', 'با سلام', 'basalam'] },
  { id: 'technolife', fa: 'تکنولایف', emoji: '📱', cat: 'shop', featured: 7, aliases: ['تکنولایف', 'technolife'] },
  { id: 'okala', fa: 'اکالا', emoji: '🥫', cat: 'food', featured: 8, aliases: ['اکالا', 'okala'] },
  { id: 'khanoumi', fa: 'خانومی', emoji: '💄', cat: 'fashion', featured: 9, aliases: ['خانومی', 'khanoumi', 'khanoomi'] },
  { id: 'alopeyk', fa: 'الوپیک', emoji: '🛵', cat: 'transport', featured: 10, aliases: ['الوپیک', 'الو پیک', 'alopeyk', 'الوتاکسی'] },
  { id: 'jabama', fa: 'جاباما', emoji: '🏡', cat: 'travel', featured: 11, aliases: ['جاباما', 'جا با ما', 'jabama'] },
  { id: 'namava', fa: 'نماوا', emoji: '🍿', cat: 'media', featured: 12, aliases: ['نماوا', 'namava'] },
  { id: 'taaghche', fa: 'طاقچه', emoji: '📖', cat: 'edu', aliases: ['=طاقچه', 'taaghche', 'اپلیکیشن طاقچه'] },
  { id: 'fidibo', fa: 'فیدیبو', emoji: '📚', cat: 'edu', aliases: ['فیدیبو', 'fidibo'] },
  { id: 'filmnet', fa: 'فیلم\u200cنت', emoji: '🎞', cat: 'media', aliases: ['فیلم نت', 'فیلمنت', 'filmnet'] },
  { id: 'filimoschool', fa: 'فیلیمو مدرسه', emoji: '🏫', cat: 'edu', aliases: ['فیلیمو مدرسه', 'filimoschool', 'filimomadreseh'] },
  { id: 'cinematicket', fa: 'سینماتیکت', emoji: '🎟', cat: 'media', aliases: ['سینماتیکت', 'سینما تیکت', 'cinematicket'] },
  { id: 'digistyle', fa: 'دیجی\u200cاستایل', emoji: '👗', cat: 'fashion', alias_of: ['digikala', 'style'], aliases: [] },
  { id: 'banimode', fa: 'بانی\u200cمد', emoji: '👠', cat: 'fashion', aliases: ['بانی مد', 'بانیمد', 'banimode'] },
  { id: 'modiseh', fa: 'مدیسه', emoji: '👚', cat: 'fashion', aliases: ['مدیسه', 'modiseh'] },
  { id: 'janebi', fa: 'جانبی', emoji: '🎧', cat: 'shop', aliases: ['=جانبی', 'janebi', 'فروشگاه جانبی'] },
  { id: 'torob', fa: 'ترب', emoji: '🔎', cat: 'shop', aliases: ['=ترب', 'torob'] },
  { id: 'divar', fa: 'دیوار', emoji: '🧱', cat: 'services', aliases: ['=دیوار', 'divar'] },
  { id: 'shab', fa: 'شب', emoji: '🌙', cat: 'travel', aliases: ['اقامتگاه شب', 'shab'] },
  { id: 'jajiga', fa: 'جاجیگا', emoji: '🏕', cat: 'travel', aliases: ['جاجیگا', 'jajiga'] },
  { id: 'flightio', fa: 'فلایتیو', emoji: '🛫', cat: 'travel', aliases: ['فلایتیو', 'flightio'] },
  { id: 'flytoday', fa: 'فلای\u200cتودی', emoji: '🛬', cat: 'travel', aliases: ['فلای تودی', 'فلایتودی', 'flytoday'] },
  { id: 'ghasedak24', fa: 'قاصدک ۲۴', emoji: '🚌', cat: 'travel', aliases: ['قاصدک 24', 'قاصدک۲۴', 'ghasedak24'] },
  { id: 'mrbilit', fa: 'مستربلیط', emoji: '🎫', cat: 'travel', aliases: ['مستر بلیط', 'مستربلیط', 'mrbilit', 'mrblit'] },
  { id: 'iranhotel', fa: 'ایران هتل آنلاین', emoji: '🏨', cat: 'travel', aliases: ['ایران هتل', 'iranhotelonline'] },
  { id: 'eghamat24', fa: 'اقامت ۲۴', emoji: '🏨', cat: 'travel', aliases: ['اقامت 24', 'اقامت۲۴', 'eghamat24', 'eghamate24'] },
  { id: 'otaghak', fa: 'اتاقک', emoji: '🛏', cat: 'travel', aliases: ['=اتاقک', 'otaghak'] },
  { id: 'maxim', fa: 'ماکسیم', emoji: '🚗', cat: 'transport', aliases: ['ماکسیم', 'maxim'] },
  { id: 'carpino', fa: 'کارپینو', emoji: '🚘', cat: 'transport', aliases: ['کارپینو', 'carpino'] },
  { id: 'irancell', fa: 'ایرانسل', emoji: '📶', cat: 'telecom', aliases: ['ایرانسل', 'irancell'] },
  { id: 'mci', fa: 'همراه اول', emoji: '📱', cat: 'telecom', aliases: ['همراه اول', 'hamrahaval', 'hamraheaval', 'mci'] },
  { id: 'rightel', fa: 'رایتل', emoji: '📡', cat: 'telecom', aliases: ['رایتل', 'rightel'] },
  { id: 'shatel', fa: 'شاتل', emoji: '🌐', cat: 'telecom', aliases: ['شاتل', 'shatel'] },
  { id: 'blubank', fa: 'بلوبانک', emoji: '🏦', cat: 'finance', aliases: ['بلوبانک', 'بلو بانک', 'blubank', 'blu bank'] },
  { id: 'melligold', fa: 'ملی\u200cگلد', emoji: '🪙', cat: 'finance', aliases: ['ملی گلد', 'melligold'] },
  { id: 'milli', fa: 'میلی', emoji: '🥇', cat: 'finance', aliases: ['=میلی', 'milli', 'میلی گلد'] },
  { id: 'miogold', fa: 'میوگلد', emoji: '💍', cat: 'finance', aliases: ['میوگلد', 'میو گلد', 'mioshop', 'miogold'] },
  { id: 'tabdeal', fa: 'تبدیل', emoji: '💱', cat: 'finance', aliases: ['صرافی تبدیل', 'tabdeal'] },
  { id: 'nobitex', fa: 'نوبیتکس', emoji: '💹', cat: 'finance', aliases: ['نوبیتکس', 'nobitex'] },
  { id: 'wallex', fa: 'والکس', emoji: '💹', cat: 'finance', aliases: ['والکس', 'wallex'] },
  { id: 'azki', fa: 'ازکی', emoji: '🛡', cat: 'insurance', aliases: ['ازکی', 'azki'] },
  { id: 'azkiservice', fa: 'ازکی سرویس', emoji: '🔩', cat: 'services', aliases: ['ازکی سرویس', 'azkiservice'] },
  { id: 'azkivam', fa: 'ازکی وام', emoji: '💰', cat: 'finance', aliases: ['ازکی وام', 'azkivam'] },
  { id: 'bimebazar', fa: 'بیمه\u200cبازار', emoji: '🛡', cat: 'insurance', aliases: ['بیمه بازار', 'bimebazar', 'bime-bazar'] },
  { id: 'bimito', fa: 'بیمیتو', emoji: '🛡', cat: 'insurance', aliases: ['بیمیتو', 'bimito'] },
  { id: 'asanbime', fa: 'آسان بیمه', emoji: '🛡', cat: 'insurance', aliases: ['آسان بیمه', 'asanbime'] },
  { id: 'bimehcom', fa: 'بیمه دات کام', emoji: '🛡', cat: 'insurance', aliases: ['بیمه دات کام', 'bimeh.com'] },
  { id: 'drkermani', fa: 'دکتر کرمانی', emoji: '🥗', cat: 'health', aliases: ['دکتر کرمانی', '=کرمانی', 'drkermani', 'kermany', 'kermani'] },
  { id: 'paziresh24', fa: 'پذیرش ۲۴', emoji: '🏥', cat: 'health', aliases: ['پذیرش 24', 'paziresh24'] },
  { id: 'darukade', fa: 'داروکده', emoji: '💊', cat: 'health', aliases: ['داروکده', 'darukade'] },
  { id: 'appetit', fa: 'اپتیت', emoji: '🥑', cat: 'health', aliases: ['اپتیت', 'appetit'] },
  { id: 'fitamin', fa: 'فیتامین', emoji: '💪', cat: 'health', aliases: ['فیتامین', 'fitamin'] },
  { id: 'achareh', fa: 'آچاره', emoji: '🧰', cat: 'services', aliases: ['آچاره', 'achareh', 'achare'] },
  { id: 'cafebazaar', fa: 'کافه\u200cبازار', emoji: '🎮', cat: 'services', aliases: ['کافه بازار', 'کافهبازار', 'cafebazaar'] },
  { id: 'myket', fa: 'مایکت', emoji: '📲', cat: 'services', aliases: ['مایکت', 'myket'] },
  { id: 'maktabkhooneh', fa: 'مکتب\u200cخونه', emoji: '🎓', cat: 'edu', aliases: ['مکتب خونه', 'مکتبخونه', 'maktabkhooneh'] },
  { id: 'faradars', fa: 'فرادرس', emoji: '🎓', cat: 'edu', aliases: ['فرادرس', 'faradars'] },
  { id: 'inoschool', fa: 'آی\u200cنو', emoji: '🏫', cat: 'edu', aliases: ['آی نو', 'ino-school', 'inoschool'] },
  { id: 'iranketab', fa: 'ایران\u200cکتاب', emoji: '📕', cat: 'edu', aliases: ['ایران کتاب', 'iranketab'] },
  { id: 'rojashop', fa: 'روژا', emoji: '💅', cat: 'fashion', aliases: ['روژا', 'rojashop', 'roja'] },
  { id: 'iranicard', fa: 'ایرانیکارت', emoji: '💳', cat: 'finance', aliases: ['ایرانیکارت', 'ایرانی کارت', 'iranicard'] },
  { id: 'delino', fa: 'دلینو', emoji: '🥘', cat: 'food', aliases: ['دلینو', 'delino'] },
  { id: 'reyhoon', fa: 'ریحون', emoji: '🌿', cat: 'food', aliases: ['=ریحون', 'reyhoon'] },
  { id: 'chilivery', fa: 'چیلیوری', emoji: '🌶', cat: 'food', aliases: ['چیلیوری', 'chilivery'] },
  { id: 'hyperstar', fa: 'هایپراستار', emoji: '🛒', cat: 'food', aliases: ['هایپر استار', 'هایپراستار', 'hyperstar'] },
  { id: 'esam', fa: 'ای\u200cسام', emoji: '🏷', cat: 'shop', aliases: ['ایسام', 'ای سام', 'esam'] },
  { id: 'sheypoor', fa: 'شیپور', emoji: '📣', cat: 'services', aliases: ['=شیپور', 'sheypoor'] },
  { id: 'aparat', fa: 'آپارات', emoji: '📺', cat: 'media', aliases: ['آپارات', 'aparat'] },
  { id: 'telewebion', fa: 'تلوبیون', emoji: '📺', cat: 'media', aliases: ['تلوبیون', 'telewebion'] },
  { id: 'tiwall', fa: 'تیوال', emoji: '🎭', cat: 'media', aliases: ['تیوال', 'tiwall'] },
  { id: 'navaar', fa: 'نوار', emoji: '🎧', cat: 'media', aliases: ['=نوار', 'navaar'] },
  // Shops that showed up as unknown brands in the first crawls.
  { id: 'bitpin', fa: 'بیت\u200cپین', emoji: '🪙', cat: 'finance', aliases: ['بیت پین', 'بیتپین', 'bitpin'] },
  { id: 'tetherland', fa: 'تترلند', emoji: '💱', cat: 'finance', aliases: ['تترلند', 'tetherland'] },
  { id: 'tlyn', fa: 'طلاین', emoji: '🥇', cat: 'finance', aliases: ['طلاین', 'tlyn'] },
  { id: 'zarpin', fa: 'زرپین', emoji: '🥇', cat: 'finance', aliases: ['زرپین', 'zarpin'] },
  { id: 'khodro45', fa: 'خودرو۴۵', emoji: '🚙', cat: 'services', aliases: ['خودرو45', 'خودرو 45', 'khodro45'] },
  { id: 'mobile140', fa: 'موبایل ۱۴۰', emoji: '📱', cat: 'shop', aliases: ['موبایل 140', 'موبایل140', 'mobile140'] },
  { id: 'positron', fa: 'پوزیترون', emoji: '🔌', cat: 'shop', aliases: ['پوزیترون', 'positronshop', 'positron'] },
  { id: 'sazkala', fa: 'سازکالا', emoji: '🎸', cat: 'shop', aliases: ['ساز کالا', 'سازکالا', 'sazkala'] },
  { id: 'hermooder', fa: 'هرمودر', emoji: '👜', cat: 'fashion', aliases: ['هرمودر', 'hermooder'] },
  { id: 'padmira', fa: 'پادمیرا', emoji: '👟', cat: 'fashion', aliases: ['پادمیرا', 'padmira'] },
  { id: 'daneshjooyar', fa: 'دانشجویار', emoji: '🎓', cat: 'edu', aliases: ['دانشجویار', 'daneshjooyar'] },
  { id: 'funglish', fa: 'فانگلیش', emoji: '🗣', cat: 'edu', aliases: ['فانگلیش', 'funglish'] },
  { id: 'iranserver', fa: 'ایران سرور', emoji: '🖥', cat: 'telecom', aliases: ['ایران سرور', 'iranserver'] },
  { id: 'iranhost', fa: 'ایران هاست', emoji: '🖥', cat: 'telecom', aliases: ['ایران هاست', 'iranhost'] },
  { id: 'mihanwebhost', fa: 'میهن وب هاست', emoji: '🖥', cat: 'telecom', aliases: ['میهن وب هاست', 'mihanwebhost'] },
  { id: 'netafraz', fa: 'نت افراز', emoji: '🖥', cat: 'telecom', aliases: ['نت افراز', 'نتافراز', 'netafraz'] },
];

// Sources, best first (used to break ties when merging duplicates).
const SOURCE_RANK = ['offch', 'mopon', 'boodgeh', 'offerdaily', 'storecode', 'takhfife', 'tapsitakhfif', 'offerjo', 'iranicard', 'telegram'];
const SOURCE_FA = {
  offch: 'کانال تخفیف', mopon: 'موپن', boodgeh: 'بودجه', offerdaily: 'آفردیلی', storecode: 'استورکد', takhfife: 'تخفیفه',
  tapsitakhfif: 'تپسی تخفیف', offerjo: 'آفرجو', iranicard: 'ایرانیکارت', telegram: 'کانال\u200cهای تلگرام',
};

const SERVICE_BRANDS = BRANDS.filter((b) => b.services && b.services.length);

let _aliasIndex = null;
// Alias index: longest aliases first so "اسنپ فود" wins over "اسنپ".
function aliasIndex() {
  if (_aliasIndex) return _aliasIndex;
  const list = [];
  // "=name" aliases are common words ("جانبی", "میلی"): they only match when the whole text is that name.
  const add = (a, brand, service) => {
    const exact = a[0] === '=';
    const n = normFa(exact ? a.slice(1) : a).toLowerCase();
    const multi = /[\s\-_]/.test(n);
    list.push({ key: multi || exact ? compact(n) : n, multi, exact, brand, service });
  };
  for (const b of BRANDS) {
    if (b.alias_of) continue;
    for (const a of b.aliases || []) add(a, b.id, null);
    for (const s of b.services || []) for (const a of s.aliases || []) add(a, b.id, s.id);
  }
  for (const b of BRANDS) if (b.alias_of) { add(b.fa, b.alias_of[0], b.alias_of[1]); add(b.id, b.alias_of[0], b.alias_of[1]); }
  _aliasIndex = list.filter((x) => x.key.length >= 2).sort((a, b) => b.key.length - a.key.length);
  return _aliasIndex;
}

function brandById(id) {
  return BRANDS.find((b) => b.id === id) || null;
}

function serviceOf(brandId, serviceId) {
  const b = brandById(brandId);
  return b && b.services ? b.services.find((s) => s.id === serviceId) || null : null;
}

// Find the first (longest) alias in `text`. Multi-word aliases match anywhere in the compact form
// ("اسنپ فود" also matches "اسنپ\u200cفود"/"اسنپفود"); single-word aliases must be a whole token so that
// "دیوار" does not match "کاغذ دیواری".
// When several brands are mentioned, the earliest one is the subject ("کد تخفیف تپسی ... رایتل").
function matchAlias(text) {
  const c = compact(text);
  if (!c) return null;
  const tokens = new Set(normFa(text).toLowerCase().split(/[^a-z0-9\u0600-\u06FF.]+/).map((t) => t.replace(/^\.+|\.+$/g, '')).filter(Boolean));
  let best = null, bestPos = Infinity;
  for (const a of aliasIndex()) {
    if (!(a.exact ? c === a.key : a.multi ? c.includes(a.key) : tokens.has(a.key))) continue;
    const pos = c.indexOf(a.multi ? a.key : compact(a.key));
    if (pos < bestPos) { best = a; bestPos = pos; }
  }
  return best;
}

function hasKw(text, list) {
  const c = compact(text);
  return (list || []).some((k) => c.includes(compact(k)));
}

// Service within a known multi-service brand.
function pickService(brand, strong, weak) {
  if (!brand.services) return '';
  for (const s of brand.services) if (s.aliases.length && s.aliases.some((a) => compact(strong).includes(compact(a)))) return s.id;
  for (const s of brand.services) if (s.kw.length && hasKw(strong, s.kw)) return s.id;
  for (const s of brand.services) if (s.aliases.length && s.aliases.some((a) => compact(weak).includes(compact(a)))) return s.id;
  return brand.defaultService || brand.services[0].id;
}

function slugify(s) {
  const c = compact(s).replace(/[^a-z0-9\u0600-\u06FF]/g, '');
  return c.slice(0, 24) || 'x';
}

const CAT_HINTS = [
  ['food', ['غذا', 'رستوران', 'سوپرمارکت', 'food', 'supermarket', 'grocery']],
  ['transport', ['تاکسی', 'پیک', 'taxi', 'حمل']],
  ['travel', ['هتل', 'هواپیما', 'سفر', 'بلیط', 'گردشگری', 'tourism', 'travel', 'اقامت']],
  ['fashion', ['مد', 'لباس', 'پوشاک', 'آرایشی', 'زیبایی', 'fashion', 'cosmetic', 'beauty', 'زیورآلات']],
  ['media', ['سینما', 'فیلم', 'موسیقی', 'سریال', 'تئاتر', 'movie', 'سرگرمی']],
  ['edu', ['کتاب', 'آموزش', 'مدرسه', 'دانشگاه', 'book', 'education', 'زبان']],
  ['finance', ['بانک', 'مالی', 'سرمایه', 'طلا', 'ارز', 'کریپتو', 'finance', 'wallet']],
  ['insurance', ['بیمه', 'insurance']],
  ['telecom', ['اپراتور', 'اینترنت', 'سیم کارت', 'شارژ', 'operator', 'هاست', 'سرور']],
  ['health', ['سلامت', 'پزشک', 'دارو', 'رژیم', 'تناسب', 'مشاوره', 'health']],
  ['shop', ['فروشگاه', 'shop', 'store', 'کالا', 'دیجیتال']],
  ['services', ['خدمات', 'service', 'خودرو']],
];

function guessCategory(text) {
  const c = compact(text);
  for (const [id, words] of CAT_HINTS) if (words.some((w) => c.includes(compact(w)))) return id;
  return 'other';
}

// Classify a raw coupon: returns { brand, brandFa, service, category, known }.
// `srcBrand`: brand name as the source labels it (e.g. "اسنپ فود"); `srcSlug`: source slug (e.g. "snappfood").
function classify(raw) {
  const srcBrand = raw.srcBrand || '';
  const srcSlug = /^\s*\d+\s*$/.test(raw.srcSlug || '') ? '' : raw.srcSlug || ''; // numeric ids are not names
  const title = raw.title || '';
  const desc = raw.desc || '';
  const strong = [srcBrand, srcSlug, title].join(' ');
  // Trust the brand the source gives us; only fall back to the title when the source gave none
  // (a title like "... با دیجی پی" names the payment method, not the shop).
  let hit = matchAlias(srcBrand) || matchAlias(srcSlug.replace(/[-_]/g, ' ')) || matchAlias(srcSlug);
  if (!hit && !srcBrand && !srcSlug) hit = matchAlias(title) || matchAlias(desc);
  // A generic source brand ("اسنپ") may hide a more specific service in the title ("... اسنپ فود").
  if (hit && !hit.service) {
    const t = matchAlias(title);
    if (t && t.brand === hit.brand && t.service) hit = t;
  }
  if (hit) {
    const b = brandById(hit.brand);
    const service = hit.service || pickService(b, strong, desc);
    return { brand: b.id, brandFa: b.fa, service, category: b.cat, known: true };
  }
  const name = normFa(srcBrand) || normFa(srcSlug) || 'سایر';
  return {
    brand: 'x_' + (srcSlug || srcBrand ? slugify(srcSlug || srcBrand) : 'other'), // one "سایر" bucket, not one per title
    brandFa: name,
    service: '',
    category: raw.catHint ? guessCategory(raw.catHint) : guessCategory([srcBrand, title, desc].join(' ')),
    known: false,
  };
}

// Resolve free text typed by a user ("کد تخفیف اسنپ فود", "digikala") to a brand/service.
function resolveQuery(q) {
  const hit = matchAlias(q);
  if (!hit) return null;
  const b = brandById(hit.brand);
  if (!hit.service && b.services) {
    const s = b.services.find((sv) => sv.kw.length && hasKw(q, sv.kw));
    return { brand: b.id, service: s ? s.id : null };
  }
  return { brand: b.id, service: hit.service };
}

// Animated brand logos for the bot, from our custom emoji pack: https://t.me/addemoji/IranianBrandsAnimated
// Depends on catalog.js. Telegram shows a custom emoji sent by a bot only if the bot owner has Telegram Premium
// (Bot API 9.4); everywhere else (notifications, forwards, older apps) the plain emoji is shown instead.

// 'brand' or 'brand:service' -> [custom_emoji_id, the sticker's own emoji].
const CUSTOM_EMOJI = {
  snapp: ['5024117283887253544', '🚕'],
  'snapp:ride': ['5024117283887253544', '🚕'],
  'snapp:food': ['5026569873422026474', '🍔'],
  'snapp:market': ['5024196276925762119', '🛒'],
  'snapp:shop': ['5024260469506967822', '🛍'],
  'snapp:pay': ['5026576363117611069', '💸'],
  'snapp:doctor': ['5024096345921686715', '💊'],
  'snapp:trip': ['5024134661324933364', '✈\ufe0f'],
  tapsi: ['5024281901393776065', '🚖'],
  'tapsi:ride': ['5024281901393776065', '🚖'],
  'tapsi:food': ['5024104394690398933', '🍕'],
  'tapsi:market': ['5026329909304232649', '🧃'],
  'tapsi:shop': ['5026507819734533865', '🛍'],
  'tapsi:doctor': ['5023886111567513539', '🩺'],
  'tapsi:garage': ['5024098875657423052', '🔧'],
  digikala: ['5026037649664641195', '🛍'],
  'digikala:main': ['5026037649664641195', '🛍'],
  'digikala:jet': ['5024061221679139160', '🥦'],
  'digikala:style': ['5024028730251544497', '👕'],
  'digikala:pay': ['5026145758286448381', '💳'],
  'digikala:plus': ['5023831355029457545', '🎁'],
  digistyle: ['5024028730251544497', '👕'],
  khanoumi: ['5023895156768638987', '💄'],
  okala: ['5026150504225310555', '🛒'],
  azki: ['5023867548718860301', '🛡\ufe0f'],
  basalam: ['5026575216361342706', '🧺'],
  irancell: ['5026085199247574773', '📱'],
  technolife: ['5024052206542785765', '💻'],
  banimode: ['5026166554518096270', '👗'],
  filimo: ['5023906499777268022', '🎬'],
  namava: ['5026191177565604155', '📺'],
  iranicard: ['5026384081726736319', '💳'],
};

function customEmoji(brand, service) {
  return CUSTOM_EMOJI[service ? brand + ':' + service : brand] || null;
}

// A logo is { e: emoji, id: custom emoji id } when the pack has one, else { e: catalog emoji }.
function logoOf(brand, service, emoji) {
  const c = customEmoji(brand, service);
  return c ? { e: c[1], id: c[0] } : { e: emoji };
}
const brandLogo = (b) => logoOf(b.id, '', b.emoji);
const svcLogo = (brandId, s) => logoOf(brandId, s.id, s.emoji);

// A coupon in a mixed list: its service's logo, else its brand's.
function rowLogo(r) {
  if (r.service && customEmoji(r.brand, r.service)) return logoOf(r.brand, r.service, '');
  const b = brandById(r.brand);
  const cat = CATEGORIES.find((c) => c.id === r.category) || CATEGORIES[CATEGORIES.length - 1];
  return logoOf(r.brand, '', b ? b.emoji : cat.emoji);
}

// In message text (HTML) the emoji inside <tg-emoji> is the fallback.
function logoHtml(l) {
  return l.id ? '<tg-emoji emoji-id="' + l.id + '">' + l.e + '</tg-emoji>' : l.e;
}

// On buttons Telegram draws icon_custom_emoji_id before the text, so the text then carries no emoji.
function logoButton(l, text, fields) {
  return Object.assign(l.id ? { text, icon_custom_emoji_id: l.id } : { text: l.e + ' ' + text }, fields);
}

// Every other emoji the bot shows, animated: the matching custom emoji from our second pack
// (https://t.me/addemoji/RestrictedEmoji). Brand logos (logos.js) are placed while building a view; this pass then
// turns each remaining plain emoji of a message into <tg-emoji> and a button's emoji into its icon_custom_emoji_id.
// Popups (answerCallbackQuery), the command menu and the bot description are plain text, so they keep plain emoji.

// Plain emoji (without U+FE0F) -> [custom_emoji_id, the sticker's own emoji].
const ANIMATED_EMOJI = {
  '⌛': ['5451646226975955576', '⌛\ufe0f'], '⌨': ['5472111548572900003', '⌨\ufe0f'], '⏰': ['5413704112220949842', '⏰'], '⏳': ['5451732530048802485', '⏳'],
  '⚡': ['5431449001532594346', '⚡\ufe0f'], '✅': ['5427009714745517609', '✅'], '✈': ['5361600266225326825', '✈\ufe0f'], '✔': ['5188216731453103384', '✔\ufe0f'],
  '❌': ['5465665476971471368', '❌'], '❓': ['5467666648263564704', '❓'], '⭐': ['5435957248314579621', '⭐\ufe0f'], '🆕': ['5361979468887893611', '🆕'],
  '🌍': ['5399898266265475100', '🌍'], '🌿': ['5449850741667668411', '🌿'], '🍔': ['5372998546788194447', '🍔'], '🍕': ['5370980663778351052', '🍕'],
  '🍿': ['5371081166013078244', '🍿'], '🎁': ['5199749070830197566', '🎁'], '🎉': ['5436040291507247633', '🎉'], '🎓': ['5375163339154399459', '🎓'],
  '🎟': ['5377599075237502153', '🎟'], '🎫': ['5418010521309815154', '🎫'], '🎬': ['5375464961822695044', '🎬'], '🎭': ['5359441070201513074', '🎭'],
  '🎮': ['5467583879948803288', '🎮'], '🎸': ['5465665777619204788', '🎸'], '🏕': ['5359636199155704118', '🏕'], '🏠': ['5465226866321268133', '🏠'],
  '🏥': ['5264827875588077689', '🏥'], '🏦': ['5264895611517300926', '🏦'], '🏨': ['5265159812135546996', '🏨'], '🏫': ['5265002646397285605', '🏫'],
  '👇': ['5470177992950946662', '👇'], '👈': ['5469735272017043817', '👈'], '👉': ['5471978009449731768', '👉'], '👋': ['5472055112702629499', '👋'],
  '👜': ['5380056101473492248', '👜'], '👠': ['5372917273122054051', '👠'], '💄': ['5425119671437237058', '💄'], '💅': ['5373334855612375386', '💅'],
  '💊': ['5433635625217563352', '💊'], '💍': ['5402100905883488232', '💍'], '💡': ['5472146462362048818', '💡'], '💪': ['5471883477219549006', '💪'],
  '💰': ['5375296873982604963', '💰'], '💱': ['5471899089425667918', '💱'], '📂': ['5431721976769027887', '📂'], '📊': ['5431577498364158238', '📊'],
  '📎': ['5377844313575150051', '📎'], '📖': ['5226512880362332956', '📖'], '📚': ['5373098009640836781', '📚'], '📝': ['5334882760735598374', '📝'],
  '📣': ['5469903029144657419', '📣'], '📱': ['5407025283456835913', '📱'], '📲': ['5406809207947142040', '📲'], '📺': ['5373330964372004748', '📺'],
  '🔎': ['5188311512791393083', '🔎'], '🔐': ['5472308992514464048', '🔐'], '🔑': ['5330115548900501467', '🔑'], '🔔': ['5242628160297641831', '🔔'],
  '🔕': ['5244807637157029775', '🔕'], '🔗': ['5375129357373165375', '🔗'], '🔥': ['5420315771991497307', '🔥'], '🗂': ['5431736674147114227', '🗂'],
  '🗣': ['5370765563226236970', '🗣'], '😕': ['5373272140499918095', '😕'], '🙏': ['5472189549473963781', '🙏'], '🚕': ['5445015510435502457', '🚕'],
  '🚗': ['5445085952194124000', '🚗'], '🛍': ['5373052667671093676', '🛍'], '🛒': ['5431499171045581032', '🛒'], '🛫': ['5267341200255363810', '🛫'],
  '🛬': ['5237795059369257857', '🛬'], '🤖': ['5372981976804366741', '🤖'], '🤫': ['5370930189322688800', '🤫'], '🥇': ['5280735858926822987', '🥇'],
  '🥗': ['5264946326491134516', '🥗'], '🥫': ['5471958978449644934', '🥫'], '🧠': ['5237799019329105246', '🧠'], '🧰': ['5449428597922079323', '🧰'],
  '🧱': ['5436275698664759373', '🧱'], '🩺': ['5359299744302639114', '🩺'], '🪙': ['5379600444098093058', '🪙'],
  // Not in the pack: the closest emoji it has.
  '🌐': ['5399898266265475100', '🌍'], '🌙': ['5465643984955120548', '🌛'], '🌶': ['5370940699107662298', '🌮'], '🎞': ['5375464961822695044', '🎬'],
  '🎧': ['5188705588925702510', '🎶'], '🏡': ['5433645645376264953', '🏖'], '🏷': ['5373052667671093676', '🛍'], '👗': ['5372917273122054051', '👠'],
  '👚': ['5472363448404809929', '👛'], '👟': ['5372917273122054051', '👠'], '💳': ['5264895611517300926', '🏦'], '💹': ['5373001317042101552', '📈'],
  '📕': ['5226512880362332956', '📖'], '📡': ['5321304062715517873', '🛰'], '📦': ['5350421256627838238', '📬'], '📶': ['5407025283456835913', '📱'],
  '🔌': ['5472146462362048818', '💡'], '🔧': ['5449428597922079323', '🧰'], '🔩': ['5449428597922079323', '🧰'], '🖥': ['5431376038628171216', '💻'],
  '🚌': ['5418010521309815154', '🎫'], '🚖': ['5445015510435502457', '🚕'], '🚘': ['5445015510435502457', '🚕'], '🚙': ['5445085952194124000', '🚗'],
  '🛏': ['5265159812135546996', '🏨'], '🛡': ['5426900601101374618', '🧿'], '🛵': ['5445284980978621387', '🚀'], '🥑': ['5264946326491134516', '🥗'],
  '🥘': ['5359678839591018693', '🍽'], '🧺': ['5373052667671093676', '🛍'],
};

// Telegram keeps at most 100 entities (bold, links, code, custom emoji…) per message and silently drops the rest.
const MAX_ENTITIES = 100;
const EMOJI_SRC = '\\p{Extended_Pictographic}(?:\\ufe0f|\\p{Emoji_Modifier})?(?:\\u200d\\p{Extended_Pictographic}(?:\\ufe0f|\\p{Emoji_Modifier})?)*';
const EMOJI_RE = new RegExp(EMOJI_SRC, 'gu');
const LEAD_RE = new RegExp('^(' + EMOJI_SRC + ')\\s*', 'u');
const TRAIL_RE = new RegExp('\\s*(' + EMOJI_SRC + ')$', 'u');
const ENTITY_TAG_RE = /^<(?:b|strong|i|em|u|ins|s|strike|del|code|pre|a|tg-emoji|tg-spoiler|span|blockquote)\b/i;

function animatedEmoji(e) {
  return ANIMATED_EMOJI[e.replace(/\ufe0f/g, '')] || null;
}

// HTML message text: wrap each known emoji in <tg-emoji>, except inside <code>, <pre> (custom emoji can't go there)
// and existing <tg-emoji>; stop before the message would pass Telegram's entity limit.
function animateHtml(html) {
  const parts = String(html == null ? '' : html).split(/(<[^>]*>)/);
  let budget = MAX_ENTITIES - parts.filter((p, i) => i % 2 && ENTITY_TAG_RE.test(p)).length;
  let skip = 0;
  for (let i = 0; i < parts.length; i++) {
    if (i % 2) {
      const tag = /^<(\/?)(code|pre|tg-emoji)\b/i.exec(parts[i]);
      if (tag) skip += tag[1] ? -1 : 1;
      continue;
    }
    if (skip > 0 || !parts[i]) continue;
    parts[i] = parts[i].replace(EMOJI_RE, (e) => {
      const a = animatedEmoji(e);
      if (!a || budget <= 0) return e;
      budget--;
      return '<tg-emoji emoji-id="' + a[0] + '">' + a[1] + '</tg-emoji>';
    });
  }
  return parts.join('');
}

// Inline button: its leading (or trailing) emoji becomes the icon Telegram draws before the text.
function animateButton(b) {
  if (!b || b.icon_custom_emoji_id || typeof b.text !== 'string') return b;
  const m = LEAD_RE.exec(b.text) || TRAIL_RE.exec(b.text);
  const a = m && animatedEmoji(m[1]);
  const text = m ? (b.text.slice(0, m.index) + b.text.slice(m.index + m[0].length)).trim() : '';
  return a && text ? Object.assign({}, b, { text, icon_custom_emoji_id: a[0] }) : b;
}

// A Bot API call with its message text and buttons animated.
function animateCall(c) {
  const p = (c && c.payload) || {};
  if (p.parse_mode !== 'HTML') return c;
  const payload = Object.assign({}, p, { text: animateHtml(p.text) });
  const kb = p.reply_markup && p.reply_markup.inline_keyboard;
  if (kb) payload.reply_markup = Object.assign({}, p.reply_markup, { inline_keyboard: kb.map((row) => row.map(animateButton)) });
  return Object.assign({}, c, { payload });
}

// Telegram bot brain: turns an update + table data into Telegram API calls.
// Depends on text.js + catalog.js + logos.js + emoji.js. Pure functions, easy to test outside n8n.

const BOT_USERNAME = 'takhfif_finder_bot';
const PAGE = 5;          // coupons per page
const STORES_PAGE = 12;  // brand buttons per page

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fa(n) { return toFaDigits(String(n)); }

// ---- Update parsing -----------------------------------------------------------------------------
function parseUpdate(u) {
  const upd = u || {};
  if (upd.callback_query) {
    const q = upd.callback_query;
    return {
      kind: 'callback', cbId: q.id, data: q.data || '', chatId: q.message && q.message.chat.id, msgId: q.message && q.message.message_id,
      userId: q.from.id, firstName: q.from.first_name || '', username: q.from.username || '', isPrivate: q.message && q.message.chat.type === 'private',
    };
  }
  const m = upd.message || upd.edited_message;
  if (m && m.from) {
    return {
      kind: 'message', text: (m.text || m.caption || '').trim(), chatId: m.chat.id, msgId: m.message_id,
      userId: m.from.id, firstName: m.from.first_name || '', username: m.from.username || '', isPrivate: m.chat.type === 'private',
    };
  }
  if (upd.my_chat_member) {
    const c = upd.my_chat_member;
    return { kind: 'member', userId: c.from.id, chatId: c.chat.id, status: c.new_chat_member && c.new_chat_member.status, firstName: c.from.first_name || '', username: c.from.username || '' };
  }
  return { kind: 'other' };
}

// Decide the view and which coupon rows it needs.
// query: { need, key, cond, value, all, limit, order } for a single Data Table "get".
function routeUpdate(ctx) {
  const none = { need: false, key: 'active', cond: 'isTrue', value: '', all: false, limit: 1, order: 'score' };
  const brandQ = (b) => ({ need: true, key: 'brand', cond: 'eq', value: b, all: true, limit: 500, order: 'score' });
  // A specific service adds a second condition to the same query (key2/cond2/value2 in the Bot workflow).
  const listQ = (b, svc) => Object.assign(brandQ(b), svc && svc !== '*' ? { key2: 'service', cond2: 'eq', value2: svc } : {});
  const allQ = { need: true, key: 'active', cond: 'isTrue', value: '', all: true, limit: 5000, order: 'score' };
  const topQ = (order) => ({ need: true, key: 'active', cond: 'isTrue', value: '', all: false, limit: 60, order });
  // Multi-service brands open a service menu (counts come from stats); others go straight to their list.
  const brandR = (b, extra) => {
    const bb = brandById(b);
    return Object.assign({ view: 'brand', brand: b, query: bb && bb.services ? none : brandQ(b) }, extra || {});
  };
  if (ctx.kind === 'callback') {
    const p = ctx.data.split(':');
    switch (p[0]) {
      case 'h': return { view: 'home', query: none };
      case 'b': return brandR(p[1]);
      case 's': return { view: 'list', brand: p[1], service: p[2] || '*', page: +p[3] || 0, query: listQ(p[1], p[2]) };
      case 'n': return { view: 'newest', page: +p[1] || 0, query: topQ('first_seen') };
      case 't': return { view: 'hot', page: +p[1] || 0, query: topQ('score') };
      case 'a': return { view: 'stores', page: +p[1] || 0, query: none };
      case 'cats': return { view: 'cats', query: none };
      case 'c': return { view: 'cat', cat: p[1], page: +p[2] || 0, query: none };
      case 'f': return { view: 'follow', brand: p[1], service: p[2] || '*', ret: p[3] || 'b', query: p[3] === 'l' ? listQ(p[1], p[2]) : none };
      case 'my': return { view: 'mysubs', query: none };
      case 'u': return { view: 'unfollow', brand: p[1], service: p[2] || '*', query: none };
      case 'r': return { view: 'search', page: +p[1] || 0, q: p.slice(2).join(':'), query: allQ };
      case 'q': return { view: 'searchHelp', query: none };
      case 'help': return { view: 'help', query: none };
      case 'noop': return { view: 'noop', query: none };
      case 'j': // "I joined" on the channel gate: re-check membership, then open the view the user was heading to
        return Object.assign({}, routeUpdate(Object.assign({}, ctx, { data: p.slice(1).join(':') || 'h' })), { joinCheck: true });
      default: return { view: 'home', query: none };
    }
  }
  if (ctx.kind === 'message') {
    const t = ctx.text || '';
    const cmd = /^\/([a-z_]+)(?:@\w+)?(?:\s+(.*))?$/i.exec(t);
    if (cmd) {
      const c = cmd[1].toLowerCase();
      const arg = (cmd[2] || '').trim();
      if (c === 'start' && arg) {
        const m = /^([a-z0-9_]+?)(?:__([a-z0-9]+))?$/i.exec(arg);
        if (m && brandById(m[1])) return m[2] ? { view: 'list', brand: m[1], service: m[2], page: 0, query: listQ(m[1], m[2]), fresh: true } : brandR(m[1], { fresh: true });
      }
      if (c === 'start' || c === 'menu') return { view: 'home', query: none, fresh: true };
      if (c === 'new' || c === 'newest') return { view: 'newest', page: 0, query: topQ('first_seen'), fresh: true };
      if (c === 'hot' || c === 'top') return { view: 'hot', page: 0, query: topQ('score'), fresh: true };
      if (c === 'brands' || c === 'stores') return { view: 'stores', page: 0, query: none, fresh: true };
      if (c === 'alerts' || c === 'subs') return { view: 'mysubs', query: none, fresh: true };
      if (c === 'help') return { view: 'help', query: none, fresh: true };
      if (c === 'stats') return { view: 'stats', query: none, fresh: true };
      if (c === 'snapp' || c === 'tapsi' || c === 'digikala') return brandR(c, { fresh: true });
      return { view: 'home', query: none, fresh: true };
    }
    if (!t) return { view: 'home', query: none, fresh: true };
    const r = resolveQuery(t);
    if (r && r.service) return { view: 'list', brand: r.brand, service: r.service, page: 0, query: listQ(r.brand, r.service), fresh: true };
    if (r) return brandR(r.brand, { fresh: true });
    return { view: 'search', page: 0, q: normFa(t).slice(0, 40), query: allQ, fresh: true };
  }
  return { view: 'ignore', query: none };
}

// ---- Helpers --------------------------------------------------------------------------------------
function statsBrand(stats, id) {
  return (stats && stats.brands && stats.brands[id]) || null;
}

function brandInfo(id, stats) {
  const b = brandById(id);
  const s = statsBrand(stats, id);
  if (b) return { id, fa: b.fa, emoji: b.emoji, services: b.services || null, cat: b.cat, n: s ? s.n : 0, s: s ? s.s : {} };
  const cat = CATEGORIES.find((c) => c.id === (s && s.cat)) || CATEGORIES[CATEGORIES.length - 1];
  return { id, fa: s ? s.fa : id.replace(/^x_/, ''), emoji: cat.emoji, services: null, cat: s ? s.cat : 'other', n: s ? s.n : 0, s: {} };
}

function subsOf(user) {
  return new Set(String((user && user.subs) || '').split(',').map((x) => x.trim()).filter(Boolean));
}

function isFollowing(user, brand, service) {
  const subs = subsOf(user);
  return subs.has(brand + ':' + (service || '*')) || subs.has(brand + ':*');
}

function relTime(iso, now) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return '';
  const m = Math.max(0, Math.round((now - t) / 60000));
  if (m < 2) return 'همین الان';
  if (m < 60) return fa(m) + ' دقیقه پیش';
  const h = Math.round(m / 60);
  if (h < 24) return fa(h) + ' ساعت پیش';
  return fa(Math.round(h / 24)) + ' روز پیش';
}

function expiryLabel(iso, now) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return '✅ فعلاً معتبر';
  const h = (t - now) / 3600e3;
  if (h < 0) return '⌛\ufe0f منقضی شده';
  if (h < 24) return '🔥 فقط امروز';
  const d = Math.ceil(h / 24);
  return '⏳ ' + fa(d) + ' روز مانده';
}

function sortRows(rows) {
  return rows.slice().sort((a, b) => (b.score || 0) - (a.score || 0) || String(b.last_seen || '').localeCompare(String(a.last_seen || '')));
}

function pager(prefix, page, pages) {
  if (pages <= 1) return [];
  const row = [];
  if (page > 0) row.push({ text: '👈 قبلی', callback_data: prefix + (page - 1) });
  row.push({ text: '📖 ' + fa(page + 1) + ' از ' + fa(pages), callback_data: 'noop' });
  if (page < pages - 1) row.push({ text: 'بعدی 👉', callback_data: prefix + (page + 1) });
  return [row];
}

function pairs(buttons) {
  const rows = [];
  for (let i = 0; i < buttons.length; i += 2) rows.push(buttons.slice(i, i + 2));
  return rows;
}

const HOME_BTN = { text: '🏠 منوی اصلی', callback_data: 'h' };

// One coupon as an HTML block, headed "name | title" (name: its service or brand, after the logo).
function couponBlock(r, i, now, name, logo) {
  const lines = [];
  const head = (name ? (logo ? logoHtml(logo) + ' ' : '') + esc(name) + ' | ' : '') + esc(r.title);
  lines.push('<b>' + fa(i) + ') ' + head + '</b>');
  if (r.kind === 'code' && r.code) {
    lines.push('🎟 کد: <code>' + esc(r.code) + '</code>' + (r.hidden ? '  🤫 <i>کد مخفی</i>' : ''));
    if (r.alt_codes) lines.push('🎟 کدهای جایگزین: ' + r.alt_codes.split(',').map((c) => '<code>' + esc(c) + '</code>').join(' ، '));
  } else if (r.kind === 'unique') {
    lines.push('🔐 کد اختصاصی — با لینک زیر کد مخصوص خودت رو بگیر');
  } else {
    lines.push('🎁 آفر بدون کد — فقط از لینک خرید کن');
  }
  const meta = [];
  if (r.discount) meta.push('💰 ' + esc(r.discount));
  meta.push(expiryLabel(r.expires_at, now));
  lines.push(meta.join(' · '));
  const extra = [r.conditions, r.descr].filter(Boolean).join(' — ');
  if (extra) lines.push('📝 ' + esc(oneLine(extra, 170)));
  const srcN = String(r.sources || '').split(',').filter(Boolean).length;
  const trust = srcN > 1 ? '✔\ufe0f تأیید از ' + fa(srcN) + ' منبع' : '🔎 ' + esc(SOURCE_FA[String(r.sources || '').split(',')[0]] || 'منبع معتبر');
  const link = r.link || r.src_url;
  const label = r.link ? (r.kind === 'code' ? 'لینک خرید' : 'دریافت آفر') : 'منبع';
  lines.push(trust + (link ? ' · <a href="' + esc(link) + '">🔗 ' + label + '</a>' : ''));
  return lines.join('\n');
}

function copyButtons(rows) {
  const btns = [];
  for (const r of rows) {
    if (r.kind === 'code' && r.code) btns.push({ text: '📎 ' + r.code.slice(0, 24), copy_text: { text: r.code } });
    else if (r.link || r.src_url) btns.push({ text: '🔗 ' + (r.kind === 'unique' ? 'دریافت کد ' : 'آفر ') + oneLine(r.brand_fa || '', 14), url: r.link || r.src_url });
  }
  return pairs(btns);
}

// ---- Views ----------------------------------------------------------------------------------------
function viewHome(ctx, data, now) {
  const st = data.stats || {};
  const total = st.total || 0;
  const srcCount = Object.keys(st.sources || {}).length;
  const name = esc(oneLine(ctx.firstName || 'دوست خوبم', 30));
  const text = [
    '🎁 <b>تخفیف\u200cیاب</b> | هوشمندترین شکارچی کد تخفیف ایران',
    '',
    'سلام ' + name + '! 👋',
    '✅ <b>' + fa(total) + '</b> کد تخفیف و آفر فعال' + (st.codes ? ' (<b>' + fa(st.codes) + '</b> کد آماده\u200cی کپی)' : ''),
    '🌍 جمع\u200cآوری لحظه\u200cای از <b>' + fa(srcCount || 10) + '</b> منبع + کانال\u200cهای اختصاصی',
    st.updatedAt ? '⏰ آخرین به\u200cروزرسانی: ' + relTime(st.updatedAt, now) : '',
    '',
    '👇 برندت رو انتخاب کن، یا فقط اسمش رو تایپ کن (مثلاً <i>اسنپ فود</i>)',
  ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
  const btn = (id) => {
    const b = brandInfo(id, st);
    return logoButton(brandLogo(b), b.fa + (b.n ? ' (' + fa(b.n) + ')' : ''), { callback_data: 'b:' + id });
  };
  const featured = ['snapp', 'tapsi', 'digikala'];
  const others = Object.keys(st.brands || {})
    .filter((id) => !featured.includes(id))
    .sort((a, b) => (st.brands[b].n || 0) - (st.brands[a].n || 0))
    .slice(0, 8);
  const kb = [[btn('snapp'), btn('tapsi')], [btn('digikala')]].concat(pairs(others.map(btn)));
  kb.push([{ text: '🗂 همه فروشگاه\u200cها', callback_data: 'a:0' }, { text: '📂 دسته\u200cبندی\u200cها', callback_data: 'cats' }]);
  kb.push([{ text: '🔥 داغ\u200cترین کدها', callback_data: 't:0' }, { text: '🆕 جدیدترین کدها', callback_data: 'n:0' }]);
  kb.push([{ text: '🔔 اعلان\u200cهای من', callback_data: 'my' }, { text: '🔎 جستجو', callback_data: 'q' }, { text: '❓ راهنما', callback_data: 'help' }]);
  kb.push([{ text: '📣 معرفی ربات به دوستان', url: 'https://t.me/share/url?url=' + encodeURIComponent('https://t.me/' + BOT_USERNAME) + '&text=' + encodeURIComponent('🎁 همه کدهای تخفیف فعال اسنپ، تپسی، دیجی\u200cکالا و ... یک\u200cجا!') }]);
  return { text, kb };
}

function viewBrand(ctx, data, route, now) {
  const b = brandInfo(route.brand, data.stats);
  if (!b.services) return null; // single-service brand -> list view
  const svcN = b.services.filter((s) => (b.s[s.id] || 0) > 0).length;
  const text = [
    logoHtml(brandLogo(b)) + ' <b>کدهای تخفیف ' + esc(b.fa) + '</b>',
    '✅ ' + fa(b.n) + ' کد و آفر فعال در ' + fa(svcN) + ' سرویس',
    '',
    'سرویس موردنظرت رو انتخاب کن 👇',
  ].join('\n');
  const btns = b.services.map((s) => logoButton(svcLogo(b.id, s), s.fa + ' (' + (b.s[s.id] ? fa(b.s[s.id]) : '۰') + ')', { callback_data: 's:' + b.id + ':' + s.id + ':0' }));
  const kb = pairs(btns);
  kb.push([{ text: '🗂 همه کدهای ' + b.fa + ' (' + fa(b.n) + ')', callback_data: 's:' + b.id + ':*:0' }]);
  const on = isFollowing(data.user, b.id, '*');
  kb.push([{ text: on ? '🔕 لغو اعلان کدهای جدید ' + b.fa : '🔔 کد جدید ' + b.fa + ' اومد خبرم کن', callback_data: 'f:' + b.id + ':*:b' }]);
  kb.push([HOME_BTN]);
  return { text, kb };
}

function viewList(ctx, data, route, now) {
  const b = brandInfo(route.brand, data.stats);
  const svc = route.service && route.service !== '*' ? serviceOf(route.brand, route.service) : null;
  const rows = sortRows((data.rows || []).filter((r) => r.brand === route.brand && r.active !== false && (!svc || r.service === svc.id)));
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const page = Math.min(Math.max(0, route.page || 0), pages - 1);
  const slice = rows.slice(page * PAGE, page * PAGE + PAGE);
  const title = logoHtml(svc ? svcLogo(b.id, svc) : brandLogo(b)) + ' <b>کدهای تخفیف ' + esc(svc ? svc.fa : b.fa) + '</b>';
  const codes = rows.filter((r) => r.kind === 'code').length;
  const parts = [title];
  if (!rows.length) {
    parts.push('', '😕 فعلاً کد فعالی برای این بخش پیدا نکردم.', 'ربات هر ۲ ساعت همه منابع رو دوباره می\u200cگرده؛ دکمه\u200cی 🔔 رو بزن تا به محض پیدا شدن کد جدید خبرت کنم.');
  } else {
    parts.push('✅ ' + fa(rows.length) + ' مورد فعال' + (codes ? ' · ' + fa(codes) + ' کد' : '') + (pages > 1 ? ' · صفحه ' + fa(page + 1) + ' از ' + fa(pages) : ''));
    parts.push('━━━━━━━━━━━━━━');
    slice.forEach((r, i) => {
      const sv = !svc && b.services && r.service ? serviceOf(b.id, r.service) : null;
      parts.push(couponBlock(r, page * PAGE + i + 1, now, sv ? sv.fa : '', sv ? svcLogo(b.id, sv) : null), '');
    });
    parts.push('💡 روی کد بزن یا از دکمه\u200cهای 📎 زیر استفاده کن تا کپی بشه.');
  }
  const kb = copyButtons(slice);
  kb.push(...pager('s:' + b.id + ':' + (svc ? svc.id : '*') + ':', page, pages));
  const on = isFollowing(data.user, b.id, svc ? svc.id : '*');
  kb.push([{ text: on ? '🔕 لغو اعلان' : '🔔 کد جدید اومد خبرم کن', callback_data: 'f:' + b.id + ':' + (svc ? svc.id : '*') + ':l' }]);
  const back = b.services ? { text: '👈 ' + b.fa, callback_data: 'b:' + b.id } : { text: '👈 فروشگاه\u200cها', callback_data: 'a:0' };
  kb.push([back, HOME_BTN]);
  return { text: parts.join('\n'), kb };
}

function viewTop(ctx, data, route, now, mode) {
  const rows = (data.rows || []).filter((r) => r.active !== false);
  const sorted = mode === 'newest'
    ? rows.slice().sort((a, b) => String(b.first_seen || '').localeCompare(String(a.first_seen || '')))
    : sortRows(rows);
  const pages = Math.max(1, Math.ceil(sorted.length / PAGE));
  const page = Math.min(Math.max(0, route.page || 0), pages - 1);
  const slice = sorted.slice(page * PAGE, page * PAGE + PAGE);
  const head = mode === 'newest' ? '🆕 <b>جدیدترین کدهای کشف\u200cشده</b>' : '🔥 <b>داغ\u200cترین کدهای تخفیف</b> (بر اساس امتیاز هوشمند)';
  const parts = [head, '━━━━━━━━━━━━━━'];
  slice.forEach((r, i) => parts.push(couponBlock(r, page * PAGE + i + 1, now, r.brand_fa, rowLogo(r)), ''));
  if (!slice.length) parts.push('فعلاً چیزی پیدا نشد؛ کمی بعد دوباره سر بزن 🙏');
  const kb = copyButtons(slice);
  kb.push(...pager(mode === 'newest' ? 'n:' : 't:', page, pages));
  kb.push([HOME_BTN]);
  return { text: parts.join('\n'), kb };
}

function brandButtonsSorted(stats, filterFn) {
  return Object.keys((stats && stats.brands) || {})
    .filter(filterFn || (() => true))
    .sort((a, b) => (stats.brands[b].n || 0) - (stats.brands[a].n || 0));
}

function viewStores(ctx, data, route) {
  const ids = brandButtonsSorted(data.stats);
  const pages = Math.max(1, Math.ceil(ids.length / STORES_PAGE));
  const page = Math.min(Math.max(0, route.page || 0), pages - 1);
  const slice = ids.slice(page * STORES_PAGE, page * STORES_PAGE + STORES_PAGE);
  const text = '🗂 <b>همه فروشگاه\u200cها و برندها</b>\n' + fa(ids.length) + ' برند با کد فعال — مرتب\u200cشده بر اساس تعداد کد\n\nیکی رو انتخاب کن 👇';
  const kb = pairs(slice.map((id) => { const b = brandInfo(id, data.stats); return logoButton(brandLogo(b), oneLine(b.fa, 18) + ' (' + fa(b.n) + ')', { callback_data: 'b:' + id }); }));
  kb.push(...pager('a:', page, pages));
  kb.push([{ text: '📂 دسته\u200cبندی\u200cها', callback_data: 'cats' }, HOME_BTN]);
  return { text, kb };
}

function viewCats(ctx, data) {
  const st = data.stats || {};
  const counts = {};
  for (const id of Object.keys(st.brands || {})) {
    const cat = brandInfo(id, st).cat || 'other';
    counts[cat] = (counts[cat] || 0) + (st.brands[id].n || 0);
  }
  const btns = CATEGORIES.filter((c) => c.id !== 'super' && counts[c.id]).map((c) => ({ text: c.emoji + ' ' + c.fa + ' (' + fa(counts[c.id]) + ')', callback_data: 'c:' + c.id + ':0' }));
  const kb = pairs(btns);
  kb.push(['snapp', 'tapsi', 'digikala'].map((id) => { const b = brandInfo(id, st); return logoButton(brandLogo(b), b.fa, { callback_data: 'b:' + id }); }));
  kb.push([HOME_BTN]);
  return { text: '📂 <b>دسته\u200cبندی\u200cها</b>\nدسته\u200cی موردنظرت رو انتخاب کن 👇', kb };
}

function viewCat(ctx, data, route) {
  const cat = CATEGORIES.find((c) => c.id === route.cat) || CATEGORIES[CATEGORIES.length - 1];
  const ids = brandButtonsSorted(data.stats, (id) => brandInfo(id, data.stats).cat === cat.id);
  const pages = Math.max(1, Math.ceil(ids.length / STORES_PAGE));
  const page = Math.min(Math.max(0, route.page || 0), pages - 1);
  const slice = ids.slice(page * STORES_PAGE, page * STORES_PAGE + STORES_PAGE);
  const kb = pairs(slice.map((id) => { const b = brandInfo(id, data.stats); return logoButton(brandLogo(b), oneLine(b.fa, 18) + ' (' + fa(b.n) + ')', { callback_data: 'b:' + id }); }));
  kb.push(...pager('c:' + cat.id + ':', page, pages));
  kb.push([{ text: '👈 دسته\u200cبندی\u200cها', callback_data: 'cats' }, HOME_BTN]);
  return { text: cat.emoji + ' <b>' + esc(cat.fa) + '</b>\n' + fa(ids.length) + ' برند فعال 👇', kb };
}

function searchRows(rows, q) {
  const words = normFa(q).toLowerCase().split(/\s+/).filter((w) => w.length > 1 && !/^(کد|تخفیف|کدتخفیف|برای|و|از|با)$/.test(w)).map(compact);
  if (!words.length) return [];
  const scored = [];
  for (const r of rows) {
    const hay = compact([r.brand_fa, r.title, r.descr, r.code, r.brand].join(' '));
    let hit = 0;
    for (const w of words) if (hay.includes(w)) hit++;
    if (hit) scored.push({ r, s: hit * 100 + (r.score || 0) });
  }
  return scored.sort((a, b) => b.s - a.s).map((x) => x.r);
}

function viewSearch(ctx, data, route, now) {
  const found = searchRows((data.rows || []).filter((r) => r.active !== false), route.q || '');
  const pages = Math.max(1, Math.ceil(found.length / PAGE));
  const page = Math.min(Math.max(0, route.page || 0), pages - 1);
  const slice = found.slice(page * PAGE, page * PAGE + PAGE);
  const parts = ['🔎 نتایج جستجو برای «<b>' + esc(route.q) + '</b>»'];
  if (!found.length) {
    parts.push('', '😕 چیزی پیدا نکردم. اسم برند رو امتحان کن (مثلاً: <i>اسنپ فود</i>، <i>دیجی کالا</i>، <i>تپسی</i>، <i>فیلیمو</i>) یا از منو انتخاب کن.');
  } else {
    parts.push('✅ ' + fa(found.length) + ' نتیجه', '━━━━━━━━━━━━━━');
    slice.forEach((r, i) => parts.push(couponBlock(r, page * PAGE + i + 1, now, r.brand_fa, rowLogo(r)), ''));
  }
  const kb = copyButtons(slice);
  const qShort = String(route.q || '').slice(0, 18);
  kb.push(...pager('r:', page, pages).map((row) => row.map((b) => (b.callback_data.startsWith('r:') ? Object.assign({}, b, { callback_data: b.callback_data + ':' + qShort }) : b))));
  kb.push([{ text: '🗂 همه فروشگاه\u200cها', callback_data: 'a:0' }, HOME_BTN]);
  return { text: parts.join('\n'), kb };
}

function viewMySubs(ctx, data) {
  const subs = [...subsOf(data.user)];
  const parts = ['🔔 <b>اعلان\u200cهای من</b>'];
  const kb = [];
  if (!subs.length) {
    parts.push('', 'هنوز برای هیچ برندی اعلان فعال نکردی.', 'داخل صفحه\u200cی هر برند یا سرویس، دکمه\u200cی «🔔 خبرم کن» رو بزن تا به محض کشف کد جدید، همینجا برات بفرستم ⚡\ufe0f');
  } else {
    parts.push('به محض کشف کد جدید در این بخش\u200cها خبرت می\u200cکنم:', '');
    for (const s of subs) {
      const [bid, sid] = s.split(':');
      const b = brandInfo(bid, data.stats);
      const sv = sid && sid !== '*' ? serviceOf(bid, sid) : null;
      const label = sv ? sv.fa : 'همه\u200cی ' + b.fa;
      parts.push('• ' + logoHtml(sv ? svcLogo(bid, sv) : brandLogo(b)) + ' ' + esc(label));
      kb.push([{ text: '🔕 حذف ' + oneLine(label, 24), callback_data: 'u:' + bid + ':' + (sid || '*') }]);
    }
  }
  kb.push([HOME_BTN]);
  return { text: parts.join('\n'), kb };
}

function viewHelp() {
  const text = [
    '❓ <b>راهنمای تخفیف\u200cیاب</b>',
    '',
    '🤖 این ربات هر ۲ ساعت بیش از ۱۰ سایت کد تخفیف (موپن، کانال تخفیف، آفردیلی، تخفیفه، آفرجو، استورکد، بودجه، تپسی\u200cتخفیف، ایرانیکارت و ...) به\u200cعلاوه\u200cی کانال\u200cهای تلگرامی اختصاصی رو می\u200cگرده، کدهای مخفی پشت دکمه\u200cی «نمایش کد» رو استخراج می\u200cکنه، تکراری\u200cها رو ادغام می\u200cکنه و فقط کدهای معتبر رو نشونت میده.',
    '',
    '🧠 <b>امتیاز هوشمند:</b> کدهایی که در چند منبع تأیید شدن، تخفیف بیشتری دارن و تازه\u200cترن بالاتر میان.',
    '📎 <b>کپی با یک لمس:</b> روی کد یا دکمه\u200cی 📎 بزن.',
    '🔔 <b>اعلان:</b> برای هر برند/سرویس دکمه\u200cی «خبرم کن» رو بزن؛ کد جدید که پیدا بشه برات می\u200cفرستم.',
    '🔎 <b>جستجو:</b> کافیه اسم برند یا سرویس رو بنویسی: «اسنپ فود»، «تپسی گاراژ»، «دیجی کالا جت»، «فیلیمو»...',
    '',
    '⌨\ufe0f دستورات: /start منو · /hot داغ\u200cترین\u200cها · /new جدیدترین\u200cها · /brands فروشگاه\u200cها · /alerts اعلان\u200cها',
  ].join('\n');
  return { text, kb: [[HOME_BTN]] };
}

function viewStats(ctx, data, now) {
  const st = data.stats || {};
  const parts = ['📊 <b>آمار تخفیف\u200cیاب</b>', '', '✅ موارد فعال: ' + fa(st.total || 0) + ' (کد: ' + fa(st.codes || 0) + ')', '🛍 برندها: ' + fa(Object.keys(st.brands || {}).length), st.updatedAt ? '⏰ آخرین crawl: ' + relTime(st.updatedAt, now) : '', '', '<b>سهم منابع:</b>'];
  for (const [s, n] of Object.entries(st.sources || {}).sort((a, b) => b[1] - a[1])) parts.push('• ' + esc(SOURCE_FA[s] || s) + ': ' + fa(n));
  const run = st.run || {};
  if (run.fetched) parts.push('', '🌍 آخرین اجرا: ' + fa(run.fetched) + ' درخواست، ' + fa(run.created || 0) + ' مورد جدید، ' + fa(run.errors || 0) + ' خطا');
  return { text: parts.filter((x) => x !== null).join('\n'), kb: [[HOME_BTN]] };
}

// ---- Channel gate ---------------------------------------------------------------------------------
// gate: { channel: '@name', check: raw getChatMember response }. The bot must be an admin of the channel for
// Telegram to answer; any failed check counts as 'off' so a misconfiguration never locks users out.
function channelGate(gate) {
  if (!gate || !gate.channel) return 'off';
  const c = gate.check || {};
  if (!c.ok || !c.result) return 'off';
  const st = c.result.status;
  if (st === 'creator' || st === 'administrator' || st === 'member') return 'member';
  if (st === 'restricted') return c.result.is_member ? 'member' : 'out';
  return 'out'; // left / kicked
}

function utf8Len(s) {
  let n = 0;
  for (const ch of s) { const c = ch.codePointAt(0); n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4; }
  return n;
}

// Callback data of the "I joined" button: reopens what the user asked for (Telegram allows 64 bytes).
function resumeData(r) {
  const p = r.page || 0;
  const list = (b, svc, pg) => 's:' + b + ':' + (svc || '*') + ':' + pg;
  const to = {
    brand: () => 'b:' + r.brand, list: () => list(r.brand, r.service, p), newest: () => 'n:' + p, hot: () => 't:' + p,
    follow: () => (r.ret === 'l' ? list(r.brand, r.service, 0) : 'b:' + r.brand), stores: () => 'a:' + p, cats: () => 'cats',
    cat: () => 'c:' + r.cat + ':' + p, mysubs: () => 'my', unfollow: () => 'my', searchHelp: () => 'q', help: () => 'help',
    search: () => 'r:' + p + ':' + String(r.q || '').slice(0, 18),
  }[r.view];
  const chars = Array.from('j:' + (to ? to() : 'h'));
  while (utf8Len(chars.join('')) > 64) chars.pop();
  return chars.join('');
}

function viewJoin(ctx, data, route, channel) {
  const stats = data.stats || {};
  const handle = String(channel).replace(/^@/, '');
  const hi = ctx.firstName ? 'سلام ' + esc(oneLine(ctx.firstName, 30)) + '! ' : 'سلام! ';
  const big3 = ['snapp', 'tapsi', 'digikala'].map((id) => { const b = brandInfo(id, stats); return logoHtml(brandLogo(b)) + ' ' + esc(b.fa); }).join('، ');
  const text = [
    '🎁 <b>' + hi + 'به تخفیف\u200cیاب خوش اومدی</b>',
    '',
    '🔑 ' + (stats.total ? '<b>' + fa(stats.total) + '</b> کد تخفیف و آفر فعال' : 'همه\u200cی کدهای تخفیف فعال') +
      ' ' + big3 + ' و ده\u200cها فروشگاه دیگه منتظرته!',
    '',
    '📣 برای استفاده از ربات، فقط کافیه عضو کانال ما بشی:',
    '👈 <b>@' + esc(handle) + '</b>',
    '',
    '✅ عضویت رایگانه و چند ثانیه بیشتر طول نمی\u200cکشه',
    '⚡\ufe0f بعدش کدهای مخفی، جستجوی هوشمند و اعلان کد جدید برات باز میشه',
    '',
    '👇 روی «عضویت در کانال» بزن، عضو شو و بعد «عضو شدم» رو بزن',
  ].join('\n');
  const kb = [
    [{ text: '📣 عضویت در کانال ' + handle, url: 'https://t.me/' + handle }],
    [{ text: '✅ عضو شدم، بزن بریم!', callback_data: resumeData(route) }],
  ];
  return { text, kb };
}

// ---- Main -----------------------------------------------------------------------------------------
// data: { stats, user, rows, gate }. Returns { calls: [{method, payload}], user: {...} | null },
// with every emoji animated (see emoji.js).
function buildReply(ctx, route, data, nowMs) {
  const rep = replyCalls(ctx, route, data, nowMs);
  return { calls: rep.calls.map(animateCall), user: rep.user };
}

function replyCalls(ctx, route, data, nowMs) {
  const now = nowMs || Date.now();
  const calls = [];
  const nowIso = new Date(now).toISOString();
  let user = null;
  if (ctx.userId) {
    const prev = data.user || null;
    user = {
      user_id: String(ctx.userId), first_name: oneLine(ctx.firstName, 64), username: ctx.username || '', subs: (prev && prev.subs) || '',
      joined_at: (prev && prev.joined_at) || nowIso, last_seen: nowIso, blocked: false,
    };
  }
  if (ctx.kind === 'member') {
    // Only a block is worth saving: starting the bot also sends /start at the same moment, and saving both
    // concurrently would store the new user twice. Any later message clears the flag again.
    if (user && ctx.status === 'kicked') { user.blocked = true; return { calls, user }; }
    return { calls, user: null };
  }
  if (route.view === 'ignore') return { calls, user: null };
  if (ctx.kind === 'callback' && route.view === 'noop') {
    calls.push({ method: 'answerCallbackQuery', payload: { callback_query_id: ctx.cbId } });
    return { calls, user: null };
  }
  let toast = '';
  const gate = channelGate(data.gate);
  if (gate === 'out' && (ctx.kind === 'message' || ctx.kind === 'callback')) {
    if (route.joinCheck) {
      calls.push({ method: 'answerCallbackQuery', payload: { callback_query_id: ctx.cbId, show_alert: true,
        text: '❌ هنوز عضو کانال نشدی!\n\nاول روی «عضویت در کانال» بزن، عضو شو و بعد دوباره «عضو شدم» رو بزن 🙏' } });
      return { calls, user };
    }
    const g = viewJoin(ctx, data, route, data.gate.channel);
    const payload = { text: g.text, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, reply_markup: { inline_keyboard: g.kb } };
    if (ctx.kind === 'callback') {
      calls.push({ method: 'answerCallbackQuery', payload: { callback_query_id: ctx.cbId, text: '🔒 اول عضو کانال شو' } });
      calls.push({ method: 'editMessageText', payload: Object.assign({ chat_id: ctx.chatId, message_id: ctx.msgId }, payload) });
    } else {
      calls.push({ method: 'sendMessage', payload: Object.assign({ chat_id: ctx.chatId }, payload) });
    }
    return { calls, user };
  }
  if (route.joinCheck && gate === 'member') toast = '🎉 عضویتت تأیید شد؛ خوش اومدی!';
  let r = route;
  if (route.view === 'follow' || route.view === 'unfollow') {
    const subs = subsOf(data.user);
    const key = route.brand + ':' + (route.service || '*');
    const was = subs.has(key);
    if (route.view === 'unfollow' || was) subs.delete(key); else subs.add(key);
    if (subs.size > 30) { toast = 'حداکثر ۳۰ اعلان مجازه'; subs.delete(key); }
    user.subs = [...subs].join(',');
    data = Object.assign({}, data, { user: Object.assign({}, data.user || {}, { subs: user.subs }) });
    toast = toast || (subs.has(key) ? '🔔 اعلان فعال شد؛ کد جدید که بیاد خبرت می\u200cکنم' : '🔕 اعلان غیرفعال شد');
    r = route.view === 'unfollow' ? { view: 'mysubs' } : route.ret === 'l' ? { view: 'list', brand: route.brand, service: route.service, page: 0 } : { view: 'brand', brand: route.brand };
  }
  let v = null;
  switch (r.view) {
    case 'home': v = viewHome(ctx, data, now); break;
    case 'brand': v = viewBrand(ctx, data, r, now) || null; if (!v) { r = { view: 'list', brand: r.brand, service: '*', page: 0 }; v = viewList(ctx, data, r, now); } break;
    case 'list': v = viewList(ctx, data, r, now); break;
    case 'newest': v = viewTop(ctx, data, r, now, 'newest'); break;
    case 'hot': v = viewTop(ctx, data, r, now, 'hot'); break;
    case 'stores': v = viewStores(ctx, data, r); break;
    case 'cats': v = viewCats(ctx, data); break;
    case 'cat': v = viewCat(ctx, data, r); break;
    case 'search': v = viewSearch(ctx, data, r, now); break;
    case 'searchHelp': v = { text: '🔎 <b>جستجو</b>\nاسم برند، سرویس یا هر کلمه\u200cای رو همینجا بفرست؛ مثلاً:\n<i>اسنپ فود</i> · <i>تپسی گاراژ</i> · <i>دیجی کالا جت</i> · <i>بلیط هواپیما</i> · <i>فیلیمو</i>', kb: [[HOME_BTN]] }; break;
    case 'mysubs': v = viewMySubs(ctx, data); break;
    case 'help': v = viewHelp(); break;
    case 'stats': v = viewStats(ctx, data, now); break;
    default: v = viewHome(ctx, data, now);
  }
  const markup = { inline_keyboard: v.kb };
  if (ctx.kind === 'callback') {
    calls.push({ method: 'answerCallbackQuery', payload: Object.assign({ callback_query_id: ctx.cbId }, toast ? { text: toast } : {}) });
    calls.push({ method: 'editMessageText', payload: { chat_id: ctx.chatId, message_id: ctx.msgId, text: v.text, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, reply_markup: markup } });
  } else {
    calls.push({ method: 'sendMessage', payload: { chat_id: ctx.chatId, text: v.text, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, reply_markup: markup } });
  }
  return { calls, user };
}

// Alert messages for users following brands/services with new codes (used by the crawler).
function buildAlerts(newRows, users, nowMs) {
  const now = nowMs || Date.now();
  const out = [];
  // Two updates handled at once can still store a user twice: alert each chat once, from its latest row.
  const latest = {};
  for (const u of users) {
    if (!u || !u.user_id) continue;
    const prev = latest[u.user_id];
    if (!prev || String(u.last_seen || '') > String(prev.last_seen || '')) latest[u.user_id] = u;
  }
  for (const u of Object.values(latest)) {
    if (u.blocked || !u.subs) continue;
    const subs = subsOf(u);
    const hits = newRows.filter((r) => subs.has(r.brand + ':*') || subs.has(r.brand + ':' + r.service)).slice(0, 5);
    if (!hits.length) continue;
    const parts = ['🔔 <b>کد تخفیف جدید پیدا شد!</b>', '━━━━━━━━━━━━━━'];
    hits.forEach((r, i) => parts.push(couponBlock(r, i + 1, now, r.brand_fa, rowLogo(r)), ''));
    parts.push('🔕 مدیریت اعلان\u200cها: /alerts');
    const kb = copyButtons(hits);
    kb.push([{ text: '🏠 منوی تخفیف\u200cیاب', callback_data: 'h' }]);
    out.push(animateCall({ method: 'sendMessage', payload: { chat_id: u.user_id, text: parts.join('\n'), parse_mode: 'HTML', link_preview_options: { is_disabled: true }, reply_markup: { inline_keyboard: kb } } }));
  }
  return out;
}

// Bot Engine dispatcher (Code node "Bot Engine" in the Engine sub-workflow).
// Ops: botParse (Telegram update -> route + data-table query), botReply (-> Bot API calls), alerts. Bundled with lib/, bot/ by scripts/build.mjs.
const req = $('Request In').first().json || {};
const op = req.op || '';

if (op === 'alerts') {
  const users = (req.users || []).filter((u) => u && u.user_id);
  return buildAlerts(req.rows || [], users).map((c) => ({ json: c }));
}

if (op === 'botParse') {
  const ctx = parseUpdate(req.update || {});
  const route = routeUpdate(ctx);
  return [{ json: { ctx, route, q: route.query, userId: String(ctx.userId || '0') } }];
}

if (op === 'botReply') {
  const p = req.p || {};
  let stats = {};
  try { stats = req.stats && req.stats.value ? JSON.parse(req.stats.value) : {}; } catch (e) { stats = {}; }
  const user = req.user && req.user.user_id ? req.user : null;
  const rows = p.q && p.q.need ? (req.rows || []).filter((r) => r && r.ckey) : [];
  const rep = buildReply(p.ctx || {}, p.route || { view: 'home', query: {} }, { stats, user, rows, gate: req.gate || null });
  const out = rep.calls.map((c) => ({ json: { _op: 'tg', method: c.method, payload: c.payload } }));
  if (rep.user) out.push({ json: Object.assign({ _op: 'user' }, rep.user) });
  return out;
}

return [{ json: { error: 'unknown bot op ' + op } }];
