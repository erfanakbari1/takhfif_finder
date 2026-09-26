// Every other emoji the bot shows, animated: the matching custom emoji from our second pack
// (https://t.me/addemoji/RestrictedEmoji). Brand logos (logos.js) are placed while building a view; this pass then
// turns each remaining plain emoji of a message into <tg-emoji> and a button's emoji into its icon_custom_emoji_id.
// Popups (answerCallbackQuery), the command menu and the bot description are plain text, so they keep plain emoji.

// Plain emoji (without U+FE0F) -> [custom_emoji_id, the sticker's own emoji].
const ANIMATED_EMOJI = {
  '⌛': ['5451646226975955576', '⌛\ufe0f'], '⌨': ['5472111548572900003', '⌨\ufe0f'], '⏰': ['5413704112220949842', '⏰'], '⏳': ['5451732530048802485', '⏳'],
  '⚡': ['5431449001532594346', '⚡\ufe0f'], '✅': ['5427009714745517609', '✅'], '✈': ['5361600266225326825', '✈\ufe0f'], '✔': ['5188216731453103384', '✔\ufe0f'],
  '❌': ['5465665476971471368', '❌'], '❓': ['5467666648263564704', '❓'], '⭐': ['5435957248314579621', '⭐\ufe0f'], '🆕': ['5361979468887893611', '🆕'],
  '🌍': ['5399898266265475100', '🌍'], '🌿': ['5449850741667668411', '🌿'], '🍔': ['5372998546788194447', '🍔'], '🍕': ['5370980663778351052', '🍕'],
  '🍿': ['5371081166013078244', '🍿'], '🎁': ['5199749070830197566', '🎁'], '🎉': ['5436040291507247633', '🎉'], '🎓': ['5375163339154399459', '🎓'],
  '🎟': ['5377599075237502153', '🎟'], '🎫': ['5418010521309815154', '🎫'], '🎬': ['5375464961822695044', '🎬'], '🎭': ['5359441070201513074', '🎭'],
  '🎮': ['5467583879948803288', '🎮'], '🎸': ['5465665777619204788', '🎸'], '🏕': ['5359636199155704118', '🏕'], '🏠': ['5465226866321268133', '🏠'],
  '🏥': ['5264827875588077689', '🏥'], '🏦': ['5264895611517300926', '🏦'], '🏨': ['5265159812135546996', '🏨'], '🏫': ['5265002646397285605', '🏫'],
  '👇': ['5470177992950946662', '👇'], '👈': ['5469735272017043817', '👈'], '👉': ['5471978009449731768', '👉'], '👋': ['5472055112702629499', '👋'],
  '👜': ['5380056101473492248', '👜'], '👠': ['5372917273122054051', '👠'], '💄': ['5425119671437237058', '💄'], '💅': ['5373334855612375386', '💅'],
  '💊': ['5433635625217563352', '💊'], '💍': ['5402100905883488232', '💍'], '💡': ['5472146462362048818', '💡'], '💪': ['5471883477219549006', '💪'],
  '💰': ['5375296873982604963', '💰'], '💱': ['5471899089425667918', '💱'], '📂': ['5431721976769027887', '📂'], '📊': ['5431577498364158238', '📊'],
  '📎': ['5377844313575150051', '📎'], '📖': ['5226512880362332956', '📖'], '📚': ['5373098009640836781', '📚'], '📝': ['5334882760735598374', '📝'],
  '📣': ['5469903029144657419', '📣'], '📱': ['5407025283456835913', '📱'], '📲': ['5406809207947142040', '📲'], '📺': ['5373330964372004748', '📺'],
  '🔎': ['5188311512791393083', '🔎'], '🔐': ['5472308992514464048', '🔐'], '🔑': ['5330115548900501467', '🔑'], '🔔': ['5242628160297641831', '🔔'],
  '🔕': ['5244807637157029775', '🔕'], '🔗': ['5375129357373165375', '🔗'], '🔥': ['5420315771991497307', '🔥'], '🗂': ['5431736674147114227', '🗂'],
  '🗣': ['5370765563226236970', '🗣'], '😕': ['5373272140499918095', '😕'], '🙏': ['5472189549473963781', '🙏'], '🚕': ['5445015510435502457', '🚕'],
  '🚗': ['5445085952194124000', '🚗'], '🛍': ['5373052667671093676', '🛍'], '🛒': ['5431499171045581032', '🛒'], '🛫': ['5267341200255363810', '🛫'],
  '🛬': ['5237795059369257857', '🛬'], '🤖': ['5372981976804366741', '🤖'], '🤫': ['5370930189322688800', '🤫'], '🥇': ['5280735858926822987', '🥇'],
  '🥗': ['5264946326491134516', '🥗'], '🥫': ['5471958978449644934', '🥫'], '🧠': ['5237799019329105246', '🧠'], '🧰': ['5449428597922079323', '🧰'],
  '🧱': ['5436275698664759373', '🧱'], '🩺': ['5359299744302639114', '🩺'], '🪙': ['5379600444098093058', '🪙'],
  // Not in the pack: the closest emoji it has.
  '🌐': ['5399898266265475100', '🌍'], '🌙': ['5465643984955120548', '🌛'], '🌶': ['5370940699107662298', '🌮'], '🎞': ['5375464961822695044', '🎬'],
  '🎧': ['5188705588925702510', '🎶'], '🏡': ['5433645645376264953', '🏖'], '🏷': ['5373052667671093676', '🛍'], '👗': ['5372917273122054051', '👠'],
  '👚': ['5472363448404809929', '👛'], '👟': ['5372917273122054051', '👠'], '💳': ['5264895611517300926', '🏦'], '💹': ['5373001317042101552', '📈'],
  '📕': ['5226512880362332956', '📖'], '📡': ['5321304062715517873', '🛰'], '📦': ['5350421256627838238', '📬'], '📶': ['5407025283456835913', '📱'],
  '🔌': ['5472146462362048818', '💡'], '🔧': ['5449428597922079323', '🧰'], '🔩': ['5449428597922079323', '🧰'], '🖥': ['5431376038628171216', '💻'],
  '🚌': ['5418010521309815154', '🎫'], '🚖': ['5445015510435502457', '🚕'], '🚘': ['5445015510435502457', '🚕'], '🚙': ['5445085952194124000', '🚗'],
  '🛏': ['5265159812135546996', '🏨'], '🛡': ['5426900601101374618', '🧿'], '🛵': ['5445284980978621387', '🚀'], '🥑': ['5264946326491134516', '🥗'],
  '🥘': ['5359678839591018693', '🍽'], '🧺': ['5373052667671093676', '🛍'],
};

