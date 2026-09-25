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

// Source registry: what to fetch (crawl plan) and how to parse every response.
// Depends on text.js. Runs inside n8n Code nodes, so everything is regex based.
//
// A job:   { source, kind, url, method?, headers?, body?, ref?, base?, meta? }
// A parse result: { items: RawCoupon[], jobs: Job[], seen: ref[], expired: ref[], meta: {k:v} }
// RawCoupon: { source, ref, srcBrand, srcSlug, catHint, title, desc, code, kind, discountText,
//              expiryText, expiresAt, expired, link, url, hidden, likes, dislikes, postedAt }

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const XHR = { Accept: 'application/json, text/javascript, */*; q=0.01', 'X-Requested-With': 'XMLHttpRequest' };

const MOPON = 'https://www.mopon.ir';
const MOPON_LISTS = [
  '/جدیدترین-ها/کوپن', '/جدیدترین-ها/کوپن?page=2', '/جدیدترین-ها/کوپن?page=3',
  '/محبوبترین-ها/کوپن', '/پربازدیدترین-ها/کوپن',
  '/تاکسی-اینترنتی/کوپن', '/تاکسی-اینترنتی/کوپن?page=2', '/سفارش-غذا/کوپن', '/فروشگاه-اینترنتی/کوپن',
  '/فروشگاه-اینترنتی/کوپن?page=2', '/فروشگاه-مد-و-لباس/کوپن', '/خدمات-آنلاین/کوپن', '/رزرو-هواپیما-و-هتل/کوپن',
  '/اپراتور-تلفن-همراه-و-اینترنت/کوپن', '/مشاوره-و-آموزش/کوپن', '/موسیقی،-تئاتر-و-سینما/کوپن', '/کتاب/کوپن', '/تخفیف-گروهی/کوپن',
  '/کد-تخفیف-اسنپ/تاکسی-اینترنتی/کوپن', '/کد-تخفیف-اسنپ-فود/سفارش-غذا/کوپن', '/کد-تخفیف-اسنپ-مارکت/فروشگاه-اینترنتی/کوپن',
  '/کد-تخفیف-اسنپ-شاپ/فروشگاه-اینترنتی/کوپن', '/کد-تخفیف-اسنپ-باکس/تاکسی-اینترنتی/کوپن', '/کد-تخفیف-اسنپ-اکسپرس/فروشگاه-اینترنتی/کوپن',
  '/کد-تخفیف-تپسی/تاکسی-اینترنتی/کوپن', '/کد-تخفیف-تپسی-دکتر/مشاوره-و-آموزش/کوپن',
  '/کد-تخفیف-دیجی-کالا/فروشگاه-اینترنتی/کوپن', '/کد-تخفیف-دیجی-کالا-جت/فروشگاه-اینترنتی/کوپن',
  '/کد-تخفیف-اکالا/فروشگاه-اینترنتی/کوپن', '/کد-تخفیف-با-سلام/فروشگاه-اینترنتی/کوپن', '/کد-تخفیف-فیلیمو/موسیقی-تئاتر-سینما/کوپن',
  '/کد-تخفیف-الوپیک/تاکسی-اینترنتی/کوپن', '/کد-تخفیف-جانبی/فروشگاه-اینترنتی/کوپن', '/کد-تخفیف-ازکی/خدمات-آنلاین/کوپن',
];

const OFFCH_API = 'https://api.offch.com/api/v2';
const OFFCH_SHOPS = [
  'snapp', 'snappfood', 'snappmarket', 'snappshop', 'snapppay', 'snappdoctor', 'snapptrip', 'snapproom', 'snappbox',
  'snappexpress', 'snappbimeh', 'snappcarfix', 'tapsi', 'tapsifood', 'tapsishop', 'tapsidoctor', 'tapsigarage', 'tapsimarket',
  'digikala', 'digikalajet', 'digistyle', 'digiplus', 'digipay', 'alibaba', 'filimo', 'filimoschool', 'namava', 'filmnet',
  'basalam', 'technolife', 'okala', 'khanoumi', 'alopeyk', 'jabama', 'shab', 'fidibo', 'taaghche', 'banimode', 'modiseh',
  'janebi', 'torob', 'azki', 'azkiservice', 'bimebazar', 'irancell', 'mci', 'blubank', 'mioshop', 'rojashop', 'appetit',
  'maktabkhooneh', 'cinematicket', 'ghasedak24', 'flightio', 'kermany', 'esam', 'fitamin', 'ino-school',
];

const OFFERDAILY_BRANDS = [
  'snapp', 'snapp-food', 'snapp-market', 'snapp-shop', 'snapp-pay', 'snapp-doctor', 'snapp-trip', 'snapp-room', 'snappbox',
  'snapp-express', 'snapp-bimeh', 'snappcarfix', 'tapsi', 'tapsifood', 'tapsi-market', 'tapsishop', 'tapsidoctor', 'tapsi-garage',
  'digikala', 'digikalajet', 'digistyle', 'digiclub', 'mydigipay', 'alibaba', 'filimo', 'namava', 'filmnet', 'basalam',
  'technolife', 'okala', 'khanoomi', 'alopeyk', 'jabama', 'shab', 'fidibo', 'taaghche', 'banimode', 'modiseh', 'janebi',
  'torob', 'azki', 'irancell', 'mci', 'rightel', 'blubank', 'melligold', 'milli', 'appetit', 'cinematicket', 'flightio',
  'flytoday', 'ghasedak24', 'mrblit', 'drkermani', 'cafebazaar', 'divar', 'achareh', 'maktabkhooneh', 'faradars', 'reyhoon',
];

