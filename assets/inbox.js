// Inbox: pick a message to read it (list + reading pane; one pane at a time on phones).
(function () {
  'use strict';
  var box = document.getElementById('inbox');
  if (!box) return;
  var cfg = window.RC_INBOX, pick = document.getElementById('inbox-pick'), current = null;

  function open(id, push) {
    var item = box.querySelector('[data-msg="' + id + '"]'), msg = document.getElementById('msg-' + id);
    if (!item || !msg) return;
    box.querySelectorAll('.inbox-item.is-open').forEach(function (b) { b.classList.remove('is-open'); });
    box.querySelectorAll('.msg').forEach(function (a) { a.hidden = true; });
    item.classList.add('is-open');
    msg.hidden = false; pick.hidden = true; current = id;
    box.classList.add('reading');
    if (push !== false) history.replaceState(null, '', '#m' + id);
    if (item.classList.contains('is-unread')) {
      item.classList.remove('is-unread');
      var fd = new FormData();
      fd.append('action', 'read'); fd.append('message_id', id); fd.append('csrf', cfg.csrf);
      fetch(cfg.url, { method: 'POST', body: fd, credentials: 'same-origin' }).then(function () {
        document.querySelectorAll('.sb-nav a[href*="inbox.php"] .sb-badge').forEach(function (b) {
          var n = parseInt(b.textContent, 10) - 1;
          if (n > 0) b.textContent = n; else b.remove();
        });
      }).catch(function () {});
    }
    if (window.matchMedia('(max-width: 760px)').matches) window.scrollTo(0, 0);
  }
  function close() {
    box.classList.remove('reading');
    if (current) { var item = box.querySelector('[data-msg="' + current + '"]'); if (item) item.focus(); }
    history.replaceState(null, '', location.pathname + location.search);
  }

  box.querySelectorAll('.inbox-item').forEach(function (b) {
    b.addEventListener('click', function () { open(b.dataset.msg); });
  });
  box.querySelectorAll('[data-inbox-back]').forEach(function (b) { b.addEventListener('click', close); });

  var q = document.getElementById('inbox-q'), none = document.getElementById('inbox-none');
  q.addEventListener('input', function () {
    var term = q.value.toLowerCase().trim(), any = false;
    box.querySelectorAll('.inbox-item').forEach(function (b) {
      var hit = !term || b.dataset.search.indexOf(term) !== -1;
      b.parentNode.hidden = !hit; any = any || hit;
    });
    none.hidden = any;
  });

  // Arrow keys move through the list.
  document.getElementById('inbox-items').addEventListener('keydown', function (e) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    var items = Array.prototype.filter.call(box.querySelectorAll('.inbox-item'), function (b) { return !b.parentNode.hidden; });
    var i = items.indexOf(document.activeElement);
    var next = items[e.key === 'ArrowDown' ? Math.min(i + 1, items.length - 1) : Math.max(i - 1, 0)];
    if (next) { e.preventDefault(); next.focus(); open(next.dataset.msg); }
  });

  var m = /^#m(\d+)$/.exec(location.hash);
  if (m) open(m[1], false);
})();
