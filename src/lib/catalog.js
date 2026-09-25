// Brand / service taxonomy and the coupon classifier.
// Depends on text.js (normFa, compact).
//
// `aliases` identify a brand or service by name (source brand names, slugs, hashtags, titles).
// `kw` are weaker context words, only used once the brand is known.

const CATEGORIES = [
  { id: 'super', fa: 'سوپراپ\u200cها', emoji: '⭐\ufe0f' },
  { id: 'food', fa: 'غذا و سوپرمارکت', emoji: '🍔' },
  { id: 'shop', fa: 'فروشگاه اینترنتی', emoji: '🛍' },
  { id: 'fashion', fa: 'مد، پوشاک و زیبایی', emoji: '👗' },
  { id: 'travel', fa: 'سفر و اقامت', emoji: '✈\ufe0f' },
  { id: 'transport', fa: 'تاکسی، پیک و حمل\u200cونقل', emoji: '🚕' },
  { id: 'media', fa: 'فیلم، موسیقی و سرگرمی', emoji: '🎬' },
  { id: 'edu', fa: 'کتاب و آموزش', emoji: '📚' },
  { id: 'finance', fa: 'بانک، طلا و مالی', emoji: '💳' },
  { id: 'insurance', fa: 'بیمه', emoji: '🛡' },
  { id: 'telecom', fa: 'اینترنت و اپراتور', emoji: '📶' },
  { id: 'health', fa: 'سلامت و پزشکی', emoji: '🩺' },
  { id: 'services', fa: 'خدمات آنلاین و خودرو', emoji: '🧰' },
  { id: 'other', fa: 'سایر', emoji: '🗂' },
];

