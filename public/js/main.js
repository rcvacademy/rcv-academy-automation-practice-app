/**
 * main.js — Software Testing Mentor & RCV Academy Automation Practice Website
 * Handles all client-side interactivity across every page.
 * Each section is guarded by checking for a page-specific element
 * so code only runs on the relevant page.
 */

/* ─── Sidebar / Mobile Menu ─────────────────────────────────────────────── */
(function initSidebar() {
  const sidebar      = document.getElementById('sidebar');
  const mobileBtn    = document.getElementById('mobile-menu-btn');
  const overlay      = document.getElementById('sidebar-overlay');
  const collapseBtn  = document.getElementById('sidebar-collapse-btn');

  if (mobileBtn && sidebar) {
    mobileBtn.addEventListener('click', () => {
      sidebar.classList.toggle('mobile-open');
      if (overlay) overlay.classList.toggle('show');
    });
  }
  if (overlay && sidebar) {
    overlay.addEventListener('click', () => {
      sidebar.classList.remove('mobile-open');
      overlay.classList.remove('show');
    });
  }
  if (collapseBtn && sidebar) {
    collapseBtn.addEventListener('click', () => {
      sidebar.classList.toggle('collapsed');
    });
  }
})();

/* ─── Dynamic Table ──────────────────────────────────────────────────────── */
(function initDynamicTable() {
  const seedEl = document.getElementById('table-seed-data');
  const tbody  = document.getElementById('dynamic-table-body');
  const addBtn = document.getElementById('add-row-btn');
  const clearBtn = document.getElementById('clear-table-btn');
  const searchInput = document.getElementById('table-search');
  const rowCountEl  = document.getElementById('row-count-badge');
  if (!tbody) return;

  /* Parse seed JSON embedded in the view */
  let rows = [];
  if (seedEl) {
    try { rows = JSON.parse(seedEl.textContent); } catch(e) {}
  }
  let nextId = rows.length + 1;

  /* Store the column keys from the original seed so new rows always get all fields */
  const columns = rows.length ? Object.keys(rows[0]) : ['id','name','department','salary','status'];

  function render(data) {
    tbody.innerHTML = '';
    data.forEach(r => {
      const tr = document.createElement('tr');
      tr.setAttribute('data-row-id', r.id);
      tr.setAttribute('data-testid', 'dynamic-row-' + r.id);
      const cells = columns.map(c => `<td>${r[c] !== undefined ? r[c] : ''}</td>`).join('');
      tr.innerHTML = cells +
        `<td>
           <button class="btn btn-sm btn-danger del-row-btn"
                   data-testid="delete-row-${r.id}"
                   data-row-id="${r.id}"
                   aria-label="Delete row ${r.id}">
             <i class="fas fa-trash"></i>
           </button>
         </td>`;
      tbody.appendChild(tr);
    });
    if (rowCountEl) rowCountEl.textContent = 'Rows: ' + data.length;
  }

  render(rows);

  /* Add row — always populate every column */
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      const names = ['Emily Rose','Ryan Park','Priya Nair','Omar Ali','Sara Müller',
                     'Liam Chen','Zoe Adams','Noah Singh','Mia Torres','Jake Kim'];
      const depts = ['Engineering','Marketing','HR','Finance','Sales','Design'];
      const statuses = ['Active','Inactive','On Leave'];
      const n  = names[Math.floor(Math.random() * names.length)];
      const newRow = {};
      columns.forEach(k => {
        if (k === 'id')          newRow[k] = nextId;
        else if (k === 'name')       newRow[k] = n;
        else if (k === 'department') newRow[k] = depts[Math.floor(Math.random() * depts.length)];
        else if (k === 'salary')     newRow[k] = '$' + (60 + Math.floor(Math.random() * 60)) + ',000';
        else if (k === 'status')     newRow[k] = statuses[Math.floor(Math.random() * statuses.length)];
        else if (k === 'email')      newRow[k] = n.toLowerCase().replace(' ', '.') + nextId + '@example.com';
        else if (k === 'role')       newRow[k] = ['Admin','Editor','Viewer'][nextId % 3];
        else newRow[k] = 'N/A';
      });
      rows.push(newRow);
      nextId++;
      render(rows);
    });
  }

  /* Clear all rows */
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      rows = [];
      render(rows);
    });
  }

  /* Delete row (delegated) */
  tbody.addEventListener('click', e => {
    const btn = e.target.closest('.del-row-btn');
    if (!btn) return;
    const id = Number(btn.getAttribute('data-row-id'));
    rows = rows.filter(r => r.id !== id);
    render(rows);
  });

  /* Search — filter across all visible columns */
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.toLowerCase();
      const filtered = rows.filter(r =>
        columns.some(k => String(r[k]).toLowerCase().includes(q))
      );
      render(filtered);
    });
  }
})();

