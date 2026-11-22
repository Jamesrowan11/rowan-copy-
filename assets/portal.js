// Portal shell: sidebar (collapse on desktop, drawer on phones), Ctrl/Cmd+K
// search palette, toasts, dismissible banners, dropdown menus.
(function () {
  'use strict';
  var body = document.body;
  function store(key, value) {
    try { if (value === undefined) return localStorage.getItem(key); localStorage.setItem(key, value); } catch (e) { return null; }
  }

  // ---- Toasts: window.rcToast(message, 'ok' | 'err') ----
  var toasts = document.getElementById('toasts');
  window.rcToast = function (msg, type) {
    if (!toasts) return alert(msg);
    var t = document.createElement('div');
    t.className = 'toast toast-' + (type === 'err' ? 'err' : 'ok');
    t.setAttribute('role', type === 'err' ? 'alert' : 'status');
    t.textContent = msg;
    var x = document.createElement('button');
    x.type = 'button'; x.className = 'toast-x'; x.setAttribute('aria-label', 'Dismiss'); x.textContent = '×';
    x.onclick = function () { t.remove(); };
    t.appendChild(x);
    toasts.appendChild(t);
    setTimeout(function () { t.classList.add('toast-out'); setTimeout(function () { t.remove(); }, 300); }, type === 'err' ? 9000 : 5000);
  };
  document.querySelectorAll('.toast-seed').forEach(function (s) { window.rcToast(s.textContent, s.dataset.type); s.remove(); });

  // ---- Sidebar ----
  document.querySelectorAll('[data-sidebar-collapse]').forEach(function (b) {
    b.addEventListener('click', function () {
      body.classList.toggle('sb-collapsed');
      store('rc-sidebar', body.classList.contains('sb-collapsed') ? 'collapsed' : 'open');
    });
  });
  function openDrawer(open) { body.classList.toggle('sb-open', open); }
  document.querySelectorAll('[data-sidebar-open]').forEach(function (b) { b.addEventListener('click', function () { openDrawer(true); }); });
  document.querySelectorAll('[data-sidebar-close]').forEach(function (b) { b.addEventListener('click', function () { openDrawer(false); }); });

  // ---- Dismissible banners (remembered on this device) ----
  document.querySelectorAll('[data-dismiss-key]').forEach(function (el) {
    var key = el.dataset.dismissKey;
    if (store(key) === '1') { el.remove(); return; }
    var x = el.querySelector('[data-dismiss]');
    if (x) x.addEventListener('click', function () { store(key, '1'); el.classList.add('fade-out'); setTimeout(function () { el.remove(); }, 250); });
  });

  // ---- Dropdown menus (<details class="menu">): one open at a time, close on outside click / Esc ----
  document.addEventListener('click', function (e) {
    document.querySelectorAll('details.menu[open]').forEach(function (d) { if (!d.contains(e.target)) d.removeAttribute('open'); });
  });

  // ---- Forms that ask first: <form data-confirm="Are you sure?"> ----
  document.querySelectorAll('form[data-confirm]').forEach(function (f) {
    f.addEventListener('submit', function (e) { if (!confirm(f.dataset.confirm)) e.preventDefault(); });
  });

  // ---- Simple dialogs: [data-dialog-open="id"], [data-dialog-close] ----
  document.querySelectorAll('[data-dialog-open]').forEach(function (b) {
    b.addEventListener('click', function () {
      var d = document.getElementById(b.dataset.dialogOpen);
      if (d && typeof d.showModal === 'function') { d.showModal(); var f = d.querySelector('input:not([type=hidden])'); if (f) f.focus(); }
    });
  });
  document.querySelectorAll('dialog.dlg').forEach(function (d) {
    if (d.hasAttribute('data-open-on-load') && typeof d.showModal === 'function') {
      d.showModal(); var pw = d.querySelector('input[type=password]'); if (pw) pw.focus();
    }
    d.addEventListener('click', function (e) { if (e.target === d) d.close(); });
    d.querySelectorAll('[data-dialog-close]').forEach(function (b) { b.addEventListener('click', function () { d.close(); }); });
  });
  // Type-to-confirm: the submit button unlocks once the word is typed.
  document.querySelectorAll('form[data-type-confirm]').forEach(function (f) {
    var input = f.querySelector('[data-type-input]'), btn = f.querySelector('[data-type-submit]');
    input.addEventListener('input', function () { btn.disabled = input.value.trim().toUpperCase() !== f.dataset.typeConfirm; });
  });

  // ---- Command palette ----
  var pal = document.getElementById('palette'), q = document.getElementById('palette-q'), list = document.getElementById('palette-list');
  var items = window.RC_PALETTE || [], shown = [], active = 0;
  function render() {
    var term = (q.value || '').toLowerCase().trim();
    shown = items.filter(function (i) { return !term || (i.label + ' ' + i.hint).toLowerCase().indexOf(term) !== -1; }).slice(0, 12);
    active = Math.min(active, Math.max(0, shown.length - 1));
    list.innerHTML = '';
    if (!shown.length) { var li = document.createElement('li'); li.className = 'palette-empty'; li.textContent = 'Nothing matches “' + q.value + '”'; list.appendChild(li); return; }
    shown.forEach(function (i, n) {
      var li = document.createElement('li');
      li.setAttribute('role', 'option'); li.id = 'pal-' + n;
      li.setAttribute('aria-selected', n === active ? 'true' : 'false');
      var a = document.createElement('span'); a.textContent = i.label;
      var b = document.createElement('small'); b.textContent = i.hint;
      li.appendChild(a); li.appendChild(b);
      li.addEventListener('mousemove', function () { if (active !== n) { active = n; render(); } });
      li.addEventListener('click', function () { go(n); });
      list.appendChild(li);
    });
    q.setAttribute('aria-activedescendant', 'pal-' + active);
  }
  function go(n) { var i = shown[n]; if (i) location.href = i.url; }
  function openPalette() {
    if (!pal || typeof pal.showModal !== 'function') return;
    q.value = ''; active = 0; render(); pal.showModal(); q.focus();
  }
  if (pal) {
    q.addEventListener('input', function () { active = 0; render(); });
    q.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(active + 1, shown.length - 1); render(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(active - 1, 0); render(); }
      else if (e.key === 'Enter') { e.preventDefault(); go(active); }
    });
    pal.addEventListener('click', function (e) { if (e.target === pal) pal.close(); });
  }
  document.querySelectorAll('[data-palette-open]').forEach(function (b) { b.addEventListener('click', openPalette); });
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); openPalette(); }
    if (e.key === 'Escape') {
      openDrawer(false);
      document.querySelectorAll('details.menu[open]').forEach(function (d) { d.removeAttribute('open'); });
    }
  });
})();