// Telegram keeps at most 100 entities (bold, links, code, custom emoji…) per message and silently drops the rest.
const MAX_ENTITIES = 100;
const EMOJI_SRC = '\\p{Extended_Pictographic}(?:\\ufe0f|\\p{Emoji_Modifier})?(?:\\u200d\\p{Extended_Pictographic}(?:\\ufe0f|\\p{Emoji_Modifier})?)*';
const EMOJI_RE = new RegExp(EMOJI_SRC, 'gu');
const LEAD_RE = new RegExp('^(' + EMOJI_SRC + ')\\s*', 'u');
const TRAIL_RE = new RegExp('\\s*(' + EMOJI_SRC + ')$', 'u');
const ENTITY_TAG_RE = /^<(?:b|strong|i|em|u|ins|s|strike|del|code|pre|a|tg-emoji|tg-spoiler|span|blockquote)\b/i;

function animatedEmoji(e) {
  return ANIMATED_EMOJI[e.replace(/\ufe0f/g, '')] || null;
}

// HTML message text: wrap each known emoji in <tg-emoji>, except inside <code>, <pre>, links (Telegram drops custom
// emoji there) and existing <tg-emoji>; stop before the message would pass Telegram's entity limit.
function animateHtml(html) {
  const parts = String(html == null ? '' : html).split(/(<[^>]*>)/);
  let budget = MAX_ENTITIES - parts.filter((p, i) => i % 2 && ENTITY_TAG_RE.test(p)).length;
  let skip = 0;
  for (let i = 0; i < parts.length; i++) {
    if (i % 2) {
      const tag = /^<(\/?)(code|pre|a|tg-emoji)\b/i.exec(parts[i]);
      if (tag) skip += tag[1] ? -1 : 1;
      continue;
    }
    if (skip > 0 || !parts[i]) continue;
    parts[i] = parts[i].replace(EMOJI_RE, (e) => {
      const a = animatedEmoji(e);
      if (!a || budget <= 0) return e;
      budget--;
      return '<tg-emoji emoji-id="' + a[0] + '">' + a[1] + '</tg-emoji>';
    });
  }
  return parts.join('');
}

// Inline button: its leading (or trailing) emoji becomes the icon Telegram draws before the text.
function animateButton(b) {
  if (!b || b.icon_custom_emoji_id || typeof b.text !== 'string') return b;
  const m = LEAD_RE.exec(b.text) || TRAIL_RE.exec(b.text);
  const a = m && animatedEmoji(m[1]);
  const text = m ? (b.text.slice(0, m.index) + b.text.slice(m.index + m[0].length)).trim() : '';
  return a && text ? Object.assign({}, b, { text, icon_custom_emoji_id: a[0] }) : b;
}

// A Bot API call with its message text and buttons animated.
function animateCall(c) {
  const p = (c && c.payload) || {};
  if (p.parse_mode !== 'HTML') return c;
  const payload = Object.assign({}, p, { text: animateHtml(p.text) });
  const kb = p.reply_markup && p.reply_markup.inline_keyboard;
  if (kb) payload.reply_markup = Object.assign({}, p.reply_markup, { inline_keyboard: kb.map((row) => row.map(animateButton)) });
  return Object.assign({}, c, { payload });
}

// @export-start
if (typeof module !== 'undefined') {
  module.exports = { ANIMATED_EMOJI, animatedEmoji, animateHtml, animateButton, animateCall };
}
// @export-end
