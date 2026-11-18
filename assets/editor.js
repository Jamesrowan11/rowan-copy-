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
  // Pop-up message (the portal shell's toasts), falling back to alert().
  function toast(msg, type) { if (window.rcToast) window.rcToast(msg, type); else alert(msg); }
  function fail(r) { toast(r.error || 'Something went wrong. Please try again.', 'err'); }
  function when(ts) {
    var d = new Date(String(ts).replace(' ', 'T') + 'Z');
    var mins = Math.round((Date.now() - d) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + ' min ago';
    if (mins < 60 * 24) return Math.round(mins / 60) + ' h ago';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ', ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
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
      document.querySelectorAll('.dev').forEach(function (x) {
        x.classList.toggle('active', x === b);
        x.setAttribute('aria-checked', x === b ? 'true' : 'false');
      });
      $('#frame').style.width = b.dataset.w;
      $('#frame').classList.toggle('frame-phone', b.dataset.w === '390px');
    });
  });
  // Draft (what you're editing) or Live (what visitors see right now).
  var view = 'draft';
  function setView(v) {
    if (v === 'live' && !RC.liveUrl) return;
    view = v;
    document.querySelectorAll('.view').forEach(function (x) {
      x.classList.toggle('active', x.dataset.view === v);
      x.setAttribute('aria-checked', x.dataset.view === v ? 'true' : 'false');
    });
    var live = $('#live-frame');
    if (v === 'live' && live.dataset.loaded !== RC.liveUrl) { live.src = RC.liveUrl; live.dataset.loaded = RC.liveUrl; }
    live.hidden = v !== 'live';
    preview.hidden = v === 'live';
    $('#empty-state').hidden = v === 'live' || !!RC.html;
  }
  document.querySelectorAll('.view').forEach(function (b) { b.addEventListener('click', function () { setView(b.dataset.view); }); });

  // ---------- status ----------
  function renderStatus() {
    var live = !!RC.publishedVersionId;
    var badge = $('#status-badge');
    var pending = live && RC.publishedVersionId !== RC.currentVersionId;
    badge.innerHTML = '';
    badge.appendChild(el('i'));
    badge.appendChild(document.createTextNode(live ? (pending ? 'Changes not published' : 'Published') : 'Draft'));
    badge.className = 'status status-' + (live ? (pending ? 'changes' : 'live') : 'draft');
    $('#publish-btn').querySelector('span').textContent = live ? (pending ? 'Publish changes' : 'Up to date') : 'Publish';
    $('#publish-btn').disabled = busy || !RC.currentVersionId || (live && !pending);
    $('#unpublish-btn').hidden = !live;
    $('#menu-live').hidden = !live;
    $('#view-live').disabled = !live;
    $('#view-live').title = live ? 'What visitors see now' : 'Not published yet';
    if (!live && view === 'live') setView('draft');
    $('#usage').textContent = RC.used + ' of ' + RC.limit + ' AI edits used this month';
    $('#send-btn').disabled = busy || RC.used >= RC.limit;
    $('#send-btn').querySelector('span').textContent = RC.currentVersionId ? 'Update' : 'Build';
    $('#send-btn').setAttribute('aria-label', RC.currentVersionId ? 'Update my site' : 'Build my website');
  }

  $('#publish-btn').addEventListener('click', function () {
    var btn = this;
    btn.disabled = true;
    btn.querySelector('span').textContent = 'Publishing…';
    siteAction('publish').then(function (r) {
      if (r.error) { renderStatus(); return fail(r); }
      RC.publishedVersionId = r.published_version_id;
      RC.liveUrl = r.url;
      $('#live-frame').dataset.loaded = '';
      if (view === 'live') setView('live');
      renderStatus();
      renderHistory();
      toast('Your changes are live! 🎉 ' + r.url.replace(/^https?:\/\//, ''));
    });
  });
  $('#unpublish-btn').addEventListener('click', function (e) {
    e.preventDefault();
    this.closest('details').removeAttribute('open');
    if (!confirm('Take this website offline? You can publish it again any time.')) return;
    siteAction('unpublish').then(function (r) {
      if (r.error) return fail(r);
      RC.publishedVersionId = 0;
      RC.liveUrl = '';
      renderStatus();
      renderHistory();
      toast('Your website is offline. Publish it again any time.');
    });
  });

  // ---------- tabs ----------
  function openTab(name) {
    document.querySelectorAll('.tab').forEach(function (x) {
      x.classList.toggle('active', x.dataset.tab === name);
      x.setAttribute('aria-selected', x.dataset.tab === name ? 'true' : 'false');
    });
    document.querySelectorAll('.tab-body').forEach(function (b) { b.hidden = b.dataset.body !== name; });
  }
  document.querySelectorAll('.tab').forEach(function (t) {
    t.addEventListener('click', function () { openTab(t.dataset.tab); });
  });
  if (location.hash === '#settings') openTab('settings');
  document.querySelectorAll('.chip[data-add]').forEach(function (chip) {
    chip.addEventListener('click', function () {
      var ta = $('#instruction');
      ta.value = (ta.value.trim() + ' ' + chip.dataset.add).trim();
      ta.focus();
    });
  });

  // ---------- chat log: the site's change history as a conversation ----------
  function bubble(role, text, meta) {
    var b = el('div', { class: 'bubble bubble-' + role });
    if (role === 'ai') {
      var ico = el('span', { class: 'bubble-ico' });
      ico.innerHTML = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9.94 14.06A2 2 0 0 0 8.5 12.6l-6.13-1.58a.5.5 0 0 1 0-.96L8.5 8.5A2 2 0 0 0 9.94 7.06l1.58-6.13a.5.5 0 0 1 .96 0l1.58 6.13A2 2 0 0 0 15.5 8.5l6.13 1.58a.5.5 0 0 1 0 .96L15.5 12.6a2 2 0 0 0-1.44 1.46l-1.58 6.13a.5.5 0 0 1-.96 0z"/></svg>';
      b.appendChild(ico);
    }
    var body = el('div');
    body.appendChild(el('span', null, text));
    if (meta) body.appendChild(el('small', null, meta));
    b.appendChild(body);
    return b;
  }
  function renderChat() {
    var log = $('#chat-log');
    log.innerHTML = '';
    var list = RC.versions.slice(0, 8).reverse();
    if (!list.length) {
      log.appendChild(bubble('ai', RC.autoBuild ? 'Building your first design from your description…' :
        'Hi! Tell me what your website needs, or click Build and I\'ll design it from your business description.'));
    }
    list.forEach(function (v) {
      var ins = String(v.instruction || '').trim();
      var hand = ins === 'Edited the code by hand', copy = ins.indexOf('Copied from') === 0;
      if (!hand && !copy && ins && ins !== 'First design') log.appendChild(bubble('user', ins));
      var msg = hand ? 'You edited the code by hand. Saved as a new version.'
        : copy ? ins + '.'
        : (!ins || ins === 'First design') ? 'Your first design is ready. Take a look at the preview.'
        : 'Done! That change is in your draft.';
      log.appendChild(bubble('ai', msg, when(v.created_at) + (v.id === RC.publishedVersionId ? ' · live' : '')));
    });
    log.scrollTop = log.scrollHeight;
  }

  // ---------- AI generation (streams HTML into the preview as it's written) ----------
  function generate(instruction, mode) {
    if (busy) return;
    busy = true;
    showError('');
    renderStatus();
    if (instruction) $('#chat-log').appendChild(bubble('user', instruction));
    $('#chat-log').scrollTop = $('#chat-log').scrollHeight;
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
        renderChat();
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
          if (view === 'live') setView('draft');
          renderHistory();
          renderChat();
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

  $('#instruction').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('#chat-form').requestSubmit(); }
  });
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
      var current = v.id === RC.currentVersionId, live = v.id === RC.publishedVersionId;
      var li = el('li', { class: 'tl' + (current ? ' tl-current' : '') + (live ? ' tl-live' : '') });
      li.appendChild(el('span', { class: 'tl-dot' }));
      var info = el('div', { class: 'tl-info' });
      info.appendChild(el('div', { class: 'h-title' }, v.instruction || 'Design'));
      var meta = el('div', { class: 'muted small tl-meta' }, when(v.created_at));
      if (live) meta.appendChild(el('span', { class: 'pill pill-live' }, 'Live'));
      if (current) meta.appendChild(el('span', { class: 'pill pill-draft' }, 'Current draft'));
      info.appendChild(meta);
      li.appendChild(info);
      if (!current) {
        var b = el('button', { class: 'btn btn-ghost btn-sm' }, 'Restore');
        b.addEventListener('click', function () {
          b.disabled = true;
          siteAction('restore', { version_id: v.id }).then(function (r) {
            b.disabled = false;
            if (r.error) return fail(r);
            RC.currentVersionId = r.version_id;
            RC.html = r.html;
            setPreview(r.html);
            if (view === 'live') setView('draft');
            renderHistory();
            renderStatus();
            toast('Restored that version to your draft. Publish to make it live.');
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
    if (!RC.images.length) list.appendChild(el('li', { class: 'muted small img-empty' }, 'No photos yet. Your logo and a few photos make a big difference.'));
    RC.images.forEach(function (img) {
      var li = el('li', { class: 'img-tile' });
      li.appendChild(el('img', { src: img.url, alt: img.label || '' , loading: 'lazy' }));
      li.appendChild(el('span', { class: 'img-label' }, img.label || 'Photo'));
      var del = el('button', { class: 'img-del', title: 'Delete image', 'aria-label': 'Delete ' + (img.label || 'image') }, '×');
      del.addEventListener('click', function () {
        if (!confirm('Delete this image? It will disappear from any page that uses it.')) return;
        siteAction('delete_image', { image_id: img.id }).then(function (r) {
          if (r && r.error) return fail(r);
          RC.images = RC.images.filter(function (x) { return x.id !== img.id; });
          renderImages();
          toast('Image deleted.');
        });
      });
      li.appendChild(del);
      list.appendChild(li);
    });
  }
  var drop = $('#drop'), fileInput = $('#image-file');
  function pickedFile() {
    var f = fileInput.files[0];
    $('#upload-name').hidden = !f;
    if (f) {
      $('#upload-name').textContent = 'Ready to upload: ' + f.name;
      if (!$('#image-label').value) $('#image-label').value = f.name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ');
    }
  }
  fileInput.addEventListener('change', pickedFile);
  ['dragenter', 'dragover'].forEach(function (ev) {
    drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('drop-over'); });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('drop-over'); });
  });
  drop.addEventListener('drop', function (e) {
    if (e.dataTransfer && e.dataTransfer.files.length) { fileInput.files = e.dataTransfer.files; pickedFile(); }
  });
  $('#upload-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var file = fileInput.files[0];
    if (!file) return toast('Choose a photo first.', 'err');
    var fd = new FormData();
    fd.append('action', 'upload');
    fd.append('image', file);
    fd.append('label', $('#image-label').value);
    $('#upload-btn').disabled = true;
    $('#upload-btn').textContent = 'Uploading…';
    post(RC.urls.site, fd).then(function (r) {
      $('#upload-btn').disabled = false;
      $('#upload-btn').textContent = 'Upload';
      if (r.error) return fail(r);
      RC.images.push(r.image);
      renderImages();
      e.target.reset();
      $('#upload-name').hidden = true;
      toast('Photo uploaded. Ask the AI to use it.');
    });
  });

  // ---------- settings ----------
  $('#settings-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target;
    siteAction('settings', { name: f.name.value, slug: f.slug.value, brief: f.brief.value }).then(function (r) {
      if (r.error) return fail(r);
      $('#site-name').textContent = f.name.value;
      $('#live-link').textContent = r.url.replace(/^https?:\/\//, '');
      $('#live-link').href = r.url;
      toast('Settings saved.');
    });
  });
  $('#delete-site').addEventListener('click', function () {
    if (!confirm('Delete this website forever? This removes all versions, images and messages.')) return;
    siteAction('delete').then(function (r) {
      if (r.error) return fail(r);
      location.href = RC.urls.dashboard;
    });
  });

  // ---------- custom domain ----------
  $('#domain-form').addEventListener('submit', function (e) {
    e.preventDefault();
    siteAction('domain', { domain: e.target.domain.value }).then(function (r) {
      if (r.error) return fail(r);
      e.target.domain.value = r.domain;
      $('#domain-help').hidden = !r.domain;
      if ($('#domain-status')) { $('#domain-status').textContent = 'Not connected yet'; $('#domain-status').className = 'domain-status'; $('#connect-domain').textContent = 'Check my DNS'; }
      $('#live-link').textContent = r.url.replace(/^https?:\/\//, '');
      $('#live-link').href = r.url;
      toast(r.domain ? 'Domain saved. Point its DNS at us (steps below), then click Check my DNS.' : 'Domain removed.');
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
      if (r.error) return fail(r);
      location.href = r.url;
    });
  });
  // Editing code (Starter and up): show the warning every time, and only open
  // the code once they've ticked "I understand" (recorded on their account).
  function openCode() {
    siteAction('get_html').then(function (r) {
      if (r.error) return fail(r);
      $('#code').value = r.html;
      $('#code-panel').hidden = false;
    });
  }
  var toggleCode = $('#toggle-code');
  if (toggleCode) toggleCode.addEventListener('click', function () {
    var panel = $('#code-panel');
    if (!panel.hidden) { panel.hidden = true; return; }
    if (!RC.currentVersionId) return toast('Build your site first.', 'err');
    var dlg = $('#code-warning'), ack = $('#code-warning-ack');
    if (!dlg || typeof dlg.showModal !== 'function') {
      if (!confirm('You are about to edit your website\'s code. A mistake can break your website, and Rowan Copy ' +
          'support can\'t fix code you change by hand. You can go back to an earlier version from History. Continue?')) return;
      return siteAction('accept_code_terms').then(function (r) { if (r.error) return fail(r); openCode(); });
    }
    ack.checked = false;
    $('#code-warning-ok').disabled = true;
    dlg.returnValue = '';
    dlg.showModal();
  });
  if ($('#code-warning')) {
    $('#code-warning-ack').addEventListener('change', function () {
      $('#code-warning-ok').disabled = !this.checked;
    });
    $('#code-warning').addEventListener('close', function () {
      if (this.returnValue !== 'ok' || !$('#code-warning-ack').checked) return;
      siteAction('accept_code_terms').then(function (r) {
        if (r.error) return fail(r);
        openCode();
      });
    });
  }
  $('#save-code').addEventListener('click', function () {
    siteAction('save_html', { html: $('#code').value }).then(function (r) {
      if (r.error) return fail(r);
      RC.html = r.html;
      RC.currentVersionId = r.version.id;
      RC.versions.unshift(r.version);
      setPreview(r.html);
      renderHistory();
      renderStatus();
      renderChat();
      toast('Code saved as a new draft version.');
    });
  });

  // ---------- start ----------
  setPreview(RC.html);
  renderStatus();
  renderHistory();
  renderImages();
  renderChat();
  if (RC.autoBuild) generate('');
})();