/* ─── Pagination Table ────────────────────────────────────────────────────── */
(function initPaginationTable() {
  const seedEl   = document.getElementById('pagination-seed-data');
  const tbody    = document.getElementById('pag-table-body');
  const prevBtn  = document.getElementById('pag-prev');
  const nextBtn  = document.getElementById('pag-next');
  const pageSel  = document.getElementById('page-size-select');
  const pageInfo = document.getElementById('pag-info');
  const searchIn = document.getElementById('pag-search');
  const pageNums = document.getElementById('pag-page-numbers');
  if (!tbody) return;

  let allRows = [];
  if (seedEl) {
    try { allRows = JSON.parse(seedEl.textContent); } catch(e) {}
  }
  let currentPage = 1;
  let pageSize    = 5;
  let filteredRows = allRows;

  function render() {
    const start = (currentPage - 1) * pageSize;
    const slice = filteredRows.slice(start, start + pageSize);
    tbody.innerHTML = '';
    slice.forEach(r => {
      const tr = document.createElement('tr');
      tr.setAttribute('data-testid', 'pagination-row');
      tr.innerHTML = Object.values(r).map(v => `<td>${v}</td>`).join('');
      tbody.appendChild(tr);
    });
    const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
    const end = Math.min(start + pageSize, filteredRows.length);
    if (pageInfo) pageInfo.textContent = `Showing ${filteredRows.length ? start + 1 : 0}–${end} of ${filteredRows.length}`;
    if (prevBtn) prevBtn.disabled = currentPage <= 1;
    if (nextBtn) nextBtn.disabled = currentPage >= totalPages;

    /* render page-number buttons */
    if (pageNums) {
      pageNums.innerHTML = '';
      for (let p = 1; p <= totalPages; p++) {
        const btn = document.createElement('button');
        btn.className = 'page-btn pg-num-btn' + (p === currentPage ? ' active' : '');
        btn.dataset.page = p;
        btn.setAttribute('data-testid', 'pag-btn-' + p);
        btn.setAttribute('aria-label', 'Page ' + p);
        btn.textContent = p;
        pageNums.appendChild(btn);
      }
    }
  }

  if (pageSel) {
    pageSel.addEventListener('change', () => {
      pageSize = Number(pageSel.value);
      currentPage = 1;
      render();
    });
  }
  if (prevBtn) prevBtn.addEventListener('click', () => { currentPage--; render(); });
  if (nextBtn) nextBtn.addEventListener('click', () => { currentPage++; render(); });
  if (searchIn) {
    searchIn.addEventListener('input', () => {
      const q = searchIn.value.toLowerCase();
      filteredRows = allRows.filter(r => Object.values(r).some(v => String(v).toLowerCase().includes(q)));
      currentPage = 1;
      render();
    });
  }
  /* Delegate page-number button clicks */
  document.addEventListener('click', e => {
    const btn = e.target.closest('.pg-num-btn');
    if (!btn) return;
    currentPage = Number(btn.dataset.page);
    render();
  });

  render();
})();

/* ─── Data Table (employee table with dept filter) ───────────────────────── */
(function initDataTable() {
  const seedEl     = document.getElementById('employee-seed');
  const tbody      = document.getElementById('dt-tbody');
  const deptFilter = document.getElementById('dt-dept-filter');
  const exportBtn  = document.getElementById('dt-export-btn');
  const searchInput = document.getElementById('dt-search');
  if (!tbody) return;

  let allData = [];
  if (seedEl) {
    try { allData = JSON.parse(seedEl.textContent); } catch(e) {}
  }

  function render(data) {
    tbody.innerHTML = '';
    data.forEach((r, i) => {
      const tr = document.createElement('tr');
      tr.setAttribute('data-testid', 'data-row-' + (i + 1));
      tr.setAttribute('data-row-index', i + 1);
      tr.innerHTML = Object.values(r).map(v => `<td>${v}</td>`).join('');
      tbody.appendChild(tr);
    });
    const cnt = document.getElementById('dt-row-count');
    if (cnt) cnt.textContent = data.length + ' rows';
  }

  function filterData() {
    let filtered = allData;
    if (deptFilter && deptFilter.value) {
      filtered = filtered.filter(r => r.dept === deptFilter.value);
    }
    if (searchInput && searchInput.value.trim()) {
      const q = searchInput.value.toLowerCase();
      filtered = filtered.filter(r =>
        Object.values(r).some(v => String(v).toLowerCase().includes(q))
      );
    }
    render(filtered);
  }

  if (deptFilter) {
    deptFilter.addEventListener('change', filterData);
  }

  if (searchInput) {
    searchInput.addEventListener('input', filterData);
  }

  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const rows = Array.from(tbody.querySelectorAll('tr'));
      const headers = Array.from(document.querySelectorAll('#employee-data-table thead th'))
                           .map(th => th.textContent.trim()).join(',');
      const csv = headers + '\n' + rows.map(tr =>
        Array.from(tr.querySelectorAll('td')).map(td => '"' + td.textContent + '"').join(',')
      ).join('\n');
      const a   = document.createElement('a');
      a.href    = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
      a.download = 'export.csv';
      a.click();
    });
  }

  render(allData);
})();

