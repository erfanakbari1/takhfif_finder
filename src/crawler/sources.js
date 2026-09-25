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

// @export-start
if (typeof module !== 'undefined') {
  module.exports = { buildPlan, parseResponse, PARSERS, TG_CHANNELS, OFFCH_SHOPS };
}
// @export-end
