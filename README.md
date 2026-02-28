# Software Testing Mentor & RCV Academy Automation Practice Website

A beginner-friendly Node.js web application with **32 interactive pages** for practicing every type of web element locator used in automated testing (Selenium, Playwright, Cypress, etc.).

---

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/your-username/stm-rcv-automation-practice.git

# 2. Enter the project directory
cd stm-rcv-automation-practice

# 3. Install dependencies
npm install

# 4. Start the server
npm start

# 5. Open the app in your browser
#    http://localhost:3000
```

For auto-reload during development:

```bash
npm run dev
```

---

## Project Structure

```
stm-rcv-automation-practice/
├── .gitignore
├── server.js               # Express server — all routes & middleware
├── package.json
├── views/
│   ├── layout.ejs          # Shared layout (sidebar, topbar, footer)
│   ├── index.ejs           # Home page (feature grid)
│   ├── login.ejs
│   ├── register.ejs
│   ├── dynamic-table.ejs
│   ├── pagination-table.ejs
│   ├── data-table.ejs
│   ├── sortable-table.ejs
│   ├── radio-buttons.ejs
│   ├── checkboxes.ejs
│   ├── drag-drop.ejs
│   ├── form-validation.ejs
│   ├── file-upload.ejs
│   ├── file-download.ejs
│   ├── autocomplete.ejs
│   ├── notifications.ejs
│   ├── challenging-dom.ejs
│   ├── shadow-dom.ejs
│   ├── js-alert.ejs
│   ├── js-confirm.ejs
│   ├── js-prompt.ejs
│   ├── jquery-menu.ejs
│   ├── redirect-link.ejs
│   ├── context-menu.ejs
│   ├── horizontal-slider.ejs
│   ├── mouse-hover.ejs
│   ├── iframe.ejs
│   ├── tooltips.ejs
│   ├── multiple-windows.ejs
│   ├── contact-us.ejs
│   ├── exit-intent.ejs
│   ├── scrollbars.ejs
│   ├── calendar.ejs
│   ├── redirected.ejs      # Redirect landing page
│   ├── new-window.ejs      # Standalone new-window page
│   └── iframe-inner.ejs    # Standalone iframe content page
├── public/
│   ├── css/style.css
│   ├── js/main.js          # All client-side interactivity
│   ├── files/              # Sample downloadable files
│   │   ├── stm-logo-720.png
│   │   ├── sample-report.pdf
│   │   ├── data-export.csv
│   │   ├── screenshot.png
│   │   ├── app-config.json
│   │   └── readme.txt
│   └── uploads/            # File upload destination (gitkeep'd)
```

---

## Pages & Locator Strategies

| # | Page | URL | Key Locator Strategies |
|---|------|-----|------------------------|
| 1 | Home | `/` | CSS Grid, data-testid |
| 2 | Login | `/login` | id, name, placeholder, role |
| 3 | Register | `/register` | id, name, class, select, radio |
| 4 | Dynamic Table | `/dynamic-table` | data-row-id, data-testid, class |
| 5 | Pagination Table | `/pagination-table` | aria-label, data-page, id |
| 6 | Data Table | `/data-table` | id, class, aria-label |
| 7 | Sortable Table | `/sortable-table` | data-sort-key, aria-sort |
| 8 | Radio Buttons | `/radio-buttons` | id, name, value, class |
| 9 | Checkboxes | `/checkboxes` | id, name, class, aria-label |
| 10 | Drag & Drop | `/drag-drop` | id, data-testid, class |
| 11 | Form Validation | `/form-validation` | id, is-valid/is-invalid CSS |
| 12 | File Upload | `/file-upload` | type=file, id, data-testid |
| 13 | File Download | `/file-download` | href, download attribute |
| 14 | Autocomplete | `/autocomplete` | role=option, data-testid |
| 15 | Notifications | `/notifications` | role=alert, aria-live, id |
| 16 | Challenging DOM | `/challenging-dom` | dynamic id, deep nesting |
| 17 | Shadow DOM | `/shadow-dom` | shadowRoot, mode=open |
| 18 | JS Alert | `/js-alert` | window.alert, driver.switchTo |
| 19 | JS Confirm | `/js-confirm` | window.confirm |
| 20 | JS Prompt | `/js-prompt` | window.prompt |
| 21 | jQuery Menu | `/jquery-menu` | class, role=menuitem |
| 22 | Redirect Link | `/redirect-link` | href, data-testid, id |
| 23 | Context Menu | `/context-menu` | contextmenu event, role=menu |
| 24 | Horizontal Slider | `/horizontal-slider` | type=range, id, aria-label |
| 25 | Mouse Hover | `/mouse-hover` | :hover, class, data-testid |
| 26 | iFrame | `/iframe` | iframe id, src, switchTo |
| 27 | Tooltips | `/tooltips` | title, data-tooltip, aria-describedby |
| 28 | Multiple Windows | `/multiple-windows` | window.open, target=_blank |
| 29 | Contact Us | `/contact-us` | id, name, class, role |
| 30 | Exit Intent | `/exit-intent` | mouseleave, role=dialog |
| 31 | Scrollbars | `/scrollbars` | scrollTop, data-item-index |
| 32 | Calendar | `/calendar` | input[type=date], jQuery UI |

---

## Locator Reference

| Strategy | Example |
|----------|---------|
| **ID** | `#login-btn`, `By.id("login-btn")` |
| **Name** | `[name="username"]`, `By.name("username")` |
| **Class** | `.btn-primary`, `By.className("btn-primary")` |
| **Tag** | `input`, `By.tagName("input")` |
| **CSS Selector** | `div.card > p.text-muted` |
| **XPath** | `//button[@data-testid="submit-btn"]` |
| **Link Text** | `By.linkText("Download CSV")` |
| **Role** | `getByRole('button', {name:'Submit'})` |
| **data-testid** | `[data-testid="login-btn"]` |
| **aria-label** | `[aria-label="Close modal"]` |
| **aria-describedby** | `[aria-describedby="tooltip-1"]` |
| **Placeholder** | `[placeholder="Enter email"]` |

---

## Technologies

- **Node.js** + **Express 4**
- **EJS** templates + **express-ejs-layouts**
- **jQuery 3.7** + **jQuery UI 1.13** (CDN)
- **Font Awesome 5** (CDN)
- **Multer** for file uploads

---

## License

MIT
