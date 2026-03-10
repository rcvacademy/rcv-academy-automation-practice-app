/**
 * Software Testing Mentor & RCV Academy Automation Practice Website
 * A beginner-friendly Node.js/Express app for practicing UI automation locators.
 * Run: npm install && npm start
 * Then visit: http://localhost:3000
 */

const express = require('express');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const ejsLayouts = require('express-ejs-layouts');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;
const GA_MEASUREMENT_ID = process.env.GA_MEASUREMENT_ID || '';

// ─── Load sponsor banners from JSON config ────────────────────────────────────
let sponsors = { diamond: [], platinum: [], gold: [], silver: [] };
try {
  const raw = fs.readFileSync(path.join(__dirname, 'public', 'files', 'sponsors.json'), 'utf8');
  const parsed = JSON.parse(raw);
  sponsors.diamond  = Array.isArray(parsed.diamond)  ? parsed.diamond  : [];
  sponsors.platinum = Array.isArray(parsed.platinum) ? parsed.platinum : [];
  sponsors.gold     = Array.isArray(parsed.gold)     ? parsed.gold     : [];
  sponsors.silver   = Array.isArray(parsed.silver)   ? parsed.silver   : [];
} catch (_) { /* sponsors.json missing or invalid – banners simply won't show */ }

// ─── Multer (file upload) configuration ───────────────────────────────────────
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// Auto-cleanup: keep at most 100 files, delete oldest when limit is reached
function pruneUploads() {
  fs.readdir(uploadDir, (err, names) => {
    if (err || names.length <= 100) return;
    const files = names.map(n => {
      const full = path.join(uploadDir, n);
      try { return { path: full, mtime: fs.statSync(full).mtimeMs }; }
      catch (_) { return null; }
    }).filter(Boolean);
    files.sort((a, b) => a.mtime - b.mtime);           // oldest first
    const toDelete = files.slice(0, files.length - 100);
    toDelete.forEach(f => fs.unlink(f.path, () => {}));
  });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename:    (req, file, cb) => {
    // Sanitise: strip directory components and non-safe characters
    const safe = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, Date.now() + '-' + safe);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 },   // 100 KB max
  fileFilter: (req, file, cb) => {
    const allowed = /\.(jpe?g|png|gif|bmp|webp|pdf|docx?|xlsx?|pptx?|txt|csv)$/i;
    if (!allowed.test(file.originalname)) {
      return cb(new Error('File type not allowed. Only images and documents are accepted.'), false);
    }
    cb(null, true);
  }
});

// ─── Middleware ────────────────────────────────────────────────────────────────
app.disable('x-powered-by');      // hide Express fingerprint
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' https://code.jquery.com https://www.googletagmanager.com; " +
    "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://fonts.googleapis.com https://code.jquery.com; " +
    "font-src 'self' https://cdnjs.cloudflare.com https://fonts.gstatic.com; " +
    "img-src 'self' https://placehold.co data:; " +
    "connect-src 'self' https://www.google-analytics.com https://www.googletagmanager.com; " +
    "frame-src 'self'; " +
    "frame-ancestors 'self'; " +
    "form-action 'self'; " +
    "object-src 'none'; " +
    "base-uri 'self';"
  );
  next();
});
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(ejsLayouts);              // wraps every view in views/layout.ejs
app.set('layout', 'layout');      // use layout.ejs as the default wrapper
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

// ─── CSRF Protection (double-submit cookie) ──────────────────────────────────
// Routes that use multer (multipart) must check CSRF after parsing; all others checked here.
const MULTIPART_CSRF_EXEMPT = new Set(['/file-upload', '/file-upload-multi']);
app.use((req, res, next) => {
  if (!req.cookies._csrf) {
    const token = crypto.randomBytes(24).toString('hex');
    res.cookie('_csrf', token, { sameSite: 'Strict', secure: process.env.NODE_ENV === 'production', maxAge: 24 * 60 * 60 * 1000 });
    req.cookies._csrf = token;
  }
  res.locals.csrfToken = req.cookies._csrf;
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    const ct = req.headers['content-type'] || '';
    const isMultipart = ct.startsWith('multipart/');
    // Only skip CSRF for known file-upload routes (they check after multer)
    if (isMultipart && MULTIPART_CSRF_EXEMPT.has(req.path)) {
      return next();
    }
    if (!req.body._csrf || req.body._csrf !== req.cookies._csrf) {
      return res.status(403).send('Forbidden – invalid CSRF token.');
    }
  }
  next();
});

