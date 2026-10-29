/**
 * shortlist-ui.js
 * Depends on shortlist-store.js (window.Shortlist) — load that first.
 *
 * Two integration points, call both from wherever scout-view already
 * renders things:
 *
 *   1. Shortlist.UI.renderBookmarkButton(athlete)
 *        -> returns an HTMLElement (a <button>) to drop into your
 *           existing athlete card template, wherever the card's action
 *           row is. `athlete` needs at least { id, ...whatever you want
 *           snapshotted } — pass only the fields the shortlist card
 *           should display (name, weight class, PRs, etc), not the
 *           full athlete record.
 *
 *   2. Shortlist.UI.mountPanel({ trigger: <el>, onOpenAthlete: fn })
 *        -> call once on scout-view init. `trigger` is the nav element
 *           that should show the shortlist count badge and open the
 *           panel on click (e.g. your existing nav icon/button).
 *           onOpenAthlete(athleteId) is optional — wire it to however
 *           scout-view already navigates to an athlete's full profile,
 *           so a shortlist row can jump there.
 *
 * No emoji anywhere — bookmark icon is inline SVG, matches the rest of
 * the app's line-icon style.
 */
(function (global) {
  'use strict';

  if (!global.Shortlist) {
    console.error('[Shortlist.UI] shortlist-store.js must load first');
    return;
  }

  var BOOKMARK_OUTLINE =
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"/></svg>';
  var BOOKMARK_FILLED =
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"/></svg>';

  function renderBookmarkButton(athlete) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'shortlist-bookmark-btn';
    btn.setAttribute('aria-label', 'Add to shortlist');

    function paint() {
      var active = Shortlist.has(athlete.id);
      btn.innerHTML = active ? BOOKMARK_FILLED : BOOKMARK_OUTLINE;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
      btn.setAttribute('aria-label', active ? 'Remove from shortlist' : 'Add to shortlist');
    }

    btn.addEventListener('click', function (e) {
      e.preventDefault();  // button sits inside an <a> card — don't navigate
      e.stopPropagation();
      Shortlist.toggle(athlete.id, athlete);
      paint();
    });

    paint();
    return btn;
  }

  // ---- Slide-out panel ----

  var panelEl = null;
  var badgeEls = [];
  var unsubscribe = null;

  function buildPanelDom() {
    var overlay = document.createElement('div');
    overlay.className = 'shortlist-overlay';

    var panel = document.createElement('aside');
    panel.className = 'shortlist-panel';
    panel.setAttribute('role', 'complementary');
    panel.setAttribute('aria-label', 'Shortlist');

    panel.innerHTML =
      '<div class="shortlist-panel-header">' +
        '<h2>Shortlist</h2>' +
        '<div style="display:flex;align-items:center;gap:8px;">' +
          '<button type="button" class="btn btn-outline btn-sm" onclick="window.openComparisonModal()" style="font-size:11px;padding:4px 10px;">Compare</button>' +
          '<button type="button" class="shortlist-close-btn" aria-label="Close shortlist">' +
            '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>' +
          '</button>' +
        '</div>' +
      '</div>' +
      '<div class="shortlist-panel-body"></div>';

    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    function close() {
      overlay.classList.remove('is-open');
    }
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) close();
    });
    panel.querySelector('.shortlist-close-btn').addEventListener('click', close);

    return { overlay: overlay, panel: panel, body: panel.querySelector('.shortlist-panel-body'), close: close };
  }

  function renderPanelBody(bodyEl, onOpenAthlete) {
    var entries = Shortlist.getAll();
    if (entries.length === 0) {
      bodyEl.innerHTML = '<p class="shortlist-empty">No athletes shortlisted yet. Tap the bookmark icon on any athlete card to add them here.</p>';
      return;
    }

    bodyEl.innerHTML = '';
    entries.forEach(function (entry) {
      var row = document.createElement('div');
      row.className = 'shortlist-row';

      var info = document.createElement('div');
      info.className = 'shortlist-row-info';
      info.textContent = (entry.snapshot && entry.snapshot.name) || entry.id;
      if (onOpenAthlete) {
        info.classList.add('is-clickable');
        info.addEventListener('click', function () { onOpenAthlete(entry.id); });
      }

      var removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'shortlist-row-remove';
      removeBtn.setAttribute('aria-label', 'Remove from shortlist');
      removeBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
      removeBtn.addEventListener('click', function () {
        Shortlist.remove(entry.id);
      });

      row.appendChild(info);
      row.appendChild(removeBtn);
      bodyEl.appendChild(row);
    });
  }

  function updateBadge() {
    var n = Shortlist.count();
    badgeEls.forEach(function (b) {
      b.textContent = String(n);
      b.style.display = n > 0 ? '' : 'none';
    });
  }

  function mountPanel(opts) {
    opts = opts || {};
    var triggers = opts.triggers || (opts.trigger ? [opts.trigger] : []);
    var onOpenAthlete = opts.onOpenAthlete;

    var dom = buildPanelDom();
    panelEl = dom;

    if (unsubscribe) unsubscribe();
    unsubscribe = Shortlist.subscribe(function () {
      renderPanelBody(dom.body, onOpenAthlete);
      updateBadge();
    });

    renderPanelBody(dom.body, onOpenAthlete);

    badgeEls = [];
    triggers.forEach(function (trigger) {
      if (!trigger) return;
      var badge = document.createElement('span');
      badge.className = 'shortlist-count-badge';
      trigger.style.position = trigger.style.position || 'relative';
      trigger.appendChild(badge);
      badgeEls.push(badge);
      trigger.addEventListener('click', function () {
        dom.overlay.classList.add('is-open');
      });
    });
    updateBadge();

    return {
      open: function () { dom.overlay.classList.add('is-open'); },
      close: dom.close
    };
  }

  global.Shortlist.UI = {
    renderBookmarkButton: renderBookmarkButton,
    mountPanel: mountPanel
  };

  // ── Comparison modal (Feature C) ─────────────────────────────────────
  // Reads shortlisted snapshots and renders a responsive side-by-side
  // matrix. Works entirely from cached snapshot data — no extra Firestore
  // reads. Reuses the app's existing modal-overlay + modal styles so it
  // inherits dark/light theme automatically.
  function esc(v) {
    var d = document.createElement('div');
    d.textContent = v == null ? '' : String(v);
    return d.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  global.openComparisonModal = function() {
    var entries = Shortlist.getAll();

    // Tear down any prior instance so reopening is always fresh.
    var existing = document.getElementById('comparisonModal');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id = 'comparisonModal';
    overlay.className = 'modal-overlay';
    overlay.style.cssText = 'display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;padding:20px;z-index:9999;';

    var modal = document.createElement('div');
    modal.className = 'modal modal-wide';
    modal.style.cssText = 'max-width:900px;width:100%;overflow-x:auto;';

    if (!entries.length) {
      modal.innerHTML =
        '<button type="button" class="modal-close-x" onclick="document.getElementById(\'comparisonModal\').remove()" aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>' +
        '<h2 style="margin-bottom:16px;">Compare Athletes</h2>' +
        '<p style="color:var(--text-muted);">Shortlist at least one athlete first — tap the bookmark icon on any card in Discover.</p>' +
        '<div class="modal-buttons"><button type="button" class="btn btn-outline" onclick="document.getElementById(\'comparisonModal\').remove()">Close</button></div>';
      overlay.appendChild(modal);
      document.body.appendChild(overlay);
      overlay.addEventListener('click', function(e){ if(e.target===overlay) overlay.remove(); });
      return;
    }

    // Collect all metric keys across all snapshots (excluding UI-only fields).
    var SKIP = { id:1, name:1, avatar:1, sport:1, location:1, gymName:1,
                 verificationStatus:1, availability:1, availSponsorship:1,
                 availTrials:1, availOpportunities:1 };
    var metricKeys = [];
    entries.forEach(function(e) {
      var s = e.snapshot || {};
      Object.keys(s).forEach(function(k) {
        if (!SKIP[k] && metricKeys.indexOf(k) === -1 && typeof s[k] !== 'object') {
          metricKeys.push(k);
        }
      });
    });

    // Format a metric key as a human-readable label.
    function labelKey(k) {
      return k.replace(/([A-Z])/g, ' $1').replace(/^./, function(c){ return c.toUpperCase(); }).trim();
    }

    function avail(snap) {
      var tags = [];
      if (snap.availability && snap.availability.openToSponsorship || snap.availSponsorship) tags.push('Sponsorship');
      if (snap.availability && snap.availability.openToTrials     || snap.availTrials)      tags.push('Trials');
      if (snap.availability && snap.availability.openToOpportunities || snap.availOpportunities) tags.push('Opportunities');
      return tags.length
        ? tags.map(function(t){ return '<span class="badge badge-green" style="font-size:9px;">' + t + '</span>'; }).join(' ')
        : '<span style="color:var(--text-muted);font-size:11px;">—</span>';
    }

    // Build table: rows = attributes, columns = athletes.
    var colCount = entries.length;
    var colW = Math.max(140, Math.floor(820 / colCount));

    var headCells = entries.map(function(e) {
      var s = e.snapshot || {};
      var avHtml = typeof avatarCircleHTML === 'function' ? avatarCircleHTML(s.avatar, 32) : '';
      return '<th style="min-width:' + colW + 'px;padding:10px 12px;text-align:center;"><div style="display:flex;justify-content:center;margin-bottom:6px;">' +
        avHtml +
        '</div><strong style="font-family:var(--font-display);font-size:14px;">' +
        esc(s.name || e.id) +
        '</strong></th>';
    }).join('');

    var rows = [];

    // Sport / Location
    rows.push('<tr><td style="font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:0.6px;color:var(--text-muted);padding:8px 12px;white-space:nowrap;">Sport · Location</td>' +
      entries.map(function(e){
        var s = e.snapshot || {};
        var parts = [s.sport, s.location].filter(Boolean);
        return '<td style="padding:8px 12px;text-align:center;font-size:13px;">' + (esc(parts.join(' · ')) || '—') + '</td>';
      }).join('') + '</tr>');

    // Verification
    rows.push('<tr><td style="font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:0.6px;color:var(--text-muted);padding:8px 12px;white-space:nowrap;">Verification</td>' +
      entries.map(function(e){
        var s = e.snapshot || {};
        var badge = (s.verificationStatus && typeof window.getVerificationBadgeHTML === 'function')
          ? window.getVerificationBadgeHTML(s.verificationStatus, s.gymName)
          : '<span style="color:var(--text-muted);font-size:11px;">—</span>';
        return '<td style="padding:8px 12px;text-align:center;">' + badge + '</td>';
      }).join('') + '</tr>');

    // Availability
    rows.push('<tr><td style="font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:0.6px;color:var(--text-muted);padding:8px 12px;white-space:nowrap;">Open To</td>' +
      entries.map(function(e){
        return '<td style="padding:8px 12px;text-align:center;display:table-cell;">' + avail(e.snapshot || {}) + '</td>';
      }).join('') + '</tr>');

    // Metric rows
    metricKeys.forEach(function(k) {
      rows.push('<tr><td style="font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:0.6px;color:var(--text-muted);padding:8px 12px;white-space:nowrap;">' +
        esc(labelKey(k)) + '</td>' +
        entries.map(function(e){
          var v = (e.snapshot || {})[k];
          return '<td style="padding:8px 12px;text-align:center;font-size:13px;font-weight:600;color:var(--text-primary);">' + (v !== undefined && v !== null ? esc(v) : '—') + '</td>';
        }).join('') + '</tr>');
    });

    // View Profile links
    rows.push('<tr><td style="padding:8px 12px;"></td>' +
      entries.map(function(e){
        return '<td style="padding:8px 12px;text-align:center;"><a href="/athlete/' + encodeURIComponent(e.id) + '" class="btn btn-outline btn-sm" style="display:inline-flex;justify-content:center;font-size:12px;">View Profile</a></td>';
      }).join('') + '</tr>');

    modal.innerHTML =
      '<button type="button" class="modal-close-x" onclick="document.getElementById(\'comparisonModal\').remove()" aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>' +
      '<h2 style="margin-bottom:4px;">Compare Athletes</h2>' +
      '<p style="font-size:12px;color:var(--text-muted);margin-bottom:16px;">' + entries.length + ' athlete' + (entries.length!==1?'s':'') + ' shortlisted</p>' +
      '<div style="overflow-x:auto;">' +
        '<table style="width:100%;border-collapse:collapse;min-width:' + (colCount * colW + 180) + 'px;">' +
          '<thead><tr><th style="padding:10px 12px;text-align:left;min-width:140px;"></th>' + headCells + '</tr></thead>' +
          '<tbody style="background:var(--bg-card);">' + rows.join('') + '</tbody>' +
        '</table>' +
      '</div>' +
      '<div class="modal-buttons" style="margin-top:16px;"><button type="button" class="btn btn-outline" onclick="document.getElementById(\'comparisonModal\').remove()">Close</button></div>';

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function(e){ if(e.target===overlay) overlay.remove(); });
  };
})(window);