const TAKHFIFE_BRANDS = ['snapp', 'azki', 'bimebazar', 'blubank', 'homsa', 'ostadkar', 'numberland', 'hostiran', 'iranserver', 'ganje'];

const STORECODE_SHOPS = [
  'snapp', 'اسنپ-فود', 'snapp-shop', 'snapp-express', 'تپسی', 'تپسی-شاپ', 'تپسی-دکتر', 'تپسی-گاراژ', 'دیجی-کالا',
  'digikalajet', 'okala', 'تکنولایف', 'بانی-مد', 'janebi', 'asalbanoo', 'gooshishop', 'تارا',
];

const TAPSI_PAGES = ['https://tapsitakhfif.ir/', 'https://tapsitakhfif.ir/page/2/', 'https://tapsitakhfif.ir/page/3/', 'https://tapsitakhfif.ir/page/4/'];

const TG_CHANNELS = ['off_channell', 'moponcom', 'offer_daily', 'offerjo_ir', 'takhfifecom', 'takhfifhot', 'StoreCode', 'booodgeh', 'irani_card'];

function enc(u) {
  // Percent-encode non-ascii path/query chars, keep existing escapes.
  return u.replace(/[^\x21-\x7e]/g, (c) => encodeURIComponent(c));
}

// ---- Crawl plan -------------------------------------------------------------------------------
function buildPlan(opts) {
  const o = opts || {};
  const jobs = [];
  const add = (source, kind, url, extra) => jobs.push(Object.assign({ source, kind, url: enc(url), method: 'GET' }, extra || {}));
  for (const p of MOPON_LISTS) add('mopon', 'list', MOPON + p);
  for (const s of OFFCH_SHOPS) add('offch', 'list', OFFCH_API + '/coupons/coupons/?shop=' + s + '&limit=100', { meta: { shop: s } });
  add('offch', 'list', OFFCH_API + '/coupons/coupons/?limit=100&ordering=-publish_datetime', { meta: { shop: '' } });
  const pbFilter = encodeURIComponent('(ExpireDate>=@now)');
  add('boodgeh', 'list', 'https://pb.boodgeh.com/api/collections/Codes/records?page=1&perPage=400&sort=-created&expand=Shop,Cat&filter=' + pbFilter);
  add('offerjo', 'list', 'https://offerjo.ir/wp-json/wp/v2/codes?per_page=100&page=1');
  add('offerjo', 'list', 'https://offerjo.ir/wp-json/wp/v2/codes?per_page=100&page=2');
  add('offerjo', 'brands', 'https://offerjo.ir/wp-json/wp/v2/brands?per_page=100');
  for (const b of OFFERDAILY_BRANDS) add('offerdaily', 'list', 'https://offerdaily.ir/brands/' + b + '/', { meta: { slug: b } });
  add('takhfife', 'list', 'https://takhfife.com/');
  for (const b of TAKHFIFE_BRANDS) add('takhfife', 'list', 'https://takhfife.com/brand/' + b + '/', { meta: { slug: b } });
  for (const u of TAPSI_PAGES) add('tapsitakhfif', 'list', u);
  add('storecode', 'nonce', 'https://storecode.ir/wp-admin/admin-ajax.php', { method: 'POST', body: 'action=get_front_nonce', contentType: 'application/x-www-form-urlencoded' });
  add('storecode', 'list', 'https://storecode.ir/');
  for (const s of STORECODE_SHOPS) add('storecode', 'list', 'https://storecode.ir/shops/' + s + '/', { meta: { slug: s } });
  add('iranicard', 'list', 'https://www.iranicard.ir/iranicard-discount-code/');
  for (const c of TG_CHANNELS) add('telegram', 'list', 'https://t.me/s/' + c, { meta: { channel: c } });
  const only = o.sources && o.sources.length ? new Set(o.sources) : null;
  return jobs
    .filter((j) => !only || only.has(j.source))
    .map((j) => Object.assign({ headers: Object.assign({ 'User-Agent': UA, 'Accept-Language': 'fa-IR,fa;q=0.9,en;q=0.8' }, j.headers || {}) }, j));
}

// ---- Helpers ------------------------------------------------------------------------------------
function bodyText(res) {
  const b = res && (res.body !== undefined ? res.body : res.data);
  if (b == null) return '';
  return typeof b === 'string' ? b : JSON.stringify(b);
}

function bodyJson(res) {
  const b = res && (res.body !== undefined ? res.body : res.data);
  if (b == null) return null;
  if (typeof b === 'object') return b;
  try { return JSON.parse(b); } catch (e) { return null; }
}