const BRANDS = [
  {
    id: 'snapp', fa: 'اسنپ', emoji: '🚖', cat: 'super', featured: 1, defaultService: 'ride',
    aliases: ['اسنپ', 'snapp', 'snapp.ir', 'snapp.taxi', 'snap'],
    services: [
      { id: 'ride', fa: 'اسنپ مسافر (تاکسی)', emoji: '🚕', aliases: ['اسنپ مسافر', 'اسنپ تاکسی', 'تاکسی اسنپ', 'snapp.taxi', 'اسنپ بایک', 'بایک پلاس', 'snappbike', 'اکوپلاس', 'اکو پلاس', 'اسنپ پرو', 'snapppro', 'اسنپ رز'], kw: ['سفر', 'تاکسی', 'درون شهری', 'بین شهری', 'فرودگاه', 'مسافر', 'اشتراکی', 'راننده', 'بایک', 'موتور'] },
      { id: 'food', fa: 'اسنپ\u200cفود', emoji: '🍔', aliases: ['اسنپ فود', 'snappfood', 'snapp-food', 'snapp food', 'فودرو', 'foodro', 'فود پارتی', 'فودپارتی'], kw: ['غذا', 'رستوران', 'فست فود', 'شیرینی', 'کافه', 'نانوایی', 'آبمیوه', 'بستنی', 'پیتزا', 'کباب', 'پت شاپ', 'قصابی', 'میوه'] },
      { id: 'market', fa: 'اسنپ\u200cمارکت', emoji: '🛒', aliases: ['اسنپ مارکت', 'snappmarket', 'snapp-market', 'سوپرمارکت اسنپ', 'اسنپ سوپرمارکت', 'سوپر مارکت اسنپ'], kw: ['سوپرمارکت', 'سوپر مارکت', 'لبنیات', 'خواربار', 'مارکت'] },
      { id: 'shop', fa: 'اسنپ\u200cشاپ', emoji: '🛍', aliases: ['اسنپ شاپ', 'snappshop', 'snapp-shop'], kw: ['موبایل', 'پوشاک', 'لوازم خانگی', 'آرایشی'] },
      { id: 'pay', fa: 'اسنپ\u200cپی', emoji: '💳', aliases: ['اسنپ پی', 'snapppay', 'snapp-pay', 'snapp pay'], kw: ['اقساطی', 'قسطی', 'درگاه', 'اعتباری'] },
      { id: 'doctor', fa: 'اسنپ\u200cدکتر و دارو', emoji: '🩺', aliases: ['اسنپ دکتر', 'snappdoctor', 'snapp-doctor', 'اسنپ دارو', 'داروخانه اسنپ'], kw: ['پزشک', 'دکتر', 'مشاوره پزشکی', 'دارو', 'روانشناس', 'ویزیت'] },
      { id: 'trip', fa: 'اسنپ\u200cتریپ', emoji: '✈\ufe0f', aliases: ['اسنپ تریپ', 'snapptrip', 'snapp-trip'], kw: ['هتل', 'بلیط', 'بلیت', 'پرواز', 'هواپیما', 'قطار', 'اتوبوس', 'تور'] },
      { id: 'room', fa: 'اسنپ\u200cروم (ویلا و اقامتگاه)', emoji: '🏡', aliases: ['اسنپ روم', 'snapproom', 'snapp-room'], kw: ['ویلا', 'اقامتگاه', 'سوئیت'] },
      { id: 'box', fa: 'اسنپ\u200cباکس و پیک/وانت', emoji: '📦', aliases: ['اسنپ باکس', 'snappbox', 'snapp-box', 'پیک اسنپ', 'اسنپ پیک', 'اسنپ وانت', 'وانت اسنپ', 'اسباب کشی اسنپ', 'اسنپ بار'], kw: ['پیک', 'وانت', 'اسباب کشی', 'باربری', 'کامیون', 'جابه جایی بار', 'مرسوله'] },
      { id: 'express', fa: 'اسنپ\u200cاکسپرس', emoji: '⚡\ufe0f', aliases: ['اسنپ اکسپرس', 'snappexpress', 'snapp-express'], kw: [] },
      { id: 'bime', fa: 'اسنپ\u200cبیمه', emoji: '🛡', aliases: ['اسنپ بیمه', 'snappbimeh', 'snapp-bimeh', 'snappbime'], kw: ['بیمه'] },
      { id: 'carfix', fa: 'اسنپ\u200cکارفیکس', emoji: '🔧', aliases: ['اسنپ کارفیکس', 'کارفیکس', 'snappcarfix', 'carfix'], kw: ['تعویض روغن', 'کارواش', 'تعمیر خودرو'] },
      { id: 'club', fa: 'اسنپ\u200cکلاب', emoji: '🎁', aliases: ['اسنپ کلاب', 'snappclub', 'snapp club', 'myclub.snapp'], kw: ['امتیاز'] },
    ],
  },
  {
    id: 'tapsi', fa: 'تپسی', emoji: '🚕', cat: 'super', featured: 2, defaultService: 'ride',
    aliases: ['تپسی', 'tapsi', 'tap30', 'tapsi.ir'],
    services: [
      { id: 'ride', fa: 'تپسی مسافر (تاکسی)', emoji: '🚖', aliases: ['تپسی مسافر', 'تپسی تاکسی', 'تپسی لاین', 'تپسی موتور', 'تپسی بین شهری'], kw: ['سفر', 'تاکسی', 'بین شهری', 'درون شهری', 'فرودگاه', 'راننده', 'موتور'] },
      { id: 'food', fa: 'تپسی\u200cفود', emoji: '🍕', aliases: ['تپسی فود', 'tapsifood', 'tapsi-food', 'tapsi food', 'تپ تایم'], kw: ['غذا', 'رستوران', 'پیک آف'] },
      { id: 'market', fa: 'تپسی\u200cمارکت', emoji: '🛒', aliases: ['تپسی مارکت', 'tapsimarket', 'tapsi-market'], kw: ['سوپرمارکت', 'سوپر مارکت'] },
      { id: 'shop', fa: 'تپسی\u200cشاپ', emoji: '🛍', aliases: ['تپسی شاپ', 'tapsishop', 'tapsi-shop'], kw: ['اقساطی', 'قسطی'] },
      { id: 'doctor', fa: 'تپسی\u200cدکتر', emoji: '🩺', aliases: ['تپسی دکتر', 'tapsidoctor', 'tapsi-doctor'], kw: ['پزشک', 'دکتر', 'مشاوره', 'روانشناس'] },
      { id: 'garage', fa: 'تپسی\u200cگاراژ', emoji: '🔧', aliases: ['تپسی گاراژ', 'tapsigarage', 'tapsi-garage'], kw: ['کارواش', 'لاستیک', 'باتری', 'تعویض روغن', 'خودرو'] },
      { id: 'pack', fa: 'تپسی\u200cپک و باکس (پیک)', emoji: '📦', aliases: ['تپسی باکس', 'تپسی پک', 'پیک تپسی', 'tapsipack', 'tapsi pack', 'tapsibox'], kw: ['پیک', 'مرسوله', 'مراکز پستی', 'ارسال بسته'] },
    ],
  },
  {
    id: 'digikala', fa: 'دیجی\u200cکالا', emoji: '🛒', cat: 'super', featured: 3, defaultService: 'main',
    aliases: ['دیجی کالا', 'دیجیکالا', 'digikala', 'dk'],
    services: [
      { id: 'main', fa: 'دیجی\u200cکالا (فروشگاه)', emoji: '🛒', aliases: [], kw: [] },
      { id: 'jet', fa: 'دیجی\u200cکالا جت و سوپرمارکت', emoji: '⚡\ufe0f', aliases: ['دیجی کالا جت', 'دیجیکالا جت', 'digikalajet', 'دیجی جت', 'سوپرمارکت فوری', 'سوپرمارکت دیجی کالا'], kw: ['سوپرمارکت', 'فوری'] },
      { id: 'style', fa: 'دیجی\u200cاستایل', emoji: '👗', aliases: ['دیجی استایل', 'digistyle', 'digi-style'], kw: [] },
      { id: 'pay', fa: 'دیجی\u200cپی', emoji: '💳', aliases: ['دیجی پی', 'digipay', 'mydigipay'], kw: ['اقساطی', 'اعتباری', 'قسطی'] },
      { id: 'plus', fa: 'دیجی\u200cپلاس', emoji: '⭐\ufe0f', aliases: ['دیجی پلاس', 'digiplus', 'دیجی کالا پلاس'], kw: [] },
      { id: 'club', fa: 'دیجی\u200cکلاب و دیجی\u200cکوین', emoji: '🎁', aliases: ['دیجی کلاب', 'digiclub', 'دیجی کوین', 'digicoin'], kw: ['ماموریت', 'کوین'] },
      { id: 'gold', fa: 'طلا و نقره دیجیتال', emoji: '🪙', aliases: ['طلای دیجیتال دیجی کالا'], kw: ['طلا', 'نقره', 'سکه', 'شمش'] },
    ],
  },
  // Popular single-service brands. `slugs` are the ids used by the sources (offch/offerdaily/boodgeh/...).
  { id: 'alibaba', fa: 'علی\u200cبابا', emoji: '✈\ufe0f', cat: 'travel', featured: 4, aliases: ['علی بابا', 'علیبابا', 'alibaba'] },
  { id: 'filimo', fa: 'فیلیمو', emoji: '🎬', cat: 'media', featured: 5, aliases: ['فیلیمو', 'filimo'] },
  { id: 'basalam', fa: 'باسلام', emoji: '🧺', cat: 'shop', featured: 6, aliases: ['باسلام', 'با سلام', 'basalam'] },
  { id: 'technolife', fa: 'تکنولایف', emoji: '📱', cat: 'shop', featured: 7, aliases: ['تکنولایف', 'technolife'] },
  { id: 'okala', fa: 'اکالا', emoji: '🥫', cat: 'food', featured: 8, aliases: ['اکالا', 'okala'] },
  { id: 'khanoumi', fa: 'خانومی', emoji: '💄', cat: 'fashion', featured: 9, aliases: ['خانومی', 'khanoumi', 'khanoomi'] },
  { id: 'alopeyk', fa: 'الوپیک', emoji: '🛵', cat: 'transport', featured: 10, aliases: ['الوپیک', 'الو پیک', 'alopeyk', 'الوتاکسی'] },
  { id: 'jabama', fa: 'جاباما', emoji: '🏡', cat: 'travel', featured: 11, aliases: ['جاباما', 'جا با ما', 'jabama'] },
  { id: 'namava', fa: 'نماوا', emoji: '🍿', cat: 'media', featured: 12, aliases: ['نماوا', 'namava'] },
  { id: 'taaghche', fa: 'طاقچه', emoji: '📖', cat: 'edu', aliases: ['=طاقچه', 'taaghche', 'اپلیکیشن طاقچه'] },
  { id: 'fidibo', fa: 'فیدیبو', emoji: '📚', cat: 'edu', aliases: ['فیدیبو', 'fidibo'] },
  { id: 'filmnet', fa: 'فیلم\u200cنت', emoji: '🎞', cat: 'media', aliases: ['فیلم نت', 'فیلمنت', 'filmnet'] },
  { id: 'filimoschool', fa: 'فیلیمو مدرسه', emoji: '🏫', cat: 'edu', aliases: ['فیلیمو مدرسه', 'filimoschool', 'filimomadreseh'] },
  { id: 'cinematicket', fa: 'سینماتیکت', emoji: '🎟', cat: 'media', aliases: ['سینماتیکت', 'سینما تیکت', 'cinematicket'] },
  { id: 'digistyle', fa: 'دیجی\u200cاستایل', emoji: '👗', cat: 'fashion', alias_of: ['digikala', 'style'], aliases: [] },
  { id: 'banimode', fa: 'بانی\u200cمد', emoji: '👠', cat: 'fashion', aliases: ['بانی مد', 'بانیمد', 'banimode'] },
  { id: 'modiseh', fa: 'مدیسه', emoji: '👚', cat: 'fashion', aliases: ['مدیسه', 'modiseh'] },
  { id: 'janebi', fa: 'جانبی', emoji: '🎧', cat: 'shop', aliases: ['=جانبی', 'janebi', 'فروشگاه جانبی'] },
  { id: 'torob', fa: 'ترب', emoji: '🔎', cat: 'shop', aliases: ['=ترب', 'torob'] },
  { id: 'divar', fa: 'دیوار', emoji: '🧱', cat: 'services', aliases: ['=دیوار', 'divar'] },
  { id: 'shab', fa: 'شب', emoji: '🌙', cat: 'travel', aliases: ['اقامتگاه شب', 'shab'] },
  { id: 'jajiga', fa: 'جاجیگا', emoji: '🏕', cat: 'travel', aliases: ['جاجیگا', 'jajiga'] },
  { id: 'flightio', fa: 'فلایتیو', emoji: '🛫', cat: 'travel', aliases: ['فلایتیو', 'flightio'] },
  { id: 'flytoday', fa: 'فلای\u200cتودی', emoji: '🛬', cat: 'travel', aliases: ['فلای تودی', 'فلایتودی', 'flytoday'] },
  { id: 'ghasedak24', fa: 'قاصدک ۲۴', emoji: '🚌', cat: 'travel', aliases: ['قاصدک 24', 'قاصدک۲۴', 'ghasedak24'] },
  { id: 'mrbilit', fa: 'مستربلیط', emoji: '🎫', cat: 'travel', aliases: ['مستر بلیط', 'مستربلیط', 'mrbilit', 'mrblit'] },
  { id: 'iranhotel', fa: 'ایران هتل آنلاین', emoji: '🏨', cat: 'travel', aliases: ['ایران هتل', 'iranhotelonline'] },
  { id: 'eghamat24', fa: 'اقامت ۲۴', emoji: '🏨', cat: 'travel', aliases: ['اقامت 24', 'اقامت۲۴', 'eghamat24', 'eghamate24'] },
  { id: 'otaghak', fa: 'اتاقک', emoji: '🛏', cat: 'travel', aliases: ['=اتاقک', 'otaghak'] },
  { id: 'maxim', fa: 'ماکسیم', emoji: '🚗', cat: 'transport', aliases: ['ماکسیم', 'maxim'] },
  { id: 'carpino', fa: 'کارپینو', emoji: '🚘', cat: 'transport', aliases: ['کارپینو', 'carpino'] },
  { id: 'irancell', fa: 'ایرانسل', emoji: '📶', cat: 'telecom', aliases: ['ایرانسل', 'irancell'] },
  { id: 'mci', fa: 'همراه اول', emoji: '📱', cat: 'telecom', aliases: ['همراه اول', 'hamrahaval', 'hamraheaval', 'mci'] },
  { id: 'rightel', fa: 'رایتل', emoji: '📡', cat: 'telecom', aliases: ['رایتل', 'rightel'] },
  { id: 'shatel', fa: 'شاتل', emoji: '🌐', cat: 'telecom', aliases: ['شاتل', 'shatel'] },
  { id: 'blubank', fa: 'بلوبانک', emoji: '🏦', cat: 'finance', aliases: ['بلوبانک', 'بلو بانک', 'blubank', 'blu bank'] },
  { id: 'melligold', fa: 'ملی\u200cگلد', emoji: '🪙', cat: 'finance', aliases: ['ملی گلد', 'melligold'] },
  { id: 'milli', fa: 'میلی', emoji: '🥇', cat: 'finance', aliases: ['=میلی', 'milli', 'میلی گلد'] },
  { id: 'miogold', fa: 'میوگلد', emoji: '💍', cat: 'finance', aliases: ['میوگلد', 'میو گلد', 'mioshop', 'miogold'] },
  { id: 'tabdeal', fa: 'تبدیل', emoji: '💱', cat: 'finance', aliases: ['صرافی تبدیل', 'tabdeal'] },
  { id: 'nobitex', fa: 'نوبیتکس', emoji: '💹', cat: 'finance', aliases: ['نوبیتکس', 'nobitex'] },
  { id: 'wallex', fa: 'والکس', emoji: '💹', cat: 'finance', aliases: ['والکس', 'wallex'] },
  { id: 'azki', fa: 'ازکی', emoji: '🛡', cat: 'insurance', aliases: ['ازکی', 'azki'] },
  { id: 'azkiservice', fa: 'ازکی سرویس', emoji: '🔩', cat: 'services', aliases: ['ازکی سرویس', 'azkiservice'] },
  { id: 'azkivam', fa: 'ازکی وام', emoji: '💰', cat: 'finance', aliases: ['ازکی وام', 'azkivam'] },
  { id: 'bimebazar', fa: 'بیمه\u200cبازار', emoji: '🛡', cat: 'insurance', aliases: ['بیمه بازار', 'bimebazar', 'bime-bazar'] },
  { id: 'bimito', fa: 'بیمیتو', emoji: '🛡', cat: 'insurance', aliases: ['بیمیتو', 'bimito'] },
  { id: 'asanbime', fa: 'آسان بیمه', emoji: '🛡', cat: 'insurance', aliases: ['آسان بیمه', 'asanbime'] },
  { id: 'bimehcom', fa: 'بیمه دات کام', emoji: '🛡', cat: 'insurance', aliases: ['بیمه دات کام', 'bimeh.com'] },
  { id: 'drkermani', fa: 'دکتر کرمانی', emoji: '🥗', cat: 'health', aliases: ['دکتر کرمانی', '=کرمانی', 'drkermani', 'kermany', 'kermani'] },
  { id: 'paziresh24', fa: 'پذیرش ۲۴', emoji: '🏥', cat: 'health', aliases: ['پذیرش 24', 'paziresh24'] },
  { id: 'darukade', fa: 'داروکده', emoji: '💊', cat: 'health', aliases: ['داروکده', 'darukade'] },
  { id: 'appetit', fa: 'اپتیت', emoji: '🥑', cat: 'health', aliases: ['اپتیت', 'appetit'] },
  { id: 'fitamin', fa: 'فیتامین', emoji: '💪', cat: 'health', aliases: ['فیتامین', 'fitamin'] },
  { id: 'achareh', fa: 'آچاره', emoji: '🧰', cat: 'services', aliases: ['آچاره', 'achareh', 'achare'] },
  { id: 'cafebazaar', fa: 'کافه\u200cبازار', emoji: '🎮', cat: 'services', aliases: ['کافه بازار', 'کافهبازار', 'cafebazaar'] },
  { id: 'myket', fa: 'مایکت', emoji: '📲', cat: 'services', aliases: ['مایکت', 'myket'] },
  { id: 'maktabkhooneh', fa: 'مکتب\u200cخونه', emoji: '🎓', cat: 'edu', aliases: ['مکتب خونه', 'مکتبخونه', 'maktabkhooneh'] },
  { id: 'faradars', fa: 'فرادرس', emoji: '🎓', cat: 'edu', aliases: ['فرادرس', 'faradars'] },
  { id: 'inoschool', fa: 'آی\u200cنو', emoji: '🏫', cat: 'edu', aliases: ['آی نو', 'ino-school', 'inoschool'] },
  { id: 'iranketab', fa: 'ایران\u200cکتاب', emoji: '📕', cat: 'edu', aliases: ['ایران کتاب', 'iranketab'] },
  { id: 'rojashop', fa: 'روژا', emoji: '💅', cat: 'fashion', aliases: ['روژا', 'rojashop', 'roja'] },
  { id: 'iranicard', fa: 'ایرانیکارت', emoji: '💳', cat: 'finance', aliases: ['ایرانیکارت', 'ایرانی کارت', 'iranicard'] },
  { id: 'delino', fa: 'دلینو', emoji: '🥘', cat: 'food', aliases: ['دلینو', 'delino'] },
  { id: 'reyhoon', fa: 'ریحون', emoji: '🌿', cat: 'food', aliases: ['=ریحون', 'reyhoon'] },
  { id: 'chilivery', fa: 'چیلیوری', emoji: '🌶', cat: 'food', aliases: ['چیلیوری', 'chilivery'] },
  { id: 'hyperstar', fa: 'هایپراستار', emoji: '🛒', cat: 'food', aliases: ['هایپر استار', 'هایپراستار', 'hyperstar'] },
  { id: 'esam', fa: 'ای\u200cسام', emoji: '🏷', cat: 'shop', aliases: ['ایسام', 'ای سام', 'esam'] },
  { id: 'sheypoor', fa: 'شیپور', emoji: '📣', cat: 'services', aliases: ['=شیپور', 'sheypoor'] },
  { id: 'aparat', fa: 'آپارات', emoji: '📺', cat: 'media', aliases: ['آپارات', 'aparat'] },
  { id: 'telewebion', fa: 'تلوبیون', emoji: '📺', cat: 'media', aliases: ['تلوبیون', 'telewebion'] },
  { id: 'tiwall', fa: 'تیوال', emoji: '🎭', cat: 'media', aliases: ['تیوال', 'tiwall'] },
  { id: 'navaar', fa: 'نوار', emoji: '🎧', cat: 'media', aliases: ['=نوار', 'navaar'] },
  // Shops that showed up as unknown brands in the first crawls.
  { id: 'bitpin', fa: 'بیت\u200cپین', emoji: '🪙', cat: 'finance', aliases: ['بیت پین', 'بیتپین', 'bitpin'] },
  { id: 'tetherland', fa: 'تترلند', emoji: '💱', cat: 'finance', aliases: ['تترلند', 'tetherland'] },
  { id: 'tlyn', fa: 'طلاین', emoji: '🥇', cat: 'finance', aliases: ['طلاین', 'tlyn'] },
  { id: 'zarpin', fa: 'زرپین', emoji: '🥇', cat: 'finance', aliases: ['زرپین', 'zarpin'] },
  { id: 'khodro45', fa: 'خودرو۴۵', emoji: '🚙', cat: 'services', aliases: ['خودرو45', 'خودرو 45', 'khodro45'] },
  { id: 'mobile140', fa: 'موبایل ۱۴۰', emoji: '📱', cat: 'shop', aliases: ['موبایل 140', 'موبایل140', 'mobile140'] },
  { id: 'positron', fa: 'پوزیترون', emoji: '🔌', cat: 'shop', aliases: ['پوزیترون', 'positronshop', 'positron'] },
  { id: 'sazkala', fa: 'سازکالا', emoji: '🎸', cat: 'shop', aliases: ['ساز کالا', 'سازکالا', 'sazkala'] },
  { id: 'hermooder', fa: 'هرمودر', emoji: '👜', cat: 'fashion', aliases: ['هرمودر', 'hermooder'] },
  { id: 'padmira', fa: 'پادمیرا', emoji: '👟', cat: 'fashion', aliases: ['پادمیرا', 'padmira'] },
  { id: 'daneshjooyar', fa: 'دانشجویار', emoji: '🎓', cat: 'edu', aliases: ['دانشجویار', 'daneshjooyar'] },
  { id: 'funglish', fa: 'فانگلیش', emoji: '🗣', cat: 'edu', aliases: ['فانگلیش', 'funglish'] },
  { id: 'iranserver', fa: 'ایران سرور', emoji: '🖥', cat: 'telecom', aliases: ['ایران سرور', 'iranserver'] },
  { id: 'iranhost', fa: 'ایران هاست', emoji: '🖥', cat: 'telecom', aliases: ['ایران هاست', 'iranhost'] },
  { id: 'mihanwebhost', fa: 'میهن وب هاست', emoji: '🖥', cat: 'telecom', aliases: ['میهن وب هاست', 'mihanwebhost'] },
  { id: 'netafraz', fa: 'نت افراز', emoji: '🖥', cat: 'telecom', aliases: ['نت افراز', 'نتافراز', 'netafraz'] },
];

