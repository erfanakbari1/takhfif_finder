import { workflow, node, trigger, sticky, ifElse, switchCase, expr } from '@n8n/workflow-sdk';

// Telegram bot @takhfif_finder_bot: webhook -> Engine (understand) -> data tables -> Engine (reply) -> Bot API.
// Workflow settings (applied after creation): timezone Asia/Tehran, executionTimeout 120s,
// saveDataSuccessExecution 'none' (one execution per user message), saveDataErrorExecution 'all'.
const ENGINE = { __rl: true, mode: 'id', value: '__ENGINE_WORKFLOW_ID__', cachedResultName: 'Takhfif Finder — Engine' };
const TABLE_COUPONS = { __rl: true, mode: 'id', value: '__TABLE_COUPONS_ID__', cachedResultName: 'takhfif_coupons' };
const TABLE_USERS = { __rl: true, mode: 'id', value: '__TABLE_USERS_ID__', cachedResultName: 'takhfif_users' };
const TABLE_META = { __rl: true, mode: 'id', value: '__TABLE_META_ID__', cachedResultName: 'takhfif_meta' };

// Only Telegram knows the secret (sent by setWebhook in the Setup workflow); other callers never start an execution.
const telegramWebhook = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'Telegram Webhook',
    position: [0, 300],
    parameters: {
      httpMethod: 'POST',
      path: 'takhfif-finder-bot',
      responseMode: 'onReceived',
      options: {
        noResponseBody: true,
        onlyRunIf: expr("{{ $json.headers['x-telegram-bot-api-secret-token'] === '__WEBHOOK_SECRET__' }}")
      }
    }
  },
  output: [{ headers: {}, body: { update_id: 1, message: { message_id: 1, from: { id: 1, first_name: 'A' }, chat: { id: 1, type: 'private' }, text: '/start' } } }]
});

const makeParse = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Make Parse Request',
    position: [240, 300],
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: "return [{ json: { op: 'botParse', update: $input.first().json.body || {} } }];" }
  },
  output: [{ op: 'botParse', update: {} }]
});

const understand = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.3,
  config: {
    name: 'Understand Update',
    position: [480, 300],
    parameters: { source: 'database', workflowId: ENGINE, mode: 'once', options: { waitForSubWorkflow: true } }
  },
  output: [{ ctx: {}, route: { view: 'home' }, q: { need: false }, userId: '1' }]
});

const loadUser = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Load User',
    position: [720, 300],
    alwaysOutputData: true,
    parameters: {
      resource: 'row',
      operation: 'get',
      dataTableId: TABLE_USERS,
      matchType: 'allConditions',
      filters: { conditions: [{ keyName: 'user_id', condition: 'eq', keyValue: expr('{{ $json.userId }}') }] },
      limit: 1
    }
  },
  output: [{ user_id: '1', subs: '' }]
});

const loadStats = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Load Stats',
    position: [960, 300],
    alwaysOutputData: true,
    executeOnce: true,
    parameters: {
      resource: 'row',
      operation: 'get',
      dataTableId: TABLE_META,
      matchType: 'allConditions',
      filters: { conditions: [{ keyName: 'key', condition: 'eq', keyValue: 'stats' }] },
      limit: 1
    }
  },
  output: [{ key: 'stats', value: '{}' }]
});

const needCoupons = ifElse({
  version: 2.3,
  config: {
    name: 'Need Coupons?',
    position: [1200, 300],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        conditions: [{ leftValue: expr("{{ $('Understand Update').first().json.q.need }}"), operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and'
      }
    }
  }
});

// The query itself (brand / newest / hottest / search) is decided by the Engine in "Understand Update".
const queryCoupons = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Query Coupons',
    position: [1440, 200],
    alwaysOutputData: true,
    executeOnce: true,
    parameters: {
      resource: 'row',
      operation: 'get',
      dataTableId: TABLE_COUPONS,
      matchType: 'allConditions',
      filters: {
        conditions: [
          {
            keyName: expr("{{ $('Understand Update').first().json.q.key }}"),
            condition: expr("{{ $('Understand Update').first().json.q.cond }}"),
            keyValue: expr("{{ $('Understand Update').first().json.q.value }}")
          },
          {
            keyName: expr("{{ $('Understand Update').first().json.q.key2 || 'active' }}"),
            condition: expr("{{ $('Understand Update').first().json.q.cond2 || 'isTrue' }}"),
            keyValue: expr("{{ $('Understand Update').first().json.q.value2 || '' }}")
          },
          { keyName: 'active', condition: 'isTrue' }
        ]
      },
      returnAll: expr("{{ $('Understand Update').first().json.q.all }}"),
      limit: expr("{{ $('Understand Update').first().json.q.limit }}"),
      orderBy: true,
      orderByColumn: expr("{{ $('Understand Update').first().json.q.order }}"),
      orderByDirection: 'DESC'
    }
  },
  output: [{ ckey: 'snapp|SF50', brand: 'snapp', service: 'food', code: 'SF50', active: true }]
});

