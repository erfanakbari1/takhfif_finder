import { workflow, node, trigger, sticky, ifElse, switchCase, expr } from '@n8n/workflow-sdk';

// Crawls every source every 2 hours through the Engine sub-workflow and keeps the coupons table in sync.
// Workflow settings (applied after creation): timezone Asia/Tehran, executionTimeout 3000s,
// saveDataSuccessExecution 'none' (run stats are kept in takhfif_meta.last_run), saveDataErrorExecution 'all'.
const ENGINE = { __rl: true, mode: 'id', value: '@@cfg:ENGINE_WORKFLOW_ID@@', cachedResultName: 'Takhfif Finder — Engine' };
const TABLE_COUPONS = { __rl: true, mode: 'id', value: '@@cfg:TABLE_COUPONS@@', cachedResultName: 'takhfif_coupons' };
const TABLE_USERS = { __rl: true, mode: 'id', value: '@@cfg:TABLE_USERS@@', cachedResultName: 'takhfif_users' };
const TABLE_META = { __rl: true, mode: 'id', value: '@@cfg:TABLE_META@@', cachedResultName: 'takhfif_meta' };

const schedule = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: {
    name: 'Every 2 Hours',
    position: [0, 200],
    parameters: { rule: { interval: [{ field: 'hours', hoursInterval: 2, triggerAtMinute: 7 }] } }
  }
});

const runNow = trigger({
  type: 'n8n-nodes-base.manualTrigger',
  version: 1,
  config: { name: 'Run Now', position: [0, 400] }
});

// Empty on the very first run, so it must still hand one (empty) item to the next step.
const loadKnown = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Load Known Coupons',
    position: [240, 300],
    alwaysOutputData: true,
    parameters: { resource: 'row', operation: 'get', dataTableId: TABLE_COUPONS, returnAll: true }
  },
  output: [{ id: 1, ckey: 'snapp|SF50', refs: 'offch:1', active: true, code: 'SF50', kind: 'code' }]
});

const makePlan = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Make Plan Request',
    position: [480, 300],
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "return [{ json: { op: 'plan' } }];" }
  },
  output: [{ op: 'plan' }]
});

const planCrawl = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.3,
  config: {
    name: 'Plan Crawl',
    position: [720, 300],
    parameters: { source: 'database', workflowId: ENGINE, mode: 'once', options: { waitForSubWorkflow: true } }
  },
  output: [{ op: 'fetch', stage: 1, chunk: 0, jobs: [] }]
});

// One Engine run per chunk of ~20 pages; each returns one compact aggregate (items + follow-up jobs).
const fetchListings = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.3,
  config: {
    name: 'Fetch Listings',
    position: [960, 300],
    onError: 'continueRegularOutput',
    parameters: { source: 'database', workflowId: ENGINE, mode: 'each', options: { waitForSubWorkflow: true } }
  },
  output: [{ items: [], jobs: [], seen: [], expired: [], meta: {}, errors: [], fetched: 20, bySource: {} }]
});

const makeReveals = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Make Reveal Request',
    position: [1200, 300],
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: "// Only the fields needed to skip (or periodically refresh) reveals of coupons we already know.\nconst known = $('Load Known Coupons').all().map((i) => i.json).filter((r) => r.ckey)\n  .map((r) => ({ ckey: r.ckey, refs: r.refs, active: r.active, code: r.code, kind: r.kind, last_seen: r.last_seen }));\nconst s1 = $input.all().map((i) => i.json);\nreturn [{ json: { op: 'reveals', known, s1 } }];"
    }
  },
  output: [{ op: 'reveals', known: [], s1: [] }]
});

const planReveals = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.3,
  config: {
    name: 'Plan Reveals',
    position: [1440, 300],
    parameters: { source: 'database', workflowId: ENGINE, mode: 'once', options: { waitForSubWorkflow: true } }
  },
  output: [{ op: 'fetch', noJobs: false, stage: 2, chunk: 0, jobs: [] }]
});

const anyReveals = ifElse({
  version: 2.3,
  config: {
    name: 'Any Reveals?',
    position: [1680, 300],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        conditions: [{ leftValue: expr('{{ $json.noJobs }}'), operator: { type: 'boolean', operation: 'false', singleValue: true } }],
        combinator: 'and'
      }
    }
  }
});

// Opens the "show code" pages / APIs (hidden codes) for coupons we have not seen before.
const revealCodes = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.3,
  config: {
    name: 'Reveal Codes',
    position: [1920, 200],
    onError: 'continueRegularOutput',
    parameters: { source: 'database', workflowId: ENGINE, mode: 'each', options: { waitForSubWorkflow: true } }
  },
  output: [{ items: [], jobs: [], seen: [], expired: [], meta: {}, errors: [], fetched: 20, bySource: {} }]
});

const makeMerge = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Make Merge Request',
    position: [2160, 300],
    executeOnce: true,
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: "const known = $('Load Known Coupons').all().map((i) => i.json).filter((r) => r.ckey);\nconst s1 = $('Fetch Listings').all().map((i) => i.json);\nlet s2 = [];\ntry { s2 = $('Reveal Codes').all().map((i) => i.json); } catch (e) { s2 = []; } // no reveals this run\nreturn [{ json: { op: 'merge', known, s1, s2 } }];"
    }
  },
  output: [{ op: 'merge', known: [], s1: [], s2: [] }]
});

