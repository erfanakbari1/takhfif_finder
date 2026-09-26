// Animated brand logos for the bot, from our custom emoji pack: https://t.me/addemoji/IranianBrandsAnimated
// Depends on catalog.js. Telegram shows a custom emoji sent by a bot only if the bot owner has Telegram Premium
// (Bot API 9.4); everywhere else (notifications, forwards, older apps) the plain emoji is shown instead.

// 'brand' or 'brand:service' -> [custom_emoji_id, the sticker's own emoji].
const CUSTOM_EMOJI = {
  snapp: ['5024117283887253544', '🚕'],
  'snapp:ride': ['5024117283887253544', '🚕'],
  'snapp:food': ['5026569873422026474', '🍔'],
  'snapp:market': ['5024196276925762119', '🛒'],
  'snapp:shop': ['5024260469506967822', '🛍'],
  'snapp:pay': ['5026576363117611069', '💸'],
  'snapp:doctor': ['5024096345921686715', '💊'],
  'snapp:trip': ['5024134661324933364', '✈️'],
  tapsi: ['5024281901393776065', '🚖'],
  'tapsi:ride': ['5024281901393776065', '🚖'],
  'tapsi:food': ['5024104394690398933', '🍕'],
  'tapsi:market': ['5026329909304232649', '🧃'],
  'tapsi:shop': ['5026507819734533865', '🛍'],
  'tapsi:doctor': ['5023886111567513539', '🩺'],
  'tapsi:garage': ['5024098875657423052', '🔧'],
  digikala: ['5026037649664641195', '🛍'],
  'digikala:main': ['5026037649664641195', '🛍'],
  'digikala:jet': ['5024061221679139160', '🥦'],
  'digikala:style': ['5024028730251544497', '👕'],
  'digikala:pay': ['5026145758286448381', '💳'],
  'digikala:plus': ['5023831355029457545', '🎁'],
  digistyle: ['5024028730251544497', '👕'],
  khanoumi: ['5023895156768638987', '💄'],
  okala: ['5026150504225310555', '🛒'],
  azki: ['5023867548718860301', '🛡️'],
  basalam: ['5026575216361342706', '🧺'],
  irancell: ['5026085199247574773', '📱'],
  technolife: ['5024052206542785765', '💻'],
  banimode: ['5026166554518096270', '👗'],
  filimo: ['5023906499777268022', '🎬'],
  namava: ['5026191177565604155', '📺'],
  iranicard: ['5026384081726736319', '💳'],
};

function customEmoji(brand, service) {
  return CUSTOM_EMOJI[service ? brand + ':' + service : brand] || null;
}

// A logo is { e: emoji, id: custom emoji id } when the pack has one, else { e: catalog emoji }.
function logoOf(brand, service, emoji) {
  const c = customEmoji(brand, service);
  return c ? { e: c[1], id: c[0] } : { e: emoji };
}
const brandLogo = (b) => logoOf(b.id, '', b.emoji);
const svcLogo = (brandId, s) => logoOf(brandId, s.id, s.emoji);

// A coupon in a mixed list: its service's logo, else its brand's.
function rowLogo(r) {
  if (r.service && customEmoji(r.brand, r.service)) return logoOf(r.brand, r.service, '');
  const b = brandById(r.brand);
  const cat = CATEGORIES.find((c) => c.id === r.category) || CATEGORIES[CATEGORIES.length - 1];
  return logoOf(r.brand, '', b ? b.emoji : cat.emoji);
}

// In message text (HTML) the emoji inside <tg-emoji> is the fallback.
function logoHtml(l) {
  return l.id ? '<tg-emoji emoji-id="' + l.id + '">' + l.e + '</tg-emoji>' : l.e;
}

// On buttons Telegram draws icon_custom_emoji_id before the text, so the text then carries no emoji.
function logoButton(l, text, fields) {
  return Object.assign(l.id ? { text, icon_custom_emoji_id: l.id } : { text: l.e + ' ' + text }, fields);
}

// @export-start
if (typeof module !== 'undefined') {
  module.exports = { CUSTOM_EMOJI, customEmoji, logoOf, rowLogo, logoHtml, logoButton };
}
// @export-end
