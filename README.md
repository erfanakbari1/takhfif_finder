# 🎁 تخفیف‌یاب — Takhfif Finder

[![tests](https://github.com/erfanakbari1/takhfif_finder/actions/workflows/test.yml/badge.svg)](https://github.com/erfanakbari1/takhfif_finder/actions/workflows/test.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

[English summary ↓](#-english-summary)

ربات تلگرامی [@takhfif_finder_bot](https://t.me/takhfif_finder_bot): همه‌ی کدهای تخفیف فعال، معتبر و حتی **مخفیِ** اسنپ، تپسی، دیجی‌کالا و ده‌ها فروشگاه ایرانی دیگر را از بیش از ۱۰ سایت و کانال کد تخفیف جمع می‌کند، تکراری‌ها را ادغام و منقضی‌ها را حذف می‌کند و با یک منوی تمیز تحویل می‌دهد.

کل سیستم روی **n8n** اجرا می‌شود. منطق در همین ریپو با تست نوشته شده و به‌صورت کد داخل نودهای n8n دیپلوی می‌شود.

## ✨ امکانات

- **منوی /start**: اسنپ، تپسی و دیجی‌کالا در صدر، پرکدترین برندها، همه‌ی فروشگاه‌ها، دسته‌بندی‌ها، داغ‌ترین‌ها و جدیدترین‌ها.
- **زیرمنوی سرویس‌ها**:
  - **اسنپ** (۱۳ سرویس): مسافر، فود، مارکت، شاپ، پی، دکتر و دارو، تریپ، روم، باکس/پیک، اکسپرس، بیمه، کارفیکس، کلاب.
  - **تپسی** (۷ سرویس): مسافر، فود، مارکت، شاپ، دکتر، گاراژ، پک/باکس.
  - **دیجی‌کالا** (۷ سرویس): فروشگاه، جت و سوپرمارکت، استایل، دیجی‌پی، پلاس، کلاب، طلا.
- **کدهای مخفی**: کدهایی را که پشت دکمه‌ی «نمایش کد» یا «دریافت کد» پنهان‌اند، از API یا صفحه‌ی کوپن استخراج می‌کند (موپن، کانال تخفیف، آفردیلی، تخفیفه، تپسی‌تخفیف، استورکد).
- **امتیاز هوشمند**: امتیاز هر کد بر اساس این موارد محاسبه می‌شود:
  - تأیید در چند منبع
  - میزان تخفیف
  - تازگی
  - لایک و دیس‌لایک سایت مبدأ
  - نوع (کد، کد اختصاصی یا آفر)
- **ادغام و اعتبارسنجی**:
  - یک کد که در چند سایت آمده، یک ردیف با فهرست منابع می‌شود.
  - تاریخ انقضا از متن‌های فارسی خوانده می‌شود: شمسی، میلادی، «۳ روز مانده» و «فقط امروز».
  - کدی که دیگر در هیچ منبعی دیده نشود، غیرفعال می‌شود.
  - هر کد شناخته‌شده حدوداً هر ۱۲ ساعت دوباره از منبعش خوانده می‌شود. به این ترتیب کد، تاریخ انقضا و توضیحات به‌روز می‌ماند و کدی که منبع منقضی اعلامش کند، کنار می‌رود.
- **کپی با یک لمس**: هر کد یک دکمه‌ی `copy_text` دارد.
- **اموجی‌های متحرک**:
  - کنار اسم اسنپ، تپسی، دیجی‌کالا، سرویس‌هایشان و برندهای معروف دیگر، لوگوی متحرک از پک اموجی خودمان ([IranianBrandsAnimated](https://t.me/addemoji/IranianBrandsAnimated)) می‌آید.
  - بقیه‌ی اموجی‌های متن پیام‌ها و دکمه‌ها هم نسخه‌ی متحرکشان از پک [RestrictedEmoji](https://t.me/addemoji/RestrictedEmoji) است. اگر پک اموجی دقیقی را نداشته باشد، نزدیک‌ترینش می‌آید (مثلاً 📬 به‌جای 📦).
  - در متن پیام‌ها با `<tg-emoji>` و روی دکمه‌ها با `icon_custom_emoji_id` نمایش داده می‌شوند. تلگرام در هر پیام حداکثر ۱۰۰ entity نگه می‌دارد، پس ربات از این سقف رد نمی‌شود.
  - تلگرام اموجی کاستوم ربات را فقط وقتی نشان می‌دهد که صاحب ربات تلگرام پریمیوم داشته باشد. جاهایی که نمایشش ممکن نیست (مثل نوتیفیکیشن)، اموجی معمولی همان استیکر دیده می‌شود.
  - پاپ‌آپ‌ها (answerCallbackQuery)، منوی دستورات و توضیحات ربات در تلگرام متن ساده‌اند و اموجی معمولی دارند.
- **شرط عضویت در کانال**:
  - کسی که عضو کانال تعیین‌شده (`REQUIRED_CHANNEL`، الان [@GozarNetPro](https://t.me/GozarNetPro)) نباشد، یک پیام دعوت با دکمه‌ی «عضویت در کانال» و «عضو شدم» می‌بیند.
  - بعد از عضویت، دقیقاً همان بخشی که خواسته بود باز می‌شود؛ مثلاً لینک مستقیم اسنپ‌فود.
  - ربات باید ادمین کانال باشد (بدون هیچ دسترسی خاص) تا تلگرام عضویت را جواب بدهد. اگر نباشد، بررسی انجام نمی‌شود و ربات برای همه باز می‌ماند.
- **جستجوی فارسی**: کافی است بنویسید «اسنپ فود»، «تپسی گاراژ» یا «دیجی کالا جت». نوشتار عربی/فارسی و اعداد نرمال‌سازی می‌شوند.
- **اعلان**: با دکمه‌ی «🔔 خبرم کن» برای هر برند یا سرویس، کد جدید که پیدا شود همان لحظه ارسال می‌شود.
- **خزش مؤدبانه**:
  - حداکثر ۶ درخواست در هر ۰٫۷ ثانیه.
  - کدهای یک‌بارمصرف (مثل `get_one_offcode` استورکد یا کوپن‌های تک‌کاربره‌ی کانال تخفیف) هرگز «مصرف» نمی‌شوند. فقط لینک دریافتشان نمایش داده می‌شود.

## 🏗 معماری

```
                 هر ۲ ساعت                                     Telegram
                     │                                             │ webhook (secret token)
          ┌──────────▼───────────┐                      ┌─────────▼──────────┐
          │ Takhfif Finder —     │                      │ Takhfif Finder —   │
          │ Crawler              │                      │ Telegram Bot       │
          └──────────┬───────────┘                      └─────────┬──────────┘
   plan → fetch → reveals → merge                  botParse → (data tables) → botReply
                     │           Execute Sub-workflow {op}         │
                     └──────────────►┌───────────────┐◄────────────┘
                                     │ Takhfif Finder│  Crawler Engine  (fetch, plan)
                                     │ — Engine      │  Merge Engine    (reveals, merge, version)
                                     └───────┬───────┘  Bot Engine      (botParse, botReply, alerts)
                                             │
                       n8n Data Tables: takhfif_coupons · takhfif_users · takhfif_meta
```

| Workflow در n8n | کار |
|---|---|
| **Takhfif Finder — Engine** | همه‌ی منطق در سه Code node (بیلد مینیفای‌شده‌ی `src/`). دانلود صفحه‌ها با HTTP Request (۶ درخواست / ۰٫۷ ثانیه) هم همین‌جاست، تا HTML خام از این ساب‌ورک‌فلو بیرون نرود. |
| **Takhfif Finder — Crawler** | هر ۲ ساعت خزش کامل، ذخیره در جدول کوپن‌ها، آمار در `takhfif_meta`، ارسال اعلان و پاک‌سازی ردیف‌های قدیمی. |
| **Takhfif Finder — Telegram Bot** | وب‌هوک ربات. درخواست بدون هدر `X-Telegram-Bot-Api-Secret-Token` درست اصلاً اجرا نمی‌شود. عضویت کاربر در کانال لازم با `getChatMember` بررسی می‌شود. |
| **Takhfif Finder — Setup** | اجرای دستی و یک‌باره: `setWebhook`، منوی دستورات و توضیحات ربات. |

## 🌐 منابع

| منبع | روش |
|---|---|
| mopon.ir | صفحه‌های جدیدترین، محبوب، دسته‌ها و برندها ← API `coupon/single` برای کد مخفی |
| offch.com (کانال تخفیف) | API `api.offch.com/api/v2` برای ~۶۰ فروشگاه و جدیدترین‌ها ← جزئیات کوپن برای کد |
| boodgeh.com | API کالکشن PocketBase (کدهای منقضی‌نشده) |
| offerdaily.ir | صفحه‌ی برندها ← صفحه‌ی کوپن (`input#code` و لینک مستقیم) |
| takhfife.com | صفحه‌ی اصلی و برندها ← صفحه‌ی کوپن |
| tapsitakhfif.ir | فهرست صفحه‌ها ← صفحه‌ی آفر |
| offerjo.ir | WordPress REST API |
| storecode.ir | صفحه‌ی اصلی و فروشگاه‌ها + `admin-ajax` (فقط کدهای عمومی) |
| iranicard.ir | صفحه‌ی کد تخفیف (با عبور از چالش کوکی) |
| کانال‌های تلگرام | نسخه‌ی وب عمومی `t.me/s/…`: کانال تخفیف، موپن، آفردیلی، آفرجو، تخفیفه، تخفیف‌هات، استورکد، بودجه، ایرانیکارت |

> **منابعی که مستقیم خزش نمی‌شوند:**
> - takhfifhot.com: کدهایش از کانال تلگرامی خودش (`t.me/s/takhfifhot`) جمع می‌شود.
> - myclub.snapp.ir/vendors: پیشنهادهایش پشت لاگین اسنپ است. آفرهای اسنپ‌کلاب فقط وقتی دیده می‌شوند که منابع دیگر منتشرشان کنند.
> - takhfifan.com و offaro.com: به درخواست سرور پاسخ خالی می‌دهند (محتوا با جاوااسکریپت ساخته می‌شود یا دسترسی بسته است)، پس فعلاً پوشش مستقیم ندارند.

## 🗂 ساختار ریپو

```
src/lib/text.js          نرمال‌سازی فارسی، تاریخ شمسی، مبلغ/درصد، تشخیص کد
src/lib/catalog.js       برندها، سرویس‌ها، دسته‌ها و نام‌های مستعار (+ تشخیص برند/سرویس)
src/crawler/sources.js   برنامه‌ی خزش و پارسر هر منبع
src/crawler/merge.js     نرمال‌سازی، ادغام، امتیازدهی، چرخه‌ی عمر ردیف‌ها، آمار
src/crawler/pipeline.js  چانک‌بندی، برنامه‌ریزی reveal و تازه‌سازی دوره‌ای
src/bot/bot.js           مسیریابی آپدیت‌ها، منوها، کارت کوپن‌ها، اعلان‌ها
src/bot/logos.js         لوگوهای متحرک برندها (پک اموجی کاستوم) برای پیام‌ها و دکمه‌ها
src/bot/emoji.js         بقیه‌ی اموجی‌ها به نسخه‌ی متحرک (پک RestrictedEmoji)، در متن پیام‌ها و روی دکمه‌ها
src/main/*-engine.js     دیسپچر هر Code node
workflows/*.template.js  ورک‌فلوهای n8n (Workflow SDK) با placeholder
scripts/build.mjs        بیلد باندل‌ها (خوانا + مینیفای) و ورک‌فلوها
config.example.json      نمونه‌ی تنظیمات سرور (آدرس n8n، شناسه‌ی جدول‌ها و ورک‌فلوها)
test/engine.test.js      تست باندل‌ها دقیقاً مثل اجرا در n8n (خوانا و مینیفای)
```

## 🛠 توسعه

```bash
npm install
npm test                 # بیلد + تست هر دو نسخه‌ی خوانا و مینیفای
```

- **دیپلوی موتور**: محتوای `dist/crawler-engine.min.js`، `dist/merge-engine.min.js` و `dist/bot-engine.min.js` را در Code nodeهای هم‌نام در ورک‌فلوی Engine بگذارید. نسخه‌ی خوانا (`*.code.js`) هم عیناً کار می‌کند.
- **بررسی دیپلوی**: ساب‌ورک‌فلوی Engine را با `{ "op": "version" }` اجرا کنید. طول و هش کد ذخیره‌شده‌ی هر نود برمی‌گردد.
- **ساخت ورک‌فلوها برای سرور خودتان**:
  1. `config.example.json` را به `config.json` کپی کنید و آدرس n8n و شناسه‌ی جدول‌ها و ورک‌فلوی Engine را در آن بنویسید. `REQUIRED_CHANNEL` کانالی است که عضویتش شرط استفاده است (مثل `@GozarNetPro`)؛ خالی یعنی بدون شرط. این فایل در git نادیده گرفته می‌شود.
  2. ورک‌فلوهای کامل را با توکن در `build/` بسازید؛ این پوشه هم در git نادیده گرفته می‌شود:

  ```bash
  TELEGRAM_BOT_TOKEN=... WEBHOOK_SECRET=... node scripts/build.mjs --deploy
  ```

- **تنظیمات ورک‌فلوها در n8n**: Engine و Bot و Crawler فقط اجراهای ناموفق را ذخیره می‌کنند (`saveDataSuccessExecution: none`). آمار هر خزش در ردیف `last_run` جدول `takhfif_meta` ثبت می‌شود.

- **افزودن برند یا منبع**:
  - برند: یک ورودی در `BRANDS` در `src/lib/catalog.js`.
  - لوگوی متحرک: شناسه‌ی اموجی (`custom_emoji_id`، از متد `getStickerSet`) و اموجی خود استیکر در `CUSTOM_EMOJI` در `src/bot/logos.js`.
  - اموجی تازه در متن‌ها یا کاتالوگ: معادل متحرکش در `ANIMATED_EMOJI` در `src/bot/emoji.js`. اگر جا بیفتد، تست «every emoji the bot shows is animated» خطا می‌دهد.
  - منبع: یک پارسر در `PARSERS` و چند job در `buildPlan` در `src/crawler/sources.js`، به‌علاوه‌ی یک fixture تست.

> 🔐 توکن ربات و secret وب‌هوک فقط داخل نودهای n8n هستند. در `dist/` به‌جایشان `__TELEGRAM_BOT_TOKEN__` و `__WEBHOOK_SECRET__` آمده است. آدرس سرور و شناسه‌ها هم از `config.example.json` می‌آیند، نه از سرور واقعی.

## 🇬🇧 English summary

**Takhfif Finder** is a Telegram bot ([@takhfif_finder_bot](https://t.me/takhfif_finder_bot)) that collects active discount codes for Iranian services and online shops (Snapp, Tapsi, Digikala and 120+ more brands) and serves them through clean Persian menus.

- **Crawler:** every 2 hours it fetches 9 coupon sites and 9 public Telegram channels, reveals codes hidden behind "show code" buttons, merges the same code found on several sources, scores it, and re-checks known codes about twice a day so expired ones drop out. Requests are throttled, and single-use codes are never consumed.
- **Bot:** brand and service menus (Snapp Food, Tapsi Garage, Digikala Jet, …) with animated brand logos and animated emoji from our own custom emoji packs, Persian search, one-tap copy buttons, and alerts when a followed brand gets a new code. Optionally, users must join a channel first.
- **Runs on [n8n](https://n8n.io):** four workflows (Engine, Crawler, Telegram Bot, Setup) and three n8n Data Tables. The logic lives in this repo as plain JavaScript (`src/`). It is bundled into n8n Code nodes, and the tests run the exact bundles that get deployed.

```bash
npm install
npm test   # builds dist/ and tests both the readable and the minified bundles
```

Deployment notes, the source list and the repo layout are in the Persian sections above. Bot token, webhook secret and instance ids are never committed (see `config.example.json`).

Licensed under the [MIT License](LICENSE).
