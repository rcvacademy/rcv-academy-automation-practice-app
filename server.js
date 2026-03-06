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

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Multer (file upload) configuration ───────────────────────────────────────
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

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
  limits: { fileSize: 5 * 1024 * 1024 }   // 5 MB max
});

// ─── Middleware ────────────────────────────────────────────────────────────────
app.disable('x-powered-by');      // hide Express fingerprint
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(ejsLayouts);              // wraps every view in views/layout.ejs
app.set('layout', 'layout');      // use layout.ejs as the default wrapper
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ─── Navigation menu items (used in layout) ───────────────────────────────────
// Each item: { label, href, icon }
const menuItems = [
  { label: 'Home',                   href: '/',                    icon: 'fa-home' },
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

// Helper: render a view with common locals
function render(res, view, extras = {}) {
  res.render(view, { menuItems, activePage: view, ...extras });
}

// ─── Routes ───────────────────────────────────────────────────────────────────

app.get('/',                 (req, res) => render(res, 'index'));
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
app.post('/login', (req, res) => {
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

// POST: file upload
app.post('/file-upload', upload.single('uploadFile'), (req, res) => {
  render(res, 'file-upload', {
    uploadedFile: req.file ? req.file.originalname : null
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

// ─── Start server ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n✅  Software Testing Mentor & RCV Academy Automation Practice Website is running!`);
  console.log(`   Open: http://localhost:${PORT}\n`);
});