/* ─── Sortable Table ─────────────────────────────────────────────────────── */
(function initSortableTable() {
  const seedEl = document.getElementById('products-seed');
  const tbody  = document.getElementById('sort-tbody');
  if (!tbody) return;

  let allData = [];
  if (seedEl) {
    try { allData = JSON.parse(seedEl.textContent); } catch(e) {}
  }
  let keys = allData.length ? Object.keys(allData[0]) : [];
  let sortKey   = 'id';
  let sortDir   = 'asc';
  let filteredData = [...allData];

  const searchInput  = document.getElementById('sort-search');
  const indicatorEl  = document.getElementById('sort-indicator');
  const resetBtn     = document.getElementById('reset-sort-btn');

  function updateIndicator() {
    if (indicatorEl) {
      const arrow = sortDir === 'asc' ? '↑' : '↓';
      const colName = sortKey ? sortKey.charAt(0).toUpperCase() + sortKey.slice(1) : 'ID';
      indicatorEl.textContent = 'Sorted by: ' + colName + ' ' + arrow;
    }
  }

  function render(data) {
    tbody.innerHTML = '';
    data.forEach((r, i) => {
      const tr = document.createElement('tr');
      tr.setAttribute('data-testid', 'sortable-row-' + (i + 1));
      tr.innerHTML = keys.map(k => {
        const val = r[k];
        if (k === 'instock') return `<td>${val ? '<span class="badge badge-success">Yes</span>' : '<span class="badge badge-danger">No</span>'}</td>`;
        if (k === 'price') return `<td>$${Number(val).toFixed(2)}</td>`;
        return `<td>${val}</td>`;
      }).join('');
      tbody.appendChild(tr);
    });
  }

  function sortData(data) {
    if (!sortKey) return data;
    return [...data].sort((a, b) => {
      let av = a[sortKey];
      let bv = b[sortKey];
      if (typeof av === 'boolean') { av = av ? 1 : 0; bv = bv ? 1 : 0; }
      if (typeof av === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === 'asc' ? (av - bv) : (bv - av);
    });
  }

  function applyFilterAndSort() {
    let data = allData;
    if (searchInput && searchInput.value.trim()) {
      const q = searchInput.value.toLowerCase();
      data = data.filter(r =>
        Object.values(r).some(v => String(v).toLowerCase().includes(q))
      );
    }
    filteredData = data;
    render(sortData(filteredData));
    updateIndicator();
  }

  /* Attach click listeners to sortable headers */
  document.querySelectorAll('[data-sort-col]').forEach(th => {
    th.style.cursor = 'pointer';
    th.addEventListener('click', () => {
      const k = th.getAttribute('data-sort-col');
      if (sortKey === k) {
        sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        sortKey = k;
        sortDir = 'asc';
      }

      /* Update header classes and icons */
      document.querySelectorAll('[data-sort-col]').forEach(h => {
        h.classList.remove('sort-asc', 'sort-desc');
        h.setAttribute('aria-sort', 'none');
        h.setAttribute('data-sort-dir', 'none');
        const icon = h.querySelector('.sort-icon');
        if (icon) { icon.className = 'fas fa-sort sort-icon'; }
      });
      th.classList.add(sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
      th.setAttribute('aria-sort', sortDir === 'asc' ? 'ascending' : 'descending');
      th.setAttribute('data-sort-dir', sortDir);
      const thIcon = th.querySelector('.sort-icon');
      if (thIcon) { thIcon.className = 'fas ' + (sortDir === 'asc' ? 'fa-sort-up' : 'fa-sort-down') + ' sort-icon'; }

      applyFilterAndSort();
    });
  });

  /* Search filter */
  if (searchInput) {
    searchInput.addEventListener('input', applyFilterAndSort);
  }

  /* Reset sort */
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      sortKey = 'id';
      sortDir = 'asc';
      if (searchInput) searchInput.value = '';
      document.querySelectorAll('[data-sort-col]').forEach(h => {
        h.classList.remove('sort-asc', 'sort-desc');
        h.setAttribute('aria-sort', 'none');
        h.setAttribute('data-sort-dir', 'none');
        const icon = h.querySelector('.sort-icon');
        if (icon) { icon.className = 'fas fa-sort sort-icon'; }
      });
      const idTh = document.querySelector('[data-sort-col="id"]');
      if (idTh) {
        idTh.classList.add('sort-asc');
        idTh.setAttribute('aria-sort', 'ascending');
        idTh.setAttribute('data-sort-dir', 'asc');
        const icon = idTh.querySelector('.sort-icon');
        if (icon) { icon.className = 'fas fa-sort-up sort-icon'; }
      }
      applyFilterAndSort();
    });
  }

  applyFilterAndSort();
})();

