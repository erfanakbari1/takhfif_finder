import { workflow, node, trigger, sticky, switchCase, expr } from '@n8n/workflow-sdk';

// Workflow settings (applied after creation): saveDataSuccessExecution 'none' (a crawl runs ~70 sub-executions
// holding raw HTML), saveDataErrorExecution 'all'.
const requestIn = trigger({
  type: 'n8n-nodes-base.executeWorkflowTrigger',
  version: 1.2,
  config: {
    name: 'Request In',
    position: [0, 200],
    parameters: { inputSource: 'passthrough' }
  },
  output: [{ op: 'fetch', jobs: [{ source: 'mopon', kind: 'list', url: 'https://www.mopon.ir/', method: 'GET', headers: {} }] }]
});

const routeOp = switchCase({
  version: 3.4,
  config: {
    name: 'Route Op',
    position: [240, 200],
    parameters: {
      mode: 'rules',
      rules: {
        values: [
          {
            renameOutput: true,
            outputKey: 'fetch',
            conditions: {
              options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
              conditions: [{ leftValue: expr('{{ $json.op }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'fetch' }],
              combinator: 'and'
            }
          },
          {
            renameOutput: true,
            outputKey: 'plan',
            conditions: {
              options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
              conditions: [{ leftValue: expr('{{ $json.op }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'plan' }],
              combinator: 'and'
            }
          },
          {
            renameOutput: true,
            outputKey: 'merge',
            conditions: {
              options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
              conditions: [{ leftValue: expr('{{ $json.op }}'), operator: { type: 'string', operation: 'regex' }, rightValue: '^(reveals|merge|version)$' }],
              combinator: 'and'
            }
          }
        ]
      },
      options: { fallbackOutput: 'extra', renameFallbackOutput: 'bot' }
    }
  }
});

const expandJobs = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Expand Jobs',
    position: [480, 80],
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: "const out = [];\nfor (const it of $input.all()) {\n  for (const j of it.json.jobs || []) {\n    out.push({ json: Object.assign({ method: 'GET', body: '', contentType: 'application/x-www-form-urlencoded', headers: {} }, j) });\n  }\n}\nreturn out;"
    }
  },
  output: [{ source: 'mopon', kind: 'list', url: 'https://www.mopon.ir/', method: 'GET', headers: {}, body: '', contentType: 'application/x-www-form-urlencoded' }]
});

const fetchUrl = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Fetch URL',
    position: [720, 80],
    onError: 'continueRegularOutput',
    parameters: {
      method: expr('{{ $json.method }}'),
      url: expr('{{ $json.url }}'),
      sendHeaders: true,
      specifyHeaders: 'json',
      jsonHeaders: expr('{{ JSON.stringify($json.headers || {}) }}'),
      sendBody: true,
      contentType: 'raw',
      rawContentType: expr('{{ $json.contentType }}'),
      body: expr('{{ $json.body || "" }}'),
      options: {
        batching: { batch: { batchSize: 6, batchInterval: 700 } },
        redirect: { redirect: { followRedirects: true, maxRedirects: 6 } },
        response: { response: { fullResponse: true, neverError: true, responseFormat: 'autodetect' } },
        timeout: 25000
      }
    }
  },
  output: [{ statusCode: 200, headers: {}, body: '<html></html>' }]
});

const crawlerEngine = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Crawler Engine',
    position: [960, 80],
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: '@@min:crawler-engine@@'
    }
  },
  output: [{ items: [], jobs: [], seen: [], expired: [], meta: {}, errors: [], fetched: 1, bySource: {} }]
});

const mergeEngine = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Merge Engine',
    position: [960, 240],
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: '@@min:merge-engine@@'
    }
  },
  output: [{ _op: 'upsert', ckey: 'snapp|X', brand: 'snapp', code: 'X' }]
});

const botEngine = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Bot Engine',
    position: [960, 400],
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: '@@min:bot-engine@@'
    }
  },
  output: [{ _op: 'tg', method: 'sendMessage', payload: { chat_id: 1, text: 'hi' } }]
});

const note = sticky(
  '## 🧠 Takhfif Finder — Engine\nAll crawler + bot logic lives in two Code nodes (minified builds of `src/` in the GitHub repo, made by `npm run build`).\n\nCalled as a sub-workflow with `{ op }`:\n- `fetch` → download jobs (6 req / 0.7s) and parse them in **Crawler Engine** (raw HTML never leaves this workflow)\n- `plan` → crawl plan (**Crawler Engine**)\n- `reveals` / `merge` / `version` → dedupe, score and diff against the table (**Merge Engine**)\n- `botParse` / `botReply` / `alerts` → Telegram bot brain (**Bot Engine**)',
  [requestIn, routeOp, expandJobs, fetchUrl, crawlerEngine, mergeEngine, botEngine],
  { color: 4 }
);

export default workflow('takhfif-engine', 'Takhfif Finder — Engine')
  .add(requestIn)
  .to(routeOp
    .onCase(0, expandJobs.to(fetchUrl.to(crawlerEngine)))
    .onCase(1, crawlerEngine)
    .onCase(2, mergeEngine)
    .onCase(3, botEngine))
  .add(note);