// ─── Rate limiting ────────────────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, max: 100,
  message: 'Too many requests. Please slow down and try again shortly.',
  standardHeaders: true, legacyHeaders: false
});
app.use(globalLimiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10,
  message: 'Too many attempts. Please try again later.',
  standardHeaders: true, legacyHeaders: false
});

// ─── RCV Academy eStore ────────────────────────────────────────────────────────────────
const storeRouter = require('./routes/store');
app.use('/store', storeRouter);

// ─── Navigation menu items (used in layout) ───────────────────────────────────
// Each item: { label, href, icon }
const menuItems = [
  { label: 'Home',                   href: '/',                    icon: 'fa-home' },
  { label: 'RCV Academy eStore',     href: '/store',               icon: 'fa-store' },
  { label: 'Login Page',             href: '/login',               icon: 'fa-sign-in-alt' },
  { label: 'Register Page',          href: '/register',            icon: 'fa-user-plus' },
  { label: 'Dynamic Table',          href: '/dynamic-table',       icon: 'fa-table' },
  { label: 'Pagination Table',       href: '/pagination-table',    icon: 'fa-list-ol' },
  { label: 'Radio Buttons',          href: '/radio-buttons',       icon: 'fa-dot-circle' },
  { label: 'Checkboxes',             href: '/checkboxes',          icon: 'fa-check-square' },
  { label: 'Drag and Drop',          href: '/drag-drop',           icon: 'fa-arrows-alt' },
  { label: 'Form Validation',        href: '/form-validation',     icon: 'fa-check-circle' },
  { label: 'File Upload',            href: '/file-upload',         icon: 'fa-upload' },
  { label: 'File Downloader',        href: '/file-download',       icon: 'fa-download' },
  { label: 'Autocomplete',           href: '/autocomplete',        icon: 'fa-search' },
  { label: 'Notification Message',   href: '/notifications',       icon: 'fa-bell' },
  { label: 'Challenging DOM',        href: '/challenging-dom',     icon: 'fa-puzzle-piece' },
  { label: 'Shadow DOM',             href: '/shadow-dom',          icon: 'fa-ghost' },
  { label: 'JS Alert',               href: '/js-alert',            icon: 'fa-exclamation-triangle' },
  { label: 'JS Confirm',             href: '/js-confirm',          icon: 'fa-question-circle' },
  { label: 'JS Prompt',              href: '/js-prompt',           icon: 'fa-comment-dots' },
  { label: 'jQuery UI Menu',         href: '/jquery-menu',         icon: 'fa-bars' },
  { label: 'Redirect Link',          href: '/redirect-link',       icon: 'fa-external-link-alt' },
  { label: 'Context Menu',           href: '/context-menu',        icon: 'fa-mouse-pointer' },
  { label: 'Horizontal Slider',      href: '/horizontal-slider',   icon: 'fa-sliders-h' },
  { label: 'Mouse Hover',            href: '/mouse-hover',         icon: 'fa-hand-pointer' },
  { label: 'IFrame',                 href: '/iframe',              icon: 'fa-window-restore' },
  { label: 'Tooltips',               href: '/tooltips',            icon: 'fa-info-circle' },
  { label: 'Multiple Windows',       href: '/multiple-windows',    icon: 'fa-clone' },
  { label: 'Data Table',             href: '/data-table',          icon: 'fa-database' },
  { label: 'Sortable Tables',        href: '/sortable-table',      icon: 'fa-sort' },
  { label: 'Contact Us',             href: '/contact-us',          icon: 'fa-envelope' },
  { label: 'Exit Intent',            href: '/exit-intent',         icon: 'fa-sign-out-alt' },
  { label: 'Scrollbars',             href: '/scrollbars',          icon: 'fa-scroll' },
  { label: 'Calendar',               href: '/calendar',            icon: 'fa-calendar-alt' },
  { label: 'Multi-Login Sections',    href: '/multi-login',         icon: 'fa-layer-group' },
];

