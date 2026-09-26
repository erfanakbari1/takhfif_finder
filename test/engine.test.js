// Runs the Engine Code nodes exactly as n8n would (the built bundles in dist/, readable and minified), with fake $ / $input.
// Usage: npm test            (builds first)
//        node test/engine.test.js [fixturesDir]
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const BOT_OPS = new Set(['botParse', 'botReply', 'alerts']);
const MERGE_OPS = new Set(['reveals', 'merge', 'version']);
const variants = ['code', 'min'];
const scripts = {};
for (const v of variants) {
  for (const b of ['crawler-engine', 'merge-engine', 'bot-engine']) {
    const code = fs.readFileSync(path.join(root, 'dist', `${b}.${v}.js`), 'utf8');
    scripts[v + ':' + b] = new vm.Script('(async function(){\n' + code + '\n})()', { filename: `${b}.${v}.js` });
  }
}
let variant = 'code';

async function runEngine(request, extra) {
  const nodes = Object.assign({ 'Request In': [{ json: request }] }, (extra && extra.nodes) || {});
  const input = (extra && extra.input) || [{ json: request }];
  const ctx = vm.createContext({
    console, Buffer, URL, Date, JSON, Math, encodeURIComponent, decodeURIComponent, atob, btoa,
    $: (name) => ({ first: () => nodes[name][0], all: () => nodes[name] }),
    $input: { all: () => input, first: () => input[0] },
  });
  const bundle = BOT_OPS.has(request.op) ? 'bot-engine' : MERGE_OPS.has(request.op) ? 'merge-engine' : 'crawler-engine';
  const out = await scripts[variant + ':' + bundle].runInContext(ctx);
  return JSON.parse(JSON.stringify(out.map((i) => i.json)));
}

const fixtures = process.argv[2];
let failures = 0;
const checks = [];
function check(name, fn) { checks.push([name, fn]); }

check('plan builds chunked jobs for every source', async () => {
  const out = (await runEngine({ op: 'plan' }));
  assert.ok(out.length > 5, 'expected several chunks');
  const jobs = out.flatMap((c) => c.jobs);
  const sources = new Set(jobs.map((j) => j.source));
  for (const s of ['mopon', 'offch', 'boodgeh', 'offerjo', 'offerdaily', 'takhfife', 'tapsitakhfif', 'storecode', 'iranicard', 'telegram']) assert.ok(sources.has(s), 'missing ' + s);
  assert.ok(out.every((c) => c.op === 'fetch' && c.jobs.length <= 20));
  assert.ok(jobs.every((j) => /^https:\/\/[\x21-\x7e]+$/.test(j.url)), 'urls must be ascii-encoded');
});

check('botParse routes /start and callbacks', async () => {
  const a = (await runEngine({ op: 'botParse', update: { message: { message_id: 1, from: { id: 5, first_name: 'A' }, chat: { id: 5, type: 'private' }, text: '/start' } } }))[0];
  assert.strictEqual(a.route.view, 'home');
  const b = (await runEngine({ op: 'botParse', update: { callback_query: { id: 'x', from: { id: 5 }, data: 's:snapp:food:1', message: { message_id: 9, chat: { id: 5, type: 'private' } } } } }))[0];
  assert.strictEqual(b.route.view, 'list');
  assert.strictEqual(b.q.value, 'snapp');
  const c = (await runEngine({ op: 'botParse', update: { message: { message_id: 1, from: { id: 5 }, chat: { id: 5, type: 'private' }, text: 'کد تخفیف تپسی گاراژ' } } }))[0];
  assert.deepStrictEqual([c.route.view, c.route.brand, c.route.service], ['list', 'tapsi', 'garage']);
  const d = (await runEngine({ op: 'botParse', update: { message: { message_id: 1, from: { id: 5 }, chat: { id: 5, type: 'private' }, text: 'دیجیکالا جت' } } }))[0];
  assert.deepStrictEqual([d.route.brand, d.route.service], ['digikala', 'jet']);
  // A service list filters by service in the data-table query itself.
  assert.deepStrictEqual([b.q.key2, b.q.value2], ['service', 'food']);
  assert.deepStrictEqual([c.q.key2, c.q.value2], ['service', 'garage']);
});