// Sources, best first (used to break ties when merging duplicates).
const SOURCE_RANK = ['offch', 'mopon', 'boodgeh', 'offerdaily', 'storecode', 'takhfife', 'tapsitakhfif', 'offerjo', 'iranicard', 'telegram'];
const SOURCE_FA = {
  offch: 'کانال تخفیف', mopon: 'موپن', boodgeh: 'بودجه', offerdaily: 'آفردیلی', storecode: 'استورکد', takhfife: 'تخفیفه',
  tapsitakhfif: 'تپسی تخفیف', offerjo: 'آفرجو', iranicard: 'ایرانیکارت', telegram: 'کانال\u200cهای تلگرام',
};

const SERVICE_BRANDS = BRANDS.filter((b) => b.services && b.services.length);

let _aliasIndex = null;
// Alias index: longest aliases first so "اسنپ فود" wins over "اسنپ".
function aliasIndex() {
  if (_aliasIndex) return _aliasIndex;
  const list = [];
  // "=name" aliases are common words ("جانبی", "میلی"): they only match when the whole text is that name.
  const add = (a, brand, service) => {
    const exact = a[0] === '=';
    const n = normFa(exact ? a.slice(1) : a).toLowerCase();
    const multi = /[\s\-_]/.test(n);
    list.push({ key: multi || exact ? compact(n) : n, multi, exact, brand, service });
  };
  for (const b of BRANDS) {
    if (b.alias_of) continue;
    for (const a of b.aliases || []) add(a, b.id, null);
    for (const s of b.services || []) for (const a of s.aliases || []) add(a, b.id, s.id);
  }
  for (const b of BRANDS) if (b.alias_of) { add(b.fa, b.alias_of[0], b.alias_of[1]); add(b.id, b.alias_of[0], b.alias_of[1]); }
  _aliasIndex = list.filter((x) => x.key.length >= 2).sort((a, b) => b.key.length - a.key.length);
  return _aliasIndex;
}

