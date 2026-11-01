(function () {
  'use strict';
  var RC = window.RC;
  var $ = function (sel) { return document.querySelector(sel); };
  var preview = $('#preview');
  var busy = false;

  // ---------- helpers ----------
  function post(url, data) {
    var fd = data instanceof FormData ? data : new FormData();
    if (!(data instanceof FormData)) Object.keys(data || {}).forEach(function (k) { fd.append(k, data[k]); });
    fd.append('csrf', RC.csrf);
    fd.append('site_id', RC.siteId);
    return fetch(url, { method: 'POST', body: fd, credentials: 'same-origin' }).then(function (r) {
      return r.json().catch(function () { return { error: 'Unexpected server response (' + r.status + ').' }; });
    });
  }
  function siteAction(action, extra) {
    var d = extra || {};
    d.action = action;
    return post(RC.urls.site, d);
  }
  function el(tag, attrs, text) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (text != null) n.textContent = text;
    return n;
  }
  function showError(msg) {
    var e = $('#chat-error');
    e.textContent = msg || '';
    e.hidden = !msg;
  }

  // ---------- preview ----------
  function setPreview(html) {
    preview.srcdoc = html || '';
    $('#empty-state').hidden = !!html;
  }
  document.querySelectorAll('.dev').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('.dev').forEach(function (x) { x.classList.toggle('active', x === b); });
      preview.style.width = b.dataset.w;
    });
  });

  // ---------- status ----------
  function renderStatus() {
    var live = !!RC.publishedVersionId;
    var badge = $('#status-badge');
    var pending = live && RC.publishedVersionId !== RC.currentVersionId;
    badge.textContent = live ? (pending ? 'Live · unpublished changes' : 'Live') : 'Draft · not published';
    badge.className = 'badge' + (live ? ' badge-live' : '');
    $('#publish-btn').textContent = live ? (pending ? 'Publish changes' : 'Published ✓') : 'Publish';
    $('#publish-btn').disabled = busy || !RC.currentVersionId || (live && !pending);
    $('#unpublish-btn').hidden = !live;
    $('#usage').textContent = RC.used + ' of ' + RC.limit + ' AI edits used this month';
    $('#send-btn').disabled = busy || RC.used >= RC.limit;
    $('#send-btn').textContent = RC.currentVersionId ? 'Update my site' : '✨ Build my website';
  }

  $('#publish-btn').addEventListener('click', function () {
    siteAction('publish').then(function (r) {
      if (r.error) return alert(r.error);
      RC.publishedVersionId = r.published_version_id;
      renderStatus();
      window.open(r.url, '_blank', 'noopener');
    });
  });
  $('#unpublish-btn').addEventListener('click', function () {
    if (!confirm('Take this website offline? You can publish it again any time.')) return;
    siteAction('unpublish').then(function (r) {
      if (r.error) return alert(r.error);
      RC.publishedVersionId = 0;
      renderStatus();
    });
  });

  // ---------- tabs ----------
  document.querySelectorAll('.tab').forEach(function (t) {
    t.addEventListener('click', function () {
      document.querySelectorAll('.tab').forEach(function (x) { x.classList.toggle('active', x === t); });
      document.querySelectorAll('.tab-body').forEach(function (b) { b.hidden = b.dataset.body !== t.dataset.tab; });
    });
  });
  document.querySelectorAll('.chip[data-add]').forEach(function (chip) {
    chip.addEventListener('click', function () {
      var ta = $('#instruction');
      ta.value = (ta.value.trim() + ' ' + chip.dataset.add).trim();
      ta.focus();
    });
  });

  // ---------- AI generation (streams HTML into the preview as it's written) ----------
  function generate(instruction, mode) {
    if (busy) return;
    busy = true;
    showError('');
    renderStatus();
    $('#progress').hidden = false;
    $('#progress-title').textContent = RC.currentVersionId && mode !== 'rebuild' ? 'Updating your site…' : 'Designing your site…';
    $('#progress-detail').textContent = 'Planning the layout…';

    var started = Date.now();
    var html = '';
    var lastPaint = 0;
    var timer = setInterval(function () {
      var s = Math.round((Date.now() - started) / 1000);
      $('#progress-detail').textContent = (html ? 'Writing your site (' + Math.round(html.length / 1000) + 'k characters)' : 'Planning the layout') + ' · ' + s + 's';
    }, 1000);

    function finish(err) {
      clearInterval(timer);
      busy = false;
      $('#progress').hidden = true;
      if (err) {
        showError(err);
        setPreview(RC.html); // put back the last saved version
      }
      renderStatus();
    }

    var fd = new FormData();
    fd.append('instruction', instruction || '');
    if (mode) fd.append('mode', mode);
    fd.append('csrf', RC.csrf);
    fd.append('site_id', RC.siteId);

    fetch(RC.urls.generate, { method: 'POST', body: fd, credentials: 'same-origin' }).then(function (res) {
      var type = res.headers.get('Content-Type') || '';
      if (type.indexOf('text/event-stream') === -1) {
        return res.json().then(function (j) { finish(j.error || 'Something went wrong.'); }, function () { finish('Something went wrong (' + res.status + ').'); });
      }
      var reader = res.body.getReader();
      var decoder = new TextDecoder();
      var buffer = '';
      var gotDone = false;

      function handle(event, data) {
        if (event === 'chunk') {
          html += data.t;
          // Repaint the live preview every ~2s while the HTML is being written.
          if (Date.now() - lastPaint > 2000 && html.indexOf('<body') !== -1) {
            lastPaint = Date.now();
            preview.srcdoc = html;
            $('#empty-state').hidden = true;
          }
        } else if (event === 'done') {
          gotDone = true;
          RC.html = data.html;
          RC.currentVersionId = data.version.id;
          RC.used = data.used;
          RC.versions.unshift(data.version);
          setPreview(data.html);
          renderHistory();
          $('#instruction').value = '';
          finish();
        } else if (event === 'error') {
          gotDone = true;
          finish(data.message);
        }
      }

      function pump() {
        return reader.read().then(function (r) {
          if (r.done) {
            if (!gotDone) finish('The connection was interrupted. If the site doesn’t update, check History in a minute or try again.');
            return;
          }
          buffer += decoder.decode(r.value, { stream: true });
          var parts = buffer.split('\n\n');
          buffer = parts.pop();
          parts.forEach(function (block) {
            var ev = 'message', data = '';
            block.split('\n').forEach(function (line) {
              if (line.indexOf('event: ') === 0) ev = line.slice(7);
              else if (line.indexOf('data: ') === 0) data += line.slice(6);
            });
            if (data) { try { handle(ev, JSON.parse(data)); } catch (e) { /* ignore malformed */ } }
          });
          return pump();
        });
      }
      return pump();
    }).catch(function () {
      finish('Could not reach Rowan Copy. Check your internet connection and try again.');
    });
  }

  $('#chat-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var text = $('#instruction').value.trim();
    if (RC.currentVersionId && text.length < 3) return showError('Tell us what you would like to change.');
    generate(text);
  });
  $('#rebuild-link').addEventListener('click', function (e) {
    e.preventDefault();
    if (!confirm('Create a brand-new design from your business description? Your current version stays in History.')) return;
    generate($('#instruction').value.trim(), 'rebuild');
  });

  // ---------- history ----------
  function renderHistory() {
    var list = $('#history-list');
    list.innerHTML = '';
    if (!RC.versions.length) list.appendChild(el('li', { class: 'muted small' }, 'No versions yet.'));
    RC.versions.forEach(function (v) {
      var li = el('li');
      var info = el('div');
      info.appendChild(el('div', { class: 'h-title' }, v.instruction));
      var meta = new Date(v.created_at.replace(' ', 'T') + 'Z').toLocaleString();
      if (v.id === RC.currentVersionId) meta += ' · showing';
      if (v.id === RC.publishedVersionId) meta += ' · live';
      info.appendChild(el('div', { class: 'muted small' }, meta));
      li.appendChild(info);
      if (v.id !== RC.currentVersionId) {
        var b = el('button', { class: 'btn btn-ghost btn-sm' }, 'Restore');
        b.addEventListener('click', function () {
          siteAction('restore', { version_id: v.id }).then(function (r) {
            if (r.error) return alert(r.error);
            RC.currentVersionId = r.version_id;
            RC.html = r.html;
            setPreview(r.html);
            renderHistory();
            renderStatus();
          });
        });
        li.appendChild(b);
      }
      list.appendChild(li);
    });
  }

  // ---------- images ----------
  function renderImages() {
    var list = $('#image-list');
    list.innerHTML = '';
    RC.images.forEach(function (img) {
      var li = el('li');
      li.appendChild(el('img', { src: img.url, alt: '' }));
      li.appendChild(el('span', { class: 'small' }, img.label));
      var del = el('button', { class: 'link small', title: 'Delete image' }, 'Delete');
      del.addEventListener('click', function () {
        if (!confirm('Delete this image? It will disappear from any page that uses it.')) return;
        siteAction('delete_image', { image_id: img.id }).then(function () {
          RC.images = RC.images.filter(function (x) { return x.id !== img.id; });
          renderImages();
        });
      });
      li.appendChild(del);
      list.appendChild(li);
    });
  }
  $('#upload-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var file = $('#image-file').files[0];
    if (!file) return;
    var fd = new FormData();
    fd.append('action', 'upload');
    fd.append('image', file);
    fd.append('label', $('#image-label').value);
    post(RC.urls.site, fd).then(function (r) {
      if (r.error) return alert(r.error);
      RC.images.push(r.image);
      renderImages();
      e.target.reset();
    });
  });

  // ---------- settings ----------
  $('#settings-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target;
    siteAction('settings', { name: f.name.value, slug: f.slug.value, brief: f.brief.value }).then(function (r) {
      if (r.error) return alert(r.error);
      $('#site-name').textContent = f.name.value;
      $('#live-link').textContent = r.url;
      $('#live-link').href = r.url;
      alert('Settings saved.');
    });
  });
  $('#delete-site').addEventListener('click', function () {
    if (!confirm('Delete this website forever? This removes all versions, images and messages.')) return;
    siteAction('delete').then(function (r) {
      if (r.error) return alert(r.error);
      location.href = RC.urls.dashboard;
    });
  });

  // ---------- custom domain ----------
  $('#domain-form').addEventListener('submit', function (e) {
    e.preventDefault();
    siteAction('domain', { domain: e.target.domain.value }).then(function (r) {
      if (r.error) return alert(r.error);
      e.target.domain.value = r.domain;
      $('#domain-help').hidden = !r.domain;
      if ($('#domain-status')) { $('#domain-status').textContent = 'Not connected yet'; $('#domain-status').className = 'domain-status'; $('#connect-domain').textContent = 'Connect'; }
      $('#live-link').textContent = r.url;
      $('#live-link').href = r.url;
      alert(r.domain ? 'Domain saved. Point its DNS at us (steps below), then click Connect.' : 'Domain removed.');
    });
  });

  var connectBtn = $('#connect-domain');
  if (connectBtn) connectBtn.addEventListener('click', function () {
    connectBtn.disabled = true; connectBtn.textContent = 'Checking…';
    siteAction('connect_domain').then(function (r) {
      connectBtn.disabled = false;
      var st = $('#domain-status');
      if (r.error) { st.textContent = r.error; st.className = 'domain-status err'; connectBtn.textContent = 'Try again'; return; }
      st.textContent = '✓ ' + r.message; st.className = 'domain-status ok'; connectBtn.textContent = 'Check again';
    });
  });

  // ---------- tools ----------
  $('#duplicate-site').addEventListener('click', function () {
    if (!confirm('Make a copy of this website? The copy starts as an unpublished draft.')) return;
    siteAction('duplicate').then(function (r) {
      if (r.error) return alert(r.error);
      location.href = r.url;
    });
  });
  $('#toggle-code').addEventListener('click', function () {
    var panel = $('#code-panel');
    if (!panel.hidden) { panel.hidden = true; return; }
    if (!RC.currentVersionId) return alert('Build your site first.');
    siteAction('get_html').then(function (r) {
      if (r.error) return alert(r.error);
      $('#code').value = r.html;
      panel.hidden = false;
    });
  });
  $('#save-code').addEventListener('click', function () {
    siteAction('save_html', { html: $('#code').value }).then(function (r) {
      if (r.error) return alert(r.error);
      RC.html = r.html;
      RC.currentVersionId = r.version.id;
      RC.versions.unshift(r.version);
      setPreview(r.html);
      renderHistory();
      renderStatus();
      alert('Code saved as a new version.');
    });
  });

  // ---------- start ----------
  setPreview(RC.html);
  renderStatus();
  renderHistory();
  renderImages();
  if (RC.autoBuild) generate('');
})();