check('merge + botReply produce a coupon list with copy buttons', async () => {
  const now = new Date().toISOString();
  const s1 = [{ items: [
    { source: 'offch', ref: 'offch:1', srcSlug: 'snappfood', title: 'کد تخفیف 50 هزار تومانی اسنپ فود', code: 'SF50', kind: 'code', discountText: '50,000 تومان' },
    { source: 'mopon', ref: 'mopon:a', srcBrand: 'اسنپ فود', title: 'کد تخفیف ۵۰ هزار تومانی اولین سفارش اسنپ‌فود', code: 'sf50', kind: 'code' },
    { source: 'boodgeh', ref: 'boodgeh:z', srcBrand: 'تپسی', srcSlug: 'tapsi', title: 'کد تخفیف تپسی گاراژ کارواش', code: 'TG100', kind: 'code' },
  ], jobs: [], seen: [], expired: [], meta: {}, errors: [], fetched: 3, bySource: { offch: { req: 1, items: 1, jobs: 0, err: 0 } } }];
  const ops = (await runEngine({ op: 'merge', known: [], s1, s2: [] }));
  const ups = ops.filter((o) => o._op === 'upsert');
  assert.strictEqual(ups.length, 2, 'SF50 from two sources must merge into one row');
  const sf = ups.find((u) => u.code.toUpperCase() === 'SF50');
  assert.strictEqual(sf.service, 'food');
  assert.ok(sf.sources.includes('offch') && sf.sources.includes('mopon'));
  const tg = ups.find((u) => u.code === 'TG100');
  assert.deepStrictEqual([tg.brand, tg.service], ['tapsi', 'garage']);
  const statsItem = ops.find((o) => o._op === 'meta' && o.key === 'stats');
  const p = (await runEngine({ op: 'botParse', update: { callback_query: { id: 'x', from: { id: 5, first_name: 'A' }, data: 's:snapp:food:0', message: { message_id: 9, chat: { id: 5, type: 'private' } } } } }))[0];
  const reply = (await runEngine({ op: 'botReply', p, user: {}, stats: statsItem, rows: ups }));
  const edit = reply.find((r) => r._op === 'tg' && r.method === 'editMessageText');
  assert.ok(edit.payload.text.includes('SF50') || edit.payload.text.includes('sf50'));
  const flat = edit.payload.reply_markup.inline_keyboard.flat();
  assert.ok(flat.some((b) => b.copy_text), 'copy button');
  assert.ok(flat.every((b) => !b.callback_data || Buffer.byteLength(b.callback_data) <= 64), 'callback_data <= 64 bytes');
  assert.ok(reply.some((r) => r._op === 'user'));
  const startP = (await runEngine({ op: 'botParse', update: { message: { message_id: 1, from: { id: 5, first_name: 'A' }, chat: { id: 5, type: 'private' }, text: '/start' } } }))[0];
  const home = await runEngine({ op: 'botReply', p: startP, user: {}, stats: statsItem, rows: [] });
  assert.ok(home[0].payload.text.includes('تخفیف‌یاب'));
  void now;
});