function brandById(id) {
  return BRANDS.find((b) => b.id === id) || null;
}

function serviceOf(brandId, serviceId) {
  const b = brandById(brandId);
  return b && b.services ? b.services.find((s) => s.id === serviceId) || null : null;
}

// Find the first (longest) alias in `text`. Multi-word aliases match anywhere in the compact form
// ("اسنپ فود" also matches "اسنپ\u200cفود"/"اسنپفود"); single-word aliases must be a whole token so that
// "دیوار" does not match "کاغذ دیواری".
// When several brands are mentioned, the earliest one is the subject ("کد تخفیف تپسی ... رایتل").
function matchAlias(text) {
  const c = compact(text);
  if (!c) return null;
  const tokens = new Set(normFa(text).toLowerCase().split(/[^a-z0-9\u0600-\u06FF.]+/).map((t) => t.replace(/^\.+|\.+$/g, '')).filter(Boolean));
  let best = null, bestPos = Infinity;
  for (const a of aliasIndex()) {
    if (!(a.exact ? c === a.key : a.multi ? c.includes(a.key) : tokens.has(a.key))) continue;
    const pos = c.indexOf(a.multi ? a.key : compact(a.key));
    if (pos < bestPos) { best = a; bestPos = pos; }
  }
  return best;
}

