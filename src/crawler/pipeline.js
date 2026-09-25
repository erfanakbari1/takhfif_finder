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

// @export-start
if (typeof module !== 'undefined') {
  module.exports = { chunk, combineResults, planReveals, CHUNK_SIZE, MAX_REVEALS, REFRESH_HOURS };
}
// @export-end