check('known coupons: refreshed twice a day, keep their best text, expire when a refresh says so', async () => {
  const h = (n) => new Date(Date.now() + n * 3600e3).toISOString();
  const k1 = { ckey: 'snapp|SF50', brand: 'snapp', service: 'food', code: 'SF50', kind: 'code', active: true, refs: 'offch:1,offerjo:9',
    sources: 'offch,offerjo', title: 'کد تخفیف ۵۰ هزار تومانی اسنپ فود (کانال تخفیف)', descr: 'توضیح کامل کانال تخفیف برای این کد که از چهل حرف بیشتر است و باید بماند',
    discount: '۵۰ هزار تومان', pct: 0, toman: 50000, expires_at: h(240), first_seen: h(-48), last_seen: h(-13), sig: 'old' };
  const k2 = { ckey: 'tapsi|TG1', brand: 'tapsi', service: 'ride', code: 'TG1', kind: 'code', active: true, refs: 'mopon:m1', sources: 'mopon',
    title: 'کد تپسی', descr: '', first_seen: h(-48), last_seen: h(-1), sig: 'old2' };
  const reveal = (ref, source) => ({ source, kind: 'reveal', ref, url: 'https://x/' + ref, base: { source, ref, srcSlug: 'snappfood', title: 't', kind: 'code' } });
  const s1 = [{ items: [{ source: 'offerjo', ref: 'offerjo:9', srcSlug: 'snappfood', title: 'کد SF50 اسنپ فود از آفرجو', code: 'SF50', kind: 'code' }],
    jobs: [reveal('offch:1', 'offch'), reveal('mopon:m1', 'mopon'), reveal('offch:2', 'offch')], seen: [], expired: [], meta: {}, errors: [], fetched: 3 }];
  const plan = (await runEngine({ op: 'reveals', known: [k1, k2], s1 }))[0];
  assert.deepStrictEqual(plan.jobs.map((j) => j.ref), ['offch:2', 'offch:1'], 'new coupon first, then the 13h-old one; the fresh one waits');
  const s2 = [{ items: [], jobs: [], seen: [], expired: ['mopon:m1'], meta: {}, errors: [], fetched: 1 }];
  const ups = (await runEngine({ op: 'merge', known: [k1, k2], s1, s2 })).filter((o) => o._op === 'upsert');
  const r1 = ups.find((u) => u.ckey === 'snapp|SF50');
  assert.strictEqual(r1.title, k1.title, 'a lower-ranked source must not overwrite the text');
  assert.strictEqual(r1.descr, k1.descr);
  assert.deepStrictEqual([r1.expires_at, r1.discount, r1.toman], [k1.expires_at, k1.discount, 50000], 'gaps filled from the stored row');
  assert.strictEqual(ups.find((u) => u.ckey === 'tapsi|TG1').active, false, 'a refresh that finds it expired deactivates it');
});