function hasKw(text, list) {
  const c = compact(text);
  return (list || []).some((k) => c.includes(compact(k)));
}

// Service within a known multi-service brand.
function pickService(brand, strong, weak) {
  if (!brand.services) return '';
  for (const s of brand.services) if (s.aliases.length && s.aliases.some((a) => compact(strong).includes(compact(a)))) return s.id;
  for (const s of brand.services) if (s.kw.length && hasKw(strong, s.kw)) return s.id;
  for (const s of brand.services) if (s.aliases.length && s.aliases.some((a) => compact(weak).includes(compact(a)))) return s.id;
  return brand.defaultService || brand.services[0].id;
}

function slugify(s) {
  const c = compact(s).replace(/[^a-z0-9\u0600-\u06FF]/g, '');
  return c.slice(0, 24) || 'x';
}

const CAT_HINTS = [
  ['food', ['غذا', 'رستوران', 'سوپرمارکت', 'food', 'supermarket', 'grocery']],
  ['transport', ['تاکسی', 'پیک', 'taxi', 'حمل']],
  ['travel', ['هتل', 'هواپیما', 'سفر', 'بلیط', 'گردشگری', 'tourism', 'travel', 'اقامت']],
  ['fashion', ['مد', 'لباس', 'پوشاک', 'آرایشی', 'زیبایی', 'fashion', 'cosmetic', 'beauty', 'زیورآلات']],
  ['media', ['سینما', 'فیلم', 'موسیقی', 'سریال', 'تئاتر', 'movie', 'سرگرمی']],
  ['edu', ['کتاب', 'آموزش', 'مدرسه', 'دانشگاه', 'book', 'education', 'زبان']],
  ['finance', ['بانک', 'مالی', 'سرمایه', 'طلا', 'ارز', 'کریپتو', 'finance', 'wallet']],
  ['insurance', ['بیمه', 'insurance']],
  ['telecom', ['اپراتور', 'اینترنت', 'سیم کارت', 'شارژ', 'operator', 'هاست', 'سرور']],
  ['health', ['سلامت', 'پزشک', 'دارو', 'رژیم', 'تناسب', 'مشاوره', 'health']],
  ['shop', ['فروشگاه', 'shop', 'store', 'کالا', 'دیجیتال']],
  ['services', ['خدمات', 'service', 'خودرو']],
];

