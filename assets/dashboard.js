// My sites: the three-step "Build a new website" dialog and quick Publish.
(function () {
  'use strict';
  var dlg = document.getElementById('builder');
  var form = document.getElementById('builder-form');
  var step = 1, last = 3;

  function show(n) {
    step = n;
    form.querySelectorAll('.step').forEach(function (s) { s.hidden = Number(s.dataset.step) !== n; });
    form.querySelectorAll('.steps li').forEach(function (li, i) { li.classList.toggle('on', i < n); });
    form.querySelector('[data-step-back]').hidden = n === 1;
    form.querySelector('[data-step-next]').hidden = n === last;
    form.querySelector('[data-step-build]').hidden = n !== last;
    var first = form.querySelector('.step[data-step="' + n + '"] input, .step[data-step="' + n + '"] textarea');
    if (first) first.focus();
  }
  function valid(n) {
    var field = n === 1 ? form.elements.name : n === 2 ? form.elements.brief : null;
    if (!field) return true;
    if (n === 2 && field.value.trim().length < 20) {
      field.setCustomValidity('Please write at least a sentence or two about your business.');
    } else {
      field.setCustomValidity('');
    }
    return field.reportValidity();
  }
  function open() { if (dlg && typeof dlg.showModal === 'function') { show(1); dlg.showModal(); } }

  document.querySelectorAll('[data-builder-open]').forEach(function (b) { b.addEventListener('click', open); });
  if (dlg) {
    form.querySelector('[data-builder-close]').addEventListener('click', function () { dlg.close(); });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
    form.querySelector('[data-step-next]').addEventListener('click', function () { if (valid(step)) show(step + 1); });
    form.querySelector('[data-step-back]').addEventListener('click', function () { show(step - 1); });
    form.elements.brief.addEventListener('input', function () { this.setCustomValidity(''); });
    form.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target.tagName === 'INPUT' && step < last) { e.preventDefault(); if (valid(step)) show(step + 1); }
    });
    form.querySelectorAll('.chip[data-add]').forEach(function (chip) {
      chip.addEventListener('click', function () {
        var ta = form.elements.brief;
        if (ta.value.indexOf(chip.dataset.add) === -1) ta.value = (ta.value.trim() + ' ' + chip.dataset.add).trim();
        chip.classList.add('chip-on');
        ta.focus();
      });
    });
    form.addEventListener('submit', function (e) {
      if (!valid(1) || !valid(2)) { e.preventDefault(); show(form.elements.name.value ? 2 : 1); return; }
      // The chosen style is added to the description the AI reads.
      var style = form.querySelector('input[name=style]:checked');
      if (style && form.elements.brief.value.indexOf(style.value) === -1) {
        form.elements.brief.value = form.elements.brief.value.trim() + ' ' + style.value;
      }
      form.querySelectorAll('.step, .builder-foot, .steps').forEach(function (el) { el.hidden = true; });
      form.querySelector('.building').hidden = false;
    });
    if (dlg.hasAttribute('data-open-on-load') || location.hash === '#new-site') open();
  }

  // Quick Publish from a site card.
  document.querySelectorAll('[data-publish]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var fd = new FormData();
      fd.append('action', 'publish');
      fd.append('site_id', btn.dataset.publish);
      fd.append('csrf', window.RC_DASH.csrf);
      btn.disabled = true;
      var label = btn.innerHTML;
      btn.textContent = 'Publishing…';
      fetch(window.RC_DASH.siteApi, { method: 'POST', body: fd, credentials: 'same-origin' })
        .then(function (r) { return r.json().catch(function () { return { error: 'Something went wrong. Please try again.' }; }); })
        .then(function (r) {
          if (r.error) { window.rcToast(r.error, 'err'); btn.disabled = false; btn.innerHTML = label; return; }
          window.rcToast('Your changes are live! 🎉');
          setTimeout(function () { location.reload(); }, 900);
        })
        .catch(function () { window.rcToast('No connection. Please try again.', 'err'); btn.disabled = false; btn.innerHTML = label; });
    });
  });
})();