/* ─── Autocomplete ───────────────────────────────────────────────────────── */
(function initAutocomplete() {
  /* ─ Country autocomplete (vanilla) ──────────────────────── */
  const input    = document.getElementById('country-ac-input');
  const list     = document.getElementById('country-ac-list');
  const hidden   = document.getElementById('country-ac-value');
  const result   = document.getElementById('country-ac-result');
  if (!input || !list) return;

  const seedEl = document.getElementById('country-list');
  let countries = [];
  if (seedEl) { try { countries = JSON.parse(seedEl.textContent); } catch(e) {} }

  function closeList() {
    list.innerHTML = '';
    list.style.display = 'none';
    input.setAttribute('aria-expanded', 'false');
  }
  function selectCountry(c) {
    input.value = c;
    if (hidden)  hidden.value = c;
    if (result)  result.textContent = 'Selected: ' + c;
    closeList();
  }

  input.addEventListener('input', function () {
    const q = this.value.toLowerCase().trim();
    if (!q) { closeList(); return; }
    const matches = countries.filter(c => c.toLowerCase().startsWith(q)).slice(0, 8);
    if (!matches.length) { closeList(); return; }
    list.innerHTML = '';
    matches.forEach(c => {
      const li = document.createElement('li');
      li.textContent = c;
      li.setAttribute('data-testid', 'country-option');
      li.setAttribute('role', 'option');
      li.setAttribute('tabindex', '0');
      li.addEventListener('mousedown', e => { e.preventDefault(); selectCountry(c); });
      li.addEventListener('keydown',   e => { if (e.key === 'Enter') selectCountry(c); });
      list.appendChild(li);
    });
    list.style.display = 'block';
    input.setAttribute('aria-expanded', 'true');
  });

  input.addEventListener('blur', () => setTimeout(closeList, 150));
  document.addEventListener('click', e => {
    if (!input.contains(e.target) && !list.contains(e.target)) closeList();
  });

  /* ─ Technology autocomplete (jQuery UI) ───────────────── */
  const techInput  = document.getElementById('tech-ac-input');
  const techResult = document.getElementById('tech-ac-result');
  const techSeedEl = document.getElementById('tech-list');
  if (techInput && typeof $ !== 'undefined' && $.fn && $.fn.autocomplete) {
    let techList = [];
    if (techSeedEl) { try { techList = JSON.parse(techSeedEl.textContent); } catch(e) {} }
    $(techInput).autocomplete({
      source: techList,
      minLength: 1,
      select: function (evt, ui) {
        evt.preventDefault();
        techInput.value = ui.item.value;
        if (techResult) techResult.textContent = 'Selected: ' + ui.item.value;
      }
    });
    $(techInput).on('autocompleteopen', function () {
      $('.ui-autocomplete li').each(function (i) {
        $(this).attr('data-testid', 'tech-option-' + (i + 1));
      });
    });
  }
})();

/* ─── Tag Input ──────────────────────────────────────────────────────────── */
(function initTagInput() {
  const tagInput  = document.getElementById('tag-input');
  const tagList   = document.getElementById('tag-list');
  const tagHidden = document.getElementById('tags-hidden');
  const tagCount  = document.getElementById('tag-count');
  if (!tagInput) return;

  let tags = [];

  function render() {
    tagList.querySelectorAll('.tag-item').forEach(el => el.remove());
    tags.forEach((t, i) => {
      const span = document.createElement('span');
      span.className = 'tag-item';
      span.setAttribute('data-testid', 'tag-' + i);
      span.appendChild(document.createTextNode(t + ' '));
      var rmBtn = document.createElement('button');
      rmBtn.className = 'tag-rm';
      rmBtn.setAttribute('data-idx', i);
      rmBtn.setAttribute('aria-label', 'Remove ' + t);
      rmBtn.textContent = '\u00d7';
      span.appendChild(rmBtn);
      tagList.appendChild(span);
    });
    if (tagHidden) tagHidden.value = tags.join(',');
    if (tagCount)  tagCount.textContent = tags.length + ' tag' + (tags.length !== 1 ? 's' : '') + ' added';
  }

  tagInput.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ',') && tagInput.value.trim()) {
      e.preventDefault();
      tags.push(tagInput.value.trim());
      tagInput.value = '';
      render();
    }
    if (e.key === 'Backspace' && !tagInput.value && tags.length) {
      tags.pop();
      render();
    }
  });

  tagList.addEventListener('click', e => {
    const btn = e.target.closest('.tag-rm');
    if (!btn) return;
    tags.splice(Number(btn.dataset.idx), 1);
    render();
  });
})();