function b64decode(s) {
  try {
    const t = String(s).replace(/-/g, '+').replace(/_/g, '/');
    const padded = t + '='.repeat((4 - (t.length % 4)) % 4);
    if (typeof Buffer !== 'undefined') return Buffer.from(padded, 'base64').toString('utf8');
    return decodeURIComponent(Array.prototype.map.call(atob(padded), (c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
  } catch (e) { return ''; }
}

function empty() { return { items: [], jobs: [], seen: [], expired: [], meta: {} }; }

function slugFromMoponPath(path) {
  const m = /\/کد-تخفیف-([^/]+)\/([^/]+)\/کوپن/.exec(decodeURIComponent(path || ''));
  return m ? { slug: m[1].replace(/-/g, ' '), cat: m[2].replace(/-/g, ' ') } : { slug: '', cat: '' };
}

// ---- mopon.ir ---------------------------------------------------------------------------------
function parseMoponList(job, res) {
  const out = empty();
  const html = bodyText(res);
  const blocks = splitBlocks(html, /<div class="col-lg-2 pl-lg-0 img-col center">/);
  for (const blk of blocks) {
    const btn = (blk.match(/<button[^>]*data-coupon-id[^>]*>/) || [])[0];
    if (!btn) continue;
    const id = attr(btn, 'data-id');
    if (!id) continue;
    const brandHref = firstMatch(blk, /<a href="(\/کد-تخفیف-[^"]+\/کوپن)"/) || firstMatch(blk, /<a href="([^"]*%DA%A9%D8%AF-%D8%AA%D8%AE%D9%81%DB%8C%D9%81-[^"]+)"/);
    const bs = slugFromMoponPath(brandHref);
    const titleA = firstMatch(blk, /<a class="coupon-title" href="([^"]+)"/);
    const desc = htmlToText(firstMatch(blk, /<div class="description-wrapper">([\s\S]*?)<\/div>/) || '');
    const valid = htmlToText(firstMatch(blk, /<span class="[^"]*valid-date[^"]*">([\s\S]*?)<\/span>/) || '');
    const dtype = htmlToText(firstMatch(blk, /<span class="discount">([\s\S]*?)<\/span>/) || '');
    const ref = 'mopon:' + id;
    if (/منقضی/.test(valid)) { out.expired.push(ref); continue; }
    const base = {
      source: 'mopon', ref, srcBrand: attr(btn, 'data-brand-name') || '', srcSlug: bs.slug, catHint: bs.cat,
      title: attr(btn, 'data-title') || '', desc, code: '', kind: /کد/.test(dtype) ? 'code' : 'deal',
      discountText: '', expiryText: valid, url: titleA ? absUrl(titleA, MOPON) : MOPON,
    };
    out.jobs.push({ source: 'mopon', kind: 'reveal', ref, url: MOPON + '/api/coupon/single/' + id, method: 'GET', headers: Object.assign({ 'User-Agent': UA, Referer: MOPON + '/' }, XHR), base });
  }
  return out;
}

function parseMoponReveal(job, res) {
  const out = empty();
  const j = bodyJson(res);
  const d = j && j.data;
  if (!d) return out;
  const base = job.base || {};
  if (+d.is_expired === 1) { out.expired.push(job.ref); return out; }
  let code = d.code ? String(d.code).trim() : '';
  let kind = +d.deal_type === 1 ? 'code' : 'deal';
  if (kind === 'code' && !code) kind = 'unique'; // signup/points-only code: user must open the site
  const vu = d.valid_until;
  let expiresAt = null;
  if (d.expiration_date) expiresAt = parseExpiry(String(d.expiration_date)).iso;
  else if (vu && typeof vu === 'object') expiresAt = new Date(Date.now() + ((+vu.day || 0) * 86400 + (+vu.hour || 0) * 3600 + (+vu.minute || 0) * 60) * 1000).toISOString();
  out.items.push(Object.assign({}, base, {
    title: d.title || base.title,
    desc: htmlToText(d.content || '') || base.desc,
    srcBrand: (d.brand && d.brand.name) || base.srcBrand,
    code, kind, expiresAt,
    link: d.link || '',
    likes: +d.likes || 0, dislikes: +d.dislikes || 0,
    hidden: !!(d.is_signup || +d.score > 0),
  }));
  return out;
}

// ---- offch.com ----------------------------------------------------------------------------------
function parseOffchList(job, res) {
  const out = empty();
  const j = bodyJson(res);
  const rows = (j && j.results) || [];
  for (const r of rows) {
    const ref = 'offch:' + r.id;
    if (r.is_expired === true || /منقضی/.test(r.pretty_expire_datetime || '')) { out.expired.push(ref); continue; }
    const shop = (r.shop && r.shop.name) || (job.meta && job.meta.shop) || '';
    const base = {
      source: 'offch', ref, srcBrand: '', srcSlug: shop, title: r.title || '', desc: htmlToText(r.description || ''),
      code: '', discountText: r.pretty_value || '', expiryText: r.pretty_expire_datetime || '',
      url: 'https://www.offch.com' + enc(r.url || ''), kind: 'deal',
    };
    if (+r.type === 1) {
      if (+r.num_of_single_use_coupons > 0 || r.is_one_customer_only) {
        out.items.push(Object.assign(base, { kind: 'unique' }));
      } else {
        out.jobs.push({ source: 'offch', kind: 'reveal', ref, url: OFFCH_API + '/coupons/coupons/' + r.id + '/', method: 'GET', headers: { 'User-Agent': UA, Accept: 'application/json' }, base: Object.assign(base, { kind: 'code' }) });
      }
    } else {
      out.items.push(base);
    }
  }
  return out;
}

function parseOffchReveal(job, res) {
  const out = empty();
  const d = bodyJson(res);
  if (!d || !d.id) return out;
  const base = job.base || {};
  if (d.is_expired === true) { out.expired.push(job.ref); return out; }
  const codes = (Array.isArray(d.code) ? d.code : d.code ? [d.code] : []).map((c) => String(c).trim()).filter(Boolean);
  out.items.push(Object.assign({}, base, {
    srcBrand: (d.shop && d.shop.persian_name) || base.srcBrand,
    title: d.title || base.title,
    desc: base.desc || htmlToText(d.description || ''),
    code: codes[0] || '',
    altCodes: codes.slice(1, 4),
    kind: codes.length ? 'code' : 'unique',
    expiresAt: d.expire_datetime ? parseExpiry(d.expire_datetime).iso : null,
    link: d.link || '',
  }));
  return out;
}

// ---- boodgeh.com (PocketBase) -------------------------------------------------------------------
function parseBoodgehList(job, res) {
  const out = empty();
  const j = bodyJson(res);
  const rows = (j && j.items) || [];
  const now = Date.now();
  for (const r of rows) {
    const ref = 'boodgeh:' + r.id;
    const exp = r.ExpireDate ? Date.parse(String(r.ExpireDate).replace(' ', 'T')) : NaN;
    if (Number.isFinite(exp) && exp < now) { out.expired.push(ref); continue; }
    const shop = (r.expand && r.expand.Shop) || {};
    const cat = (r.expand && r.expand.Cat) || {};
    const code = String(r.Code || '').trim();
    const serial = r.Seri === true || (r.CodeList && String(r.CodeList).trim().length > 0);
    const isDeal = /پیشنهاد|آفر|لینک/.test(r.Type || '') || !code;
    out.items.push({
      source: 'boodgeh', ref, srcBrand: shop.TitleFa || '', srcSlug: shop.TitleEn || '', catHint: cat.TitleFa || '',
      title: normFa(r.Title || ''), desc: [r.List1, r.List2, r.List3].filter(Boolean).join('\n'),
      code: serial ? '' : code, kind: serial ? 'unique' : isDeal ? 'deal' : 'code',
      discountText: r.Header || '', expiresAt: Number.isFinite(exp) ? new Date(exp).toISOString() : null,
      conditions: r.Type1 || '', link: r.Link || '',
      url: shop.TitleEn ? 'https://boodgeh.com/shops/' + shop.TitleEn : 'https://boodgeh.com/',
    });
  }
  return out;
}

// ---- offerjo.ir (WordPress REST) ----------------------------------------------------------------
function parseOfferjoBrands(job, res) {
  const out = empty();
  const rows = bodyJson(res) || [];
  const map = {};
  if (Array.isArray(rows)) for (const r of rows) if (r && r.slug) map[decodeURIComponent(r.slug)] = decodeEntities(r.name || '');
  out.meta.offerjoBrands = map;
  return out;
}

function parseOfferjoList(job, res) {
  const out = empty();
  const rows = bodyJson(res);
  if (!Array.isArray(rows)) return out;
  const maxAgeMs = 60 * 86400e3;
  for (const r of rows) {
    const ref = 'offerjo:' + r.id;
    const date = Date.parse((r.date_gmt || r.date || '') + 'Z');
    if (Number.isFinite(date) && Date.now() - date > maxAgeMs) continue;
    const brandClass = (r.class_list || []).find((c) => /^brands-/.test(c));
    const slug = brandClass ? decodeURIComponent(brandClass.replace(/^brands-/, '')) : '';
    const meta = r.meta || {};
    const code = String(meta.discount_code || '').trim();
    const text = htmlToText((r.content && r.content.rendered) || '').replace(/\*\*/g, '');
    out.items.push({
      source: 'offerjo', ref, srcBrand: '', srcSlug: slug, title: decodeEntities((r.title && r.title.rendered) || ''),
      desc: text, code: looksLikeCode(code) ? code : '', kind: looksLikeCode(code) ? 'code' : 'deal',
      discountText: meta.value || '', link: meta.destination_link || '', url: r.link || 'https://offerjo.ir/',
      expiryText: text, postedAt: Number.isFinite(date) ? new Date(date).toISOString() : null,
    });
  }
  return out;
}

// ---- offerdaily.ir ------------------------------------------------------------------------------
function parseOfferdailyList(job, res) {
  const out = empty();
  const html = bodyText(res);
  const slug = (job.meta && job.meta.slug) || '';
  const cards = splitBlocks(html, /<div class="card[^"]*listing-card-container/);
  for (const c of cards) {
    // The page ends with "related offers" of other brands (`card listing-card-container h-300 text-center`, title in
    // a <p>). Only the brand's own `flex-row` cards belong to this slug; the others are crawled from their own pages.
    if (!/^<div class="[^"]*\bflex-row\b/.test(c)) continue;
    const href = firstMatch(c, /(?:href|data-link)="((?:https:\/\/offerdaily\.ir)?\/\d+-[^"]+)"/);
    const id = href ? firstMatch(href, /\/(\d+)-/) : null;
    if (!href || !id) continue;
    const ref = 'offerdaily:' + id;
    // Icon rows: `<i class="lni lni-revenue …"></i><span> 350,000 تومان</span>` or `<span><i …></i> معتبر</span>`.
    const info = {};
    for (const key of ['revenue', 'alarm-clock', 'ticket', 'users']) {
      const m = new RegExp('lni-' + key + '[^"]*"><\\/i>\\s*(?:<span[^>]*>)?\\s*([^<]*)').exec(c);
      info[key] = m ? htmlToText(m[1]) : '';
    }
    info.alarm = info['alarm-clock'];
    const alarmTitle = firstMatch(c, /lni-alarm-clock[^"]*"><\/i>\s*<span title="([^"]*)"/) || '';
    const title = htmlToText(firstMatch(c, /<h[23][^>]*>([\s\S]*?)<\/h[23]>/) || '');
    const desc = htmlToText(firstMatch(c, /<p[^>]*>([\s\S]*?)<\/p>/) || '');
    if (/منقضی/.test(info.alarm) && !/شاید/.test(info.alarm)) { out.expired.push(ref); continue; }
    if (/شاید/.test(info.alarm)) continue;
    const isCode = /کد/.test(info.ticket);
    const base = {
      source: 'offerdaily', ref, srcBrand: '', srcSlug: slug, title, desc, code: '', kind: isCode ? 'code' : 'deal',
      discountText: info.revenue, conditions: info.users && !/تمام کاربران/.test(info.users) ? info.users : '',
      expiryText: alarmTitle, expiresAt: parseExpiry(alarmTitle).iso, url: enc(absUrl(href, 'https://offerdaily.ir/')),
    };
    if (isCode) out.jobs.push({ source: 'offerdaily', kind: 'reveal', ref, url: enc(absUrl(href, 'https://offerdaily.ir/')), method: 'GET', headers: { 'User-Agent': UA }, base });
    else out.items.push(base);
  }
  return out;
}

