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