/* ─── Drag and Drop (Kanban Board) ──────────────────────────────────────── */
(function initDragDrop() {
  const board     = document.getElementById('drag-board');
  const statusEl  = document.getElementById('drag-status');
  const resetBtn  = document.getElementById('reset-drag-btn');
  if (!board) return;

  let dragging = null;

  /* Store original positions for reset */
  const original = {};
  board.querySelectorAll('.draggable-item').forEach(item => {
    original[item.id] = item.parentElement.id;
  });

  board.addEventListener('dragstart', e => {
    dragging = e.target.closest('.draggable-item');
    if (dragging) {
      dragging.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', dragging.id);
    }
  });

  board.addEventListener('dragend', () => {
    if (dragging) dragging.classList.remove('dragging');
    dragging = null;
    board.querySelectorAll('.drag-zone').forEach(c => c.classList.remove('drag-over'));
  });

  board.addEventListener('dragover', e => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const zone = e.target.closest('.drag-zone');
    board.querySelectorAll('.drag-zone').forEach(c => c.classList.remove('drag-over'));
    if (zone) zone.classList.add('drag-over');
  });

  board.addEventListener('dragleave', e => {
    if (!board.contains(e.relatedTarget)) {
      board.querySelectorAll('.drag-zone').forEach(c => c.classList.remove('drag-over'));
    }
  });

  board.addEventListener('drop', e => {
    e.preventDefault();
    const zone = e.target.closest('.drag-zone');
    if (dragging && zone) {
      zone.appendChild(dragging);
      const colName = zone.querySelector('.drag-zone-title') &&
                      zone.querySelector('.drag-zone-title').textContent.trim();
      if (statusEl) statusEl.textContent =
        '✅ "' + dragging.getAttribute('aria-label').replace('Draggable item: ', '') +
        '" moved to ' + colName;
    }
    board.querySelectorAll('.drag-zone').forEach(c => c.classList.remove('drag-over'));
  });

  /* Reset board */
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      Object.entries(original).forEach(([itemId, colId]) => {
        const item = document.getElementById(itemId);
        const col  = document.getElementById(colId);
        if (item && col) col.appendChild(item);
      });
      if (statusEl) statusEl.textContent = 'Board reset.';
    });
  }
})();

/* ─── Source → Target Box ────────────────────────────────────────────────── */
(function initSourceTargetDrag() {
  const sourceBox = document.getElementById('drag-source-box');
  const targetBox = document.getElementById('drag-target-box');
  const resultEl  = document.getElementById('drop-result');
  if (!sourceBox || !targetBox) return;

  sourceBox.addEventListener('dragstart', e => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', 'source');
    sourceBox.style.opacity = '0.5';
  });
  sourceBox.addEventListener('dragend', () => {
    sourceBox.style.opacity = '1';
  });

  targetBox.addEventListener('dragover', e => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    targetBox.style.background = 'var(--primary-light, #e0e7ff)';
    targetBox.style.borderColor = 'var(--primary)';
  });
  targetBox.addEventListener('dragleave', () => {
    targetBox.style.background = '';
    targetBox.style.borderColor = '';
  });
  targetBox.addEventListener('drop', e => {
    e.preventDefault();
    targetBox.style.background = '#d1fae5';
    targetBox.style.borderColor = '#22c55e';
    targetBox.style.color = '#166534';
    targetBox.textContent = '✅ DROPPED!';
    if (resultEl) resultEl.textContent = 'Source was successfully dropped onto the target.';
    /* reset after 2s */
    setTimeout(() => {
      targetBox.style.background = '';
      targetBox.style.borderColor = '';
      targetBox.style.color = '';
      targetBox.textContent = 'DROP HERE';
    }, 2000);
  });
})();

/* ─── Notifications (Toasts) ─────────────────────────────────────────────── */
(function initNotifications() {
  const container = document.getElementById('toast-container');
  if (!container) return;

  window.showToast = function (msg, type) {
    const toast = document.createElement('div');
    toast.className = 'toast toast-' + (type || 'info');
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'assertive');
    toast.setAttribute('data-testid', 'toast-' + type);
    toast.innerHTML =
      `<span>${msg}</span>
       <button class="toast-close" aria-label="Dismiss notification">&times;</button>`;
    container.appendChild(toast);
    const timer = setTimeout(() => toast.remove(), 4000);
    toast.querySelector('.toast-close').addEventListener('click', () => {
      clearTimeout(timer);
      toast.remove();
    });
  };

  /* Toast trigger buttons — correct IDs from notifications.ejs */
  const toastMap = {
    'btn-success-toast': ['success', 'Operation completed successfully!'],
    'btn-error-toast':   ['error',   'Something went wrong. Please try again.'],
    'btn-warning-toast': ['warning', 'Warning: your session is about to expire.'],
    'btn-info-toast':    ['info',    'A new version of the app is available.']
  };
  Object.entries(toastMap).forEach(([id, [type, msg]]) => {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener('click', () => showToast(msg, type));
  });

  /* Auto-dismiss (3 s) */
  const autoBtn = document.getElementById('btn-auto-dismiss');
  if (autoBtn) {
    autoBtn.addEventListener('click', () => {
      const toast = document.createElement('div');
      toast.className = 'toast toast-info';
      toast.setAttribute('role', 'status');
      toast.setAttribute('data-testid', 'toast-auto-dismiss');
      toast.innerHTML = '<span>⏱️ Auto-dismisses in 3 seconds…</span>';
      container.appendChild(toast);
      setTimeout(() => toast.remove(), 3000);
    });
  }

  /* Dismissible inline alert */
  const dismissBtn = document.getElementById('dismiss-alert-btn');
  const alertEl    = document.getElementById('dismissible-alert');
  const showBtn    = document.getElementById('show-alert-btn');
  if (dismissBtn && alertEl) {
    dismissBtn.addEventListener('click', () => {
      alertEl.style.display = 'none';
      if (showBtn) showBtn.style.display = 'inline-block';
    });
  }
  if (showBtn && alertEl) {
    showBtn.addEventListener('click', () => {
      alertEl.style.display = 'flex';
      showBtn.style.display = 'none';
    });
  }

  /* Message badge counter */
  const badge      = document.getElementById('message-badge');
  const clearBadge = document.getElementById('clear-badge-btn');
  const addBadge   = document.getElementById('add-badge-btn');
  if (badge) {
    let count = Number(badge.textContent) || 0;
    const update = n => {
      count = Math.max(0, n);
      badge.textContent = count;
      badge.style.display = count === 0 ? 'none' : '';
    };
    if (clearBadge) clearBadge.addEventListener('click', () => update(0));
    if (addBadge)   addBadge  .addEventListener('click', () => update(count + 1));
  }
})();