const mergeScore = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.3,
  config: {
    name: 'Merge & Score',
    position: [2400, 300],
    parameters: { source: 'database', workflowId: ENGINE, mode: 'once', options: { waitForSubWorkflow: true } }
  },
  output: [{ _op: 'upsert', ckey: 'snapp|SF50', brand: 'snapp', code: 'SF50' }]
});

const routeResults = switchCase({
  version: 3.4,
  config: {
    name: 'Route Results',
    position: [2640, 300],
    parameters: { mode: 'rules', rules: { values: '@@switch:_op:upsert,meta,alerts,purge@@' }, options: {} }
  }
});

const saveCoupons = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Save Coupons',
    position: [2900, 0],
    parameters: {
      resource: 'row',
      operation: 'upsert',
      dataTableId: TABLE_COUPONS,
      matchType: 'allConditions',
      filters: { conditions: [{ keyName: 'ckey', condition: 'eq', keyValue: expr('{{ $json.ckey }}') }] },
      columns: '@@columns:coupons@@'
    }
  }
});

const saveMeta = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Save Stats',
    position: [2900, 200],
    parameters: {
      resource: 'row',
      operation: 'upsert',
      dataTableId: TABLE_META,
      matchType: 'allConditions',
      filters: { conditions: [{ keyName: 'key', condition: 'eq', keyValue: expr('{{ $json.key }}') }] },
      columns: '@@columns:meta@@'
    }
  }
});

const hasAlerts = ifElse({
  version: 2.3,
  config: {
    name: 'Has Alerts?',
    position: [2900, 400],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        conditions: [{ leftValue: expr('{{ ($json.rows || []).length }}'), operator: { type: 'number', operation: 'gt' }, rightValue: 0 }],
        combinator: 'and'
      }
    }
  }
});

const loadFollowers = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Load Followers',
    position: [3140, 400],
    parameters: {
      resource: 'row',
      operation: 'get',
      dataTableId: TABLE_USERS,
      matchType: 'allConditions',
      // isNotEmpty only means NOT NULL, so also exclude '' (users who turned every alert off).
      filters: { conditions: [{ keyName: 'subs', condition: 'isNotEmpty' }, { keyName: 'subs', condition: 'neq', keyValue: '' }, { keyName: 'blocked', condition: 'isFalse' }] },
      returnAll: true
    }
  },
  output: [{ user_id: '1', subs: 'snapp:*', blocked: false }]
});

const makeAlerts = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Make Alerts Request',
    position: [3380, 400],
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: "const rows = $('Has Alerts?').first().json.rows || [];\nconst users = $input.all().map((i) => i.json);\nreturn [{ json: { op: 'alerts', rows, users } }];"
    }
  },
  output: [{ op: 'alerts', rows: [], users: [] }]
});

const buildAlerts = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.3,
  config: {
    name: 'Build Alerts',
    position: [3620, 400],
    parameters: { source: 'database', workflowId: ENGINE, mode: 'once', options: { waitForSubWorkflow: true } }
  },
  output: [{ method: 'sendMessage', payload: { chat_id: '1', text: 'hi' } }]
});

// Telegram allows ~30 messages/second for broadcasts; stay well below it.
const sendAlerts = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Send Alerts',
    position: [3860, 400],
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: expr('https://api.telegram.org/bot@@cfg:TELEGRAM_BOT_TOKEN@@/{{ $json.method }}'),
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify($json.payload) }}'),
      options: {
        batching: { batch: { batchSize: 20, batchInterval: 1100 } },
        response: { response: { neverError: true } },
        timeout: 15000
      }
    }
  }
});

// Inactive rows are kept for a month (so a returning code keeps its history), then removed.
const purgeOld = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Purge Old Coupons',
    position: [2900, 600],
    parameters: {
      resource: 'row',
      operation: 'deleteRows',
      dataTableId: TABLE_COUPONS,
      matchType: 'allConditions',
      filters: { conditions: [{ keyName: 'active', condition: 'isFalse' }, { keyName: 'last_seen', condition: 'lt', keyValue: expr('{{ $json.before }}') }] }
    }
  }
});

const note = sticky(
  '## 🕷 Takhfif Finder — Crawler\nEvery 2 hours: plan → fetch all listing pages & APIs (mopon, offch, boodgeh, offerdaily, takhfife, tapsitakhfif, offerjo, storecode, iranicard, Telegram channels) → reveal hidden codes of new coupons → merge duplicates, score, expire → save to **takhfif_coupons**, stats to **takhfif_meta**, and alert followers.\n\nAll logic runs in the **Takhfif Finder — Engine** sub-workflow.',
  [schedule, runNow, loadKnown, makePlan, planCrawl, fetchListings, makeReveals, planReveals, anyReveals, revealCodes, makeMerge, mergeScore],
  { color: 5 }
);

export default workflow('takhfif-crawler', 'Takhfif Finder — Crawler')
  .add(schedule)
  .to(loadKnown)
  .to(makePlan)
  .to(planCrawl)
  .to(fetchListings)
  .to(makeReveals)
  .to(planReveals)
  .to(anyReveals
    .onTrue(revealCodes.to(makeMerge))
    .onFalse(makeMerge))
  .add(makeMerge)
  .to(mergeScore)
  .to(routeResults
    .onCase(0, saveCoupons)
    .onCase(1, saveMeta)
    .onCase(2, hasAlerts.onTrue(loadFollowers.to(makeAlerts.to(buildAlerts.to(sendAlerts)))))
    .onCase(3, purgeOld))
  .add(runNow)
  .to(loadKnown)
  .add(note);
