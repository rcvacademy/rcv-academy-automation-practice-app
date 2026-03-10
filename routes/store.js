'use strict';

const express        = require('express');
const router         = express.Router();
const path           = require('path');
const rateLimit      = require('express-rate-limit');
const bcrypt         = require('bcryptjs');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10,
  message: 'Too many attempts. Please try again later.',
  standardHeaders: true, legacyHeaders: false
});

// ── In-Memory Stores ──────────────────────────────────────────────────────────
const storeUsers    = new Map(); // email → userObject
const storeSessions = new Map(); // sessionId → { email, createdAt }
const SESSION_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days (matches cookie maxAge)

// Sweep expired sessions every 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [sid, sess] of storeSessions) {
    if (now - sess.createdAt > SESSION_MAX_AGE) storeSessions.delete(sid);
  }
}, 30 * 60 * 1000);

// ── Promo codes ───────────────────────────────────────────────────────────────
const PROMO_CODES = {
  SAVE10: 0.10,
  RCV20:  0.20,
  TEST50: 0.50
};

// ── Allowed public email domains ──────────────────────────────────────────────
const ALLOWED_EMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com',
  'yahoo.com', 'yahoo.co.uk', 'yahoo.co.in', 'yahoo.ca',
  'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
  'aol.com',
  'icloud.com', 'me.com', 'mac.com',
  'protonmail.com', 'proton.me',
  'zoho.com', 'zohomail.com',
  'yandex.com', 'yandex.ru',
  'mail.com', 'email.com',
  'gmx.com', 'gmx.net',
  'fastmail.com',
  'tutanota.com', 'tuta.io',
  'rediffmail.com',
]);

function isAllowedEmail(email) {
  const domain = email.split('@')[1];
  return domain && ALLOWED_EMAIL_DOMAINS.has(domain);
}