check('channel gate: non-members get the join message, "I joined" re-checks and resumes', async () => {
  const gate = (status) => ({ channel: '@GozarNetPro', check: status ? { ok: true, result: { status } } : { ok: false, error_code: 400, description: 'Bad Request: member list is inaccessible' } });
  const stats = { value: JSON.stringify({ total: 1716, codes: 663, brands: { snapp: { fa: 'اسنپ', n: 10, c: 5, s: { food: 3 } } }, sources: {} }) };
  const msg = (text) => ({ message: { message_id: 1, from: { id: 5, first_name: 'Ali' }, chat: { id: 5, type: 'private' }, text } });
  const cb = (data) => ({ callback_query: { id: 'c1', from: { id: 5, first_name: 'Ali' }, data, message: { message_id: 9, chat: { id: 5, type: 'private' } } } });
  const rows = [{ ckey: 'snapp|F1', brand: 'snapp', service: 'food', brand_fa: 'اسنپ', title: 'کد فود', code: 'F1', kind: 'code', sources: 'offch', active: true, score: 90 }];
  const reply = async (update, g) => {
    const p = (await runEngine({ op: 'botParse', update }))[0];
    return { p, out: await runEngine({ op: 'botReply', p, user: {}, stats, rows: p.q.need ? rows : [], gate: g }) };
  };
  // Not a member: /start shows the gate, with a join link and an "I joined" button that returns home.
  let { out } = await reply(msg('/start'), gate('left'));
  const send = out.find((o) => o.method === 'sendMessage');
  assert.ok(send.payload.text.includes('@GozarNetPro') && send.payload.text.includes('۱۷۱۶'));
  const kb = send.payload.reply_markup.inline_keyboard.flat();
  assert.strictEqual(kb[0].url, 'https://t.me/GozarNetPro');
  assert.strictEqual(kb[1].callback_data, 'j:h');
  assert.ok(out.some((o) => o._op === 'user'), 'the user is still saved');
  // A deep link or button resumes exactly there after joining.
  ({ out } = await reply(msg('/start snapp__food'), gate('left')));
  assert.strictEqual(out.find((o) => o.method === 'sendMessage').payload.reply_markup.inline_keyboard[1][0].callback_data, 'j:s:snapp:food:0');
  ({ out } = await reply(cb('s:snapp:food:1'), gate('kicked')));
  assert.deepStrictEqual(out.filter((o) => o._op === 'tg').map((o) => o.method), ['answerCallbackQuery', 'editMessageText']);
  // "I joined" while still outside: only an alert, the gate message stays.
  ({ out } = await reply(cb('j:s:snapp:food:0'), gate('left')));
  const tg = out.filter((o) => o._op === 'tg');
  assert.strictEqual(tg.length, 1);
  assert.strictEqual(tg[0].payload.show_alert, true);
  // "I joined" as a member: the list opens with a welcome toast (and the query was built for it).
  const joined = await reply(cb('j:s:snapp:food:0'), gate('member'));
  assert.deepStrictEqual([joined.p.route.view, joined.p.q.value, joined.p.q.value2], ['list', 'snapp', 'food']);
  const edit = joined.out.find((o) => o.method === 'editMessageText');
  assert.ok(edit.payload.text.includes('F1'));
  assert.ok(joined.out.find((o) => o.method === 'answerCallbackQuery').payload.text.includes('تأیید'));
  // Members and failed checks (bot not admin of the channel) use the bot normally.
  for (const g of [gate('administrator'), gate(null), null]) {
    ({ out } = await reply(msg('/start'), g));
    assert.ok(out.find((o) => o.method === 'sendMessage').payload.text.includes('تخفیف\u200cیاب</b> |'), 'home menu');
  }
  // Long searches still fit Telegram's 64-byte callback data.
  ({ out } = await reply(msg('کد تخفیف خرید بلیط هواپیما خارجی ارزان برای تعطیلات تابستان'), gate('left')));
  const data = out.find((o) => o.method === 'sendMessage').payload.reply_markup.inline_keyboard[1][0].callback_data;
  assert.ok(data.startsWith('j:r:0:') && Buffer.byteLength(data) <= 64, data);
});

check('alerts go only to followers', async () => {
  const rows = [{ brand: 'snapp', service: 'food', brand_fa: 'اسنپ', title: 'کد', code: 'X1', kind: 'code', sources: 'offch' }];
  const out = (await runEngine({ op: 'alerts', rows, users: [{ user_id: '1', subs: 'snapp:food' }, { user_id: '2', subs: 'tapsi:*' }, { user_id: '3', subs: 'snapp:*', blocked: true }] }));
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].payload.chat_id, '1');
  // A user stored twice is alerted once, following the latest row (here: alerts turned off).
  const dup = await runEngine({ op: 'alerts', rows, users: [
    { user_id: '7', subs: 'snapp:*', last_seen: '2026-09-25T10:00:00.000Z' }, { user_id: '7', subs: 'snapp:*', last_seen: '2026-09-25T10:00:01.000Z' },
    { user_id: '8', subs: 'snapp:*', last_seen: '2026-09-25T10:00:00.000Z' }, { user_id: '8', subs: 'tapsi:*', last_seen: '2026-09-25T11:00:00.000Z' }] });
  assert.deepStrictEqual(dup.map((a) => a.payload.chat_id), ['7']);
});