// Make menuItems available to all views (including the store router)
app.locals.menuItems = menuItems;

// Make GA ID and sponsors available to all views
app.locals.gaId = GA_MEASUREMENT_ID;
app.locals.sponsors = sponsors;

// Helper: render a view with common locals
function render(res, view, extras = {}) {
  res.render(view, { menuItems, activePage: view, ...extras });
}

// ─── Routes ───────────────────────────────────────────────────────────────────

app.get('/',                 (req, res) => render(res, 'index'));
app.get('/terms',            (req, res) => render(res, 'terms'));
app.get('/privacy-policy',   (req, res) => render(res, 'privacy-policy'));
app.get('/login',            (req, res) => render(res, 'login'));
app.get('/register',         (req, res) => render(res, 'register'));
app.get('/dynamic-table',    (req, res) => render(res, 'dynamic-table'));
app.get('/pagination-table', (req, res) => render(res, 'pagination-table'));
app.get('/radio-buttons',    (req, res) => render(res, 'radio-buttons'));
app.get('/checkboxes',       (req, res) => render(res, 'checkboxes'));
app.get('/drag-drop',        (req, res) => render(res, 'drag-drop'));
app.get('/form-validation',  (req, res) => render(res, 'form-validation'));
app.get('/file-upload',      (req, res) => render(res, 'file-upload'));
app.get('/file-download',    (req, res) => render(res, 'file-download'));
app.get('/autocomplete',     (req, res) => render(res, 'autocomplete'));
app.get('/notifications',    (req, res) => render(res, 'notifications'));
app.get('/challenging-dom',  (req, res) => render(res, 'challenging-dom'));
app.get('/shadow-dom',       (req, res) => render(res, 'shadow-dom'));
app.get('/js-alert',         (req, res) => render(res, 'js-alert'));
app.get('/js-confirm',       (req, res) => render(res, 'js-confirm'));
app.get('/js-prompt',        (req, res) => render(res, 'js-prompt'));
app.get('/jquery-menu',      (req, res) => render(res, 'jquery-menu'));
app.get('/redirect-link',    (req, res) => render(res, 'redirect-link'));
app.get('/context-menu',     (req, res) => render(res, 'context-menu'));
app.get('/horizontal-slider',(req, res) => render(res, 'horizontal-slider'));
app.get('/mouse-hover',      (req, res) => render(res, 'mouse-hover'));
app.get('/iframe',           (req, res) => render(res, 'iframe'));
app.get('/tooltips',         (req, res) => render(res, 'tooltips'));
app.get('/multiple-windows', (req, res) => render(res, 'multiple-windows'));
app.get('/data-table',       (req, res) => render(res, 'data-table'));
app.get('/sortable-table',   (req, res) => render(res, 'sortable-table'));
app.get('/contact-us',       (req, res) => render(res, 'contact-us'));
app.get('/exit-intent',      (req, res) => render(res, 'exit-intent'));
app.get('/scrollbars',       (req, res) => render(res, 'scrollbars'));
app.get('/calendar',         (req, res) => render(res, 'calendar'));
app.get('/multi-login',      (req, res) => render(res, 'multi-login'));

// POST: login (demo – always succeeds so testers can practice the flow)
app.post('/login', authLimiter, (req, res) => {
  const { username, password } = req.body;
  render(res, 'login', {
    message: username === 'admin' && password === 'password'
      ? { type: 'success', text: 'Login successful! Welcome, ' + username }
      : { type: 'error',   text: 'Invalid credentials. Try admin / password.' }
  });
});

// POST: register
app.post('/register', (req, res) => {
  render(res, 'register', { message: { type: 'success', text: 'Registration successful!' } });
});

// POST: form validation
app.post('/form-validation', (req, res) => {
  render(res, 'form-validation', { submitted: true, data: req.body });
});

