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