check('joining the bot does not save the user (the /start message does); blocking does', async () => {
  const member = (status) => ({ my_chat_member: { chat: { id: 9, type: 'private' }, from: { id: 9, first_name: 'Z' }, date: 1, old_chat_member: { status: 'member' }, new_chat_member: { status } } });
  const reply = async (update) => {
    const p = (await runEngine({ op: 'botParse', update }))[0];
    return runEngine({ op: 'botReply', p, user: {}, stats: {}, rows: [] });
  };
  assert.ok(!(await reply(member('member'))).some((r) => r._op === 'user'));
  const blocked = (await reply(member('kicked'))).find((r) => r._op === 'user');
  assert.strictEqual(blocked.blocked, true);
});

check('brand logos: animated custom emoji in messages and on buttons, plain emoji outside the pack', async () => {
  const SNAPP = '5024117283887253544';
  const SNAPP_FOOD = '5026569873422026474';
  const TAPSI = '5024281901393776065';
  const tag = (id, e) => '<tg-emoji emoji-id="' + id + '">' + e + '</tg-emoji>';
  const stats = { value: JSON.stringify({ total: 20, codes: 10, sources: {}, brands: {
    snapp: { fa: 'اسنپ', n: 10, c: 5, s: { food: 3, box: 1 } }, tapsi: { fa: 'تپسی', n: 4, c: 2, s: { garage: 4 } },
    digikala: { fa: 'دیجی‌کالا', n: 3, c: 1, s: { jet: 3 } }, torob: { fa: 'ترب', n: 2, c: 1, s: {} } } }) };
  const rows = [
    { ckey: 'snapp|F1', brand: 'snapp', service: 'food', brand_fa: 'اسنپ', title: 'کد فود', code: 'F1', kind: 'code', sources: 'offch', active: true, score: 90 },
    { ckey: 'snapp|B1', brand: 'snapp', service: 'box', brand_fa: 'اسنپ', title: 'کد باکس', code: 'B1', kind: 'code', sources: 'offch', active: true, score: 80 },
    { ckey: 'torob|T1', brand: 'torob', service: '', brand_fa: 'ترب', category: 'shop', title: 'کد ترب', code: 'T1', kind: 'code', sources: 'offch', active: true, score: 70 },
  ];
  const msg = (text) => ({ message: { message_id: 1, from: { id: 5, first_name: 'Ali' }, chat: { id: 5, type: 'private' }, text } });
  const cb = (data) => ({ callback_query: { id: 'c1', from: { id: 5, first_name: 'Ali' }, data, message: { message_id: 9, chat: { id: 5, type: 'private' } } } });
  const reply = async (update, gate) => {
    const p = (await runEngine({ op: 'botParse', update }))[0];
    const out = await runEngine({ op: 'botReply', p, user: { user_id: '5', subs: 'snapp:food,tapsi:*' }, stats, rows: p.q.need ? rows : [], gate });
    return out.find((o) => o.method === 'sendMessage' || o.method === 'editMessageText').payload;
  };
  // Home: Telegram draws the logo before the button text, which then carries no emoji of its own.
  let kb = (await reply(msg('/start'))).reply_markup.inline_keyboard.flat();
  const snapp = kb.find((b) => b.callback_data === 'b:snapp');
  assert.deepStrictEqual([snapp.icon_custom_emoji_id, snapp.text], [SNAPP, 'اسنپ (۱۰)']);
  const torob = kb.find((b) => b.callback_data === 'b:torob');
  assert.ok(!torob.icon_custom_emoji_id && torob.text === '🔎 ترب (۲)', 'brands outside the pack keep their emoji');
  // Brand page: logo in the title; service buttons with their own logo, or their plain emoji.
  let m = await reply(cb('b:snapp'));
  assert.ok(m.text.startsWith(tag(SNAPP, '🚕') + ' <b>کدهای تخفیف اسنپ</b>'));
  kb = m.reply_markup.inline_keyboard.flat();
  assert.strictEqual(kb.find((b) => b.callback_data === 's:snapp:food:0').icon_custom_emoji_id, SNAPP_FOOD);
  assert.strictEqual(kb.find((b) => b.callback_data === 's:snapp:box:0').text, '📦 اسنپ‌باکس و پیک/وانت (۱)');
  // All of a brand's codes: each coupon headed by its service.
  m = await reply(cb('s:snapp:*:0'));
  assert.ok(m.text.includes('<b>۱) ' + tag(SNAPP_FOOD, '🍔') + ' اسنپ‌فود | کد فود</b>'));
  assert.ok(m.text.includes('<b>۲) 📦 اسنپ‌باکس و پیک/وانت | کد باکس</b>'));
  // Mixed lists (hot, newest, search, alerts): the service's logo, else the brand's, else its plain emoji.
  m = await reply(cb('t:0'));
  assert.ok(m.text.includes(tag(SNAPP_FOOD, '🍔') + ' اسنپ | کد فود'));
  assert.ok(m.text.includes(tag(SNAPP, '🚕') + ' اسنپ | کد باکس'));
  assert.ok(m.text.includes('🔎 ترب | کد ترب'));
  const alert = (await runEngine({ op: 'alerts', rows: rows.slice(0, 1), users: [{ user_id: '1', subs: 'snapp:*' }] }))[0];
  assert.ok(alert.payload.text.includes(tag(SNAPP_FOOD, '🍔') + ' اسنپ | کد فود'));
  // My alerts, the super-apps row under categories, and the channel gate's welcome.
  m = await reply(cb('my'));
  assert.ok(m.text.includes('• ' + tag(SNAPP_FOOD, '🍔') + ' اسنپ‌فود') && m.text.includes('• ' + tag(TAPSI, '🚖') + ' همه‌ی تپسی'));
  kb = (await reply(cb('cats'))).reply_markup.inline_keyboard.flat();
  assert.deepStrictEqual(kb.filter((b) => b.icon_custom_emoji_id).map((b) => b.text), ['اسنپ', 'تپسی', 'دیجی‌کالا']);
  m = await reply(msg('/start'), { channel: '@GozarNetPro', check: { ok: true, result: { status: 'left' } } });
  assert.ok(m.text.includes(tag(SNAPP, '🚕') + ' اسنپ، ' + tag(TAPSI, '🚖') + ' تپسی، '));
});

