import { workflow, node, trigger, sticky } from '@n8n/workflow-sdk';

// Run once (and again whenever the webhook URL/secret or the bot texts change).

const runSetup = trigger({
  type: 'n8n-nodes-base.manualTrigger',
  version: 1,
  config: { name: 'Run Setup', position: [0, 300] }
});

const setWebhook = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Set Webhook',
    position: [240, 300],
    parameters: {
      method: 'POST',
      url: 'https://api.telegram.org/bot@@cfg:TELEGRAM_BOT_TOKEN@@/setWebhook',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: '{"url": "@@cfg:WEBHOOK_URL@@", "secret_token": "@@cfg:WEBHOOK_SECRET@@", "allowed_updates": ["message", "callback_query", "my_chat_member"], "drop_pending_updates": true, "max_connections": 40}',
      options: { response: { response: { neverError: true } } }
    }
  }
});

const setCommands = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Set Commands',
    position: [480, 300],
    parameters: {
      method: 'POST',
      url: 'https://api.telegram.org/bot@@cfg:TELEGRAM_BOT_TOKEN@@/setMyCommands',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: '{"commands": [{"command": "start", "description": "🎁 منوی اصلی تخفیف‌یاب"}, {"command": "hot", "description": "🔥 داغ‌ترین کدهای تخفیف"}, {"command": "new", "description": "🆕 جدیدترین کدهای کشف‌شده"}, {"command": "snapp", "description": "🚖 کدهای تخفیف اسنپ (همه سرویس‌ها)"}, {"command": "tapsi", "description": "🚕 کدهای تخفیف تپسی (همه سرویس‌ها)"}, {"command": "digikala", "description": "🛒 کدهای تخفیف دیجی‌کالا"}, {"command": "brands", "description": "🗂 همه فروشگاه‌ها و برندها"}, {"command": "alerts", "description": "🔔 اعلان‌های من"}, {"command": "stats", "description": "📊 آمار و منابع"}, {"command": "help", "description": "❓ راهنما"}]}',
      options: { response: { response: { neverError: true } } }
    }
  }
});

const setDescription = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Set Description',
    position: [720, 300],
    parameters: {
      method: 'POST',
      url: 'https://api.telegram.org/bot@@cfg:TELEGRAM_BOT_TOKEN@@/setMyDescription',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: '{"description": "🎁 تخفیف‌یاب | هوشمندترین شکارچی کد تخفیف ایران\\n\\n✅ همه کدهای تخفیف فعال و حتی مخفیِ اسنپ، تپسی، دیجی‌کالا و ده‌ها فروشگاه دیگر، یک‌جا\\n🔄 به‌روزرسانی خودکار هر ۲ ساعت از بیش از ۱۰ سایت و کانال معتبر\\n🧠 امتیاز هوشمند، حذف کدهای تکراری و منقضی\\n📋 کپی کد با یک لمس\\n🔔 خبرت می‌کنیم وقتی کد جدیدِ برند دلخواهت پیدا شد\\n\\nبرای شروع «Start» رو بزن 👇"}',
      options: { response: { response: { neverError: true } } }
    }
  }
});

const setShortDescription = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Set Short Description',
    position: [960, 300],
    parameters: {
      method: 'POST',
      url: 'https://api.telegram.org/bot@@cfg:TELEGRAM_BOT_TOKEN@@/setMyShortDescription',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: '{"short_description": "همه کدهای تخفیف فعال و مخفی اسنپ، تپسی، دیجی‌کالا و ... یک‌جا 🎁 به‌روزرسانی هر ۲ ساعت"}',
      options: { response: { response: { neverError: true } } }
    }
  }
});

const webhookInfo = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Webhook Info',
    position: [1200, 300],
    parameters: { method: 'GET', url: 'https://api.telegram.org/bot@@cfg:TELEGRAM_BOT_TOKEN@@/getWebhookInfo', options: { response: { response: { neverError: true } } } }
  }
});

const note = sticky(
  '## ⚙️ Takhfif Finder — Setup\nRun manually once: registers the bot webhook (with the secret token checked by the Bot workflow), the command menu and the bot descriptions. **Webhook Info** shows the result.',
  [runSetup, setWebhook, setCommands, setDescription, setShortDescription, webhookInfo],
  { color: 3 }
);

export default workflow('takhfif-setup', 'Takhfif Finder — Setup')
  .add(runSetup)
  .to(setWebhook)
  .to(setCommands)
  .to(setDescription)
  .to(setShortDescription)
  .to(webhookInfo)
  .add(note);