function parseOfferdailyReveal(job, res) {
  const out = empty();
  const html = bodyText(res);
  const base = job.base || {};
  const input = (html.match(/<input[^>]*id="code"[^>]*>/) || [])[0];
  const code = input ? (attr(input, 'value') || '').trim() : '';
  const ext = firstMatch(html, /href="\/external\/([^"]+)"/);
  const breadcrumbBrand = firstMatch(html, /"position":\s*5,\s*"name":\s*"([^"]+)"/) || '';
  // "How to use" section: the heading closest to the thank-you line (the first mention is inside a <meta> tag).
  const end = html.indexOf('این کد تخفیف به کارتون اومد');
  const start = end > 0 ? html.lastIndexOf('استفاده از کد تخفیف', end) : -1;
  const body = start >= 0 ? htmlToText(html.slice(start + 'استفاده از کد تخفیف'.length, end)).slice(0, 1500) : '';
  out.items.push(Object.assign({}, base, {
    code: looksLikeCode(code) ? code : '',
    kind: looksLikeCode(code) ? 'code' : base.kind === 'code' ? 'unique' : base.kind,
    srcBrand: base.srcBrand || breadcrumbBrand,
    desc: body || base.desc,
    link: ext ? b64decode(decodeURIComponent(ext)) : '',
    expiryText: body,
  }));
  return out;
}