if (fixtures && fs.existsSync(fixtures)) {
  check('fetch op parses captured responses', async () => {
    const files = [['b7/b7_00_pb_boodgeh_com.txt', 'boodgeh', 'list'], ['b7/b7_03_t_me.txt', 'telegram', 'list'], ['b6/b6_05_api_offch_com.txt', 'offch', 'reveal']];
    const jobs = files.map(([, source, kind], i) => ({ json: { source, kind, url: 'https://x/' + i, meta: { channel: 'off_channell' }, ref: 'offch:18924', base: { source, ref: 'offch:18924', srcSlug: 'snappfood', title: 't', kind: 'code' } } }));
    const input = files.map(([f]) => ({ json: { statusCode: 200, body: fs.readFileSync(path.join(fixtures, f), 'utf8') } }));
    const out = (await runEngine({ op: 'fetch', jobs: [] }, { nodes: { 'Expand Jobs': jobs }, input }));
    assert.strictEqual(out.length, 1);
    assert.ok(out[0].items.length > 20, 'items parsed: ' + out[0].items.length);
    assert.ok(out[0].items.some((i) => i.code === 'FOOD41'));
  });
}

(async () => {
  for (const v of variants) {
    variant = v;
    for (const [name, fn] of checks) {
      try { await fn(); console.log(`ok  - [${v}] ${name}`); } catch (e) { failures++; console.log(`FAIL- [${v}] ${name}\n      ${e.stack}`); }
    }
  }
  console.log(failures ? failures + ' failure(s)' : 'all passed');
  process.exit(failures ? 1 : 0);
})();
