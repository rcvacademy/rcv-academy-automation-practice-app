'use strict';

const express        = require('express');
const router         = express.Router();
const path           = require('path');
const fs             = require('fs');
const Database       = require('better-sqlite3');
const rateLimit      = require('express-rate-limit');
const bcrypt         = require('bcryptjs');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10,
  message: 'Too many attempts. Please try again later.',
  standardHeaders: true, legacyHeaders: false
});

// ── SQLite User Store ──────────────────────────────────────────────────────────
const DB_DIR  = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DB_DIR, 'store.db');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    email TEXT PRIMARY KEY,
    data  TEXT NOT NULL
  )
`);

// Migrate legacy JSON file if it exists
(function migrateLegacyJson() {
  const legacyFile = path.join(DB_DIR, 'store-users.json');
  try {
    if (fs.existsSync(legacyFile)) {
      const raw = JSON.parse(fs.readFileSync(legacyFile, 'utf8'));
      const insert = db.prepare('INSERT OR IGNORE INTO users (email, data) VALUES (?, ?)');
      const tx = db.transaction((users) => {
        for (const u of users) insert.run(u.email, JSON.stringify(u));
      });
      tx(raw);
      fs.renameSync(legacyFile, legacyFile + '.migrated');
      console.log(`Migrated ${raw.length} user(s) from JSON to SQLite.`);
    }
  } catch (err) {
    console.error('Legacy JSON migration failed:', err.message);
  }
})();

// Prepared statements (reused for performance)
const stmtGet    = db.prepare('SELECT data FROM users WHERE email = ?');
const stmtUpsert = db.prepare('INSERT OR REPLACE INTO users (email, data) VALUES (?, ?)');
const stmtExists = db.prepare('SELECT 1 FROM users WHERE email = ?');

function dbGetUser(email) {
  const row = stmtGet.get(email);
  return row ? JSON.parse(row.data) : null;
}

function dbSaveUser(user) {
  stmtUpsert.run(user.email, JSON.stringify(user));
}

function dbHasUser(email) {
  return !!stmtExists.get(email);
}

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
  },

  // ── Smartphones (7 more) ─────────────────────────────────────────────────
  {
    id: 11,
    name: 'ProMax Smartphone X12 Pro',
    category: 'Smartphones',
    brand: 'ProMax',
    model: 'X12 Pro',
    sku: 'PM-X12P-BLK',
    price: 999.99,
    originalPrice: 1199.99,
    image: 'https://placehold.co/300x220/1e293b/ffffff?text=Smartphone+X12+Pro',
    images: [
      'https://placehold.co/600x440/1e293b/ffffff?text=X12+Pro+Front',
      'https://placehold.co/600x440/334155/ffffff?text=X12+Pro+Side',
      'https://placehold.co/600x440/0f172a/ffffff?text=X12+Pro+Back'
    ],
    rating: 4.8,
    reviews: 189,
    stock: 20,
    description: 'The ProMax X12 Pro upgrades to a 6.9-inch LTPO AMOLED, titanium frame, and 200MP periscope telephoto for 10× optical zoom.',
    warranty: '2 Years',
    specs: { Display: '6.9" 120Hz LTPO AMOLED', Processor: 'Snapdragon 8 Gen 3', RAM: '16 GB', Storage: '512 GB', Camera: '200MP + 50MP + 12MP', Battery: '5500 mAh', OS: 'Android 14' },
    reviewList: [
      { author: 'Tom A.', rating: 5, date: '2025-01-10', text: 'The zoom camera is insane. Worth the upgrade from X12.' }
    ]
  },
  {
    id: 12,
    name: 'ProMax Smartphone X12 Pro Max',
    category: 'Smartphones',
    brand: 'ProMax',
    model: 'X12 Pro Max',
    sku: 'PM-X12PM-GLD',
    price: 1199.99,
    originalPrice: 1399.99,
    image: 'https://placehold.co/300x220/2d1810/ffffff?text=Smartphone+X12+Pro+Max',
    images: [
      'https://placehold.co/600x440/2d1810/ffffff?text=X12+ProMax+Front',
      'https://placehold.co/600x440/3d2820/ffffff?text=X12+ProMax+Side'
    ],
    rating: 4.9,
    reviews: 97,
    stock: 10,
    description: 'The ultimate ProMax experience. 7.2-inch display, 1TB storage, satellite SOS, and cinema-grade video recording with ProRes support.',
    warranty: '2 Years',
    specs: { Display: '7.2" 120Hz LTPO AMOLED', Processor: 'Snapdragon 8 Gen 3', RAM: '16 GB', Storage: '1 TB', Camera: '200MP + 50MP + 50MP + 12MP', Battery: '6000 mAh', OS: 'Android 14' },
    reviewList: [
      { author: 'Uma K.', rating: 5, date: '2025-02-01', text: 'Absolutely the best smartphone money can buy right now.' }
    ]
  },
  {
    id: 13,
    name: 'ProMax Smartphone X12 Mini',
    category: 'Smartphones',
    brand: 'ProMax',
    model: 'X12 Mini',
    sku: 'PM-X12M-BLU',
    price: 599.99,
    originalPrice: 749.99,
    image: 'https://placehold.co/300x220/1a365d/ffffff?text=Smartphone+X12+Mini',
    images: [
      'https://placehold.co/600x440/1a365d/ffffff?text=X12+Mini+Front',
      'https://placehold.co/600x440/2a4a6d/ffffff?text=X12+Mini+Back'
    ],
    rating: 4.4,
    reviews: 231,
    stock: 35,
    description: 'Compact flagship power. The X12 Mini packs the same Snapdragon 8 Gen 3 chip into a pocket-friendly 5.8-inch form factor.',
    warranty: '1 Year',
    specs: { Display: '5.8" 120Hz AMOLED', Processor: 'Snapdragon 8 Gen 3', RAM: '8 GB', Storage: '128 GB', Camera: '50MP + 12MP', Battery: '3800 mAh', OS: 'Android 14' },
    reviewList: [
      { author: 'Vera P.', rating: 4, date: '2025-01-18', text: 'Love the small size. Battery could be bigger but charges fast.' }
    ]
  },
  {
    id: 14,
    name: 'NovaTech Smartphone S22',
    category: 'Smartphones',
    brand: 'NovaTech',
    model: 'S22',
    sku: 'NT-S22-BLK',
    price: 699.99,
    originalPrice: 849.99,
    image: 'https://placehold.co/300x220/0d3330/ffffff?text=NovaTech+S22',
    images: [
      'https://placehold.co/600x440/0d3330/ffffff?text=S22+Front',
      'https://placehold.co/600x440/1d4340/ffffff?text=S22+Back'
    ],
    rating: 4.5,
    reviews: 412,
    stock: 28,
    description: 'NovaTech S22 delivers stunning photography with AI-enhanced triple cameras, an all-day 4800mAh battery, and a vibrant 6.4-inch Dynamic AMOLED.',
    warranty: '1 Year',
    specs: { Display: '6.4" Dynamic AMOLED 2X', Processor: 'Exynos 2400', RAM: '8 GB', Storage: '256 GB', Camera: '50MP + 12MP + 10MP', Battery: '4800 mAh', OS: 'Android 14' },
    reviewList: [
      { author: 'Will J.', rating: 5, date: '2025-01-05', text: 'Fantastic photos in every lighting condition.' }
    ]
  },
  {
    id: 15,
    name: 'NovaTech Smartphone S22 Ultra',
    category: 'Smartphones',
    brand: 'NovaTech',
    model: 'S22 Ultra',
    sku: 'NT-S22U-BLK',
    price: 1099.99,
    originalPrice: 1299.99,
    image: 'https://placehold.co/300x220/0d3330/ffcc00?text=NovaTech+S22+Ultra',
    images: [
      'https://placehold.co/600x440/0d3330/ffcc00?text=S22+Ultra+Front',
      'https://placehold.co/600x440/1d4340/ffcc00?text=S22+Ultra+Back'
    ],
    rating: 4.7,
    reviews: 176,
    stock: 15,
    description: 'The NovaTech S22 Ultra features a built-in S Pen stylus, 108MP camera, 6.8-inch QHD+ display, and 5000mAh battery for the ultimate power user.',
    warranty: '2 Years',
    specs: { Display: '6.8" QHD+ Dynamic AMOLED 2X', Processor: 'Exynos 2400', RAM: '12 GB', Storage: '512 GB', Camera: '108MP + 12MP + 10MP + 10MP', Battery: '5000 mAh', OS: 'Android 14' },
    reviewList: [
      { author: 'Xavier R.', rating: 5, date: '2025-02-10', text: 'The S Pen integration is seamless. Best note-taking phone.' }
    ]
  },
  {
    id: 16,
    name: 'ZenPhone Flip 5G',
    category: 'Smartphones',
    brand: 'ZenPhone',
    model: 'Flip 5G',
    sku: 'ZP-FLIP5G-PNK',
    price: 849.99,
    originalPrice: 999.99,
    image: 'https://placehold.co/300x220/4a1942/ffffff?text=ZenPhone+Flip+5G',
    images: [
      'https://placehold.co/600x440/4a1942/ffffff?text=Flip+Open',
      'https://placehold.co/600x440/5a2952/ffffff?text=Flip+Closed'
    ],
    rating: 4.3,
    reviews: 198,
    stock: 22,
    description: 'Flip the script with this ultra-compact foldable. 6.7-inch foldable AMOLED, flex mode camera, and a cover display for quick glances.',
    warranty: '1 Year',
    specs: { Display: '6.7" Foldable AMOLED 120Hz', 'Cover Display': '3.4" Super AMOLED', Processor: 'Snapdragon 8 Gen 2', RAM: '8 GB', Storage: '256 GB', Camera: '50MP + 12MP', Battery: '3700 mAh' },
    reviewList: [
      { author: 'Yara S.', rating: 4, date: '2025-01-22', text: 'So fun to use. The cover display is super handy.' }
    ]
  },
  {
    id: 17,
    name: 'ZenPhone Fold 5G',
    category: 'Smartphones',
    brand: 'ZenPhone',
    model: 'Fold 5G',
    sku: 'ZP-FOLD5G-BLK',
    price: 1499.99,
    originalPrice: 1799.99,
    image: 'https://placehold.co/300x220/1a1a2e/ffffff?text=ZenPhone+Fold+5G',
    images: [
      'https://placehold.co/600x440/1a1a2e/ffffff?text=Fold+Open',
      'https://placehold.co/600x440/2a2a3e/ffffff?text=Fold+Tablet'
    ],
    rating: 4.6,
    reviews: 143,
    stock: 8,
    description: 'Unfold to a 7.6-inch tablet-sized display. Multi-window multitasking, triple rear cameras, and all-day battery in one premium foldable device.',
    warranty: '2 Years',
    specs: { 'Inner Display': '7.6" QXGA+ Foldable AMOLED', 'Cover Display': '6.2" HD+ Dynamic AMOLED', Processor: 'Snapdragon 8 Gen 2', RAM: '12 GB', Storage: '512 GB', Camera: '50MP + 12MP + 10MP', Battery: '4400 mAh' },
    reviewList: [
      { author: 'Zach M.', rating: 5, date: '2025-02-14', text: 'Like having a phone AND tablet. Multitasking is incredible.' }
    ]
  },

  // ── Laptops (7 more) ────────────────────────────────────────────────────
  {
    id: 18,
    name: 'UltraBook Pro 15 Air',
    category: 'Laptops',
    brand: 'UltraBook',
    model: 'Pro 15 Air',
    sku: 'UB-PRO15A-GLD',
    price: 1099.00,
    originalPrice: 1299.00,
    image: 'https://placehold.co/300x220/1a3a4a/ffffff?text=UltraBook+Pro+15+Air',
    images: [
      'https://placehold.co/600x440/1a3a4a/ffffff?text=Pro+15+Air+Open',
      'https://placehold.co/600x440/2a4a5a/ffffff?text=Pro+15+Air+Side'
    ],
    rating: 4.6,
    reviews: 167,
    stock: 18,
    description: 'The thinnest UltraBook yet. Just 0.98 kg with Intel Core i5, 16 GB RAM, and a stunning 15.6-inch OLED display. Perfect for on-the-go professionals.',
    warranty: '2 Years',
    specs: { Display: '15.6" OLED 60Hz', Processor: 'Intel Core i5-13500H', RAM: '16 GB DDR5', Storage: '512 GB NVMe SSD', GPU: 'Intel Iris Xe', Battery: '72 Wh (12+ hrs)', Weight: '0.98 kg' },
    reviewList: [
      { author: 'Amy W.', rating: 5, date: '2025-01-15', text: 'Incredibly light and the OLED screen is gorgeous.' }
    ]
  },
  {
    id: 19,
    name: 'UltraBook Pro 15 Touch',
    category: 'Laptops',
    brand: 'UltraBook',
    model: 'Pro 15 Touch',
    sku: 'UB-PRO15T-SLV',
    price: 1399.00,
    originalPrice: 1599.00,
    image: 'https://placehold.co/300x220/0f2027/ffffff?text=UltraBook+Pro+15+Touch',
    images: [
      'https://placehold.co/600x440/0f2027/ffffff?text=Pro+15+Touch+Front',
      'https://placehold.co/600x440/203a43/ffffff?text=Pro+15+Touch+Tent'
    ],
    rating: 4.4,
    reviews: 98,
    stock: 10,
    description: '2-in-1 convertible with a 360° hinge and touchscreen. Intel Core i7, 32 GB RAM, and included stylus for creative professionals.',
    warranty: '2 Years',
    specs: { Display: '15.6" 2K IPS Touchscreen 120Hz', Processor: 'Intel Core i7-13700H', RAM: '32 GB DDR5', Storage: '1 TB NVMe SSD', GPU: 'Intel Iris Xe', Battery: '78 Wh (9+ hrs)', Weight: '1.5 kg' },
    reviewList: [
      { author: 'Brian F.', rating: 4, date: '2025-01-20', text: 'Touch screen is responsive. Great for sketching ideas.' }
    ]
  },
  {
    id: 20,
    name: 'UltraBook Pro 14',
    category: 'Laptops',
    brand: 'UltraBook',
    model: 'Pro 14',
    sku: 'UB-PRO14-BLK',
    price: 1149.00,
    originalPrice: 1349.00,
    image: 'https://placehold.co/300x220/0f2027/ffffff?text=UltraBook+Pro+14',
    images: [
      'https://placehold.co/600x440/0f2027/ffffff?text=Pro+14+Open',
      'https://placehold.co/600x440/2c5364/ffffff?text=Pro+14+Keyboard'
    ],
    rating: 4.7,
    reviews: 287,
    stock: 22,
    description: 'The 14-inch sweet spot. Compact yet powerful with Intel Core i7, 16 GB RAM, and a brilliant miniLED display with 100% DCI-P3 coverage.',
    warranty: '2 Years',
    specs: { Display: '14" miniLED 2K 120Hz', Processor: 'Intel Core i7-13700H', RAM: '16 GB DDR5', Storage: '512 GB NVMe SSD', GPU: 'NVIDIA RTX 4050', Battery: '76 Wh (11+ hrs)', Weight: '1.1 kg' },
    reviewList: [
      { author: 'Claire D.', rating: 5, date: '2025-02-05', text: 'Perfect size for daily carry. MiniLED display is stunning.' }
    ]
  },
  {
    id: 21,
    name: 'ChromeMax Laptop C3',
    category: 'Laptops',
    brand: 'ChromeMax',
    model: 'C3',
    sku: 'CM-C3-WHT',
    price: 349.00,
    originalPrice: 449.00,
    image: 'https://placehold.co/300x220/e8f5e9/1b5e20?text=ChromeMax+C3',
    images: [
      'https://placehold.co/600x440/e8f5e9/1b5e20?text=C3+Open',
      'https://placehold.co/600x440/c8e6c9/1b5e20?text=C3+Side'
    ],
    rating: 4.1,
    reviews: 543,
    stock: 50,
    description: 'Fast, secure, and affordable. ChromeOS boots in seconds, auto-updates, and gives you 12+ hours of battery life for browsing, docs, and streaming.',
    warranty: '1 Year',
    specs: { Display: '14" FHD IPS', Processor: 'MediaTek Kompanio 828', RAM: '4 GB', Storage: '64 GB eMMC', Battery: '50 Wh (12+ hrs)', OS: 'ChromeOS', Weight: '1.3 kg' },
    reviewList: [
      { author: 'Diane L.', rating: 4, date: '2025-01-08', text: 'Great for students. Fast and reliable.' }
    ]
  },
  {
    id: 22,
    name: 'ChromeMax Laptop C3 Plus',
    category: 'Laptops',
    brand: 'ChromeMax',
    model: 'C3 Plus',
    sku: 'CM-C3P-BLU',
    price: 449.00,
    originalPrice: 549.00,
    image: 'https://placehold.co/300x220/e3f2fd/0d47a1?text=ChromeMax+C3+Plus',
    images: [
      'https://placehold.co/600x440/e3f2fd/0d47a1?text=C3+Plus+Open',
      'https://placehold.co/600x440/bbdefb/0d47a1?text=C3+Plus+Side'
    ],
    rating: 4.3,
    reviews: 312,
    stock: 38,
    description: 'More power, more storage. The C3 Plus upgrades to 8 GB RAM, 128 GB storage, and a brighter touchscreen display for added versatility.',
    warranty: '1 Year',
    specs: { Display: '14" FHD IPS Touchscreen', Processor: 'MediaTek Kompanio 1200', RAM: '8 GB', Storage: '128 GB eMMC', Battery: '52 Wh (11+ hrs)', OS: 'ChromeOS', Weight: '1.35 kg' },
    reviewList: [
      { author: 'Eric N.', rating: 4, date: '2025-01-25', text: 'Touchscreen is a great addition. Runs smoothly.' }
    ]
  },
  {
    id: 23,
    name: 'HyperStation Workstation 17',
    category: 'Laptops',
    brand: 'HyperStation',
    model: 'WS-17',
    sku: 'HS-WS17-BLK',
    price: 2499.00,
    originalPrice: 2899.00,
    image: 'https://placehold.co/300x220/1a1a1a/ff4444?text=HyperStation+17',
    images: [
      'https://placehold.co/600x440/1a1a1a/ff4444?text=WS-17+Open',
      'https://placehold.co/600x440/2a2a2a/ff4444?text=WS-17+Ports'
    ],
    rating: 4.8,
    reviews: 88,
    stock: 5,
    description: 'Uncompromising desktop-class performance in a portable form. Intel Core i9, 64 GB RAM, RTX 4080, and a 17.3-inch 4K MiniLED display.',
    warranty: '3 Years',
    specs: { Display: '17.3" 4K MiniLED 144Hz', Processor: 'Intel Core i9-14900HX', RAM: '64 GB DDR5', Storage: '2 TB NVMe SSD', GPU: 'NVIDIA RTX 4080', Battery: '99.5 Wh (5+ hrs)', Weight: '2.7 kg' },
    reviewList: [
      { author: 'Fiona G.', rating: 5, date: '2025-02-12', text: 'Handles 3D rendering like a desktop. Fans are surprisingly quiet.' }
    ]
  },
  {
    id: 24,
    name: 'HyperStation Workstation 17 Pro',
    category: 'Laptops',
    brand: 'HyperStation',
    model: 'WS-17 Pro',
    sku: 'HS-WS17P-BLK',
    price: 3199.00,
    originalPrice: 3599.00,
    image: 'https://placehold.co/300x220/1a1a1a/ffaa44?text=HyperStation+17+Pro',
    images: [
      'https://placehold.co/600x440/1a1a1a/ffaa44?text=WS-17+Pro+Open',
      'https://placehold.co/600x440/2a2a2a/ffaa44?text=WS-17+Pro+Ports'
    ],
    rating: 4.9,
    reviews: 42,
    stock: 3,
    description: 'The pinnacle of mobile workstations. Intel Core i9, 128 GB RAM, RTX 4090, ISV-certified for professional CAD, VFX, and AI/ML workloads.',
    warranty: '3 Years',
    specs: { Display: '17.3" 4K MiniLED 165Hz', Processor: 'Intel Core i9-14900HX', RAM: '128 GB DDR5', Storage: '4 TB NVMe SSD (2×2TB RAID0)', GPU: 'NVIDIA RTX 4090', Battery: '99.5 Wh (4+ hrs)', Weight: '3.1 kg' },
    reviewList: [
      { author: 'George H.', rating: 5, date: '2025-02-20', text: 'ISV certified and it shows. Blender renders are insanely fast.' }
    ]
  },

  // ── Audio (7 more) ──────────────────────────────────────────────────────
  {
    id: 25,
    name: 'SoundWave ANC Headphones Pro',
    category: 'Audio',
    brand: 'SoundWave',
    model: 'ANC-900 Pro',
    sku: 'SW-ANC900P-SLV',
    price: 349.99,
    originalPrice: 449.99,
    image: 'https://placehold.co/300x220/1a1a2e/ffffff?text=ANC+Headphones+Pro',
    images: [
      'https://placehold.co/600x440/1a1a2e/ffffff?text=ANC+Pro+Front',
      'https://placehold.co/600x440/16213e/ffffff?text=ANC+Pro+Side'
    ],
    rating: 4.9,
    reviews: 312,
    stock: 30,
    description: 'Premium edition with spatial audio, LDAC/aptX HD codec support, 40-hour battery, and adaptive ANC that adjusts to your environment in real-time.',
    warranty: '2 Years',
    specs: { Type: 'Over-ear, closed back', ANC: 'Adaptive ANC + Transparency', 'Driver Size': '50mm planar magnetic', Battery: '40 hours', Connectivity: 'Bluetooth 5.3, LDAC, aptX HD, 3.5mm', Weight: '260 g' },
    reviewList: [
      { author: 'Hannah J.', rating: 5, date: '2025-01-28', text: 'Planar magnetic drivers sound incredible. Best headphones I have ever used.' }
    ]
  },
  {
    id: 26,
    name: 'SoundWave ANC Headphones SE',
    category: 'Audio',
    brand: 'SoundWave',
    model: 'ANC-500 SE',
    sku: 'SW-ANC500SE-WHT',
    price: 149.99,
    originalPrice: 199.99,
    image: 'https://placehold.co/300x220/1a1a2e/cccccc?text=ANC+Headphones+SE',
    images: [
      'https://placehold.co/600x440/1a1a2e/cccccc?text=ANC+SE+Front',
      'https://placehold.co/600x440/16213e/cccccc?text=ANC+SE+Side'
    ],
    rating: 4.3,
    reviews: 845,
    stock: 80,
    description: 'Affordable noise cancellation without compromise. 25-hour battery, comfortable on-ear design, and signature SoundWave audio quality in a budget-friendly package.',
    warranty: '1 Year',
    specs: { Type: 'On-ear, closed back', ANC: 'Active Noise Cancellation', 'Driver Size': '32mm', Battery: '25 hours', Connectivity: 'Bluetooth 5.2, 3.5mm jack', Weight: '190 g' },
    reviewList: [
      { author: 'Ian D.', rating: 4, date: '2025-01-12', text: 'Amazing value. ANC is not as strong as the Pro but more than adequate.' }
    ]
  },
  {
    id: 27,
    name: 'PixelBuds Wireless Earbuds Pro',
    category: 'Audio',
    brand: 'PixelBuds',
    model: 'Pro-X2',
    sku: 'PB-PROX2-BLK',
    price: 249.99,
    originalPrice: 299.99,
    image: 'https://placehold.co/300x220/e0e7ff/312e81?text=PixelBuds+Pro',
    images: [
      'https://placehold.co/600x440/e0e7ff/312e81?text=PixelBuds+Pro+Both',
      'https://placehold.co/600x440/c7d2fe/1e1b4b?text=PixelBuds+Pro+Case'
    ],
    rating: 4.8,
    reviews: 423,
    stock: 45,
    description: 'Upgraded Pro edition with spatial audio, lossless codec support, 10-hour battery per bud, and a wireless charging case with LED display.',
    warranty: '1 Year',
    specs: { Drivers: '14mm custom dynamic', ANC: 'Adaptive Hybrid ANC', Battery: '10h + 30h (case)', 'Water Resistance': 'IP55', Connectivity: 'Bluetooth 5.3, LE Audio', Weight: '5.8 g per earbud' },
    reviewList: [
      { author: 'Jessica K.', rating: 5, date: '2025-02-02', text: 'Spatial audio is a game changer for movies and music.' }
    ]
  },
  {
    id: 28,
    name: 'PixelBuds Wireless Earbuds SE',
    category: 'Audio',
    brand: 'PixelBuds',
    model: 'SE',
    sku: 'PB-SE-WHT',
    price: 99.99,
    originalPrice: 129.99,
    image: 'https://placehold.co/300x220/e0e7ff/4a4a8a?text=PixelBuds+SE',
    images: [
      'https://placehold.co/600x440/e0e7ff/4a4a8a?text=PixelBuds+SE+Both',
      'https://placehold.co/600x440/c7d2fe/4a4a8a?text=PixelBuds+SE+Case'
    ],
    rating: 4.2,
    reviews: 1102,
    stock: 120,
    description: 'Great sound at an entry-level price. 6-hour playback, IPX4 water resistance, and quick pair. Perfect everyday earbuds.',
    warranty: '6 Months',
    specs: { Drivers: '10mm dynamic', ANC: 'None (passive isolation)', Battery: '6h + 18h (case)', 'Water Resistance': 'IPX4', Connectivity: 'Bluetooth 5.2', Weight: '4.8 g per earbud' },
    reviewList: [
      { author: 'Kevin L.', rating: 4, date: '2025-01-15', text: 'Excellent budget earbuds. Sound way better than the price suggests.' }
    ]
  },
  {
    id: 29,
    name: 'BassBox Portable Speaker 10',
    category: 'Audio',
    brand: 'BassBox',
    model: 'BX-10',
    sku: 'BB-BX10-RED',
    price: 129.99,
    originalPrice: 169.99,
    image: 'https://placehold.co/300x220/4a0000/ffffff?text=BassBox+Speaker+10',
    images: [
      'https://placehold.co/600x440/4a0000/ffffff?text=BassBox+10+Front',
      'https://placehold.co/600x440/6a1010/ffffff?text=BassBox+10+Side'
    ],
    rating: 4.5,
    reviews: 678,
    stock: 55,
    description: '360° powerful sound from a rugged, waterproof IP67 speaker. 20-hour battery, party mode linking, and a built-in power bank to charge your phone.',
    warranty: '1 Year',
    specs: { 'Driver Config': '2× 45mm full-range + passive radiator', Power: '30W peak', Battery: '20 hours', 'Water Resistance': 'IP67', Connectivity: 'Bluetooth 5.3, aux-in', Weight: '680 g' },
    reviewList: [
      { author: 'Laura M.', rating: 5, date: '2025-01-30', text: 'Took it to the beach, sounds fantastic and survived sand and splash.' }
    ]
  },
  {
    id: 30,
    name: 'BassBox Portable Speaker 10 Mini',
    category: 'Audio',
    brand: 'BassBox',
    model: 'BX-10 Mini',
    sku: 'BB-BX10M-BLU',
    price: 69.99,
    originalPrice: 89.99,
    image: 'https://placehold.co/300x220/001a4a/ffffff?text=BassBox+10+Mini',
    images: [
      'https://placehold.co/600x440/001a4a/ffffff?text=BassBox+Mini+Front',
      'https://placehold.co/600x440/002a5a/ffffff?text=BassBox+Mini+Side'
    ],
    rating: 4.3,
    reviews: 934,
    stock: 90,
    description: 'Ultra-portable version with the same signature BassBox sound. Clip it to your bag with the built-in carabiner. IP67 waterproof and 12-hour battery.',
    warranty: '1 Year',
    specs: { 'Driver Config': '1× 40mm full-range + passive radiator', Power: '15W peak', Battery: '12 hours', 'Water Resistance': 'IP67', Connectivity: 'Bluetooth 5.3', Weight: '310 g' },
    reviewList: [
      { author: 'Mark Q.', rating: 4, date: '2025-02-08', text: 'Surprisingly loud for its size. Love the carabiner clip.' }
    ]
  },
  {
    id: 31,
    name: 'AudioMax Soundbar 5.1',
    category: 'Audio',
    brand: 'AudioMax',
    model: 'SB-5100',
    sku: 'AM-SB5100-BLK',
    price: 399.99,
    originalPrice: 499.99,
    image: 'https://placehold.co/300x220/1a1a1a/44aaff?text=AudioMax+Soundbar',
    images: [
      'https://placehold.co/600x440/1a1a1a/44aaff?text=Soundbar+Front',
      'https://placehold.co/600x440/2a2a2a/44aaff?text=Soundbar+Subwoofer'
    ],
    rating: 4.6,
    reviews: 267,
    stock: 20,
    description: 'Immersive 5.1 surround sound from a sleek soundbar + wireless subwoofer combo. Dolby Atmos, DTS:X, and HDMI eARC for seamless TV integration.',
    warranty: '2 Years',
    specs: { Channels: '5.1 (3.1 bar + wireless sub)', Power: '410W total', Audio: 'Dolby Atmos, DTS:X', Connectivity: 'HDMI eARC, Bluetooth 5.0, optical, aux', 'Subwoofer': '8" wireless', Width: '98 cm' },
    reviewList: [
      { author: 'Nina P.', rating: 5, date: '2025-02-15', text: 'Movie nights are completely transformed. Bass from the sub is deep and punchy.' }
    ]
  },

  // ── Cameras (7 more) ────────────────────────────────────────────────────
  {
    id: 32,
    name: 'MirrorLens DSLR 4K Pro Mark II',
    category: 'Cameras',
    brand: 'MirrorLens',
    model: '4K-Pro-II',
    sku: 'ML-4KPRO2-BDY',
    price: 1399.00,
    originalPrice: 1599.00,
    image: 'https://placehold.co/300x220/2d2d2d/ffffff?text=DSLR+4K+Mark+II',
    images: [
      'https://placehold.co/600x440/2d2d2d/ffffff?text=4K+II+Front',
      'https://placehold.co/600x440/3d3d3d/ffffff?text=4K+II+Back'
    ],
    rating: 4.8,
    reviews: 87,
    stock: 6,
    description: 'Second generation of the 4K Pro. Upgraded 61MP sensor, 8K video recording, AI subject detection autofocus, and improved weather sealing.',
    warranty: '2 Years',
    specs: { Sensor: '61MP Full-Frame BSI CMOS', Video: '8K 30fps / 4K 120fps', ISO: '100 – 204800', AF: '1053-point Hybrid AF', 'Card Slots': 'CFexpress Type B + SD UHS-II', Weight: '710 g (body only)' },
    reviewList: [
      { author: 'Oscar R.', rating: 5, date: '2025-02-18', text: '8K video is breathtaking. AI autofocus tracks subjects flawlessly.' }
    ]
  },
  {
    id: 33,
    name: 'MirrorLens DSLR 4K',
    category: 'Cameras',
    brand: 'MirrorLens',
    model: '4K',
    sku: 'ML-4K-BDY',
    price: 799.00,
    originalPrice: 949.00,
    image: 'https://placehold.co/300x220/2d2d2d/cccccc?text=DSLR+4K',
    images: [
      'https://placehold.co/600x440/2d2d2d/cccccc?text=4K+Front',
      'https://placehold.co/600x440/3d3d3d/cccccc?text=4K+Back'
    ],
    rating: 4.4,
    reviews: 356,
    stock: 15,
    description: 'Entry-level full-frame DSLR with 24MP sensor, 4K/30fps video, and intuitive guided menus. Perfect for photographers stepping up from crop sensor cameras.',
    warranty: '1 Year',
    specs: { Sensor: '24MP Full-Frame CMOS', Video: '4K 30fps / 1080p 120fps', ISO: '100 – 51200', AF: '425-point Phase Detection', 'Card Slots': 'Dual SD UHS-II', Weight: '620 g (body only)' },
    reviewList: [
      { author: 'Penny T.', rating: 4, date: '2025-01-14', text: 'Excellent entry into full-frame. Image quality is superb for the price.' }
    ]
  },
  {
    id: 34,
    name: 'MirrorLens Mirrorless 8K Elite',
    category: 'Cameras',
    brand: 'MirrorLens',
    model: '8K-Elite',
    sku: 'ML-8KELT-BDY',
    price: 2499.00,
    originalPrice: 2799.00,
    image: 'https://placehold.co/300x220/1a1a1a/ffcc00?text=Mirrorless+8K+Elite',
    images: [
      'https://placehold.co/600x440/1a1a1a/ffcc00?text=8K+Elite+Front',
      'https://placehold.co/600x440/2a2a2a/ffcc00?text=8K+Elite+Back'
    ],
    rating: 4.9,
    reviews: 54,
    stock: 4,
    description: 'Flagship mirrorless with 102MP medium-format sensor, internal 8K ProRes RAW, 5-axis IBIS, and CFexpress storage. Built for professional cinematographers.',
    warranty: '3 Years',
    specs: { Sensor: '102MP Medium Format BSI CMOS', Video: '8K 60fps ProRes RAW', ISO: '64 – 102400', AF: '1053-point AI AF', IBIS: '7-stop 5-axis', Weight: '890 g (body only)' },
    reviewList: [
      { author: 'Quinn E.', rating: 5, date: '2025-02-25', text: 'Medium format in a compact body. Image quality is otherworldly.' }
    ]
  },
  {
    id: 35,
    name: 'QuickShot Action Camera 4K',
    category: 'Cameras',
    brand: 'QuickShot',
    model: 'AC-4K',
    sku: 'QS-AC4K-BLK',
    price: 299.99,
    originalPrice: 379.99,
    image: 'https://placehold.co/300x220/003300/ffffff?text=Action+Cam+4K',
    images: [
      'https://placehold.co/600x440/003300/ffffff?text=Action+4K+Front',
      'https://placehold.co/600x440/004400/ffffff?text=Action+4K+Mount'
    ],
    rating: 4.5,
    reviews: 892,
    stock: 40,
    description: 'Capture every adventure in stunning 4K/60fps with HyperSmooth stabilization, waterproof to 10m without a case, front and rear screens, and voice control.',
    warranty: '1 Year',
    specs: { Video: '4K 60fps / 2.7K 120fps / 1080p 240fps', Stabilization: 'HyperSmooth 5.0', Waterproof: '10m without housing', Screens: 'Front 1.4" + Rear 2.27" touch', Battery: '1720 mAh', Weight: '154 g' },
    reviewList: [
      { author: 'Ryan S.', rating: 5, date: '2025-01-20', text: 'Stabilization is incredible. My mountain bike footage looks professional.' }
    ]
  },
  {
    id: 36,
    name: 'QuickShot Action Camera 4K Pro',
    category: 'Cameras',
    brand: 'QuickShot',
    model: 'AC-4K Pro',
    sku: 'QS-AC4KP-BLK',
    price: 449.99,
    originalPrice: 549.99,
    image: 'https://placehold.co/300x220/003300/ffcc00?text=Action+Cam+4K+Pro',
    images: [
      'https://placehold.co/600x440/003300/ffcc00?text=Action+4K+Pro+Front',
      'https://placehold.co/600x440/004400/ffcc00?text=Action+4K+Pro+Mount'
    ],
    rating: 4.7,
    reviews: 456,
    stock: 25,
    description: 'Pro-level action camera with 5.3K recording, 1/1.9" sensor, 10-bit color, waterproof to 27m, and extended battery for all-day shooting.',
    warranty: '1 Year',
    specs: { Video: '5.3K 60fps / 4K 120fps / 1080p 240fps', Sensor: '1/1.9" CMOS', Stabilization: 'HyperSmooth 6.0 360°', Waterproof: '27m without housing', Battery: '1800 mAh (extended)', Weight: '162 g' },
    reviewList: [
      { author: 'Sarah V.', rating: 5, date: '2025-02-06', text: '5.3K footage is insanely detailed. Night mode is surprisingly good.' }
    ]
  },
  {
    id: 37,
    name: 'LensCraft Instant Camera Retro',
    category: 'Cameras',
    brand: 'LensCraft',
    model: 'Retro-1',
    sku: 'LC-RETRO1-IVR',
    price: 89.99,
    originalPrice: 109.99,
    image: 'https://placehold.co/300x220/f5f0e1/4a3728?text=Instant+Retro',
    images: [
      'https://placehold.co/600x440/f5f0e1/4a3728?text=Retro+Front',
      'https://placehold.co/600x440/e8e0d0/4a3728?text=Retro+Side'
    ],
    rating: 4.2,
    reviews: 1205,
    stock: 70,
    description: 'Capture memories instantly with this retro-styled instant camera. Auto exposure, selfie mirror, close-up lens, and prints credit-card sized photos.',
    warranty: '6 Months',
    specs: { Film: 'Instax Mini (62×46mm)', Lens: 'f/12.7, 60mm', Exposure: 'Automatic', Flash: 'Built-in auto flash', 'Selfie Mode': 'Yes (mirror + close-up lens)', Weight: '318 g' },
    reviewList: [
      { author: 'Tara W.', rating: 4, date: '2025-01-10', text: 'Such a fun party camera. Everyone loves getting instant prints.' }
    ]
  },
  {
    id: 38,
    name: 'LensCraft Instant Camera Retro Mini',
    category: 'Cameras',
    brand: 'LensCraft',
    model: 'Retro-Mini',
    sku: 'LC-RETROM-PNK',
    price: 69.99,
    originalPrice: 84.99,
    image: 'https://placehold.co/300x220/fce4ec/880e4f?text=Instant+Retro+Mini',
    images: [
      'https://placehold.co/600x440/fce4ec/880e4f?text=Retro+Mini+Front',
      'https://placehold.co/600x440/f8bbd0/880e4f?text=Retro+Mini+Side'
    ],
    rating: 4.0,
    reviews: 1567,
    stock: 95,
    description: 'The most compact instant camera yet. Slim enough for any pocket, with auto exposure and a fun built-in selfie mirror. Uses Mini film format.',
    warranty: '6 Months',
    specs: { Film: 'Instax Mini (62×46mm)', Lens: 'f/12.7, 60mm', Exposure: 'Automatic', Flash: 'Built-in auto flash', Weight: '236 g' },
    reviewList: [
      { author: 'Uma G.', rating: 4, date: '2025-02-01', text: 'So cute and compact. Perfect gift for teens.' }
    ]
  },

  // ── Accessories (7 more) ────────────────────────────────────────────────
  {
    id: 39,
    name: 'PowerHub USB-C Dock Pro',
    category: 'Accessories',
    brand: 'PowerHub',
    model: 'Dock-16 Pro',
    sku: 'PH-DOCK16P-BLK',
    price: 149.99,
    originalPrice: 189.99,
    image: 'https://placehold.co/300x220/374151/ffffff?text=USB-C+Dock+Pro',
    images: [
      'https://placehold.co/600x440/374151/ffffff?text=Dock+Pro+Front',
      'https://placehold.co/600x440/1f2937/ffffff?text=Dock+Pro+Ports'
    ],
    rating: 4.7,
    reviews: 534,
    stock: 60,
    description: '16-in-1 professional docking station with dual 4K@120Hz HDMI, 2.5G Ethernet, 140W PD charging, NVMe SSD slot, and aluminum chassis.',
    warranty: '2 Years',
    specs: { Ports: '2× HDMI 2.1, 4× USB-A 3.2, 2× USB-C 3.2, 1× USB-C PD 140W, 1× 2.5G Ethernet, 1× SD, 1× MicroSD, 1× 3.5mm, 1× NVMe slot', Display: 'Dual 4K@120Hz or 8K@60Hz', 'Power Delivery': '140W' },
    reviewList: [
      { author: 'Victor S.', rating: 5, date: '2025-01-22', text: '140W charging is impressive. NVMe slot is a genius addition.' }
    ]
  },
  {
    id: 40,
    name: 'PowerHub USB-C Dock Mini',
    category: 'Accessories',
    brand: 'PowerHub',
    model: 'Dock-6 Mini',
    sku: 'PH-DOCK6M-SLV',
    price: 39.99,
    originalPrice: 54.99,
    image: 'https://placehold.co/300x220/374151/cccccc?text=USB-C+Dock+Mini',
    images: [
      'https://placehold.co/600x440/374151/cccccc?text=Dock+Mini+Front',
      'https://placehold.co/600x440/4b5563/cccccc?text=Dock+Mini+Ports'
    ],
    rating: 4.2,
    reviews: 1345,
    stock: 150,
    description: 'Pocket-sized 6-in-1 hub: HDMI 4K, 2× USB-A, USB-C PD pass-through, SD card reader, and 3.5mm audio. The perfect travel companion.',
    warranty: '1 Year',
    specs: { Ports: '1× HDMI 2.0, 2× USB-A 3.0, 1× USB-C PD 60W, 1× SD, 1× 3.5mm Audio', Display: '4K@60Hz single', 'Power Delivery': '60W', Weight: '42 g' },
    reviewList: [
      { author: 'Wendy T.', rating: 4, date: '2025-01-18', text: 'Tiny and does everything I need. Always in my laptop bag.' }
    ]
  },
  {
    id: 41,
    name: 'ViewPad Tablet Pro 12 Lite',
    category: 'Accessories',
    brand: 'ViewPad',
    model: 'Tab Pro 12 Lite',
    sku: 'VP-TABPRO12L-BLU',
    price: 449.99,
    originalPrice: 549.99,
    image: 'https://placehold.co/300x220/334155/88bbdd?text=Tablet+Pro+12+Lite',
    images: [
      'https://placehold.co/600x440/334155/88bbdd?text=Tab+12+Lite+Front',
      'https://placehold.co/600x440/1e293b/88bbdd?text=Tab+12+Lite+Side'
    ],
    rating: 4.2,
    reviews: 189,
    stock: 30,
    description: 'Same stunning 12-inch display in a lighter, more affordable package. MediaTek chipset, 4 GB RAM, 128 GB storage. Perfect for media consumption and light productivity.',
    warranty: '1 Year',
    specs: { Display: '12" FHD+ LCD 60Hz', Processor: 'MediaTek Dimensity 1080', RAM: '4 GB LPDDR4X', Storage: '128 GB UFS 2.2', Camera: '8MP rear / 5MP front', Battery: '8000 mAh (10+ hrs)', OS: 'Android 14' },
    reviewList: [
      { author: 'Xavier M.', rating: 4, date: '2025-02-10', text: 'Great value tablet. Display is excellent for the price.' }
    ]
  },
  {
    id: 42,
    name: 'ViewPad Tablet Pro 10',
    category: 'Accessories',
    brand: 'ViewPad',
    model: 'Tab Pro 10',
    sku: 'VP-TABPRO10-GRY',
    price: 399.99,
    originalPrice: 499.99,
    image: 'https://placehold.co/300x220/334155/aaccee?text=Tablet+Pro+10',
    images: [
      'https://placehold.co/600x440/334155/aaccee?text=Tab+Pro+10+Front',
      'https://placehold.co/600x440/1e293b/aaccee?text=Tab+Pro+10+Side'
    ],
    rating: 4.3,
    reviews: 412,
    stock: 25,
    description: 'Compact 10-inch tablet with Snapdragon 7 Gen 1, stylus support, and quad speakers. Ideal for reading, note-taking, and on-the-go entertainment.',
    warranty: '1 Year',
    specs: { Display: '10.4" 2K LCD 120Hz', Processor: 'Snapdragon 7 Gen 1', RAM: '6 GB LPDDR5', Storage: '128 GB UFS 3.1', Camera: '13MP rear / 8MP front', Battery: '7040 mAh (9+ hrs)', OS: 'Android 14' },
    reviewList: [
      { author: 'Yolanda R.', rating: 4, date: '2025-01-28', text: 'Perfect size for reading. Stylus works like a charm.' }
    ]
  },
  {
    id: 43,
    name: 'ChargeMax Wireless Charger Pad',
    category: 'Accessories',
    brand: 'ChargeMax',
    model: 'WC-15',
    sku: 'CM-WC15-WHT',
    price: 29.99,
    originalPrice: 39.99,
    image: 'https://placehold.co/300x220/f5f5f5/333333?text=Wireless+Charger',
    images: [
      'https://placehold.co/600x440/f5f5f5/333333?text=Charger+Top',
      'https://placehold.co/600x440/e0e0e0/333333?text=Charger+Side'
    ],
    rating: 4.3,
    reviews: 2134,
    stock: 200,
    description: 'Slim 15W Qi wireless charging pad with LED indicator and foreign object detection. Compatible with all Qi-enabled smartphones and earbuds cases.',
    warranty: '1 Year',
    specs: { Power: '15W max (Qi)', Input: 'USB-C', Compatibility: 'Qi-certified devices', Safety: 'FOD, over-temp, over-voltage protection', Diameter: '10 cm', Weight: '68 g' },
    reviewList: [
      { author: 'Zoe A.', rating: 4, date: '2025-01-05', text: 'Charges my phone quickly. Clean minimal design.' }
    ]
  },
  {
    id: 44,
    name: 'ChargeMax Wireless Charger Pad Pro',
    category: 'Accessories',
    brand: 'ChargeMax',
    model: 'WC-25 Pro',
    sku: 'CM-WC25P-BLK',
    price: 59.99,
    originalPrice: 79.99,
    image: 'https://placehold.co/300x220/2a2a2a/ffffff?text=Wireless+Charger+Pro',
    images: [
      'https://placehold.co/600x440/2a2a2a/ffffff?text=Charger+Pro+Top',
      'https://placehold.co/600x440/3a3a3a/ffffff?text=Charger+Pro+Side'
    ],
    rating: 4.6,
    reviews: 876,
    stock: 90,
    description: '3-in-1 wireless charging station for phone, earbuds, and smartwatch simultaneously. 25W fast charging, MagSafe compatible, with a sleek foldable design.',
    warranty: '1 Year',
    specs: { Power: '25W phone + 5W watch + 5W earbuds', Input: 'USB-C 45W', Compatibility: 'Qi / MagSafe / Apple Watch', Safety: 'FOD, over-temp, over-current protection', Foldable: 'Yes (travel-friendly)', Weight: '185 g' },
    reviewList: [
      { author: 'Aaron B.', rating: 5, date: '2025-02-14', text: 'Charges all three devices at once. Foldable design is clever for travel.' }
    ]
  },
  {
    id: 45,
    name: 'KeyTech Mechanical Keyboard K1',
    category: 'Accessories',
    brand: 'KeyTech',
    model: 'K1',
    sku: 'KT-K1-GRY',
    price: 119.99,
    originalPrice: 149.99,
    image: 'https://placehold.co/300x220/37474f/ffffff?text=Mechanical+Keyboard',
    images: [
      'https://placehold.co/600x440/37474f/ffffff?text=Keyboard+Top',
      'https://placehold.co/600x440/455a64/ffffff?text=Keyboard+Side'
    ],
    rating: 4.7,
    reviews: 1023,
    stock: 45,
    description: 'Premium 75% mechanical keyboard with hot-swappable switches, gasket mount, per-key RGB, and a silicone-dampened aluminum case for a satisfying thocky sound.',
    warranty: '2 Years',
    specs: { Layout: '75% (84 keys)', Switches: 'Hot-swappable (Cherry MX/Gateron)', Keycaps: 'PBT double-shot', Connectivity: 'USB-C wired + Bluetooth 5.1 + 2.4GHz', Battery: '4000 mAh (200+ hrs)', RGB: 'Per-key programmable' },
    reviewList: [
      { author: 'Blake C.', rating: 5, date: '2025-02-08', text: 'Best keyboard I have typed on. Gasket mount makes every keystroke satisfying.' }
    ]
  },

  // ── Gaming (7 more) ─────────────────────────────────────────────────────
  {
    id: 46,
    name: 'GamePad Elite Controller Pro',
    category: 'Gaming',
    brand: 'GamePad',
    model: 'Elite-X Pro',
    sku: 'GP-ELITEXP-WHT',
    price: 199.99,
    originalPrice: 249.99,
    image: 'https://placehold.co/300x220/0d0d0d/ffffff?text=Elite+Controller+Pro',
    images: [
      'https://placehold.co/600x440/0d0d0d/ffffff?text=Controller+Pro+Front',
      'https://placehold.co/600x440/1a1a1a/ffffff?text=Controller+Pro+Back'
    ],
    rating: 4.9,
    reviews: 678,
    stock: 20,
    description: 'Pro edition with swappable thumbstick modules, 2ms wireless latency, OLED display for profiles, and a premium carrying case included.',
    warranty: '2 Years',
    specs: { Sticks: 'Magnetic hall-effect, swappable tops', Triggers: 'Adaptive resistance + hair trigger', 'Display': 'OLED profile indicator', Battery: '50 hours (wireless)', Paddles: '4× remappable metal paddles', Compatibility: 'PC, Xbox, PlayStation (via adapter)', Weight: '310 g' },
    reviewList: [
      { author: 'Chris D.', rating: 5, date: '2025-01-25', text: 'OLED display is a nice touch. Swappable sticks are genius for different genres.' }
    ]
  },
  {
    id: 47,
    name: 'GamePad Elite Controller Lite',
    category: 'Gaming',
    brand: 'GamePad',
    model: 'Elite-Lite',
    sku: 'GP-ELITEL-BLU',
    price: 79.99,
    originalPrice: 99.99,
    image: 'https://placehold.co/300x220/0d0d2d/4488ff?text=Elite+Controller+Lite',
    images: [
      'https://placehold.co/600x440/0d0d2d/4488ff?text=Controller+Lite+Front',
      'https://placehold.co/600x440/1a1a3d/4488ff?text=Controller+Lite+Back'
    ],
    rating: 4.4,
    reviews: 1456,
    stock: 60,
    description: 'Affordable entry to Elite quality. Hall-effect sticks, textured grips, 30-hour battery, and 2 rear buttons at an unbeatable price.',
    warranty: '1 Year',
    specs: { Sticks: 'Hall-effect', Triggers: 'Standard with deadzone adjustment', Battery: '30 hours (wireless)', Paddles: '2× rear buttons', Connectivity: 'USB-C / 2.4 GHz wireless', Compatibility: 'PC, Xbox, Android', Weight: '250 g' },
    reviewList: [
      { author: 'Donna F.', rating: 4, date: '2025-02-01', text: 'Incredible value. Hall-effect sticks at this price is outstanding.' }
    ]
  },
  {
    id: 48,
    name: 'GamePad Elite Controller SE',
    category: 'Gaming',
    brand: 'GamePad',
    model: 'Elite-SE',
    sku: 'GP-ELITSE-RED',
    price: 129.99,
    originalPrice: 159.99,
    image: 'https://placehold.co/300x220/2d0d0d/ff4444?text=Elite+Controller+SE',
    images: [
      'https://placehold.co/600x440/2d0d0d/ff4444?text=Controller+SE+Front',
      'https://placehold.co/600x440/3d1a1a/ff4444?text=Controller+SE+Back'
    ],
    rating: 4.6,
    reviews: 834,
    stock: 35,
    description: 'Special Edition with a bold crimson color scheme, hall-effect sticks, 4 rear paddles, and textured rubber grips. Limited run design.',
    warranty: '1 Year',
    specs: { Sticks: 'Hall-effect, configurable deadzone', Triggers: 'Adjustable stops + vibration motors', Battery: '40 hours (wireless)', Paddles: '4× remappable rear paddles', Connectivity: 'USB-C / 2.4 GHz wireless', Compatibility: 'PC, Xbox, Android', Weight: '285 g' },
    reviewList: [
      { author: 'Elena G.', rating: 5, date: '2025-02-12', text: 'Love the red design. Feels great in hand and performs flawlessly.' }
    ]
  },
  {
    id: 49,
    name: 'VRMax Virtual Reality Headset',
    category: 'Gaming',
    brand: 'VRMax',
    model: 'VR-One',
    sku: 'VR-ONE-WHT',
    price: 399.99,
    originalPrice: 499.99,
    image: 'https://placehold.co/300x220/1a0a30/aa66ff?text=VR+Headset',
    images: [
      'https://placehold.co/600x440/1a0a30/aa66ff?text=VR+Front',
      'https://placehold.co/600x440/2a1a40/aa66ff?text=VR+Side'
    ],
    rating: 4.5,
    reviews: 567,
    stock: 25,
    description: 'Standalone VR headset with 4K resolution per eye, inside-out tracking, hand gesture recognition, and a library of 500+ games and experiences.',
    warranty: '1 Year',
    specs: { Display: '2× 2160×2160 LCD', FOV: '110°', Tracking: '6DoF inside-out', Controllers: 'Included (2× touch)', Processor: 'Snapdragon XR2 Gen 2', Battery: '2.5 hours', Weight: '503 g' },
    reviewList: [
      { author: 'Fred H.', rating: 5, date: '2025-01-30', text: 'Wireless VR is a game-changer. No PC needed and resolution is sharp.' }
    ]
  },
  {
    id: 50,
    name: 'VRMax Virtual Reality Headset Pro',
    category: 'Gaming',
    brand: 'VRMax',
    model: 'VR-Pro',
    sku: 'VR-PRO-BLK',
    price: 699.99,
    originalPrice: 849.99,
    image: 'https://placehold.co/300x220/1a0a30/ffcc00?text=VR+Headset+Pro',
    images: [
      'https://placehold.co/600x440/1a0a30/ffcc00?text=VR+Pro+Front',
      'https://placehold.co/600x440/2a1a40/ffcc00?text=VR+Pro+Side'
    ],
    rating: 4.8,
    reviews: 234,
    stock: 12,
    description: 'Mixed reality headset with full-color passthrough, eye and face tracking, 4K+ per eye micro-OLED displays, and PC VR streaming over Wi-Fi 6E.',
    warranty: '2 Years',
    specs: { Display: '2× 2480×2480 micro-OLED', FOV: '120°', Tracking: '6DoF + eye + face tracking', 'Passthrough': 'Full-color stereoscopic', Processor: 'Snapdragon XR2 Gen 2', Battery: '2 hours (3.5 with battery pack)', Weight: '516 g' },
    reviewList: [
      { author: 'Gina I.', rating: 5, date: '2025-02-18', text: 'Eye tracking and passthrough are incredible. The future of computing.' }
    ]
  },
  {
    id: 51,
    name: 'PixelStream Gaming Monitor 27',
    category: 'Gaming',
    brand: 'PixelStream',
    model: 'GM-27',
    sku: 'PS-GM27-BLK',
    price: 449.99,
    originalPrice: 549.99,
    image: 'https://placehold.co/300x220/0a0a0a/00ff88?text=Gaming+Monitor+27',
    images: [
      'https://placehold.co/600x440/0a0a0a/00ff88?text=Monitor+27+Front',
      'https://placehold.co/600x440/1a1a1a/00ff88?text=Monitor+27+Back'
    ],
    rating: 4.6,
    reviews: 389,
    stock: 18,
    description: '27-inch QHD IPS gaming monitor with 165Hz refresh rate, 1ms GTG, HDR400, and height-adjustable ergonomic stand. G-Sync and FreeSync Premium compatible.',
    warranty: '3 Years',
    specs: { Panel: '27" QHD IPS (2560×1440)', 'Refresh Rate': '165Hz', 'Response Time': '1ms GTG', HDR: 'HDR400', 'Adaptive Sync': 'G-Sync / FreeSync Premium', Ports: '2× HDMI 2.1, 1× DisplayPort 1.4, USB hub' },
    reviewList: [
      { author: 'Harry J.', rating: 5, date: '2025-02-15', text: 'Colors are incredible. 165Hz makes everything butter-smooth.' }
    ]
  },
  {
    id: 52,
    name: 'PixelStream Gaming Monitor 27 Pro',
    category: 'Gaming',
    brand: 'PixelStream',
    model: 'GM-27 Pro',
    sku: 'PS-GM27P-BLK',
    price: 799.99,
    originalPrice: 999.99,
    image: 'https://placehold.co/300x220/0a0a0a/ffaa00?text=Gaming+Monitor+27+Pro',
    images: [
      'https://placehold.co/600x440/0a0a0a/ffaa00?text=Monitor+27+Pro+Front',
      'https://placehold.co/600x440/1a1a1a/ffaa00?text=Monitor+27+Pro+Back'
    ],
    rating: 4.9,
    reviews: 156,
    stock: 8,
    description: '27-inch 4K OLED gaming monitor with 240Hz, 0.03ms response, HDR True Black 400, and a KVM switch for multi-device setups. The ultimate competitive display.',
    warranty: '3 Years',
    specs: { Panel: '27" 4K QD-OLED (3840×2160)', 'Refresh Rate': '240Hz', 'Response Time': '0.03ms GTG', HDR: 'HDR True Black 400', 'Adaptive Sync': 'G-Sync Ultimate / FreeSync Premium Pro', Ports: '2× HDMI 2.1, 2× DisplayPort 2.1, USB-C 90W, KVM' },
    reviewList: [
      { author: 'Irene K.', rating: 5, date: '2025-02-22', text: 'OLED at 240Hz 4K is unreal. Best monitor I have ever used.' }
    ]
  },

  // ── Wearables (7 more) ──────────────────────────────────────────────────
  {
    id: 53,
    name: 'VitaBand Smartwatch Ultra SE',
    category: 'Wearables',
    brand: 'VitaBand',
    model: 'Ultra-SE',
    sku: 'VB-ULTRASE-GRY',
    price: 249.99,
    originalPrice: 319.99,
    image: 'https://placehold.co/300x220/1b263b/cccccc?text=Smartwatch+Ultra+SE',
    images: [
      'https://placehold.co/600x440/1b263b/cccccc?text=Ultra+SE+Face',
      'https://placehold.co/600x440/415a77/cccccc?text=Ultra+SE+Band'
    ],
    rating: 4.4,
    reviews: 298,
    stock: 35,
    description: 'The essential edition of the Ultra lineup. GPS, heart rate, SpO2, sleep tracking, and 7-day battery in a lightweight aluminum case at a friendlier price point.',
    warranty: '1 Year',
    specs: { Display: '1.85" AMOLED', Case: 'Aluminum', Health: 'Heart Rate, SpO2, Sleep, Stress', GPS: 'Single-band GPS', Battery: '7 days typical', 'Water Resistance': '5 ATM', Connectivity: 'Bluetooth 5.2' },
    reviewList: [
      { author: 'Julia L.', rating: 4, date: '2025-01-15', text: 'Great value. Does 90% of what the Ultra does at a fraction of the price.' }
    ]
  },
  {
    id: 54,
    name: 'VitaBand Smartwatch Ultra Lite',
    category: 'Wearables',
    brand: 'VitaBand',
    model: 'Ultra-Lite',
    sku: 'VB-ULTRAL-PNK',
    price: 199.99,
    originalPrice: 249.99,
    image: 'https://placehold.co/300x220/3b1b2b/ffaacc?text=Smartwatch+Ultra+Lite',
    images: [
      'https://placehold.co/600x440/3b1b2b/ffaacc?text=Ultra+Lite+Face',
      'https://placehold.co/600x440/5a3b4b/ffaacc?text=Ultra+Lite+Band'
    ],
    rating: 4.2,
    reviews: 534,
    stock: 50,
    description: 'Slim and stylish fitness-focused smartwatch. Track steps, workouts, sleep, and heart rate in a featherlight 28g case with 14-day battery life.',
    warranty: '1 Year',
    specs: { Display: '1.47" AMOLED', Case: 'Polycarbonate', Health: 'Heart Rate, Steps, Sleep, SpO2', GPS: 'Connected GPS (via phone)', Battery: '14 days typical', 'Water Resistance': '5 ATM', Weight: '28 g' },
    reviewList: [
      { author: 'Kayla M.', rating: 4, date: '2025-01-20', text: 'So light you forget you are wearing it. 2-week battery is amazing.' }
    ]
  },
  {
    id: 55,
    name: 'VitaBand Smartwatch Pro',
    category: 'Wearables',
    brand: 'VitaBand',
    model: 'Pro-3',
    sku: 'VB-PRO3-BLK',
    price: 299.99,
    originalPrice: 379.99,
    image: 'https://placehold.co/300x220/1b263b/44ff88?text=Smartwatch+Pro',
    images: [
      'https://placehold.co/600x440/1b263b/44ff88?text=Pro+3+Face',
      'https://placehold.co/600x440/415a77/44ff88?text=Pro+3+Band'
    ],
    rating: 4.6,
    reviews: 367,
    stock: 28,
    description: 'Advanced health monitoring meets smart features. ECG, blood pressure estimation, body composition, and NFC payments in a stainless steel case.',
    warranty: '1 Year',
    specs: { Display: '1.93" AMOLED Always-On', Case: 'Stainless Steel 316L', Health: 'ECG, Blood Pressure, Body Comp, SpO2', GPS: 'Dual-band GPS', Battery: '5 days typical', NFC: 'Yes (contactless payments)', Connectivity: 'Bluetooth 5.3, Wi-Fi' },
    reviewList: [
      { author: 'Leo N.', rating: 5, date: '2025-02-05', text: 'Blood pressure monitoring is surprisingly accurate. Great all-rounder.' }
    ]
  },
  {
    id: 56,
    name: 'FitTrack Fitness Band Slim',
    category: 'Wearables',
    brand: 'FitTrack',
    model: 'Slim-5',
    sku: 'FT-SLIM5-BLK',
    price: 49.99,
    originalPrice: 69.99,
    image: 'https://placehold.co/300x220/263b1b/88ff44?text=Fitness+Band+Slim',
    images: [
      'https://placehold.co/600x440/263b1b/88ff44?text=Band+Slim+Face',
      'https://placehold.co/600x440/3b5a27/88ff44?text=Band+Slim+Side'
    ],
    rating: 4.1,
    reviews: 2345,
    stock: 150,
    description: 'Ultra-affordable fitness tracker with heart rate, steps, sleep, and 20-day battery. Water-resistant and weighs just 18g. Perfect entry-level wearable.',
    warranty: '6 Months',
    specs: { Display: '1.1" AMOLED', Health: 'Heart Rate, Steps, Sleep, SpO2', Battery: '20 days typical', 'Water Resistance': '5 ATM', Connectivity: 'Bluetooth 5.0', Weight: '18 g' },
    reviewList: [
      { author: 'Maya O.', rating: 4, date: '2025-01-08', text: '20-day battery is real. Does the basics perfectly.' }
    ]
  },
  {
    id: 57,
    name: 'FitTrack Fitness Band Slim Pro',
    category: 'Wearables',
    brand: 'FitTrack',
    model: 'Slim-5 Pro',
    sku: 'FT-SLIM5P-BLK',
    price: 79.99,
    originalPrice: 99.99,
    image: 'https://placehold.co/300x220/263b1b/ccff44?text=Fitness+Band+Slim+Pro',
    images: [
      'https://placehold.co/600x440/263b1b/ccff44?text=Band+Slim+Pro+Face',
      'https://placehold.co/600x440/3b5a27/ccff44?text=Band+Slim+Pro+Side'
    ],
    rating: 4.3,
    reviews: 1234,
    stock: 100,
    description: 'Upgraded Slim with built-in GPS, larger AMOLED display, always-on mode, and 14-day battery. All the fitness tracking you need without the bulk.',
    warranty: '1 Year',
    specs: { Display: '1.47" AMOLED Always-On', Health: 'Heart Rate, Steps, Sleep, SpO2, Stress', GPS: 'Built-in GPS', Battery: '14 days typical', 'Water Resistance': '5 ATM', Connectivity: 'Bluetooth 5.2', Weight: '24 g' },
    reviewList: [
      { author: 'Nick P.', rating: 4, date: '2025-01-22', text: 'Built-in GPS is the big upgrade. Great for runners on a budget.' }
    ]
  },
  {
    id: 58,
    name: 'HealthRing Smart Ring V2',
    category: 'Wearables',
    brand: 'HealthRing',
    model: 'V2',
    sku: 'HR-V2-BLK',
    price: 299.99,
    originalPrice: 349.99,
    image: 'https://placehold.co/300x220/1a1a1a/cccccc?text=Smart+Ring+V2',
    images: [
      'https://placehold.co/600x440/1a1a1a/cccccc?text=Ring+V2+Top',
      'https://placehold.co/600x440/2a2a2a/cccccc?text=Ring+V2+Inside'
    ],
    rating: 4.5,
    reviews: 189,
    stock: 22,
    description: 'Discreet health tracking in a titanium ring. Heart rate, HRV, sleep stages, temperature, and SpO2 with 7-day battery. No screen, no distractions.',
    warranty: '1 Year',
    specs: { Material: 'Titanium Grade 5', Health: 'Heart Rate, HRV, Sleep, SpO2, Temperature', Battery: '7 days', 'Water Resistance': '100m', Weight: '4-6 g (varies by size)', Sizes: 'US 6-13' },
    reviewList: [
      { author: 'Olivia Q.', rating: 5, date: '2025-02-10', text: 'Love wearing this instead of a watch. Sleep tracking is incredibly accurate.' }
    ]
  },
  {
    id: 59,
    name: 'HealthRing Smart Ring V2 Titan',
    category: 'Wearables',
    brand: 'HealthRing',
    model: 'V2 Titan',
    sku: 'HR-V2T-GLD',
    price: 449.99,
    originalPrice: 549.99,
    image: 'https://placehold.co/300x220/2d1810/ffcc00?text=Smart+Ring+V2+Titan',
    images: [
      'https://placehold.co/600x440/2d1810/ffcc00?text=Ring+V2+Titan+Top',
      'https://placehold.co/600x440/3d2820/ffcc00?text=Ring+V2+Titan+Inside'
    ],
    rating: 4.7,
    reviews: 87,
    stock: 15,
    description: 'Premium edition with gold PVD titanium coating, sapphire sensing window, 10-day battery, and blood oxygen continuous monitoring during sleep.',
    warranty: '2 Years',
    specs: { Material: 'Titanium Grade 5 with Gold PVD', Health: 'Heart Rate, HRV, Sleep, SpO2 (continuous), Temperature, Blood Pressure (est.)', Battery: '10 days', 'Water Resistance': '100m', 'Sensing Window': 'Sapphire crystal', Sizes: 'US 6-13' },
    reviewList: [
      { author: 'Paul R.', rating: 5, date: '2025-02-20', text: 'Gorgeous gold finish. Feels like jewelry, works like a lab.' }
    ]
  },

  // ── Networking (7 more) ─────────────────────────────────────────────────
  {
    id: 60,
    name: 'MeshNet Wi-Fi 6E Router Pro',
    category: 'Networking',
    brand: 'MeshNet',
    model: 'AX11000 Pro',
    sku: 'MN-AX11KP-WHT',
    price: 349.99,
    originalPrice: 429.99,
    image: 'https://placehold.co/300x220/f8fafc/1e293b?text=WiFi+Router+Pro',
    images: [
      'https://placehold.co/600x440/f8fafc/1e293b?text=Router+Pro+Front',
      'https://placehold.co/600x440/f1f5f9/334155?text=Router+Pro+Ports'
    ],
    rating: 4.8,
    reviews: 198,
    stock: 14,
    description: 'Tri-band AX11000 powerhouse with a 10G WAN port, built-in VPN server, advanced QoS, and coverage for up to 5000 sq ft. Designed for smart homes with 100+ devices.',
    warranty: '3 Years',
    specs: { Standard: 'Wi-Fi 6E (802.11ax)', Speed: '11000 Mbps tri-band', Band: '2.4 GHz + 5 GHz + 6 GHz', Ports: '1× 10G WAN, 4× 2.5G LAN, 2× USB 3.0', Security: 'WPA3, VPN server, AI threat detection', Coverage: 'Up to 5000 sq ft' },
    reviewList: [
      { author: 'Quinn S.', rating: 5, date: '2025-02-05', text: '10G WAN port future-proofs this router. Handles 80+ devices without breaking a sweat.' }
    ]
  },
  {
    id: 61,
    name: 'MeshNet Wi-Fi 6E Router Lite',
    category: 'Networking',
    brand: 'MeshNet',
    model: 'AX3000 Lite',
    sku: 'MN-AX3KL-WHT',
    price: 89.99,
    originalPrice: 119.99,
    image: 'https://placehold.co/300x220/f8fafc/4a5568?text=WiFi+Router+Lite',
    images: [
      'https://placehold.co/600x440/f8fafc/4a5568?text=Router+Lite+Front',
      'https://placehold.co/600x440/f1f5f9/4a5568?text=Router+Lite+Ports'
    ],
    rating: 4.2,
    reviews: 756,
    stock: 45,
    description: 'Affordable Wi-Fi 6 for apartments and small homes. Dual-band AX3000, easy app setup, parental controls, and guest network support.',
    warranty: '2 Years',
    specs: { Standard: 'Wi-Fi 6 (802.11ax)', Speed: '3000 Mbps dual-band', Band: '2.4 GHz + 5 GHz', Ports: '1× Gigabit WAN, 4× Gigabit LAN', Security: 'WPA3, parental controls', Coverage: 'Up to 1500 sq ft' },
    reviewList: [
      { author: 'Rachel T.', rating: 4, date: '2025-01-12', text: 'Perfect for my apartment. Easy setup and reliable coverage.' }
    ]
  },
  {
    id: 62,
    name: 'MeshNet Wi-Fi 6 Router',
    category: 'Networking',
    brand: 'MeshNet',
    model: 'AX5400',
    sku: 'MN-AX5400-WHT',
    price: 149.99,
    originalPrice: 189.99,
    image: 'https://placehold.co/300x220/f8fafc/2d3748?text=WiFi+6+Router',
    images: [
      'https://placehold.co/600x440/f8fafc/2d3748?text=WiFi+6+Front',
      'https://placehold.co/600x440/f1f5f9/2d3748?text=WiFi+6+Ports'
    ],
    rating: 4.4,
    reviews: 534,
    stock: 30,
    description: 'Reliable dual-band Wi-Fi 6 with AX5400 speeds, MU-MIMO, OFDMA, and mesh-expandable. A solid upgrade from older routers without breaking the bank.',
    warranty: '2 Years',
    specs: { Standard: 'Wi-Fi 6 (802.11ax)', Speed: '5400 Mbps dual-band', Band: '2.4 GHz + 5 GHz', Ports: '1× 2.5G WAN, 4× Gigabit LAN, 1× USB 3.0', Security: 'WPA3, automatic updates', Coverage: 'Up to 2500 sq ft' },
    reviewList: [
      { author: 'Steve U.', rating: 4, date: '2025-01-18', text: 'Solid router. Noticeable speed improvement over my old AC router.' }
    ]
  },
  {
    id: 63,
    name: 'SignalMax Range Extender AX',
    category: 'Networking',
    brand: 'SignalMax',
    model: 'RE-AX1800',
    sku: 'SM-REAX18-WHT',
    price: 59.99,
    originalPrice: 79.99,
    image: 'https://placehold.co/300x220/e8eaf6/283593?text=Range+Extender+AX',
    images: [
      'https://placehold.co/600x440/e8eaf6/283593?text=Extender+AX+Front',
      'https://placehold.co/600x440/c5cae9/283593?text=Extender+AX+Side'
    ],
    rating: 4.1,
    reviews: 1123,
    stock: 75,
    description: 'Eliminate Wi-Fi dead zones with this plug-in range extender. Wi-Fi 6, AX1800 speeds, mesh compatible, and a Gigabit Ethernet port for wired devices.',
    warranty: '1 Year',
    specs: { Standard: 'Wi-Fi 6 (802.11ax)', Speed: '1800 Mbps dual-band', Port: '1× Gigabit Ethernet', 'Signal LED': 'Yes (optimal placement)', Setup: 'WPS or app-based', Weight: '195 g' },
    reviewList: [
      { author: 'Tina V.', rating: 4, date: '2025-01-25', text: 'Fixed the dead zone in my bedroom. Setup was straightforward.' }
    ]
  },
  {
    id: 64,
    name: 'SignalMax Range Extender AX Pro',
    category: 'Networking',
    brand: 'SignalMax',
    model: 'RE-AX3000 Pro',
    sku: 'SM-REAX3KP-WHT',
    price: 99.99,
    originalPrice: 129.99,
    image: 'https://placehold.co/300x220/e8eaf6/1a237e?text=Range+Extender+AX+Pro',
    images: [
      'https://placehold.co/600x440/e8eaf6/1a237e?text=Extender+AX+Pro+Front',
      'https://placehold.co/600x440/c5cae9/1a237e?text=Extender+AX+Pro+Side'
    ],
    rating: 4.4,
    reviews: 567,
    stock: 40,
    description: 'Dual-band AX3000 range extender with external antennas, 2.5G Ethernet port, seamless roaming, and dedicated backhaul band for maximum throughput.',
    warranty: '2 Years',
    specs: { Standard: 'Wi-Fi 6 (802.11ax)', Speed: '3000 Mbps dual-band', Ports: '1× 2.5G Ethernet, 1× Gigabit Ethernet', Backhaul: 'Dedicated 5 GHz band', 'External Antennas': '4×', Weight: '380 g' },
    reviewList: [
      { author: 'Ulysses W.', rating: 4, date: '2025-02-08', text: 'External antennas make a big difference. Coverage is significantly better than the standard model.' }
    ]
  },
  {
    id: 65,
    name: 'NetGuard Smart Switch 8-Port',
    category: 'Networking',
    brand: 'NetGuard',
    model: 'GS-308',
    sku: 'NG-GS308-BLK',
    price: 34.99,
    originalPrice: 44.99,
    image: 'https://placehold.co/300x220/263238/4dd0e1?text=Smart+Switch+8-Port',
    images: [
      'https://placehold.co/600x440/263238/4dd0e1?text=Switch+8+Front',
      'https://placehold.co/600x440/37474f/4dd0e1?text=Switch+8+Back'
    ],
    rating: 4.3,
    reviews: 1567,
    stock: 100,
    description: 'Compact 8-port Gigabit Ethernet smart managed switch with VLAN, QoS, IGMP snooping, and a fanless metal design. Perfect for home offices.',
    warranty: '5 Years',
    specs: { Ports: '8× Gigabit Ethernet', 'Switching Capacity': '16 Gbps', Management: 'Web-based smart managed', Features: 'VLAN, QoS, IGMP snooping, port mirroring', 'Form Factor': 'Desktop, fanless metal', Power: '4.4W max' },
    reviewList: [
      { author: 'Victor X.', rating: 4, date: '2025-01-10', text: 'Silent, reliable, and feature-rich for the price.' }
    ]
  },
  {
    id: 66,
    name: 'NetGuard Smart Switch 8-Port PoE',
    category: 'Networking',
    brand: 'NetGuard',
    model: 'GS-308PP',
    sku: 'NG-GS308PP-BLK',
    price: 89.99,
    originalPrice: 109.99,
    image: 'https://placehold.co/300x220/263238/ffab40?text=Smart+Switch+PoE',
    images: [
      'https://placehold.co/600x440/263238/ffab40?text=Switch+PoE+Front',
      'https://placehold.co/600x440/37474f/ffab40?text=Switch+PoE+Back'
    ],
    rating: 4.5,
    reviews: 876,
    stock: 55,
    description: 'Same smart managed features plus PoE+ on all 8 ports (123W total budget). Power IP cameras, access points, and VoIP phones without separate power supplies.',
    warranty: '5 Years',
    specs: { Ports: '8× Gigabit Ethernet PoE+ (802.3af/at)', 'PoE Budget': '123W total', 'Switching Capacity': '16 Gbps', Management: 'Web-based smart managed', Features: 'VLAN, QoS, IGMP snooping, PoE scheduling', Power: '150W max' },
    reviewList: [
      { author: 'Wendy Y.', rating: 5, date: '2025-02-16', text: 'Powers all my IP cameras and AP. VLAN support is icing on the cake.' }
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
  return dbGetUser(sess.email);
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

const PRODUCTS_PER_PAGE = 12;

// ── Home / product listing ────────────────────────────────────────────────────
router.get('/', function(req, res) {
  const storeUser = getUser(req);
  const cat = req.query.cat || '';
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const allProducts = cat ? PRODUCTS.filter(p => p.category === cat) : PRODUCTS;
  const totalProducts = allProducts.length;
  const totalPages = Math.max(1, Math.ceil(totalProducts / PRODUCTS_PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * PRODUCTS_PER_PAGE;
  const products = allProducts.slice(start, start + PRODUCTS_PER_PAGE);
  storeRender(res, 'home', {
    storeUser, products, activeCategory: cat, title: 'RCV Academy eStore',
    currentPage, totalPages, totalProducts
  });
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
  if (dbHasUser(normalEmail)) {
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
  dbSaveUser(user);

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
  const user = dbGetUser(normalEmail);

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
  dbSaveUser(user);
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
  dbSaveUser(user);
  res.redirect('/store/cart');
});

// ── Cart: remove ──────────────────────────────────────────────────────────────
router.post('/cart/remove', requireAuth, function(req, res) {
  const user = req.storeUser;
  const productId = parseInt(req.body.productId, 10);
  user.cart = user.cart.filter(i => i.productId !== productId);
  dbSaveUser(user);
  res.redirect('/store/cart');
});

// ── Cart: clear ───────────────────────────────────────────────────────────────
router.post('/cart/clear', requireAuth, function(req, res) {
  req.storeUser.cart = [];
  req.storeUser.appliedPromo = null;
  dbSaveUser(req.storeUser);
  res.redirect('/store/cart');
});

// ── Cart: apply promo ─────────────────────────────────────────────────────────
router.post('/cart/promo', requireAuth, function(req, res) {
  const user  = req.storeUser;
  const code  = (req.body.promoCode || '').trim().toUpperCase();
  if (PROMO_CODES[code]) {
    user.appliedPromo = code;
    dbSaveUser(user);
    return res.redirect('/store/cart?promo=Promo+code+applied!');
  }
  user.appliedPromo = null;
  dbSaveUser(user);
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
  dbSaveUser(user);

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
    dbSaveUser(user);
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
  dbSaveUser(user);
  res.redirect(safeRedirect(req.body.redirect, '/store/wishlist'));
});

// ── Wishlist: clear ───────────────────────────────────────────────────────────
router.post('/wishlist/clear', requireAuth, function(req, res) {
  req.storeUser.wishlist = [];
  dbSaveUser(req.storeUser);
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
    dbSaveUser(user);
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
    dbSaveUser(user);
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
    dbSaveUser(user);
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
    dbSaveUser(user);
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