/* ─── Form Validation ────────────────────────────────────────────────────── */
(function initFormValidation() {
  const form = document.getElementById('validation-form');
  if (!form) return;

  /* view error IDs are like 'firstname-error', inputs are 'v-firstname' */
  function getErrorEl(input) {
    const baseId = input.id.replace(/^v-/, '');
    return document.getElementById(baseId + '-error');
  }

  function validateField(input) {
    const rule = input.dataset.validate;
    const val  = input.value.trim();
    let ok = true;
    if (rule === 'minlength') ok = input.value.length >= Number(input.dataset.minlength || 2);
    if (rule === 'email')     ok = /^[^@]+@[^@]+\.[^@]+$/.test(val);
    if (rule === 'age')       ok = val === '' || (Number(val) >= 18 && Number(val) <= 99);
    if (rule === 'url')       ok = val === '' || /^https?:\/\/.+/.test(val);
    return ok;
  }

  form.addEventListener('submit', e => {
    e.preventDefault();
    let valid = true;
    form.querySelectorAll('[data-validate]').forEach(input => {
      const ok = validateField(input);
      const errorEl = getErrorEl(input);
      input.classList.toggle('is-valid',   ok);
      input.classList.toggle('is-invalid', !ok);
      if (errorEl) errorEl.style.display = ok ? 'none' : 'block';
      if (!ok) valid = false;
    });
    const resultEl = document.getElementById('form-result');
    if (resultEl) {
      resultEl.textContent = valid ? '✅ Form submitted successfully!' : '❌ Please fix the errors above.';
      resultEl.className   = valid ? 'alert alert-success' : 'alert alert-danger';
      resultEl.style.display = 'block';
    }
  });

  /* Live validation on blur */
  form.querySelectorAll('[data-validate]').forEach(input => {
    input.addEventListener('blur', () => {
      const ok = validateField(input);
      const errorEl = getErrorEl(input);
      input.classList.toggle('is-valid',   ok);
      input.classList.toggle('is-invalid', !ok);
      if (errorEl) errorEl.style.display = ok ? 'none' : 'block';
    });
  });

  /* Character count for textarea */
  const msgArea   = document.getElementById('v-message');
  const charCount = document.getElementById('char-count');
  if (msgArea && charCount) {
    msgArea.addEventListener('input', () => { charCount.textContent = msgArea.value.length; });
  }

  /* Clear validation state on reset */
  form.addEventListener('reset', () => {
    setTimeout(() => {
      form.querySelectorAll('[data-validate]').forEach(input => {
        input.classList.remove('is-valid', 'is-invalid');
        const errorEl = getErrorEl(input);
        if (errorEl) errorEl.style.display = 'none';
      });
      const resultEl = document.getElementById('form-result');
      if (resultEl) resultEl.style.display = 'none';
      if (charCount) charCount.textContent = '0';
    }, 0);
  });
})();

/* ─── File Upload (drag-drop zone) ───────────────────────────────────────── */
(function initFileUpload() {
  const zone       = document.getElementById('drop-zone');
  const input      = document.getElementById('drop-zone-input');
  const browseLink = document.getElementById('browse-link');
  const list       = document.getElementById('dropped-files-list');
  if (!zone) return;

  zone.addEventListener('dragenter', e => { e.preventDefault(); zone.classList.add('drag-active'); });
  zone.addEventListener('dragover',  e => { e.preventDefault(); zone.classList.add('drag-active'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-active'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-active');
    showFiles(e.dataTransfer.files);
  });
  zone.addEventListener('click', () => input && input.click());
  if (browseLink) browseLink.addEventListener('click', e => { e.stopPropagation(); input && input.click(); });
  if (input) input.addEventListener('change', () => showFiles(input.files));

  function showFiles(files) {
    if (!list) return;
    list.innerHTML = '';
    Array.from(files).forEach(f => {
      const p = document.createElement('p');
      p.style.cssText = 'margin:4px 0;font-size:13px;';
      p.setAttribute('data-testid', 'uploaded-file');
      var icon = document.createElement('i');
      icon.className = 'fas fa-file';
      icon.style.cssText = 'color:var(--primary);margin-right:6px;';
      p.appendChild(icon);
      p.appendChild(document.createTextNode(f.name + ' '));
      var sizeSpan = document.createElement('span');
      sizeSpan.style.color = 'var(--text-muted)';
      sizeSpan.textContent = '(' + (f.size / 1024).toFixed(1) + ' KB)';
      p.appendChild(sizeSpan);
      list.appendChild(p);
    });
  }

  /* Multiple file preview */
  const multiInput   = document.getElementById('multi-file-input');
  const multiPreview = document.getElementById('multi-file-preview');
  const clearBtn     = document.getElementById('clear-files-btn');
  if (multiInput && multiPreview) {
    multiInput.addEventListener('change', () => {
      multiPreview.innerHTML = '';
      Array.from(multiInput.files).forEach((f, i) => {
        const p = document.createElement('p');
        p.setAttribute('data-testid', 'multi-file-item-' + (i + 1));
        p.style.cssText = 'margin:3px 0;font-size:13px;';
        p.textContent = (i + 1) + '. ' + f.name + ' — ' + (f.size / 1024).toFixed(1) + ' KB';
        multiPreview.appendChild(p);
      });
    });
  }
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (multiInput)   multiInput.value = '';
      if (multiPreview) multiPreview.innerHTML = '';
    });
  }
})();