// POST: file upload (single)
app.post('/file-upload', (req, res, next) => {
  upload.single('uploadFile')(req, res, (err) => {
    if (err) {
      return render(res, 'file-upload', {
        uploadError: err.code === 'LIMIT_FILE_SIZE'
          ? 'File is too large. Maximum allowed size is 100 KB.'
          : err.message || 'Upload failed. Please try a different file.'
      });
    }
    // CSRF check after multer parses the multipart body
    if (!req.body._csrf || req.body._csrf !== req.cookies._csrf) {
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(403).send('Forbidden \u2013 invalid CSRF token.');
    }
    if (req.file) pruneUploads();
    render(res, 'file-upload', {
      uploadedFile: req.file ? req.file.originalname : null
    });
  });
});

// POST: file upload (multiple)
app.post('/file-upload-multi', (req, res, next) => {
  upload.array('files', 10)(req, res, (err) => {
    if (err) {
      return render(res, 'file-upload', {
        uploadError: err.code === 'LIMIT_FILE_SIZE'
          ? 'One or more files are too large. Maximum allowed size is 100 KB each.'
          : err.code === 'LIMIT_UNEXPECTED_FILE'
          ? 'Too many files. Maximum 10 files allowed at once.'
          : err.message || 'Upload failed. Please try different files.'
      });
    }
    // CSRF check after multer parses the multipart body
    if (!req.body._csrf || req.body._csrf !== req.cookies._csrf) {
      if (req.files) req.files.forEach(f => fs.unlink(f.path, () => {}));
      return res.status(403).send('Forbidden \u2013 invalid CSRF token.');
    }
    if (req.files && req.files.length) pruneUploads();
    render(res, 'file-upload', {
      uploadedFiles: req.files ? req.files.map(f => f.originalname) : []
    });
  });
});

// POST: contact us
app.post('/contact-us', (req, res) => {
  render(res, 'contact-us', { message: { type: 'success', text: 'Thank you! Your message has been sent.' } });
});

// GET: redirect target
app.get('/redirected', (req, res) => {
  render(res, 'redirected');
});

// GET: new window target page (standalone – no shared layout)
app.get('/new-window', (req, res) => {
  res.render('new-window', { layout: false });
});

// GET: iframe inner page (standalone – no shared layout, passes ?frame= query param)
app.get('/iframe-inner', (req, res) => {
  res.render('iframe-inner', { layout: false, query: req.query });
});

// ─── 404 catch-all ────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).send(
    '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>404 – Page Not Found</title>' +
    '<style>body{font-family:Inter,system-ui,sans-serif;display:flex;justify-content:center;align-items:center;' +
    'min-height:100vh;margin:0;background:#f5f7fa;color:#333;text-align:center;}' +
    '.box{max-width:440px;padding:40px;}.code{font-size:72px;font-weight:700;color:#64748b;margin:0;}' +
    'p{color:#555;margin:12px 0 24px;}a{color:#2563eb;text-decoration:none;font-weight:500;}' +
    'a:hover{text-decoration:underline;}</style></head>' +
    '<body><div class="box"><p class="code">404</p><h2>Page Not Found</h2>' +
    '<p>The page you requested does not exist.</p>' +
    '<a href="/">← Back to Home</a></div></body></html>'
  );
});

// ─── Global error handler ─────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).send(
    '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>500 – Server Error</title>' +
    '<style>body{font-family:Inter,system-ui,sans-serif;display:flex;justify-content:center;align-items:center;' +
    'min-height:100vh;margin:0;background:#f5f7fa;color:#333;text-align:center;}' +
    '.box{max-width:440px;padding:40px;}.code{font-size:72px;font-weight:700;color:#ef4444;margin:0;}' +
    'p{color:#555;margin:12px 0 24px;}a{color:#2563eb;text-decoration:none;font-weight:500;}' +
    'a:hover{text-decoration:underline;}</style></head>' +
    '<body><div class="box"><p class="code">500</p><h2>Something Went Wrong</h2>' +
    '<p>An unexpected error occurred. Please try again later.</p>' +
    '<a href="/">← Back to Home</a></div></body></html>'
  );
});

// ─── Start server ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n✅  Software Testing Mentor & RCV Academy Automation Practice Website is running!`);
  console.log(`   Open: http://localhost:${PORT}\n`);
});
