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

// @export-start
if (typeof module !== 'undefined') {
  module.exports = { parseUpdate, routeUpdate, buildReply, buildAlerts, searchRows, couponBlock, channelGate, resumeData };
}
// @export-end