const makeReply = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Make Reply Request',
    position: [1680, 300],
    executeOnce: true,
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: "const p = $('Understand Update').first().json;\nlet user = {};\ntry { user = $('Load User').first().json || {}; } catch (e) { user = {}; }\nlet stats = {};\ntry { stats = $('Load Stats').first().json || {}; } catch (e) { stats = {}; }\nlet rows = [];\nif (p.q && p.q.need) {\n  try { rows = $('Query Coupons').all().map((i) => i.json); } catch (e) { rows = []; }\n}\nreturn [{ json: { op: 'botReply', p, user, stats, rows } }];"
    }
  },
  output: [{ op: 'botReply', p: {}, user: {}, stats: {}, rows: [] }]
});

const buildReply = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.3,
  config: {
    name: 'Build Reply',
    position: [1920, 300],
    parameters: { source: 'database', workflowId: ENGINE, mode: 'once', options: { waitForSubWorkflow: true } }
  },
  output: [{ _op: 'tg', method: 'sendMessage', payload: { chat_id: 1, text: 'hi' } }]
});

const routeReply = switchCase({
  version: 3.4,
  config: {
    name: 'Route Reply',
    position: [2160, 300],
    parameters: { mode: 'rules', rules: { values: [{"renameOutput":true,"outputKey":"tg","conditions":{"options":{"caseSensitive":true,"leftValue":"","typeValidation":"loose"},"conditions":[{"leftValue":"={{ $json._op }}","operator":{"type":"string","operation":"equals"},"rightValue":"tg"}],"combinator":"and"}},{"renameOutput":true,"outputKey":"user","conditions":{"options":{"caseSensitive":true,"leftValue":"","typeValidation":"loose"},"conditions":[{"leftValue":"={{ $json._op }}","operator":{"type":"string","operation":"equals"},"rightValue":"user"}],"combinator":"and"}}] }, options: {} }
  }
});

// answerCallbackQuery / editMessageText / sendMessage, in the order the Engine returned them.
const telegramApi = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Telegram API',
    position: [2400, 200],
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: expr('https://api.telegram.org/bot__TELEGRAM_BOT_TOKEN__/{{ $json.method }}'),
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify($json.payload) }}'),
      options: { response: { response: { neverError: true } }, timeout: 15000 }
    }
  }
});

const saveUser = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Save User',
    position: [2400, 400],
    parameters: {
      resource: 'row',
      operation: 'upsert',
      dataTableId: TABLE_USERS,
      matchType: 'allConditions',
      filters: { conditions: [{ keyName: 'user_id', condition: 'eq', keyValue: expr('{{ $json.user_id }}') }] },
      columns: {"mappingMode":"defineBelow","value":{"user_id":"={{ $json.user_id }}","first_name":"={{ $json.first_name }}","username":"={{ $json.username }}","subs":"={{ $json.subs }}","joined_at":"={{ $json.joined_at }}","last_seen":"={{ $json.last_seen }}","blocked":"={{ $json.blocked }}"},"matchingColumns":[],"schema":[{"id":"user_id","displayName":"user_id","required":false,"defaultMatch":false,"display":true,"type":"string","canBeUsedToMatch":true},{"id":"first_name","displayName":"first_name","required":false,"defaultMatch":false,"display":true,"type":"string","canBeUsedToMatch":true},{"id":"username","displayName":"username","required":false,"defaultMatch":false,"display":true,"type":"string","canBeUsedToMatch":true},{"id":"subs","displayName":"subs","required":false,"defaultMatch":false,"display":true,"type":"string","canBeUsedToMatch":true},{"id":"joined_at","displayName":"joined_at","required":false,"defaultMatch":false,"display":true,"type":"dateTime","canBeUsedToMatch":true},{"id":"last_seen","displayName":"last_seen","required":false,"defaultMatch":false,"display":true,"type":"dateTime","canBeUsedToMatch":true},{"id":"blocked","displayName":"blocked","required":false,"defaultMatch":false,"display":true,"type":"boolean","canBeUsedToMatch":true}],"attemptToConvertTypes":false,"convertFieldsToString":false}
    }
  }
});

const note = sticky(
  '## 🤖 Takhfif Finder — Telegram Bot\n@takhfif_finder_bot webhook (secured with Telegram\'s secret token header).\n1. **Understand Update** (Engine `botParse`): command / button / free text → view + data-table query\n2. Load the user, the crawl stats and the matching coupons\n3. **Build Reply** (Engine `botReply`): menus, coupon cards with copy buttons, alerts on/off\n4. Call the Bot API and save the user',
  [telegramWebhook, makeParse, understand, loadUser, loadStats, needCoupons, queryCoupons, makeReply, buildReply, routeReply],
  { color: 6 }
);

export default workflow('takhfif-bot', 'Takhfif Finder — Telegram Bot')
  .add(telegramWebhook)
  .to(makeParse)
  .to(understand)
  .to(loadUser)
  .to(loadStats)
  .to(needCoupons
    .onTrue(queryCoupons.to(makeReply))
    .onFalse(makeReply))
  .add(makeReply)
  .to(buildReply)
  .to(routeReply
    .onCase(0, telegramApi)
    .onCase(1, saveUser))
  .add(note);