function guessCategory(text) {
  const c = compact(text);
  for (const [id, words] of CAT_HINTS) if (words.some((w) => c.includes(compact(w)))) return id;
  return 'other';
}

// Classify a raw coupon: returns { brand, brandFa, service, category, known }.
// `srcBrand`: brand name as the source labels it (e.g. "اسنپ فود"); `srcSlug`: source slug (e.g. "snappfood").
function classify(raw) {
  const srcBrand = raw.srcBrand || '';
  const srcSlug = /^\s*\d+\s*$/.test(raw.srcSlug || '') ? '' : raw.srcSlug || ''; // numeric ids are not names
  const title = raw.title || '';
  const desc = raw.desc || '';
  const strong = [srcBrand, srcSlug, title].join(' ');
  // Trust the brand the source gives us; only fall back to the title when the source gave none
  // (a title like "... با دیجی پی" names the payment method, not the shop).
  let hit = matchAlias(srcBrand) || matchAlias(srcSlug.replace(/[-_]/g, ' ')) || matchAlias(srcSlug);
  if (!hit && !srcBrand && !srcSlug) hit = matchAlias(title) || matchAlias(desc);
  // A generic source brand ("اسنپ") may hide a more specific service in the title ("... اسنپ فود").
  if (hit && !hit.service) {
    const t = matchAlias(title);
    if (t && t.brand === hit.brand && t.service) hit = t;
  }
  if (hit) {
    const b = brandById(hit.brand);
    const service = hit.service || pickService(b, strong, desc);
    return { brand: b.id, brandFa: b.fa, service, category: b.cat, known: true };
  }
  const name = normFa(srcBrand) || normFa(srcSlug) || 'سایر';
  return {
    brand: 'x_' + (srcSlug || srcBrand ? slugify(srcSlug || srcBrand) : 'other'), // one "سایر" bucket, not one per title
    brandFa: name,
    service: '',
    category: raw.catHint ? guessCategory(raw.catHint) : guessCategory([srcBrand, title, desc].join(' ')),
    known: false,
  };
}

// Resolve free text typed by a user ("کد تخفیف اسنپ فود", "digikala") to a brand/service.
function resolveQuery(q) {
  const hit = matchAlias(q);
  if (!hit) return null;
  const b = brandById(hit.brand);
  if (!hit.service && b.services) {
    const s = b.services.find((sv) => sv.kw.length && hasKw(q, sv.kw));
    return { brand: b.id, service: s ? s.id : null };
  }
  return { brand: b.id, service: hit.service };
}

// @export-start
if (typeof module !== 'undefined') {
  module.exports = { CATEGORIES, BRANDS, SERVICE_BRANDS, SOURCE_RANK, SOURCE_FA, brandById, serviceOf, matchAlias, classify, resolveQuery, guessCategory, slugify };
}
// @export-end
