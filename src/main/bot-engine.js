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
