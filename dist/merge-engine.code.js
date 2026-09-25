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

// Glue used by the crawler workflow's Code nodes: chunking, reveal planning, aggregation.
// Depends on text.js, catalog.js, sources.js.

const CHUNK_SIZE = 20;
const MAX_REVEALS = 1000;
const REFRESH_HOURS = 12;   // re-reveal a known coupon this often so its code, expiry and details stay current

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

// Merge the aggregate items returned by the fetch worker into one result.
function combineResults(aggs) {
  const res = { items: [], jobs: [], seen: [], expired: [], meta: {}, errors: [], fetched: 0 };
  for (const a of aggs) {
    if (!a) continue;
    res.items.push(...(a.items || []));
    res.jobs.push(...(a.jobs || []));
    res.seen.push(...(a.seen || []));
    res.expired.push(...(a.expired || []));
    Object.assign(res.meta, a.meta || {});
    res.errors.push(...(a.errors || []));
    res.fetched += a.fetched || 0;
  }
  return res;
}

// Decide which follow-up jobs to run. Coupons we already know are reported as "seen" so the merge step
// keeps their rows alive; their reveal only runs again when the row is due for a refresh (after new coupons).
function planReveals(stage1, knownRows, opts) {
  const o = opts || {};
  const max = o.maxReveals || MAX_REVEALS;
  const now = o.now ? Date.parse(o.now) : Date.now();
  const byRef = {};
  for (const row of knownRows) for (const ref of String(row.refs || '').split(',')) if (ref) byRef[ref.trim()] = row;
  const seen = [];
  const todo = [];
  for (const job of stage1.jobs) {
    if (job.kind === 'reveal') {
      const row = byRef[job.ref];
      if (row && row.active && (row.code || row.kind !== 'code')) {
        seen.push(job.ref);
        const last = Date.parse(row.last_seen || '');
        if (!Number.isFinite(last) || now - last < REFRESH_HOURS * 3600e3) continue;
        job.refresh = true;
      }
      if (job.needs) {
        const val = stage1.meta[job.needs];
        if (!val) continue;
        job.body = job.bodyTemplate.replace('{nonce}', encodeURIComponent(val));
      }
    }
    todo.push(job);
  }
  // Featured brands and better sources first, so a capped run still covers what users ask for most.
  const prio = (job) => {
    if (job.kind !== 'reveal') return -1; // follow-up list pages (e.g. iranicard's cookie retry) always run
    const c = job.base ? classify(job.base) : { brand: '' };
    const b = brandById(c.brand);
    const featured = b && b.featured ? b.featured : 50;
    return (job.refresh ? 10000 : 0) + featured * 100 + SOURCE_RANK.indexOf(job.source);
  };
  todo.sort((a, b) => prio(a) - prio(b));
  return { jobs: todo.slice(0, max), deferred: Math.max(0, todo.length - max), seen };
}

// Merge Engine dispatcher (Code node "Merge Engine" in the Engine sub-workflow).
// Ops: reveals (plan the code-reveal requests), merge (dedupe/score/diff against the table), version (deploy check).
// Bundled with lib/text.js, lib/catalog.js, crawler/merge.js, crawler/pipeline.js by scripts/build.mjs.
const req = $('Request In').first().json || {};
const op = req.op || '';

function slimKnown(rows) {
  return (rows || []).filter((r) => r && r.ckey);
}

if (op === 'reveals') {
  const s1 = combineResults(req.s1 || []);
  const plan = planReveals(s1, slimKnown(req.known), { maxReveals: req.maxReveals || MAX_REVEALS });
  const chunks = chunk(plan.jobs, CHUNK_SIZE);
  if (!chunks.length) return [{ json: { op: 'fetch', noJobs: true, jobs: [] } }];
  return chunks.map((c, i) => ({ json: { op: 'fetch', noJobs: false, stage: 2, chunk: i, jobs: c } }));
}

if (op === 'merge') {
  const known = slimKnown(req.known);
  const s1 = combineResults(req.s1 || []);
  const s2 = combineResults(req.s2 || []);
  const plan = planReveals(s1, known, { maxReveals: req.maxReveals || MAX_REVEALS });
  const now = new Date().toISOString();
  const res = mergeAll(s1.items.concat(s2.items), known, s1.seen.concat(s2.seen, plan.seen), s1.expired.concat(s2.expired), now);
  const errors = s1.errors.concat(s2.errors);
  const bySource = {};
  for (const a of (req.s1 || []).concat(req.s2 || [])) {
    for (const [k, v] of Object.entries((a && a.bySource) || {})) {
      const t = bySource[k] || (bySource[k] = { req: 0, items: 0, jobs: 0, err: 0 });
      t.req += v.req; t.items += v.items; t.jobs += v.jobs; t.err += v.err;
    }
  }
  const run = Object.assign({}, res.stats, { fetched: s1.fetched + s2.fetched, errors: errors.length, deferred: plan.deferred, reveals: plan.jobs.length, at: now, bySource });
  const stats = buildStats(known, res.upserts, run, now);
  const out = res.upserts.map((r) => ({ json: Object.assign({ _op: 'upsert' }, r) }));
  out.push({ json: { _op: 'meta', key: 'stats', value: JSON.stringify(stats), updated_at: now } });
  out.push({ json: { _op: 'meta', key: 'last_run', value: JSON.stringify({ run, errors: errors.slice(0, 60) }), updated_at: now } });
  out.push({ json: { _op: 'alerts', rows: res.alerts.slice(0, 80) } });
  out.push({ json: { _op: 'purge', before: res.purgeBefore } });
  return out;
}

if (op === 'version') {
  // Deploy check: length + FNV hash of the code n8n actually stores in both engine nodes.
  const info = {};
  for (const name of ['Crawler Engine', 'Merge Engine', 'Bot Engine']) {
    try {
      const code = String($(name).params.jsCode || '');
      info[name] = { len: code.length, hash: hash(code), lines: code.split('\n').map(hash).join(' ') };
    } catch (e) {
      info[name] = { error: String((e && e.message) || e) };
    }
  }
  return [{ json: info }];
}

return [{ json: { error: 'unknown merge op ' + op } }];