/* ─── File Download ───────────────────────────────────────────────────────── */
(function initFileDownload() {
  const genBtn   = document.getElementById('generate-download-btn');
  const statusEl = document.getElementById('download-status');
  if (!genBtn && !document.getElementById('downloads-table')) return;

  document.querySelectorAll('.download-link').forEach(link => {
    link.addEventListener('click', () => {
      if (statusEl) {
        const label = (link.getAttribute('aria-label') || 'file').replace('Download ', '');
        statusEl.textContent = '⬇️ Downloading ' + label + '…';
        setTimeout(() => { statusEl.textContent = '✅ Download started: ' + label; }, 800);
      }
    });
  });

  if (genBtn) {
    let dlCount = 0;
    genBtn.addEventListener('click', () => {
      dlCount++;
      const content = [
        'STM & RCV Academy Automation Practice Website — Generated File #' + dlCount,
        'Generated at: ' + new Date().toISOString(),
        '',
        'This is a dynamically generated text file.',
        'Each click creates a unique file for download testing.'
      ].join('\n');
      const blob = new Blob([content], { type: 'text/plain' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = 'generated-file-' + dlCount + '.txt';
      a.setAttribute('data-testid', 'generated-download-link');
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      if (statusEl) statusEl.textContent = '✅ "generated-file-' + dlCount + '.txt" downloaded.';
    });
  }
})();

/* ─── Challenging DOM: random button IDs ────────────────────────────────── */
(function initChallengingDom() {
  const btnGroup = document.getElementById('dynamic-btn-group');
  const resultEl = document.getElementById('dynamic-btn-result');
  const tbody    = document.getElementById('challenging-tbody');
  if (!btnGroup && !tbody) return;

  const btnLabels = ['Edit', 'Delete', 'View', 'Approve', 'Reject'];
  const btnClass  = ['btn-primary', 'btn-danger', 'btn-outline', 'btn-success', 'btn-warning'];
  function randomId() { return 'btn-' + Math.random().toString(36).slice(2, 10); }

  function renderButtons() {
    if (!btnGroup) return;
    btnGroup.innerHTML = '';
    btnLabels.forEach((label, i) => {
      const btn = document.createElement('button');
      btn.className = 'btn ' + btnClass[i] + ' challenging-btn';
      btn.id        = randomId();
      btn.setAttribute('data-testid', btn.id);
      btn.setAttribute('data-action', label.toLowerCase());
      btn.setAttribute('aria-label', label + ' action');
      btn.textContent = label;
      btn.addEventListener('click', () => {
        if (resultEl) resultEl.textContent = '✅ Clicked: ' + label + ' (id=' + btn.id + ')';
      });
      btnGroup.appendChild(btn);
    });
  }
  renderButtons();

  if (tbody) {
    const rows = [
      { lorem:'Defiant', ipsum:'Vulture', dolor:'Zephyr',  sit:'Apex',    amet:'Onyx',   action:'Edit'    },
      { lorem:'Cipher',  ipsum:'Phantom', dolor:'Rogue',   sit:'Bastion', amet:'Nexus',  action:'Delete'  },
      { lorem:'Havoc',   ipsum:'Tempest', dolor:'Wraith',  sit:'Citadel', amet:'Prism',  action:'View'    },
      { lorem:'Zenith',  ipsum:'Inferno', dolor:'Striker', sit:'Dynamo',  amet:'Torque', action:'Approve' },
      { lorem:'Eclipse', ipsum:'Mirage',  dolor:'Specter', sit:'Equinox', amet:'Vortex', action:'Reject'  }
    ];
    tbody.innerHTML = '';
    rows.forEach((r, i) => {
      const tr = document.createElement('tr');
      tr.setAttribute('data-testid', 'challenging-row-' + (i + 1));
      tr.setAttribute('data-row-index', i + 1);
      tr.innerHTML =
        ['lorem','ipsum','dolor','sit','amet'].map(k =>
          `<td data-col="${k}">${r[k]}</td>`).join('') +
        `<td><button class="btn btn-sm btn-primary table-action-btn"
                     data-testid="action-btn-${i+1}" data-action="${r.action}"
                     aria-label="${r.action} row ${i+1}">${r.action}</button></td>`;
      tbody.appendChild(tr);
    });
    tbody.addEventListener('click', e => {
      const btn = e.target.closest('.table-action-btn');
      if (!btn) return;
      const rowIdx = btn.closest('tr').getAttribute('data-row-index');
      if (resultEl) resultEl.textContent = '✅ Action "' + btn.dataset.action + '" on row ' + rowIdx;
    });
  }

  const similarList = document.getElementById('similar-items');
  if (similarList) {
    similarList.addEventListener('click', e => {
      const editBtn = e.target.closest('.similar-edit-btn');
      const delBtn  = e.target.closest('.similar-delete-btn');
      if (editBtn) {
        const txt = editBtn.closest('li').firstChild.textContent.trim();
        if (resultEl) resultEl.textContent = '✏️ Edit clicked for: ' + txt;
      }
      if (delBtn) {
        const li  = delBtn.closest('li');
        const txt = li.firstChild.textContent.trim();
        li.style.opacity = '0.4';
        li.style.textDecoration = 'line-through';
        if (resultEl) resultEl.textContent = '🗑️ Deleted: ' + txt;
      }
    });
  }
})();

/* ─── Scrollbar: lazy-load container ─────────────────────────────────────── */
(function initLazyScroll() {
  const container = document.getElementById('lazy-scroll-container');
  const counter   = document.getElementById('lazy-item-count');
  if (!container) return;

  let loaded = 10;
  const MAX  = 50;

  container.addEventListener('scroll', () => {
    if (container.scrollTop + container.clientHeight >= container.scrollHeight - 10) {
      if (loaded >= MAX) return;
      const batch = Math.min(10, MAX - loaded);
      for (let i = loaded + 1; i <= loaded + batch; i++) {
        const p = document.createElement('p');
        p.setAttribute('data-testid', 'lazy-item-' + i);
        p.setAttribute('data-item-index', i);
        p.textContent = '🌀 Lazy Item #' + i + ' — loaded on scroll';
        container.appendChild(p);
      }
      loaded += batch;
      if (counter) counter.textContent = loaded + ' / ' + MAX + ' items loaded';
    }
  });
})();

/* ─── Scroll-to Buttons (scrollbars page) ────────────────────────────────── */
(function initScrollButtons() {
  function wire(btnId, fn) {
    const btn = document.getElementById(btnId);
    if (btn) btn.addEventListener('click', fn);
  }
  const vBox = document.getElementById('vertical-scroll-box');
  wire('scroll-top-btn',   () => vBox && vBox.scrollTo({ top: 0,        behavior: 'smooth' }));
  wire('scroll-bottom-btn',() => vBox && vBox.scrollTo({ top: 99999,    behavior: 'smooth' }));
  wire('scroll-para10-btn',() => {
    const p = vBox && vBox.querySelector('[data-testid="scroll-para-10"]');
    if (p) p.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
})();

/* ─── jQuery UI Menu ───────────────────────────────────────────────────────── */
(function initJqueryMenu() {
  /* Must run after jQuery & jQuery UI are loaded — this file is loaded after both */
  if (typeof $ === 'undefined' || !$.fn || !$.fn.menu) return;
  const $menu = $('#jquery-menu');
  if (!$menu.length) return;

  /* Initialise as a jQuery UI menu widget */
  $menu.menu({
    position: { my: 'left top', at: 'left bottom' },
    select: function (event, ui) {
      var label = ui.item.children('.ui-menu-item-wrapper').first().text().trim() ||
                  ui.item.children('a').first().text().trim();
      var resultEl = document.getElementById('menu-action-result');
      if (resultEl) resultEl.textContent = '✅ Selected: ' + label;
      /* Collapse all sub-menus after selection */
      $menu.menu('collapseAll', null, true);
    }
  });

  /* For horizontal menubar: open sub-menu on hover for top-level items */
  $menu.children('.ui-menu-item').on('mouseenter', function () {
    $menu.menu('collapseAll', null, true);
    /* Expand this item's submenu */
    var $sub = $(this).children('.ui-menu');
    if ($sub.length) {
      $menu.menu('expand');
    }
  });

  /* Close all menus when mouse leaves the entire menu bar */
  $menu.on('mouseleave', function () {
    $menu.menu('collapseAll', null, true);
  });

  /* Custom nav menu hover + click */
  $('.nav-menu-item').on('mouseenter', function () {
    $(this).css({ background: 'var(--primary-light, #e0e7ff)', color: 'var(--primary, #4f46e5)' });
  }).on('mouseleave', function () {
    $(this).css({ background: '', color: '' });
  }).on('click', function (e) {
    e.preventDefault();
    var resultEl = document.getElementById('menu-action-result');
    if (resultEl) resultEl.textContent = '✅ Clicked: ' + $(this).data('item');
  });
})();

console.log('✅ main.js loaded — Software Testing Mentor & RCV Academy Automation Practice Website');