// ---- takhfife.com -------------------------------------------------------------------------------
function parseTakhfifeList(job, res) {
  const out = empty();
  const html = bodyText(res);
  const lis = splitBlocks(html, /<li class="[^"]*"><a href="https:\/\/takhfife\.com\/coupon\//);
  for (const li of lis) {
    const href = firstMatch(li, /<a href="(https:\/\/takhfife\.com\/coupon\/[^"]+)"/);
    if (!href) continue;
    const slug = decodeURIComponent(href.replace(/^https:\/\/takhfife\.com\/coupon\//, '').replace(/\/$/, ''));
    const ref = 'takhfife:' + slug;
    const brand = firstMatch(li, /href="https:\/\/takhfife\.com\/brand\/([^/"]+)\/?"/) || (job.meta && job.meta.slug) || '';
    const status = htmlToText(firstMatch(li, /<div class="expireTime[^"]*">([\s\S]*?)<\/div>/) || '');
    const tag = htmlToText(firstMatch(li, /<div class="tag[^"]*">([\s\S]*?)<\/div>/) || '');
    const title = htmlToText(firstMatch(li, /<h2>([\s\S]*?)<\/h2>/) || '');
    const amount = htmlToText(firstMatch(li, /<div class="foot"><span>([\s\S]*?)<\/span>/) || '');
    if (!title) continue;
    if (/منقضی/.test(status)) { out.expired.push(ref); continue; }
    const base = { source: 'takhfife', ref, srcBrand: '', srcSlug: decodeURIComponent(brand), title, desc: '', code: '', kind: /کد/.test(tag) ? 'code' : 'deal', discountText: amount, expiryText: status, url: href };
    out.jobs.push({ source: 'takhfife', kind: 'reveal', ref, url: href, method: 'GET', headers: { 'User-Agent': UA }, base });
  }
  return out;
}

function parseTakhfifeReveal(job, res) {
  const out = empty();
  const html = bodyText(res);
  const base = job.base || {};
  const input = (html.match(/<input[^>]*id="couponSingleCode"[^>]*>/) || [])[0];
  const code = input ? (attr(input, 'value') || attr(input, 'data-clipboard-text') || '').trim() : '';
  const go = firstMatch(html, /href="https:\/\/takhfife\.com\/go\/\?url=([^"&]+)/);
  const content = htmlToText(firstMatch(html, /<div class="(?:content|entry|desc)[^"]*">([\s\S]*?)شناسه کوپن/) || '');
  const valid = /منقضی شده/.test(htmlToText(firstMatch(html, /<div class="expireTime[^"]*">([\s\S]*?)<\/div>/) || ''));
  if (valid) { out.expired.push(job.ref); return out; }
  const ok = looksLikeCode(code);
  out.items.push(Object.assign({}, base, {
    code: ok ? code : '', kind: ok ? 'code' : base.kind === 'code' ? 'deal' : base.kind,
    desc: content || base.desc, link: go ? b64decode(decodeURIComponent(go)) : '',
  }));
  return out;
}

// ---- tapsitakhfif.ir ----------------------------------------------------------------------------
function parseTapsiList(job, res) {
  const out = empty();
  const html = bodyText(res);
  const seen = new Set();
  const re = /<a[^>]*href="(https:\/\/tapsitakhfif\.ir\/(?:تخفیف|%d8%aa%d8%ae%d9%81%db%8c%d9%81)\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const href = m[1];
    const slug = decodeURIComponent(href.replace(/^https:\/\/tapsitakhfif\.ir\/[^/]+\//, '').replace(/\/$/, ''));
    if (seen.has(slug)) continue;
    const inner = m[2];
    const title = htmlToText(firstMatch(inner, /<h[34][^>]*>([\s\S]*?)<\/h[34]>/) || inner);
    if (!title || title.length < 8) continue;
    seen.add(slug);
    const cat = htmlToText(firstMatch(inner, /category-badge[^>]*>([\s\S]*?)<\/span>/) || '');
    const valid = htmlToText(firstMatch(inner, /معتبر تا:([\s\S]*?)<\/p>/) || '');
    const ref = 'tapsitakhfif:' + slug;
    const exp = parseExpiry(valid ? 'تا ' + valid : '');
    if (exp.iso && Date.parse(exp.iso) < Date.now()) { out.expired.push(ref); continue; }
    const base = { source: 'tapsitakhfif', ref, srcBrand: 'تپسی', srcSlug: 'tapsi', catHint: cat, title, desc: '', code: '', kind: 'deal', expiresAt: exp.iso, expiryText: valid, url: enc(href) };
    out.jobs.push({ source: 'tapsitakhfif', kind: 'reveal', ref, url: enc(href), method: 'GET', headers: { 'User-Agent': UA }, base });
  }
  return out;
}

function parseTapsiReveal(job, res) {
  const out = empty();
  const html = bodyText(res);
  const base = job.base || {};
  const code = htmlToText(firstMatch(html, /id="coupon-code"[^>]*>([\s\S]*?)<\/div>/) || '').trim();
  const link = firstMatch(html, /<!-- Coupon Code -->[\s\S]*?<a href="([^"]+)"/) || '';
  const desc = htmlToText(firstMatch(html, /<!-- Deal Content -->([\s\S]*?)<!-- /) || '').replace(/^توضیحات کامل\s*/, '');
  const cats = (html.match(/دسته-بندی\/[^"]+"[^>]*>([^<]+)</g) || []).map((s) => htmlToText(s.replace(/^[^>]*>/, '')));
  const ok = looksLikeCode(code);
  out.items.push(Object.assign({}, base, {
    code: ok ? code : '', kind: ok ? 'code' : 'deal', link, desc: desc || base.desc,
    catHint: [base.catHint].concat(cats).filter(Boolean).join(' '),
  }));
  return out;
}

// ---- storecode.ir -------------------------------------------------------------------------------
function parseStorecodeNonce(job, res) {
  const out = empty();
  const t = bodyText(res).trim().replace(/^"|"$/g, '');
  if (/^[a-f0-9]{6,20}$/i.test(t)) out.meta.storecodeNonce = t;
  return out;
}

function parseStorecodeList(job, res) {
  const out = empty();
  const html = bodyText(res);
  for (const tag of openTags(html, 'data-codeid')) {
    const id = attr(tag, 'data-codeid');
    if (!id) continue;
    const ref = 'storecode:' + id;
    const expired = attr(tag, 'data-monghazi');
    if (expired && /yes|1|true/i.test(expired)) { out.expired.push(ref); continue; }
    let roles = [];
    try { roles = JSON.parse(b64decode(attr(tag, 'data-roles') || '')) || []; } catch (e) { roles = []; }
    const rolesText = roles.map((r) => normFa(String(r)).replace(/-{3,}/g, '').trim()).filter((r) => r && !/:\s*$/.test(r));
    const brandLink = attr(tag, 'data-codebrandlink') || '';
    const slug = decodeURIComponent((/\/shops\/([^/]+)\/?$/.exec(brandLink) || [])[1] || '').replace(/-/g, ' ');
    const noeType = attr(tag, 'data-codenoetype') || '';
    const noe = attr(tag, 'data-codenoe') || '';
    const isDeal = /پیشنهاد/.test(noe) || noeType === 'pishnahad';
    const link = (attr(tag, 'data-codelink') || '').replace(/[?&]utm_[^&]+/g, '').replace(/\?$/, '');
    const base = {
      source: 'storecode', ref, srcBrand: attr(tag, 'data-codebrand') || '', srcSlug: slug,
      title: attr(tag, 'data-codetitle') || '', desc: attr(tag, 'data-codedesc') || '', code: '',
      kind: isDeal ? 'deal' : noeType === 'public' ? 'code' : 'unique', discountText: (attr(tag, 'data-codetakhfif') || '').replace(/(\d)(درصد|تومان)/, '$1 $2'),
      conditions: [attr(tag, 'data-codecats') || ''].concat(rolesText).filter(Boolean).join(' • '),
      link: /^https?:\/\/[^/?]+\.[a-z]{2,}/i.test(link) ? link : '', url: attr(tag, 'data-codetitlelink') || 'https://storecode.ir/',
      likes: +(attr(tag, 'data-codelikes') || 0), dislikes: +(attr(tag, 'data-codedislikes') || 0),
    };
    if (base.kind === 'code') {
      out.jobs.push({ source: 'storecode', kind: 'reveal', ref, url: 'https://storecode.ir/wp-admin/admin-ajax.php', method: 'POST', contentType: 'application/x-www-form-urlencoded', needs: 'storecodeNonce', bodyTemplate: 'action=get_one_offcode&id=' + id + '&frontCodesField={nonce}&number=' + (attr(tag, 'data-howmany') || '1'), headers: Object.assign({ 'User-Agent': UA, Referer: 'https://storecode.ir/' }, XHR), base });
    } else {
      out.items.push(base);
    }
  }
  return out;
}

function parseStorecodeReveal(job, res) {
  const out = empty();
  const j = bodyJson(res);
  const base = job.base || {};
  const code = j && j.code ? String(Array.isArray(j.code) ? j.code[0] : j.code).trim() : '';
  if (!looksLikeCode(code)) { out.items.push(Object.assign({}, base, { kind: 'unique' })); return out; }
  out.items.push(Object.assign({}, base, { code, kind: 'code' }));
  return out;
}

// ---- iranicard.ir (Sotoon CDN browser check) ----------------------------------------------------
function parseIranicard(job, res) {
  const out = empty();
  const html = bodyText(res);
  const cookie = firstMatch(html, /document\.cookie\s*=\s*'(__zrkjc=[^;']+)/);
  if (cookie && !(job.meta && job.meta.retried)) {
    out.jobs.push({ source: 'iranicard', kind: 'list', url: job.url, method: 'GET', headers: Object.assign({}, job.headers || {}, { Cookie: cookie }), meta: { retried: true } });
    return out;
  }
  const re = /data-clipboard=(?:"([^"]+)"|'([^']+)')/g;
  let m;
  while ((m = re.exec(html))) {
    const code = decodeEntities(m[1] || m[2]).trim();
    if (!looksLikeCode(code)) continue;
    const before = html.slice(Math.max(0, m.index - 4000), m.index);
    const strongs = before.match(/<strong>([\s\S]*?)<\/strong>/g) || [];
    const lastStrong = htmlToText(strongs.length ? strongs[strongs.length - 1] : '');
    const h2s = before.match(/<h2[^>]*>([\s\S]*?)<\/h2>/g) || [];
    const section = htmlToText(h2s.length ? h2s[h2s.length - 1] : '');
    const isApp = /^App-|App$/i.test(code) || /اپلیکیشن/.test(lastStrong);
    out.items.push({
      source: 'iranicard', ref: 'iranicard:' + code, srcBrand: 'ایرانیکارت', srcSlug: 'iranicard',
      title: section ? section + (isApp ? ' (اپلیکیشن)' : ' (سایت)') : lastStrong, desc: lastStrong,
      code, kind: 'code', discountText: (/(\d+\s*[٪%])/.exec(normFa(lastStrong)) || [])[1] || '',
      link: 'https://www.iranicard.ir/', url: job.url,
    });
  }
  return out;
}

// ---- Telegram public channels (t.me/s/...) ------------------------------------------------------
function parseTelegram(job, res) {
  const out = empty();
  const html = bodyText(res);
  const channel = (job.meta && job.meta.channel) || '';
  const maxAge = 10 * 86400e3; // older channel posts are dropped, then the row goes stale
  const posts = splitBlocks(html, /<div class="tgme_widget_message_wrap/);
  for (const p of posts) {
    const post = firstMatch(p, /data-post="([^"]+)"/);
    const when = firstMatch(p, /<time[^>]*datetime="([^"]+)"/);
    const ts = when ? Date.parse(when) : NaN;
    if (!post || (Number.isFinite(ts) && Date.now() - ts > maxAge)) continue;
    const textHtml = firstMatch(p, /<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>\s*(?:<div class="tgme_widget_message_(?:footer|reply_markup)|<\/div>)/) || firstMatch(p, /<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/) || '';
    // Codes are either wrapped in <code> or written as "کد تخفیف: XYZ".
    const clean = textHtml.replace(/<i class="emoji"[^>]*>([\s\S]*?)<\/i>/g, '$1').replace(/<\/?tg-emoji[^>]*>/g, '');
    if (!/<code>/.test(clean) && !TG_CODE_LABEL.test(htmlToText(clean))) continue;
    // Each offer is usually a paragraph separated by an empty line.
    const blocks = clean.split(/<br\s*\/?>\s*(?:[\u200c\s]*<br\s*\/?>)+/);
    const postTags = tgTags(clean);
    for (let bi = 0; bi < blocks.length; bi++) {
      const b = blocks[bi];
      const plain = htmlToText(b);
      const codes = (b.match(/<code>([\s\S]*?)<\/code>/g) || []).map((c) => htmlToText(c).trim());
      const lab = new RegExp(TG_CODE_LABEL.source, 'g');
      let lm;
      while ((lm = lab.exec(plain))) codes.push(lm[1]);
      const uniq = [...new Set(codes.filter(looksLikeCode))];
      if (!uniq.length) continue;
      // Context: this block, or the previous one when the block holds only the code line.
      const ctxHtml = plain.replace(/\s+/g, '').length < 40 && bi > 0 ? blocks[bi - 1] + '<br/>' + b : b;
      const tags = tgTags(ctxHtml).filter((t) => !/آفردیلی|آفرجو|تخفیف|کد|استورکد|موپن/.test(t));
      const shopLink = firstMatch(ctxHtml, /offch\.com\/shops\/([a-z0-9-]+)/) || firstMatch(ctxHtml, /offerdaily\.ir\/brands\/([a-z0-9-]+)/) || firstMatch(ctxHtml, /storecode\.ir\/shops\/([^/"]+)/) || firstMatch(ctxHtml, /boodgeh\.com\/shops\/([a-z0-9-]+)/) || firstMatch(ctxHtml, /takhfife\.com\/brand\/([a-z0-9-]+)/) || '';
      const moponBrand = slugFromMoponPath(firstMatch(ctxHtml, /href="(https:\/\/www\.mopon\.ir\/[^"]+)"/) || '').slug;
      const text = htmlToText(ctxHtml.replace(/<code>[\s\S]*?<\/code>/g, ' '));
      const lines = text.split('\n').map((l) => stripEmoji(l).replace(/^[-•\s]+/, '').trim())
        .filter((l) => l && !/^#/.test(l) && !/^@/.test(l) && !/^(کد تخفیف|کد|کد معرف|کد هدیه)\s*:?$/.test(l));
      let title = lines.find((l) => /کد|تخفیف|هدیه|٪|%|رایگان/.test(l) && l.replace(/[:\s]/g, '').length > 8) || lines[0] || '';
      // Channel shorthand: "500 هزار ت" / "تا 250 ت" mean thousand toman.
      title = normFa(title).replace(/(هزار|میلیون)\s*ت(?=\s|$)/g, '$1 تومان').replace(/(\d+)\s*ت(?=\s|$)/g, (m, n) => (+n < 10000 ? n + ' هزار تومان' : m));
      const discount = (/میزان تخفیف:\s*([^\n]+)/.exec(text) || [])[1] || moneyText(title) || moneyText(normFa(text));
      // Brand: hashtag of this block > brand named in the title > post-level hashtag.
      // The post-level hashtag is only a fallback; resolveTelegram() (merge step, which has the brand catalog)
      // picks the final brand and drops posts about unknown apps.
      const postTag = postTags.find((t) => !/آفردیلی|آفرجو|تخفیف|کد|استورکد|موپن/.test(t)) || '';
      const srcBrand = tags[0] || moponBrand;
      const exp = parseExpiry((/(?:مهلت|اعتبار|تا تاریخ)[^\n]*/.exec(text) || [''])[0]);
      for (const code of uniq) {
        out.items.push({
          source: 'telegram', ref: 'tg:' + post + ':' + code, srcBrand, srcSlug: shopLink.replace(/-/g, ' '), title,
          tgCheck: true, tgPostTag: postTag,
          desc: lines.slice(0, 6).join('\n'), code, kind: 'code', discountText: discount, hidden: true, expiresAt: exp.iso,
          link: '', url: 'https://t.me/' + post, postedAt: Number.isFinite(ts) ? new Date(ts).toISOString() : null, channel,
        });
      }
    }
  }
  return out;
}

const TG_CODE_LABEL = /(?:کد\s*(?:تخفیف|معرف|هدیه)?|code)\s*[:：]\s*([A-Za-z0-9][A-Za-z0-9_\-]{2,30})/i;

function moneyText(t) {
  return (/(\d+(?:\.\d+)?\s*(?:٪|%|درصد))/.exec(t) || [])[1] || (/(\d+(?:\.\d+)?\s*(?:هزار|میلیون)\s*(?:تومان|ت)?)/.exec(t) || [])[1] || '';
}

function tgTags(html) {
  return (html.match(/<a href="\?q=%23[^"]+">#([^<]+)<\/a>/g) || []).map((a) => htmlToText(a).replace(/^#/, '').replace(/_/g, ' '));
}

function stripEmoji(s) {
  return String(s || '').replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{20E3}\u{200D}]/gu, '').replace(/\s+/g, ' ').trim();
}

// ---- Dispatcher ---------------------------------------------------------------------------------
const PARSERS = {
  'mopon:list': parseMoponList, 'mopon:reveal': parseMoponReveal,
  'offch:list': parseOffchList, 'offch:reveal': parseOffchReveal,
  'boodgeh:list': parseBoodgehList,
  'offerjo:list': parseOfferjoList, 'offerjo:brands': parseOfferjoBrands,
  'offerdaily:list': parseOfferdailyList, 'offerdaily:reveal': parseOfferdailyReveal,
  'takhfife:list': parseTakhfifeList, 'takhfife:reveal': parseTakhfifeReveal,
  'tapsitakhfif:list': parseTapsiList, 'tapsitakhfif:reveal': parseTapsiReveal,
  'storecode:nonce': parseStorecodeNonce, 'storecode:list': parseStorecodeList, 'storecode:reveal': parseStorecodeReveal,
  'iranicard:list': parseIranicard,
  'telegram:list': parseTelegram,
};

function parseResponse(job, res) {
  const fn = PARSERS[job.source + ':' + job.kind];
  if (!fn) return empty();
  const status = res && (res.statusCode || res.status);
  if (res && res.error && !bodyText(res)) return Object.assign(empty(), { error: String(res.error.message || res.error) });
  if (status && status >= 400) return Object.assign(empty(), { error: 'HTTP ' + status });
  try {
    return fn(job, res || {});
  } catch (e) {
    return Object.assign(empty(), { error: 'parse: ' + (e && e.message) });
  }
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

// Crawler Engine dispatcher (Code node "Crawler Engine" in the Engine sub-workflow).
// Ops: fetch (download + parse pages), plan. Bundled with lib/text.js, crawler/sources.js, crawler/pipeline.js by scripts/build.mjs.
const req = $('Request In').first().json || {};
const op = req.op || 'fetch';

if (op === 'fetch') {
  // Input: HTTP responses (one per job, same order as "Expand Jobs"). Output: ONE compact aggregate.
  const jobs = $('Expand Jobs').all();
  const responses = $input.all();
  const agg = { items: [], jobs: [], seen: [], expired: [], meta: {}, errors: [], fetched: responses.length, bySource: {} };
  for (let i = 0; i < responses.length; i++) {
    const job = jobs[i] ? jobs[i].json : {};
    const r = responses[i].json || {};
    const out = parseResponse(job, { statusCode: r.statusCode, body: r.body !== undefined ? r.body : r.data, error: r.error });
    agg.items.push(...out.items);
    agg.jobs.push(...out.jobs);
    agg.seen.push(...(out.seen || []));
    agg.expired.push(...(out.expired || []));
    Object.assign(agg.meta, out.meta || {});
    const src = job.source || '?';
    const s = agg.bySource[src] || (agg.bySource[src] = { req: 0, items: 0, jobs: 0, err: 0 });
    s.req++; s.items += out.items.length; s.jobs += out.jobs.length;
    if (out.error) { s.err++; agg.errors.push({ source: src, kind: job.kind, url: String(job.url || '').slice(0, 140), error: String(out.error).slice(0, 200) }); }
  }
  return [{ json: agg }];
}

if (op === 'plan') {
  const jobs = buildPlan({ sources: req.sources || null });
  return chunk(jobs, CHUNK_SIZE).map((c, i) => ({ json: { op: 'fetch', stage: 1, chunk: i, jobs: c } }));
}

return [{ json: { error: 'unknown crawler op ' + op } }];