// ── Product Catalog ───────────────────────────────────────────────────────────
const PRODUCTS = [
  {
    id: 1,
    name: 'ProMax Smartphone X12',
    category: 'Smartphones',
    brand: 'ProMax',
    model: 'X12',
    sku: 'PM-X12-BLK',
    price: 799.99,
    originalPrice: 999.99,
    image: 'https://placehold.co/300x220/1e293b/ffffff?text=Smartphone+X12',
    images: [
      'https://placehold.co/600x440/1e293b/ffffff?text=X12+Front',
      'https://placehold.co/600x440/334155/ffffff?text=X12+Side',
      'https://placehold.co/600x440/0f172a/ffffff?text=X12+Back'
    ],
    rating: 4.7,
    reviews: 342,
    stock: 25,
    description: 'The ProMax X12 delivers flagship performance with a stunning 6.7-inch AMOLED display, 200MP camera system, and all-day battery life. Perfect for power users who demand the best.',
    warranty: '1 Year',
    specs: {
      Display: '6.7" 120Hz AMOLED',
      Processor: 'Snapdragon 8 Gen 3',
      RAM: '12 GB',
      Storage: '256 GB',
      Camera: '200MP + 12MP + 10MP',
      Battery: '5000 mAh',
      OS: 'Android 14'
    },
    reviewList: [
      { author: 'Alice M.', rating: 5, date: '2024-11-15', text: 'Best phone I have ever owned. Lightning fast and camera is incredible.' },
      { author: 'Bob K.',   rating: 4, date: '2024-10-22', text: 'Great phone, battery life is outstanding. Slightly large for one-hand use.' }
    ]
  },
  {
    id: 2,
    name: 'UltraBook Pro 15',
    category: 'Laptops',
    brand: 'UltraBook',
    model: 'Pro 15',
    sku: 'UB-PRO15-SLV',
    price: 1299.00,
    originalPrice: 1499.00,
    image: 'https://placehold.co/300x220/0f2027/ffffff?text=UltraBook+Pro+15',
    images: [
      'https://placehold.co/600x440/0f2027/ffffff?text=UltraBook+Open',
      'https://placehold.co/600x440/203a43/ffffff?text=UltraBook+Keyboard',
      'https://placehold.co/600x440/2c5364/ffffff?text=UltraBook+Port'
    ],
    rating: 4.5,
    reviews: 218,
    stock: 12,
    description: 'Slim, powerful and beautifully designed. The UltraBook Pro 15 packs an Intel Core i7 processor, 32 GB RAM and a gorgeous 2K display into a 1.2 kg chassis.',
    warranty: '2 Years',
    specs: {
      Display: '15.6" 2K IPS 144Hz',
      Processor: 'Intel Core i7-13700H',
      RAM: '32 GB DDR5',
      Storage: '1 TB NVMe SSD',
      GPU: 'NVIDIA RTX 4060',
      Battery: '86 Wh (10+ hrs)',
      OS: 'Windows 11 Pro'
    },
    reviewList: [
      { author: 'Carol T.', rating: 5, date: '2024-12-01', text: 'Perfect work + gaming machine. Super quiet fans and runs cool.' },
      { author: 'Dave L.',  rating: 4, date: '2024-11-08', text: 'Excellent build quality. Webcam could be better.' }
    ]
  },
  {
    id: 3,
    name: 'SoundWave ANC Headphones',
    category: 'Audio',
    brand: 'SoundWave',
    model: 'ANC-700',
    sku: 'SW-ANC700-BLK',
    price: 249.99,
    originalPrice: 349.99,
    image: 'https://placehold.co/300x220/1a1a2e/ffffff?text=ANC+Headphones',
    images: [
      'https://placehold.co/600x440/1a1a2e/ffffff?text=ANC+Headphones+Front',
      'https://placehold.co/600x440/16213e/ffffff?text=ANC+Headphones+Ear',
      'https://placehold.co/600x440/0f3460/ffffff?text=ANC+Headphones+Case'
    ],
    rating: 4.8,
    reviews: 587,
    stock: 50,
    description: 'Industry-leading noise cancellation meets Hi-Res Audio in these premium over-ear headphones. 30-hour battery, multipoint pairing, and plush ear cushions for all-day comfort.',
    warranty: '1 Year',
    specs: {
      Type: 'Over-ear, closed back',
      'Noise Cancellation': 'Active (ANC + Transparency mode)',
      'Driver Size': '40mm',
      'Frequency Response': '20Hz – 20kHz',
      Battery: '30 hours ANC on',
      Connectivity: 'Bluetooth 5.3 / 3.5mm jack',
      Weight: '250 g'
    },
    reviewList: [
      { author: 'Eva R.',  rating: 5, date: '2024-11-20', text: 'ANC is on another level. Perfect for open-plan offices.' },
      { author: 'Frank P.',rating: 5, date: '2024-10-11', text: 'Sound quality is stunning. Comfortable for hours.' }
    ]
  },
  {
    id: 4,
    name: 'MirrorLens DSLR 4K Pro',
    category: 'Cameras',
    brand: 'MirrorLens',
    model: '4K-Pro',
    sku: 'ML-4KPRO-BDY',
    price: 1099.00,
    originalPrice: 1299.00,
    image: 'https://placehold.co/300x220/2d2d2d/ffffff?text=DSLR+Camera',
    images: [
      'https://placehold.co/600x440/2d2d2d/ffffff?text=Camera+Front',
      'https://placehold.co/600x440/1a1a1a/ffffff?text=Camera+Top',
      'https://placehold.co/600x440/3d3d3d/ffffff?text=Camera+Back'
    ],
    rating: 4.6,
    reviews: 134,
    stock: 8,
    description: 'Capture stunning 45MP stills and cinema-grade 4K/60fps video with this professional DSLR. Weather-sealed body, dual card slots, and built-in Wi-Fi for seamless sharing.',
    warranty: '2 Years',
    specs: {
      Sensor: '45MP Full-Frame CMOS',
      Video: '4K 60fps / 1080p 240fps',
      ISO: '100 – 102400',
      AF: '693-point Phase Detection',
      'Card Slots': 'Dual SD UHS-II',
      Connectivity: 'Wi-Fi 6, Bluetooth 5.0',
      Weight: '680 g (body only)'
    },
    reviewList: [
      { author: 'Grace W.', rating: 5, date: '2024-09-30', text: 'Absolutely breathtaking image quality. Autofocus in low-light is superb.' }
    ]
  },
  {
    id: 5,
    name: 'PowerHub USB-C Dock',
    category: 'Accessories',
    brand: 'PowerHub',
    model: 'Dock-12',
    sku: 'PH-DOCK12-GRY',
    price: 89.99,
    originalPrice: 119.99,
    image: 'https://placehold.co/300x220/374151/ffffff?text=USB-C+Dock',
    images: [
      'https://placehold.co/600x440/374151/ffffff?text=Dock+Front',
      'https://placehold.co/600x440/1f2937/ffffff?text=Dock+Ports',
      'https://placehold.co/600x440/4b5563/ffffff?text=Dock+In+Use'
    ],
    rating: 4.4,
    reviews: 902,
    stock: 100,
    description: 'Turn any laptop into a powerhouse workstation. 12-in-1 hub with dual 4K HDMI, 100W PD charging, USB 3.2 Gen 2, SD/MicroSD, Ethernet and audio.',
    warranty: '18 Months',
    specs: {
      Ports: '2× HDMI 2.0, 3× USB-A 3.2, 1× USB-C 3.2, 1× USB-C PD 100W, 1× Ethernet, 1× SD, 1× MicroSD, 1× 3.5mm Audio',
      Display: 'Dual 4K@60Hz',
      'Power Delivery': '100W Pass-through',
      Interface: 'USB-C (Thunderbolt 3/4 compatible)',
      Weight: '130 g'
    },
    reviewList: [
      { author: 'Henry S.', rating: 5, date: '2024-11-05', text: 'Everything I needed in one hub. Solid build quality.' },
      { author: 'Iris M.',  rating: 4, date: '2024-10-18', text: 'Works perfectly. Heats up a little under heavy load.' }
    ]
  },
  {
    id: 6,
    name: 'GamePad Elite Controller',
    category: 'Gaming',
    brand: 'GamePad',
    model: 'Elite-X',
    sku: 'GP-ELITEX-BLK',
    price: 149.99,
    originalPrice: 179.99,
    image: 'https://placehold.co/300x220/0d0d0d/44ff88?text=Elite+Controller',
    images: [
      'https://placehold.co/600x440/0d0d0d/44ff88?text=Controller+Front',
      'https://placehold.co/600x440/1a0a00/44ff88?text=Controller+Back',
      'https://placehold.co/600x440/111111/44ff88?text=Controller+Triggers'
    ],
    rating: 4.9,
    reviews: 1204,
    stock: 30,
    description: 'Dominate every game with hall-effect thumbsticks, remappable paddles, adjustable trigger stops, and a 40-hour rechargeable battery. Works on PC and console.',
    warranty: '1 Year',
    specs: {
      Sticks: 'Hall-Effect, configurable deadzone',
      Triggers: 'Adjustable stops + rumble motors',
      Connectivity: 'USB-C wired / 2.4 GHz wireless',
      Battery: '40 hours (wireless)',
      Paddles: '4× remappable rear paddles',
      Compatibility: 'PC, Xbox, Android (via USB)',
      Weight: '290 g'
    },
    reviewList: [
      { author: 'Jack B.',  rating: 5, date: '2024-12-10', text: 'Hall-effect sticks are a game changer. Zero drift.' },
      { author: 'Karen L.', rating: 5, date: '2024-11-28', text: 'Best controller I have used. Premium feel and build.' }
    ]
  },
  {
    id: 7,
    name: 'VitaBand Smartwatch Ultra',
    category: 'Wearables',
    brand: 'VitaBand',
    model: 'Ultra-2',
    sku: 'VB-ULTRA2-BLK',
    price: 349.99,
    originalPrice: 449.99,
    image: 'https://placehold.co/300x220/1b263b/ffffff?text=Smartwatch+Ultra',
    images: [
      'https://placehold.co/600x440/1b263b/ffffff?text=Watch+Face',
      'https://placehold.co/600x440/415a77/ffffff?text=Watch+Band',
      'https://placehold.co/600x440/778da9/000000?text=Watch+App'
    ],
    rating: 4.5,
    reviews: 476,
    stock: 40,
    description: 'Track every aspect of your health with this premium smartwatch. ECG, SpO2, GPS, sleep tracking, 200+ workout modes, and 10-day battery wrapped in a titanium case.',
    warranty: '1 Year',
    specs: {
      Display: '1.96" AMOLED Always-On',
      Case: 'Titanium Grade 5',
      Health: 'ECG, SpO2, Stress, HRV, Temp',
      GPS: 'Dual-band GPS + GLONASS',
      Battery: '10 days typical use',
      'Water Resistance': '10 ATM',
      Connectivity: 'Bluetooth 5.3, Wi-Fi, NFC'
    },
    reviewList: [
      { author: 'Liam C.',  rating: 5, date: '2024-12-05', text: 'Incredibly accurate health metrics. 10-day battery is real.' },
      { author: 'Mia R.',   rating: 4, date: '2024-11-17', text: 'Great watch. The app could use some polish but works well.' }
    ]
  },
  {
    id: 8,
    name: 'MeshNet Wi-Fi 6E Router',
    category: 'Networking',
    brand: 'MeshNet',
    model: 'AX7800',
    sku: 'MN-AX7800-WHT',
    price: 219.99,
    originalPrice: 269.99,
    image: 'https://placehold.co/300x220/f8fafc/1e293b?text=WiFi+Router',
    images: [
      'https://placehold.co/600x440/f8fafc/1e293b?text=Router+Front',
      'https://placehold.co/600x440/f1f5f9/334155?text=Router+Ports',
      'https://placehold.co/600x440/e2e8f0/475569?text=Router+App'
    ],
    rating: 4.6,
    reviews: 389,
    stock: 20,
    description: 'Blanket your home in ultra-fast, lag-free Wi-Fi 6E connectivity. Tri-band AX7800 with OFDMA, MU-MIMO, and a simple app-based setup. Supports up to 80 devices simultaneously.',
    warranty: '3 Years',
    specs: {
      Standard: 'Wi-Fi 6E (802.11ax)',
      Speed: '7800 Mbps tri-band',
      Band: '2.4 GHz + 5 GHz + 6 GHz',
      Antennas: '8× high-performance internal',
      Ports: '1× 2.5G WAN, 4× Gigabit LAN, 1× USB 3.0',
      Security: 'WPA3, automatic updates',
      Coverage: 'Up to 3000 sq ft'
    },
    reviewList: [
      { author: 'Noah G.',  rating: 5, date: '2024-10-30', text: 'No dead zones anywhere in my house. Setup took 5 minutes.' },
      { author: 'Olivia T.',rating: 4, date: '2024-10-15', text: 'Very fast and stable. App is excellent.' }
    ]
  },
  {
    id: 9,
    name: 'PixelBuds Wireless Earbuds',
    category: 'Audio',
    brand: 'PixelBuds',
    model: 'Pro-X',
    sku: 'PB-PROX-WHT',
    price: 179.99,
    originalPrice: 229.99,
    image: 'https://placehold.co/300x220/e0e7ff/312e81?text=Wireless+Earbuds',
    images: [
      'https://placehold.co/600x440/e0e7ff/312e81?text=Earbuds+Both',
      'https://placehold.co/600x440/c7d2fe/1e1b4b?text=Earbuds+Case',
      'https://placehold.co/600x440/a5b4fc/1e1b4b?text=Earbuds+Eartips'
    ],
    rating: 4.7,
    reviews: 721,
    stock: 60,
    description: 'Crystal-clear sound, custom 12mm drivers, ANC and Transparency mode in a compact IPX5-rated design. 8 hours playback + 24 more from the case. Fast pair in 2 seconds.',
    warranty: '1 Year',
    specs: {
      Drivers: '12mm custom dynamic',
      ANC: 'Hybrid Active Noise Cancellation',
      Battery: '8h + 24h (case)',
      'Water Resistance': 'IPX5',
      Connectivity: 'Bluetooth 5.3 multipoint',
      'Wearing detection': 'Yes (auto-pause)',
      Weight: '5.4 g per earbud'
    },
    reviewList: [
      { author: 'Paul N.',  rating: 5, date: '2024-12-08', text: 'Great sound for the price. ANC works remarkably well.' },
      { author: 'Quinn W.', rating: 5, date: '2024-11-25', text: 'Fit is perfect. Never had earbuds stay in this well.' }
    ]
  },
  {
    id: 10,
    name: 'ViewPad Tablet Pro 12',
    category: 'Accessories',
    brand: 'ViewPad',
    model: 'Tab Pro 12',
    sku: 'VP-TABPRO12-GRY',
    price: 649.99,
    originalPrice: 799.99,
    image: 'https://placehold.co/300x220/334155/e2e8f0?text=Tablet+Pro+12',
    images: [
      'https://placehold.co/600x440/334155/e2e8f0?text=Tablet+Front',
      'https://placehold.co/600x440/1e293b/cbd5e1?text=Tablet+Side',
      'https://placehold.co/600x440/0f172a/94a3b8?text=Tablet+Keyboard'
    ],
    rating: 4.4,
    reviews: 265,
    stock: 18,
    description: 'Work and play on a vivid 12-inch 2K LCD. Powered by a Snapdragon 8cx Gen 3, 8 hours of battery, USB-C with video output, and support for the stylus and keyboard folio.',
    warranty: '1 Year',
    specs: {
      Display: '12" 2K LCD 120Hz',
      Processor: 'Snapdragon 8cx Gen 3',
      RAM: '8 GB LPDDR5',
      Storage: '256 GB UFS 3.1',
      Camera: '13MP rear / 8MP front',
      Battery: '10000 mAh (8+ hrs)',
      OS: 'Android 14'
    },
    reviewList: [
      { author: 'Rachel B.', rating: 4, date: '2024-11-10', text: 'Excellent display. Stylus is responsive and very natural.' },
      { author: 'Sam T.',    rating: 5, date: '2024-10-28', text: 'Best Android tablet I have owned. Very fast.' }
    ]
  }
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function genSessionId() {
  return require('crypto').randomBytes(32).toString('hex');
}

function genOrderId() {
  return 'RCV' + Date.now().toString(36).toUpperCase();
}

function getUser(req) {
  const sid = req.cookies && req.cookies.storeSession;
  if (!sid) return null;
  const sess = storeSessions.get(sid);
  if (!sess) return null;
  if (Date.now() - sess.createdAt > SESSION_MAX_AGE) {
    storeSessions.delete(sid);
    return null;
  }
  return storeUsers.get(sess.email) || null;
}

function safeRedirect(url, fallback) {
  if (typeof url !== 'string' || !url.startsWith('/') || url.startsWith('//')) {
    return fallback;
  }
  return url;
}

function estDelivery(method) {
  const d = new Date();
  const days = method === 'overnight' ? 1 : method === 'express' ? 3 : 7;
  d.setDate(d.getDate() + days);
  return d.toDateString();
}

function computeCartTotals(user, promoOverride) {
  const cart = user.cart || [];
  let subtotal = 0;
  const cartItems = cart.map(item => {
    const product = PRODUCTS.find(p => p.id === item.productId);
    if (!product) return null;
    subtotal += product.price * item.qty;
    return { product, qty: item.qty };
  }).filter(Boolean);

  const shipping  = subtotal > 50 ? 0 : 9.99;
  const taxRate   = 0.08;
  const tax       = parseFloat((subtotal * taxRate).toFixed(2));

  const appliedPromo = promoOverride !== undefined ? promoOverride : (user.appliedPromo || null);
  const discountRate = appliedPromo ? (PROMO_CODES[appliedPromo] || 0) : 0;
  const discount  = parseFloat((subtotal * discountRate).toFixed(2));
  const total     = parseFloat((subtotal + shipping + tax - discount).toFixed(2));

  return { cartItems, subtotal: parseFloat(subtotal.toFixed(2)), shipping, tax, discount, total, appliedPromo };
}

// ── Auth middleware ───────────────────────────────────────────────────────────

function requireAuth(req, res, next) {
  const user = getUser(req);
  if (!user) {
    return res.redirect('/store/login?next=' + encodeURIComponent(req.originalUrl));
  }
  req.storeUser = user;
  next();
}

// ── Render helper ─────────────────────────────────────────────────────────────

function storeRender(res, view, locals) {
  // Use the portal's shared layout so the store looks consistent with the rest of the app.
  // app.locals.menuItems is available via express, passed explicitly for safety.
  res.render('store/' + view, Object.assign({
    activePage: 'store',
    layout: 'layout',
    extraHead: '<link rel="stylesheet" href="/css/store.css" />'
  }, locals));
}

// ══════════════════════════════════════════════════════════════════════════════
//  ROUTES
// ══════════════════════════════════════════════════════════════════════════════

// ── Home / product listing ────────────────────────────────────────────────────
router.get('/', function(req, res) {
  const storeUser = getUser(req);
  const cat = req.query.cat || '';
  const products = cat ? PRODUCTS.filter(p => p.category === cat) : PRODUCTS;
  storeRender(res, 'home', { storeUser, products, activeCategory: cat, title: 'RCV Academy eStore' });
});

// ── Register ──────────────────────────────────────────────────────────────────
router.get('/register', function(req, res) {
  storeRender(res, 'register', { storeUser: null, errorMessage: '', title: 'Register – RCV Academy eStore' });
});

router.post('/register', authLimiter, function(req, res) {
  const { firstName, lastName, email, phone, dob, password, confirmPassword, terms, gdprConsent } = req.body;

  if (!firstName || !lastName || !email || !password) {
    return storeRender(res, 'register', {
      storeUser: null,
      errorMessage: 'All required fields must be filled.',
      title: 'Register – RCV Academy eStore'
    });
  }
  if (password.length < 8) {
    return storeRender(res, 'register', {
      storeUser: null,
      errorMessage: 'Password must be at least 8 characters.',
      title: 'Register – RCV Academy eStore'
    });
  }
  if (password !== confirmPassword) {
    return storeRender(res, 'register', {
      storeUser: null,
      errorMessage: 'Passwords do not match.',
      title: 'Register – RCV Academy eStore'
    });
  }
  const normalEmail = email.trim().toLowerCase();
  if (!isAllowedEmail(normalEmail)) {
    return storeRender(res, 'register', {
      storeUser: null,
      errorMessage: 'Please use a valid public email address (e.g. Gmail, Yahoo, Outlook).',
      title: 'Register – RCV Academy eStore'
    });
  }
  if (terms !== 'yes') {
    return storeRender(res, 'register', {
      storeUser: null,
      errorMessage: 'You must agree to the Terms & Conditions and Privacy Policy.',
      title: 'Register – RCV Academy eStore'
    });
  }
  if (gdprConsent !== 'yes') {
    return storeRender(res, 'register', {
      storeUser: null,
      errorMessage: 'You must consent to data processing to create an account (GDPR).',
      title: 'Register – RCV Academy eStore'
    });
  }
  if (storeUsers.has(normalEmail)) {
    return storeRender(res, 'register', {
      storeUser: null,
      errorMessage: 'An account with that email already exists.',
      title: 'Register – RCV Academy eStore'
    });
  }

  const user = {
    firstName: firstName.trim(),
    lastName:  lastName.trim(),
    email:     normalEmail,
    phone:     phone || '',
    dob:       dob || '',
    password:  bcrypt.hashSync(password, 10),
    cart:      [],
    wishlist:  [],
    orders:    [],
    appliedPromo: null,
    preferences: { orderUpdates: true },
    gdprConsentDate: new Date().toISOString()
  };
  storeUsers.set(normalEmail, user);

  const sid = genSessionId();
  storeSessions.set(sid, { email: normalEmail, createdAt: Date.now() });
  res.cookie('storeSession', sid, { httpOnly: true, sameSite: 'Lax', secure: process.env.NODE_ENV === 'production', maxAge: SESSION_MAX_AGE });
  res.redirect('/store');
});

// ── Login ─────────────────────────────────────────────────────────────────────
router.get('/login', function(req, res) {
  const existing = getUser(req);
  if (existing) return res.redirect('/store');
  storeRender(res, 'login', {
    storeUser: null,
    errorMessage:   '',
    successMessage: req.query.registered ? 'Account created! Please log in.' : '',
    title: 'Login – RCV Academy eStore'
  });
});

router.post('/login', authLimiter, function(req, res) {
  const { email, password } = req.body;
  const normalEmail = (email || '').trim().toLowerCase();
  const user = storeUsers.get(normalEmail);

  if (!user || !bcrypt.compareSync(password, user.password)) {
    return storeRender(res, 'login', {
      storeUser: null,
      errorMessage:   'Invalid email or password.',
      successMessage: '',
      title: 'Login – RCV Academy eStore'
    });
  }

  // Remove any previous sessions for this user to prevent orphan buildup
  for (const [oldSid, sess] of storeSessions) {
    if (sess.email === normalEmail) storeSessions.delete(oldSid);
  }
  const sid = genSessionId();
  storeSessions.set(sid, { email: normalEmail, createdAt: Date.now() });
  res.cookie('storeSession', sid, { httpOnly: true, sameSite: 'Lax', secure: process.env.NODE_ENV === 'production', maxAge: SESSION_MAX_AGE });

  var next = safeRedirect(req.body.next || req.query.next, '/store');
  res.redirect(next);
});

// ── Logout ────────────────────────────────────────────────────────────────────
router.get('/logout', function(req, res) {
  const sid = req.cookies && req.cookies.storeSession;
  if (sid) storeSessions.delete(sid);
  res.clearCookie('storeSession');
  res.redirect('/store/login');
});

// ── Search ────────────────────────────────────────────────────────────────────
router.get('/search', function(req, res) {
  const storeUser = getUser(req);
  const query    = (req.query.q || '').trim();
  const sortBy   = req.query.sort || 'relevance';
  const catFilter = req.query.cat || '';

  let results = query
    ? PRODUCTS.filter(p => {
        const haystack = (p.name + ' ' + p.brand + ' ' + p.category + ' ' + p.description).toLowerCase();
        return query.toLowerCase().split(/\s+/).every(w => haystack.includes(w));
      })
    : [...PRODUCTS];

  if (catFilter) results = results.filter(p => p.category === catFilter);

  if (sortBy === 'price-asc')  results.sort((a,b) => a.price - b.price);
  if (sortBy === 'price-desc') results.sort((a,b) => b.price - a.price);
  if (sortBy === 'rating')     results.sort((a,b) => b.rating - a.rating);

  const categories = [...new Set(PRODUCTS.map(p => p.category))].sort();

  storeRender(res, 'search', {
    storeUser, query, sortBy, products: results, categories, activeCategory: catFilter,
    title: query ? `"${query}" – RCV Academy eStore` : 'Search – RCV Academy eStore'
  });
});

// ── Product detail ────────────────────────────────────────────────────────────
router.get('/product/:id', function(req, res) {
  const storeUser = getUser(req);
  const product = PRODUCTS.find(p => p.id === parseInt(req.params.id, 10));
  if (!product) return res.redirect('/store');

  const wishlisted = storeUser ? storeUser.wishlist.includes(product.id) : false;
  storeRender(res, 'product', {
    storeUser, product, wishlisted,
    title: product.name + ' – RCV Academy eStore'
  });
});

// ── Cart: view ────────────────────────────────────────────────────────────────
router.get('/cart', requireAuth, function(req, res) {
  const user = req.storeUser;
  const { cartItems, subtotal, shipping, tax, discount, total, appliedPromo } = computeCartTotals(user);
  storeRender(res, 'cart', {
    storeUser: user, cartItems, subtotal, shipping, tax, discount, total,
    appliedPromo, promoMessage: req.query.promo || '',
    title: 'Cart – RCV Academy eStore'
  });
});

// ── Cart: add ─────────────────────────────────────────────────────────────────
router.post('/cart/add', function(req, res) {
  const user = getUser(req);
  if (!user) {
    return res.redirect('/store/login?next=/store/cart');
  }
  const productId = parseInt(req.body.productId, 10);
  const qty       = Math.max(1, parseInt(req.body.qty, 10) || 1);
  const product   = PRODUCTS.find(p => p.id === productId);
  if (!product) return res.redirect(safeRedirect(req.body.redirect, '/store'));

  const existing = user.cart.find(i => i.productId === productId);
  if (existing) {
    existing.qty = Math.min(existing.qty + qty, product.stock);
  } else {
    user.cart.push({ productId, qty });
  }
  res.redirect(safeRedirect(req.body.redirect, '/store/cart'));
});

// ── Cart: update qty ──────────────────────────────────────────────────────────
router.post('/cart/update', requireAuth, function(req, res) {
  const user = req.storeUser;
  const productId = parseInt(req.body.productId, 10);
  const qty       = parseInt(req.body.qty, 10);
  const item      = user.cart.find(i => i.productId === productId);
  if (item) {
    if (qty < 1) {
      user.cart = user.cart.filter(i => i.productId !== productId);
    } else {
      const product = PRODUCTS.find(p => p.id === productId);
      item.qty = Math.min(qty, product ? product.stock : 99);
    }
  }
  res.redirect('/store/cart');
});

// ── Cart: remove ──────────────────────────────────────────────────────────────
router.post('/cart/remove', requireAuth, function(req, res) {
  const user = req.storeUser;
  const productId = parseInt(req.body.productId, 10);
  user.cart = user.cart.filter(i => i.productId !== productId);
  res.redirect('/store/cart');
});

// ── Cart: clear ───────────────────────────────────────────────────────────────
router.post('/cart/clear', requireAuth, function(req, res) {
  req.storeUser.cart = [];
  req.storeUser.appliedPromo = null;
  res.redirect('/store/cart');
});

// ── Cart: apply promo ─────────────────────────────────────────────────────────
router.post('/cart/promo', requireAuth, function(req, res) {
  const user  = req.storeUser;
  const code  = (req.body.promoCode || '').trim().toUpperCase();
  if (PROMO_CODES[code]) {
    user.appliedPromo = code;
    return res.redirect('/store/cart?promo=Promo+code+applied!');
  }
  user.appliedPromo = null;
  res.redirect('/store/cart?promo=Invalid+or+expired+promo+code');
});

// ── Checkout: view ────────────────────────────────────────────────────────────
router.get('/checkout', requireAuth, function(req, res) {
  const user = req.storeUser;
  if (!user.cart.length) return res.redirect('/store/cart');
  const { cartItems, subtotal, shipping, tax, discount, total, appliedPromo } = computeCartTotals(user);
  storeRender(res, 'checkout', {
    storeUser: user, cartItems, subtotal, shipping, tax, discount, total, appliedPromo,
    errorMessage: '',
    title: 'Checkout – RCV Academy eStore'
  });
});

// ── Checkout: place order ─────────────────────────────────────────────────────
router.post('/checkout/place', requireAuth, function(req, res) {
  const user = req.storeUser;
  if (!user.cart.length) return res.redirect('/store/cart');

  const {
    shipFirstName, shipLastName, shipEmail, shipPhone,
    shipAddress1, shipAddress2, shipCity, shipState, shipZip, shipCountry,
    shippingMethod, paymentMethod,
    cardName, cardNumber, cardExpiry,
    orderNotes
  } = req.body;

  if (!shipFirstName || !shipAddress1 || !shipCity || !shipState || !shipZip) {
    const { cartItems, subtotal, shipping, tax, discount, total, appliedPromo } = computeCartTotals(user);
    return storeRender(res, 'checkout', {
      storeUser: user, cartItems, subtotal, shipping, tax, discount, total, appliedPromo,
      errorMessage: 'Please fill in all required shipping fields.',
      title: 'Checkout – RCV Academy eStore'
    });
  }

  const { cartItems, subtotal, shipping, tax, discount, total, appliedPromo } = computeCartTotals(user);
  const orderId = genOrderId();

  const order = {
    id: orderId,
    date: new Date().toISOString(),
    status: 'processing',
    items: cartItems.map(ci => ({
      productId: ci.product.id,
      name:      ci.product.name,
      image:     ci.product.image,
      category:  ci.product.category,
      price:     ci.product.price,
      qty:       ci.qty
    })),
    subtotal, shipping, tax, discount, total, appliedPromo,
    shipName:    shipFirstName + ' ' + shipLastName,
    email:       shipEmail || user.email,
    shipAddress: shipAddress1 + (shipAddress2 ? ', ' + shipAddress2 : ''),
    shipCity:    shipCity + ', ' + shipState + ' ' + shipZip + ', ' + (shipCountry || 'US'),
    shippingMethod: shippingMethod || 'standard',
    paymentMethod:  paymentMethod || 'card',
    cardLast4:   cardNumber ? cardNumber.replace(/\s/g,'').slice(-4) : '',
    estDelivery: estDelivery(shippingMethod || 'standard'),
    orderNotes:  orderNotes || ''
  };

  user.orders.unshift(order);
  if (user.orders.length > 10) user.orders.length = 10; // keep only 10 most recent
  user.cart = [];
  user.appliedPromo = null;

  res.redirect('/store/order-confirm/' + orderId);
});

// ── Order confirm ─────────────────────────────────────────────────────────────
router.get('/order-confirm/:id', requireAuth, function(req, res) {
  const user  = req.storeUser;
  const order = user.orders.find(o => o.id === req.params.id);
  if (!order) return res.redirect('/store/orders');
  storeRender(res, 'order-confirm', {
    storeUser: user, order,
    title: 'Order Confirmed – RCV Academy eStore'
  });
});

// ── Orders list ───────────────────────────────────────────────────────────────
router.get('/orders', requireAuth, function(req, res) {
  const user   = req.storeUser;
  const status = req.query.status || 'all';
  const orders = status === 'all' ? user.orders : user.orders.filter(o => o.status === status);
  storeRender(res, 'orders', {
    storeUser: user, orders, activeStatus: status,
    title: 'My Orders – RCV Academy eStore'
  });
});

// ── Order detail ──────────────────────────────────────────────────────────────
router.get('/orders/:id', requireAuth, function(req, res) {
  const user  = req.storeUser;
  const order = user.orders.find(o => o.id === req.params.id);
  if (!order) return res.redirect('/store/orders');
  storeRender(res, 'order-detail', {
    storeUser: user, order,
    title: 'Order ' + order.id + ' – RCV Academy eStore'
  });
});

// ── Order cancel ──────────────────────────────────────────────────────────────
router.post('/orders/:id/cancel', requireAuth, function(req, res) {
  const user  = req.storeUser;
  const order = user.orders.find(o => o.id === req.params.id);
  if (order && order.status === 'processing') {
    order.status = 'cancelled';
  }
  res.redirect('/store/orders/' + req.params.id);
});

// ── Wishlist: view ────────────────────────────────────────────────────────────
router.get('/wishlist', requireAuth, function(req, res) {
  const user  = req.storeUser;
  const wishlistItems = (user.wishlist || []).map(id => PRODUCTS.find(p => p.id === id)).filter(Boolean);
  storeRender(res, 'wishlist', {
    storeUser: user, wishlistItems,
    title: 'Wishlist – RCV Academy eStore'
  });
});

// ── Wishlist: toggle ──────────────────────────────────────────────────────────
router.post('/wishlist/toggle', function(req, res) {
  const user = getUser(req);
  if (!user) return res.redirect('/store/login?next=/store/wishlist');

  const productId = parseInt(req.body.productId, 10);
  const idx = user.wishlist.indexOf(productId);
  if (idx === -1) {
    user.wishlist.push(productId);
  } else {
    user.wishlist.splice(idx, 1);
  }
  res.redirect(safeRedirect(req.body.redirect, '/store/wishlist'));
});

// ── Wishlist: clear ───────────────────────────────────────────────────────────
router.post('/wishlist/clear', requireAuth, function(req, res) {
  req.storeUser.wishlist = [];
  res.redirect('/store/wishlist');
});

// ── Profile: view ─────────────────────────────────────────────────────────────
router.get('/profile', requireAuth, function(req, res) {
  storeRender(res, 'profile', {
    storeUser: req.storeUser,
    activeTab: req.query.tab || 'personal',
    updateMessage: null,
    title: 'My Profile – RCV Academy eStore'
  });
});

// ── Profile: update (personal / password / address / preferences) ─────────────
router.post('/profile/update', requireAuth, function(req, res) {
  const user    = req.storeUser;
  const section = req.body.section;

  if (section === 'personal') {
    user.firstName = (req.body.firstName || '').trim() || user.firstName;
    user.lastName  = (req.body.lastName  || '').trim() || user.lastName;
    user.phone     = req.body.phone || '';
    user.dob       = req.body.dob   || '';
    user.gender    = req.body.gender || '';
    return storeRender(res, 'profile', {
      storeUser: user, activeTab: 'personal',
      updateMessage: { type: 'success', text: 'Personal information updated successfully.' },
      title: 'My Profile – RCV Academy eStore'
    });
  }

  if (section === 'password') {
    if (!req.body.currentPassword || !bcrypt.compareSync(req.body.currentPassword, user.password)) {
      return storeRender(res, 'profile', {
        storeUser: user, activeTab: 'password',
        updateMessage: { type: 'error', text: 'Current password is incorrect.' },
        title: 'My Profile – RCV Academy eStore'
      });
    }
    if ((req.body.newPassword || '').length < 8) {
      return storeRender(res, 'profile', {
        storeUser: user, activeTab: 'password',
        updateMessage: { type: 'error', text: 'New password must be at least 8 characters.' },
        title: 'My Profile – RCV Academy eStore'
      });
    }
    if (req.body.newPassword !== req.body.confirmNewPassword) {
      return storeRender(res, 'profile', {
        storeUser: user, activeTab: 'password',
        updateMessage: { type: 'error', text: 'New passwords do not match.' },
        title: 'My Profile – RCV Academy eStore'
      });
    }
    user.password = bcrypt.hashSync(req.body.newPassword, 10);
    return storeRender(res, 'profile', {
      storeUser: user, activeTab: 'password',
      updateMessage: { type: 'success', text: 'Password changed successfully.' },
      title: 'My Profile – RCV Academy eStore'
    });
  }

  if (section === 'address') {
    user.address1 = req.body.address1 || '';
    user.address2 = req.body.address2 || '';
    user.city     = req.body.city     || '';
    user.state    = req.body.state    || '';
    user.zip      = req.body.zip      || '';
    user.country  = req.body.country  || '';
    return storeRender(res, 'profile', {
      storeUser: user, activeTab: 'address',
      updateMessage: { type: 'success', text: 'Address saved successfully.' },
      title: 'My Profile – RCV Academy eStore'
    });
  }

  if (section === 'preferences') {
    user.preferences = {
      orderUpdates:   !!req.body.pref_orderUpdates,
      promotions:     !!req.body.pref_promotions,
      newsletter:     !!req.body.pref_newsletter,
      wishlistAlerts: !!req.body.pref_wishlistAlerts
    };
    return storeRender(res, 'profile', {
      storeUser: user, activeTab: 'preferences',
      updateMessage: { type: 'success', text: 'Preferences saved.' },
      title: 'My Profile – RCV Academy eStore'
    });
  }

  res.redirect('/store/profile');
});

// ── Review: add ───────────────────────────────────────────────────────────────
router.post('/review/add', requireAuth, function(req, res) {
  const user      = req.storeUser;
  const productId = parseInt(req.body.productId, 10);
  const product   = PRODUCTS.find(p => p.id === productId);
  if (!product) return res.redirect('/store');

  const rating = Math.min(5, Math.max(1, parseInt(req.body.rating, 10) || 5));
  const text   = (req.body.reviewText || '').trim().slice(0, 1000);

  const alreadyReviewed = product.reviewList.some(r => r.email === user.email);
  if (text && !alreadyReviewed) {
    product.reviewList.unshift({
      author: user.firstName + ' ' + user.lastName.charAt(0) + '.',
      email:  user.email,
      rating,
      date:   new Date().toISOString().slice(0, 10),
      text
    });
    if (product.reviewList.length > 5) product.reviewList.length = 5; // keep 5 most recent
    product.reviews = product.reviewList.length;
    const total = product.reviewList.reduce((s, r) => s + r.rating, 0);
    product.rating = parseFloat((total / product.reviewList.length).toFixed(1));
  }

  res.redirect('/store/product/' + productId + '#reviews-section');
});

module.exports = router;
