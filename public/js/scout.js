// ── scout.js ──────────────────────────────────────────
// The SECOND interface: scouts / teams / sponsors. Completely separate shell
// from the athlete app (own layout, own nav, same colour tokens as the athlete app, no logging/PRs/
// leaderboard). Self-contained on purpose — it injects its own CSS and DOM,
// and hooks the athlete app only through a handful of wrappers, so none of
// the big existing files need editing.
//
// LOAD LAST: <script src="/js/scout.js"></script> goes AFTER app-init.js.
//
// Data (see firestore-scout-rules.txt):
//   scoutAccounts/{uid}               who is a scout (org name/type/verified)
//   scoutShortlists/{scoutId__athleteId}   private shortlist + note
//   introRequests/{scoutId__athleteId}     scout asks -> athlete accepts ->
//                                          athlete's chosen contact appears ON
//                                          the request doc, visible to both.
// ACCESS: the portal is for scout / sponsor accounts only. A scout account needs
// users/{uid}.accountType == 'scout' (set once, on a fresh account) AND a scoutAccounts
// doc; firestore.rules enforces both, and nothing here creates a scout account for an
// existing athlete. Scouts CAN switch to the athlete interface (own profile, logging).
// A scout never sees an athlete's email/phone unless the athlete accepts and
// picks what to share. (Under-19 restriction on intros intentionally removed for now.)

(function () {
    'use strict';
    if (/^\/athlete\//.test(location.pathname)) return; // public profile route has no app shell

    const HINT_KEY = 'topset_scout_hint', PENDING_KEY = 'topset_scout_pending';
    const ORG_TYPES = [['team','Team / club'],['scout','Independent scout'],['sponsor','Sponsor / brand'],['gym','Gym / academy'],['other','Other']];
    const orgLabel = v => (ORG_TYPES.find(x => x[0] === v) || [0, 'Organisation'])[1];
    const esc = s => escapeHTML(s == null ? '' : String(s));
    const fmtTs = ts => ts ? new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';

    const SC = {
        uid: undefined, isScout: false, acct: null, view: 'discover',
        profiles: [], profilesLoaded: false, loading: false,
        shortlist: new Map(), requests: new Map(), incoming: [],
        cmp: new Set(), accepting: null, roleKey: null, unsubs: [], acctUnsub: null,
        signupType: 'athlete', retried: false, claiming: false
    };
    window.topsetIsScout = () => !!SC.acct; // profile-hub.js uses this to show the portal row
    const F = { q: '', sport: '', age: '', test: '', verifiedOnly: false, spons: false, trials: false, opps: false };

    const ICON = {
        discover: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
        shortlist: '<path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"/>',
        intros: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
        account: '<circle cx="12" cy="8" r="4"/><path d="M6 21v-2a6 6 0 0 1 12 0v2"/>',
        check: '<path d="M20 6 9 17l-5-5"/>',
        close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
        compare: '<path d="M16 3h5v5"/><path d="M8 21H3v-5"/><path d="m21 3-7 7"/><path d="m3 21 7-7"/>',
        switch: '<path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/>'
    };
    const svg = (k, s, fill) => `<svg viewBox="0 0 24 24" width="${s || 18}" height="${s || 18}" fill="${fill ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0">${ICON[k]}</svg>`;
    const logoSrc = () => (document.documentElement.getAttribute('data-theme') === 'light') ? '/logo-light.png' : '/logo-dark.png';

    // ── CSS ─────────────────────────────────────────────────────────────
    (function injectCSS() {
        const st = document.createElement('style'); st.id = 'scout-css';
        st.textContent = `
body:not(.scout-mode) #scoutApp{display:none}
body.scout-mode .header,body.scout-mode .bottom-nav,body.scout-mode .main-container,body.scout-mode .public-athlete-page{display:none!important}
body.scout-mode{padding-bottom:0}
.sc-hide{display:none!important}
#scoutApp{height:100vh;height:100dvh;display:grid;grid-template-columns:232px minmax(0,1fr);background:var(--bg);overflow:hidden}
.sc-side{height:100%;overflow-y:auto;display:flex;flex-direction:column;gap:22px;padding:22px 16px;border-right:1px solid var(--border);background:var(--bg-card)}
.sc-brand{display:flex;align-items:center;gap:10px;flex-wrap:wrap;min-height:32px}.sc-brand img{height:32px;width:auto;display:block;flex-shrink:0}
.sc-switch-top-btn{display:none!important}
.sc-pill{font-family:var(--font-display);font-size:11px;letter-spacing:2px;padding:3px 9px;border-radius:40px;border:1.5px solid var(--border);background:transparent;color:var(--text-secondary);font-weight:700;flex-shrink:0}
.sc-nav{display:flex;flex-direction:column;gap:4px}
.sc-nav button{display:flex;align-items:center;gap:12px;padding:11px 14px;border:none;border-radius:var(--radius-sm);background:transparent;color:var(--text-secondary);font-family:var(--font-body);font-weight:700;font-size:14px;cursor:pointer;text-align:left;transition:all var(--transition)}
.sc-nav button:hover{background:var(--bg-card-hover);color:var(--text-primary)}
.sc-nav button.active{background:var(--accent-tint-bg);color:var(--accent-green)}
.sc-nb{margin-left:auto;font-size:11px;min-width:20px;height:20px;line-height:20px;text-align:center;border-radius:10px;background:var(--accent-green);color:var(--on-accent)}
.sc-org{margin-top:auto;padding:12px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg-input);font-size:12px;color:var(--text-muted)}
.sc-org strong{display:block;color:var(--text-primary);font-size:13.5px;margin-bottom:2px}
.sc-main{height:100%;overflow-y:auto;scrollbar-gutter:stable;padding:20px 18px 48px;min-width:0}.sc-main>*{max-width:1000px;margin-left:auto;margin-right:auto}
.sc-head{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;margin-bottom:18px;flex-wrap:wrap}
.sc-head h1{font-family:var(--font-display);font-size:34px;letter-spacing:.5px;line-height:1.1}
.sc-head p{font-size:13px;color:var(--text-secondary);max-width:560px;margin-top:6px}
.sc-count{font-size:12.5px;font-weight:700;color:var(--text-muted)}
.sc-filters{display:grid;grid-template-columns:2fr 1fr 1fr 1.4fr;gap:10px;margin-bottom:12px}
.sc-filters input,.sc-filters select,.sc-select{font-family:var(--font-body);font-size:14px;height:44px;padding:0 13px;border-radius:var(--radius-sm);border:2px solid var(--border);background:var(--bg-input);color:var(--text-primary);width:100%;min-width:0}
.sc-filters input:focus,.sc-filters select:focus{outline:none;border-color:var(--accent-green)}
.sc-chips{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:20px}
.sc-chip{font-family:var(--font-body);font-size:12.5px;font-weight:700;height:34px;display:inline-flex;align-items:center;padding:0 14px;border-radius:40px;border:1.5px solid var(--border);background:transparent;color:var(--text-secondary);cursor:pointer;transition:all var(--transition)}
.sc-chip.on{background:var(--accent-green);border-color:var(--accent-green);color:var(--on-accent)}
.sc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(285px,1fr));grid-auto-rows:1fr;gap:14px;margin-bottom:26px}
.sc-card{position:relative;display:flex;flex-direction:column;gap:10px;padding:16px;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);cursor:pointer;transition:all var(--transition)}
.sc-card:hover{border-color:var(--accent-green);transform:translateY(-2px)}
.sc-card-top{display:flex;align-items:center;gap:12px}.sc-card-id{min-width:0;flex:1}
.sc-name{font-family:var(--font-display);font-size:18px;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sc-meta{font-size:12px;color:var(--text-muted);font-weight:600}
.sc-bm{width:36px;height:36px;border-radius:50%;border:1px solid var(--border);background:var(--bg-input);color:var(--text-muted);display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0}
.sc-bm.on,.sc-bm:hover{color:var(--accent-green);border-color:var(--accent-green)}
.sc-ver-tag{display:inline-flex;align-items:center;gap:5px;width:fit-content;font-size:10.5px;font-weight:800;letter-spacing:.8px;text-transform:uppercase;color:var(--on-accent);background:var(--accent-green);padding:3px 10px;border-radius:40px}
.sc-ver-none{font-size:11.5px;color:var(--text-muted);font-weight:600;padding:3px 0}
.sc-ver-rows{display:flex;flex-direction:column;border:1px solid var(--border);border-radius:var(--radius-sm);overflow:hidden}
.sc-ver-row{display:flex;justify-content:space-between;gap:10px;padding:7px 11px;font-size:12.5px;border-bottom:1px solid var(--border)}.sc-ver-row:last-child{border-bottom:none}
.sc-ver-row span{color:var(--text-secondary)}.sc-ver-row strong{font-family:var(--font-display);font-size:15px;white-space:nowrap}
.sc-av{display:flex;gap:5px;flex-wrap:wrap}.sc-av .badge{font-size:9px}
.sc-card-note{font-size:12px;color:var(--text-secondary);background:var(--bg-input);border-radius:var(--radius-sm);padding:8px 10px;border-left:3px solid var(--accent-green)}
.sc-cmp{position:absolute;top:10px;right:56px;width:18px;height:18px;accent-color:var(--accent-green);cursor:pointer}
.sc-section-title{font-family:var(--font-display);font-size:19px;margin:6px 0 12px;display:flex;gap:8px;align-items:baseline}
.sc-section-title small{font-family:var(--font-body);font-size:12px;color:var(--text-muted);font-weight:700}
.sc-empty{text-align:center;padding:56px 20px;color:var(--text-muted);font-size:14px;border:1px dashed var(--border);border-radius:var(--radius)}
.sc-row{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;padding:14px 16px;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);margin-bottom:10px;flex-wrap:wrap}
.sc-row p{font-size:12.5px;color:var(--text-secondary);margin:4px 0}
.sc-contact{margin-top:8px;padding:10px 12px;border-radius:var(--radius-sm);background:var(--accent-tint-bg);font-size:13px;display:flex;flex-direction:column;gap:4px}
.sc-contact a{color:var(--accent-green);font-weight:700}
.sc-d-head{display:flex;gap:16px;align-items:center;margin:4px 0 14px;padding-right:40px}.sc-d-head h2{padding:0;margin:0 0 2px}
.sc-sec{margin:18px 0 6px;font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:var(--text-muted)}
.sc-vtable{width:100%;border:1px solid var(--border);border-radius:var(--radius-sm);overflow:hidden}
.sc-vtable .r{display:grid;grid-template-columns:1.4fr 1fr 1.3fr;gap:8px;padding:10px 12px;border-bottom:1px solid var(--border);font-size:13px;align-items:center}.sc-vtable .r:last-child{border-bottom:none}
.sc-vtable b{font-family:var(--font-display);font-size:18px}.sc-vtable small{color:var(--text-muted);font-size:11.5px;display:block}
.sc-note{font-size:12.5px;color:var(--text-secondary);background:var(--bg-input);border-radius:var(--radius-sm);padding:10px 12px}
.sc-fine{font-size:11.5px;color:var(--text-muted);margin-top:8px}
.sc-textarea{width:100%;min-height:92px;resize:vertical;font-family:var(--font-body);font-size:14px;padding:11px 12px;border-radius:var(--radius-sm);border:2px solid var(--border);background:var(--bg-input);color:var(--text-primary);margin-top:8px}
.sc-textarea:focus{outline:none;border-color:var(--accent-green)}
.sc-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
.sc-cmp-table{width:100%;border-collapse:collapse;font-size:13px;min-width:520px}.sc-cmp-table th,.sc-cmp-table td{padding:10px 12px;border-bottom:1px solid var(--border);text-align:center}.sc-cmp-table td:first-child,.sc-cmp-table th:first-child{text-align:left;font-size:11px;font-weight:800;letter-spacing:.7px;text-transform:uppercase;color:var(--text-muted);white-space:nowrap}.sc-cmp-table td b{font-family:var(--font-display);font-size:17px}
.sc-acct-card{background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:20px;margin-bottom:16px;max-width:560px}
@media(max-width:1023px){
 #scoutApp{grid-template-columns:1fr;grid-template-rows:auto minmax(0,1fr)}
 .sc-switch-top-btn{display:inline-flex!important}.sc-switch-btn{display:none!important}
 .sc-side{height:auto;overflow:visible;flex-direction:row;align-items:center;padding:12px 16px;gap:10px;border-right:none;border-bottom:1px solid var(--border);z-index:90}
 .sc-org{display:none}
 .sc-nav{position:fixed;left:0;right:0;bottom:0;z-index:95;flex-direction:row;justify-content:space-around;gap:0;padding:6px 6px max(8px,env(safe-area-inset-bottom));background:var(--bg-card);border-top:1px solid var(--border)}
 .sc-nav button{flex-direction:column;gap:3px;font-size:11px;padding:7px 10px;flex:1;align-items:center;text-align:center;position:relative}
 .sc-nb{position:absolute;top:2px;right:18%;margin:0}
 .sc-main{padding:16px 16px 100px}
 .sc-filters{grid-template-columns:1fr 1fr}.sc-filters input{grid-column:1/-1}
 .sc-head h1{font-size:28px}
}`;
        document.head.appendChild(st);
    })();

    // ── Shell ───────────────────────────────────────────────────────────
    function buildShell() {
        if ($('#scoutApp')) return;
        const el = document.createElement('div'); el.id = 'scoutApp';
        el.innerHTML = `
<aside class="sc-side">
  <div class="sc-brand">
    <img id="scLogo" alt="TOPSET" src="${logoSrc()}">
    <span class="sc-pill">SCOUT</span>
    <button type="button" onclick="window.switchToAthleteMode()" class="sc-switch-top-btn" title="Back to Athlete app" style="margin-left:auto;background:var(--bg-input);border:1.5px solid var(--border);border-radius:40px;color:var(--text-primary);padding:5px 12px;font-size:11.5px;font-weight:700;display:inline-flex;align-items:center;gap:6px;cursor:pointer;transition:all var(--transition);">${svg('switch', 14)}<span>Athlete</span></button>
  </div>
  <nav class="sc-nav" id="scNav">
    ${[['discover','Discover'],['shortlist','Shortlist'],['intros','Intros'],['account','Account']].map(([k, l]) => `<button type="button" data-act="nav" data-view="${k}">${svg(k)}<span>${l}</span><span class="sc-nb hidden" id="scNb-${k}"></span></button>`).join('')}
    <button type="button" onclick="window.switchToAthleteMode()" class="sc-switch-btn" style="margin-top:14px;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text-primary);padding:10px 12px;font-size:13px;font-weight:700;display:flex;align-items:center;gap:10px;cursor:pointer;transition:all var(--transition);">${svg('switch', 16)}<span>Athlete Interface</span></button>
  </nav>
  <div class="sc-org" id="scOrg"></div>
  <button type="button" onclick="window.handleLogout()" style="background:transparent;border:none;color:var(--text-muted);font-size:12px;font-weight:700;display:flex;align-items:center;gap:8px;cursor:pointer;padding:8px 4px;margin-top:6px;">${svg('close', 14)} Log Out</button>
</aside>
<main class="sc-main" id="scMain"></main>
<div class="modal-overlay hidden" id="scDetailModal"><div class="modal modal-wide" id="scDetailBody"></div></div>
<div class="modal-overlay hidden" id="scCompareModal"><div class="modal modal-wide" id="scCompareBody" style="max-width:900px"></div></div>`;
        document.body.appendChild(el);
        el.addEventListener('click', onClick);
        el.addEventListener('input', e => { if (e.target.id === 'scQ') { F.q = e.target.value; renderResults(); } });
        el.addEventListener('change', onChange);
        el.addEventListener('focusout', e => { if (e.target.id === 'scNote') saveNote(e.target.dataset.id, e.target.value); });
        new MutationObserver(() => { const i = $('#scLogo'); if (i) i.src = logoSrc(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    }

    function renderOrg() {
        const o = $('#scOrg'); if (!o) return;
        o.innerHTML = SC.acct ? `<strong>${esc(SC.acct.orgName)}</strong>${esc(orgLabel(SC.acct.orgType))}` : '<span style="font-size:12px;color:var(--text-muted);">Scout Portal</span>';
    }
    function updateNav() {
        const n = SC.shortlist.size, b = $('#scNb-shortlist');
        if (b) { b.textContent = n; b.classList.toggle('hidden', !n); }
        const acc = [...SC.requests.values()].filter(r => r.status === 'accepted').length, b2 = $('#scNb-intros');
        if (b2) { b2.textContent = acc; b2.classList.toggle('hidden', !acc); b2.title = 'Connected'; }
        document.querySelectorAll('#scNav button').forEach(x => x.classList.toggle('active', x.dataset.view === SC.view));
    }
    function setView(v) {
        SC.view = v; updateNav();
        if (v === 'discover') renderDiscover(); else if (v === 'shortlist') renderShortlist(); else if (v === 'intros') renderIntros(); else renderAccount();
        window.scrollTo(0, 0);
    }
    function refreshActive() {
        updateNav();
        if (!SC.isScout) return;
        if (SC.view === 'discover') renderResults(); else if (SC.view === 'shortlist') renderShortlist(); else if (SC.view === 'intros') renderIntros();
        const m = $('#scDetailModal');
        if (m && !m.classList.contains('hidden') && SC.detailId) {
            const a = document.activeElement;
            if (!(a && a.tagName === 'TEXTAREA' && m.contains(a))) renderDetail(SC.detailId);
        }
    }

    // ── Data ────────────────────────────────────────────────────────────
    async function loadProfiles(force) {
        if (SC.loading || (SC.profilesLoaded && !force)) return;
        if (!initFirebase()) return;
        SC.loading = true;
        try {
            const snap = await db.collection('athleteProfiles').where('isPublic', '==', true).get();
            SC.profiles = []; snap.forEach(d => SC.profiles.push({ id: d.id, ...d.data() }));
            SC.profilesLoaded = true;
        } catch (e) { console.error('scout loadProfiles failed:', e); showToast('Could not load athletes.'); }
        SC.loading = false;
        if (SC.isScout && (SC.view === 'discover' || SC.view === 'shortlist')) setView(SC.view);
    }
    const verifiedList = p => Object.values(p.verifiedResults || {}).filter(v => v && v.value != null).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const lowerBetter = r => { const c = getTestConfig(r.test); return c ? c.higherIsBetter === false : r.unit === 'time'; };
    const bestFor = (p, test) => { const l = verifiedList(p).filter(r => r.test === test); if (!l.length) return null; return l.reduce((b, r) => (lowerBetter(r) ? r.value < b.value : r.value > b.value) ? r : b, l[0]); };
    const profileById = id => SC.profiles.find(p => p.id === id);

    function filteredProfiles() {
        const q = F.q.trim().toLowerCase();
        let list = SC.profiles.filter(p => {
            if (q && !`${p.name || ''} ${p.sport || ''} ${p.location || ''}`.toLowerCase().includes(q)) return false;
            if (F.sport && p.sport !== F.sport) return false;
            if (F.age && p.ageGroup !== F.age) return false;
            const v = verifiedList(p);
            if (F.verifiedOnly && !v.length) return false;
            if (F.test && !v.some(r => r.test === F.test)) return false;
            if (F.spons && !p.availability?.openToSponsorship) return false;
            if (F.trials && !p.availability?.openToTrials) return false;
            if (F.opps && !p.availability?.openToOpportunities) return false;
            return true;
        });
        if (F.test) {
            list.sort((a, b) => { const x = bestFor(a, F.test), y = bestFor(b, F.test); return lowerBetter(x) ? x.value - y.value : y.value - x.value; });
        } else {
            list.sort((a, b) => verifiedList(b).length - verifiedList(a).length || (a.name || '').localeCompare(b.name || ''));
        }
        return list;
    }

    // ── Cards ───────────────────────────────────────────────────────────
    function cardHTML(p, o) {
        o = o || {};
        const v = verifiedList(p), bm = SC.shortlist.has(p.id);
        const meta = [p.sport, p.location, p.ageGroup].filter(Boolean).map(esc).join(' · ') || 'No details yet';
        const av = [p.availability?.openToSponsorship && 'Sponsorship', p.availability?.openToTrials && 'Trials', p.availability?.openToOpportunities && 'Opportunities'].filter(Boolean);
        let vs = v; if (F.test) vs = [...v.filter(r => r.test === F.test), ...v.filter(r => r.test !== F.test)];
        const body = o.gone
            ? '<div class="sc-ver-none">This profile is no longer public.</div>'
            : (v.length
                ? `<div class="sc-ver-tag">${svg('check', 12)} ${v.length} verified result${v.length > 1 ? 's' : ''}</div><div class="sc-ver-rows">${vs.slice(0, 3).map(r => `<div class="sc-ver-row"><span>${esc(r.test)}</span><strong>${esc(r.display ?? r.value)}</strong></div>`).join('')}</div>`
                : '<div class="sc-ver-none">No verified results yet</div>');
        return `<article class="sc-card" data-act="open" data-id="${esc(p.id)}">
  <div class="sc-card-top">${avatarCircleHTML(p.avatar, 46)}<div class="sc-card-id"><div class="sc-name">${esc(p.name || 'TOPSET Athlete')}</div><div class="sc-meta">${meta}</div></div>
  <button type="button" class="sc-bm${bm ? ' on' : ''}" data-act="bm" data-id="${esc(p.id)}" title="${bm ? 'Remove from shortlist' : 'Add to shortlist'}">${svg('shortlist', 17, bm)}</button></div>
  ${body}
  ${!o.gone && av.length ? `<div class="sc-av">${av.map(a => `<span class="badge badge-green">${a}</span>`).join('')}</div>` : ''}
  ${o.note ? `<div class="sc-card-note">${esc(o.note)}</div>` : ''}
  ${o.cmp ? `<input type="checkbox" class="sc-cmp" data-id="${esc(p.id)}" title="Select to compare" ${SC.cmp.has(p.id) ? 'checked' : ''}>` : ''}
</article>`;
    }

    // ── Discover ────────────────────────────────────────────────────────
    function verifiedTestNames() {
        const s = new Set(); SC.profiles.forEach(p => verifiedList(p).forEach(r => s.add(r.test))); return [...s].sort();
    }
    function renderDiscover() {
        const sports = getSportNames(), tests = verifiedTestNames();
        $('#scMain').innerHTML = `
<div class="sc-head"><div><h1>Discover</h1><p>Athletes who chose a public profile. <b>Verified</b> results were confirmed by the athlete's gym manager — the rest of a profile is self-described.</p></div><div class="sc-count" id="scCount"></div></div>
<div class="sc-filters">
  <input id="scQ" type="search" placeholder="Search name, sport or location" value="${esc(F.q)}">
  <select id="scSport"><option value="">All sports</option>${sports.map(s => `<option value="${esc(s)}"${F.sport === s ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select>
  <select id="scAge"><option value="">All ages</option>${['14-17', '18-24', '25-34', '35-44', '45-54', '55+'].map(a => `<option${F.age === a ? ' selected' : ''}>${a}</option>`).join('')}</select>
  <select id="scTest"><option value="">Any verified test</option>${tests.map(t => `<option value="${esc(t)}"${F.test === t ? ' selected' : ''}>Best at: ${esc(t)}</option>`).join('')}</select>
</div>
<div class="sc-chips">
  <button type="button" class="sc-chip${F.verifiedOnly ? ' on' : ''}" data-act="chip" data-k="verifiedOnly">Verified results only</button>
  <button type="button" class="sc-chip${F.spons ? ' on' : ''}" data-act="chip" data-k="spons">Open to sponsorship</button>
  <button type="button" class="sc-chip${F.trials ? ' on' : ''}" data-act="chip" data-k="trials">Open to trials</button>
  <button type="button" class="sc-chip${F.opps ? ' on' : ''}" data-act="chip" data-k="opps">Open to opportunities</button>
  <button type="button" class="sc-chip" data-act="refresh" style="margin-left:auto">Refresh</button>
</div>
<div class="sc-grid" id="scGrid"></div>`;
        renderResults();
        if (!SC.profilesLoaded) loadProfiles();
    }
    function renderResults() {
        const grid = $('#scGrid'); if (!grid) return;
        if (!SC.profilesLoaded) { grid.innerHTML = '<div class="sc-empty" style="grid-column:1/-1">Loading athletes…</div>'; return; }
        const list = filteredProfiles();
        const cnt = $('#scCount'); if (cnt) cnt.textContent = `${list.length} athlete${list.length === 1 ? '' : 's'} · ${list.filter(p => verifiedList(p).length).length} with verified results`;
        grid.innerHTML = list.length ? list.map(p => cardHTML(p)).join('') : `<div class="sc-empty" style="grid-column:1/-1">${SC.profiles.length ? 'No athletes match these filters.' : 'No athletes have gone public yet.'}</div>`;
    }

    // ── Shortlist ───────────────────────────────────────────────────────
    async function toggleShortlist(id) {
        const uid = appState.currentUserId, p = profileById(id) || (SC.shortlist.get(id) && { id }); if (!uid || !p) return;
        const ref = db.collection('scoutShortlists').doc(`${uid}__${id}`);
        try {
            if (SC.shortlist.has(id)) await ref.delete();
            else await ref.set({ scoutId: uid, athleteId: id, name: String(p.name || '').slice(0, 60), avatar: avatarKey(p.avatar), sport: String(p.sport || '').slice(0, 60), location: String(p.location || '').slice(0, 60), note: '', addedAt: Date.now() });
        } catch (e) { console.error('shortlist failed:', e); showToast('Could not update your shortlist.'); }
    }
    async function saveNote(id, text) {
        const cur = SC.shortlist.get(id); text = (text || '').trim().slice(0, 300);
        if (!cur || cur.note === text) return;
        try { await db.collection('scoutShortlists').doc(`${appState.currentUserId}__${id}`).update({ note: text }); } catch (e) { console.error(e); showToast('Could not save the note.'); }
    }
    function renderShortlist() {
        const items = [...SC.shortlist.values()].sort((a, b) => b.addedAt - a.addedAt);
        let html = `<div class="sc-head"><div><h1>Shortlist</h1><p>Private to you. Add a note on any athlete, then tick two or more to compare their verified results side by side.</p></div><button type="button" class="btn btn-primary" data-act="compare">${svg('compare', 15)} Compare (${SC.cmp.size})</button></div>`;
        if (!items.length) html += '<div class="sc-empty">Nobody here yet. Tap the bookmark on an athlete in Discover.</div>';
        else {
            if (!SC.profilesLoaded) { loadProfiles(); }
            const groups = {};
            items.forEach(s => { const p = profileById(s.athleteId); const sport = (p ? p.sport : s.sport) || 'No sport listed'; (groups[sport] = groups[sport] || []).push({ s, p }); });
            Object.keys(groups).sort().forEach(sp => {
                html += `<div class="sc-section-title">${esc(sp)} <small>${groups[sp].length}</small></div><div class="sc-grid">${groups[sp].map(({ s, p }) => p ? cardHTML(p, { note: s.note, cmp: true }) : cardHTML({ id: s.athleteId, name: s.name, avatar: s.avatar, sport: s.sport, location: s.location }, { note: s.note, gone: SC.profilesLoaded })).join('')}</div>`;
            });
        }
        $('#scMain').innerHTML = html;
    }
    function openCompare() {
        const ps = [...SC.cmp].map(profileById).filter(Boolean);
        if (ps.length < 2) return showToast('Tick at least two athletes to compare.');
        if (ps.length > 4) return showToast('Compare up to four athletes at a time.');
        const tests = [...new Set(ps.flatMap(p => verifiedList(p).map(r => r.test)))].sort();
        const cell = (p, t) => { const b = bestFor(p, t); return b ? `<b>${esc(b.display ?? b.value)}</b><small>${esc(b.gymName || '')}${b.date ? ' · ' + esc(formatDate(b.date)) : ''}</small>` : '<span style="color:var(--text-muted)">—</span>'; };
        $('#scCompareBody').innerHTML = `<button type="button" class="modal-close-x" data-act="close">${svg('close', 16)}</button><h2>Compare athletes</h2><p class="sc-fine" style="margin:-8px 0 14px">Verified results only, shown as recorded. TOPSET doesn't pick a winner — different gyms and dates matter.</p>
<div style="overflow-x:auto"><table class="sc-cmp-table"><thead><tr><th></th>${ps.map(p => `<th>${avatarCircleHTML(p.avatar, 36)}<div class="sc-name" style="margin-top:6px">${esc(p.name || 'Athlete')}</div></th>`).join('')}</tr></thead><tbody>
<tr><td>Sport · Location</td>${ps.map(p => `<td>${esc([p.sport, p.location].filter(Boolean).join(' · ') || '—')}</td>`).join('')}</tr>
<tr><td>Age band</td>${ps.map(p => `<td>${esc(p.ageGroup || '—')}</td>`).join('')}</tr>
<tr><td>Verified results</td>${ps.map(p => `<td><b>${verifiedList(p).length}</b></td>`).join('')}</tr>
${tests.map(t => `<tr><td>${esc(t)}</td>${ps.map(p => `<td>${cell(p, t)}</td>`).join('')}</tr>`).join('')}
<tr><td></td>${ps.map(p => `<td><button type="button" class="btn btn-outline btn-sm" data-act="open" data-id="${esc(p.id)}">View</button></td>`).join('')}</tr>
</tbody></table></div>`;
        $('#scCompareModal').classList.remove('hidden');
    }

    // ── Athlete detail ──────────────────────────────────────────────────
    function openDetail(id) { SC.detailId = id; renderDetail(id); $('#scDetailModal').classList.remove('hidden'); }
    function contactHTML(c) {
        if (!c) return '';
        const rows = [];
        if (c.email) rows.push(`Email: <a href="mailto:${esc(c.email)}">${esc(c.email)}</a>`);
        if (c.phone) { let d = String(c.phone).replace(/\D/g, ''); if (d.startsWith('0')) d = '27' + d.slice(1); rows.push(`Phone / WhatsApp: <a href="tel:${esc(c.phone)}">${esc(c.phone)}</a> · <a href="https://wa.me/${esc(d)}" target="_blank" rel="noopener">WhatsApp</a>`); }
        return rows.length ? `<div class="sc-contact">${rows.join('')}</div>` : '';
    }
    function introBlock(p) {
        const r = SC.requests.get(p.id);
        if (!r) {
            return `<button type="button" class="btn btn-primary" data-act="intro-open" id="scIntroBtn">Request intro</button>
<div id="scIntroForm" class="hidden"><textarea class="sc-textarea" id="scIntroMsg" maxlength="400" placeholder="Who you are, what you're offering, and why this athlete. They'll read this before deciding."></textarea><div class="sc-actions"><button type="button" class="btn btn-primary" data-act="intro-send" data-id="${esc(p.id)}">Send request</button><button type="button" class="btn btn-outline" data-act="intro-cancel">Cancel</button></div></div>
<p class="sc-fine">They see your name, organisation and message. Your contact details aren't shared by TOPSET, and theirs stay hidden until they accept and choose what to share.</p>`;
        }
        if (r.status === 'pending') return `<div class="sc-note">Intro request sent ${esc(fmtTs(r.createdAt))} — waiting for their reply.</div><div class="sc-actions"><button type="button" class="btn btn-outline btn-sm" data-act="intro-withdraw" data-id="${esc(p.id)}">Withdraw request</button></div>`;
        if (r.status === 'accepted') return `<div class="sc-note"><b>Connected.</b> ${esc(p.name || 'They')} accepted your intro and shared:</div>${contactHTML(r.athleteContact) || '<div class="sc-note">No contact details on file.</div>'}`;
        if (r.status === 'revoked') return '<div class="sc-note">This athlete ended contact access. Please respect that.</div>';
        return '<div class="sc-note">This athlete isn\'t taking intros right now. A new request can\'t be sent.</div>';
    }
    function renderDetail(id) {
        const body = $('#scDetailBody'), p = profileById(id);
        if (!p) { body.innerHTML = `<button type="button" class="modal-close-x" data-act="close">${svg('close', 16)}</button><h2>Athlete</h2><div class="sc-note">This profile isn't available — it may have gone private.</div>`; return; }
        const v = verifiedList(p), s = SC.shortlist.get(id);
        const av = [p.availability?.openToSponsorship && 'Open to sponsorship', p.availability?.openToTrials && 'Open to trials', p.availability?.openToOpportunities && 'Open to opportunities'].filter(Boolean);
        body.innerHTML = `<button type="button" class="modal-close-x" data-act="close">${svg('close', 16)}</button>
<div class="sc-d-head">${avatarCircleHTML(p.avatar, 68)}<div><h2>${esc(p.name || 'TOPSET Athlete')}</h2><div class="sc-meta">${esc([p.sport, p.location, p.ageGroup].filter(Boolean).join(' · ') || 'No details yet')}</div></div></div>
${av.length ? `<div class="sc-av" style="margin-bottom:10px">${av.map(a => `<span class="badge badge-green">${a}</span>`).join('')}</div>` : ''}
${p.bio ? `<p style="font-size:14px;line-height:1.6;color:var(--text-secondary)">${esc(p.bio)}</p>` : ''}
<div class="sc-sec">Verified results</div>
${v.length ? `<div class="sc-vtable">${v.map(r => `<div class="r"><div>${esc(r.test)}</div><b>${esc(r.display ?? r.value)}</b><div>${esc(r.gymName || 'Gym')}<small>${r.date ? esc(formatDate(r.date)) : ''}</small></div></div>`).join('')}</div><p class="sc-fine">Confirmed by the athlete's gym manager — not self-reported.</p>` : '<div class="sc-note">No verified results yet. Nothing on this profile has been confirmed by a gym manager, so treat it as the athlete\'s own description.</div>'}
<div class="sc-sec">Your shortlist</div>
<div class="sc-actions" style="margin-top:0"><button type="button" class="btn ${s ? 'btn-outline' : 'btn-primary'} btn-sm" data-act="bm" data-id="${esc(id)}">${svg('shortlist', 14, !!s)} ${s ? 'On your shortlist' : 'Add to shortlist'}</button><button type="button" class="btn btn-outline btn-sm" data-act="copy-link" data-id="${esc(id)}">Copy profile link</button></div>
${s ? `<textarea class="sc-textarea" id="scNote" data-id="${esc(id)}" maxlength="300" placeholder="Private note — e.g. saw at trials, follow up in March" style="min-height:64px">${esc(s.note || '')}</textarea>` : ''}
<div class="sc-sec">Get in touch</div>
${introBlock(p)}`;
    }
    async function sendIntro(id) {
        const p = profileById(id), a = SC.acct; if (!p || !a) return;
        if (rateLimited('introSend', 2500)) return;
        const msg = ($('#scIntroMsg')?.value || '').trim().slice(0, 400);
        if (msg.length < 10) return showToast("Add a short message — who you are and what you're offering.");
        const uid = appState.currentUserId, me = getCurrentUser();
        try {
            await db.collection('introRequests').doc(`${uid}__${id}`).set({ scoutId: uid, scoutName: String(me?.name || 'Scout').slice(0, 60), scoutOrg: a.orgName, scoutOrgType: a.orgType, scoutOrgVerified: !!a.orgVerified, athleteId: id, athleteName: String(p.name || 'Athlete').slice(0, 60), message: msg, status: 'pending', createdAt: Date.now() });
            showToast('Intro request sent.');
        } catch (e) {
            console.error('intro failed:', e);
            showToast(e.code === 'permission-denied' ? "That request couldn't be sent — this athlete may no longer be public, or you've already asked." : 'Could not send. Check your connection.');
        }
    }

    // ── Intros (scout side) ─────────────────────────────────────────────
    function renderIntros() {
        const list = [...SC.requests.values()].sort((a, b) => b.createdAt - a.createdAt);
        const label = { pending: 'Waiting', accepted: 'Connected', declined: 'Not available', revoked: 'Access ended' };
        const row = r => `<div class="sc-row"><div style="min-width:0;flex:1"><strong>${esc(r.athleteName)}</strong> <span class="badge ${r.status === 'accepted' ? 'badge-green' : 'badge-new'}">${label[r.status] || r.status}</span><p>${esc(r.message)}</p><div class="sc-fine">Sent ${esc(fmtTs(r.createdAt))}</div>${r.status === 'accepted' ? contactHTML(r.athleteContact) : ''}</div><div class="sc-actions" style="margin:0"><button type="button" class="btn btn-outline btn-sm" data-act="open" data-id="${esc(r.athleteId)}">View profile</button>${r.status === 'pending' ? `<button type="button" class="btn btn-outline btn-sm" data-act="intro-withdraw" data-id="${esc(r.athleteId)}">Withdraw</button>` : ''}</div></div>`;
        const sec = (t, st) => { const l = list.filter(r => st.includes(r.status)); return l.length ? `<div class="sc-section-title">${t} <small>${l.length}</small></div>${l.map(row).join('')}` : ''; };
        $('#scMain').innerHTML = `<div class="sc-head"><div><h1>Intros</h1><p>Athletes decide whether to connect. Contact details appear here only after they accept and choose what to share.</p></div></div>`
            + (list.length ? sec('Connected', ['accepted']) + sec('Waiting for a reply', ['pending']) + sec('Closed', ['declined', 'revoked']) : '<div class="sc-empty">No intro requests yet. Open an athlete in Discover and tap “Request intro”.</div>');
        if (!SC.profilesLoaded) loadProfiles();
    }

    // ── Account (scout) ─────────────────────────────────────────────────
    function renderAccount() {
        const a = SC.acct || {}, dark = appState.theme !== 'light';
        $('#scMain').innerHTML = `<div class="sc-head"><div><h1>Account</h1></div></div>
<div class="sc-acct-card"><div class="sc-sec" style="margin-top:0">Organisation</div>
<div class="form-group"><label>Name</label><input id="scAcctOrg" maxlength="60" value="${esc(a.orgName || '')}"></div>
<div class="form-group"><label>Type</label><select id="scAcctType">${ORG_TYPES.map(([k, l]) => `<option value="${k}"${a.orgType === k ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
<p class="sc-fine" style="margin:0 0 12px">Organisation profile on TOPSET.</p>
<button type="button" class="btn btn-primary btn-sm" data-act="acct-save">Save</button></div>
<div class="sc-acct-card"><div class="sc-sec" style="margin-top:0">Theme</div><div class="hub-seg"><button type="button" class="${dark ? 'active' : ''}" data-act="theme" data-t="dark">Dark</button><button type="button" class="${dark ? '' : 'active'}" data-act="theme" data-t="light">Light</button></div></div>
<div class="sc-acct-card"><div class="sc-actions" style="margin:0"><button type="button" class="btn btn-outline" data-act="logout">Sign out</button><button type="button" class="btn-danger-outline" data-act="delete">Delete account</button></div></div>`;
    }

    // ── Events ──────────────────────────────────────────────────────────
    function closeModals() { ['#scDetailModal', '#scCompareModal'].forEach(s => $(s)?.classList.add('hidden')); SC.detailId = null; }
    function onClick(e) {
        if (e.target.classList && e.target.classList.contains('modal-overlay')) return closeModals();
        if (e.target.classList && e.target.classList.contains('sc-cmp')) return; // compare tick-box must not open the card
        const t = e.target.closest('[data-act]'); if (!t) return;
        const act = t.dataset.act, id = t.dataset.id;
        switch (act) {
            case 'nav': return setView(t.dataset.view);
            case 'open': return openDetail(id);
            case 'bm': e.stopPropagation(); return toggleShortlist(id);
            case 'close': return closeModals();
            case 'chip': F[t.dataset.k] = !F[t.dataset.k]; t.classList.toggle('on', F[t.dataset.k]); return renderResults();
            case 'refresh': return loadProfiles(true);
            case 'compare': return openCompare();
            case 'intro-open': $('#scIntroForm').classList.remove('hidden'); t.classList.add('hidden'); return $('#scIntroMsg').focus();
            case 'intro-cancel': $('#scIntroForm').classList.add('hidden'); return $('#scIntroBtn').classList.remove('hidden');
            case 'intro-send': return sendIntro(id);
            case 'intro-withdraw': return db.collection('introRequests').doc(`${appState.currentUserId}__${id}`).delete().then(() => showToast('Request withdrawn.')).catch(err => { console.error(err); showToast('Could not withdraw.'); });
            case 'copy-link': return navigator.clipboard.writeText(`${location.origin}/athlete/${id}`).then(() => showToast('Link copied!')).catch(() => showToast('Could not copy.'));
            case 'theme': return (window.setTheme(t.dataset.t), renderAccount());
            case 'logout': return window.handleLogout();
            case 'delete': return window.handleDeleteAccount();
            case 'acct-save': {
                const n = ($('#scAcctOrg').value || '').trim().slice(0, 60); if (n.length < 2) return showToast('Add your organisation name.');
                return db.collection('scoutAccounts').doc(appState.currentUserId).update({ orgName: n, orgType: $('#scAcctType').value }).then(() => showToast('Saved.')).catch(err => { console.error(err); showToast('Could not save.'); });
            }
        }
    }
    function onChange(e) {
        const t = e.target;
        if (t.id === 'scSport') { F.sport = t.value; renderResults(); }
        else if (t.id === 'scAge') { F.age = t.value; renderResults(); }
        else if (t.id === 'scTest') { F.test = t.value; renderResults(); }
        else if (t.classList.contains('sc-cmp')) {
            if (t.checked) { if (SC.cmp.size >= 4) { t.checked = false; return showToast('Compare up to four athletes at a time.'); } SC.cmp.add(t.dataset.id); } else SC.cmp.delete(t.dataset.id);
            const b = document.querySelector('[data-act="compare"]'); if (b) b.lastChild.textContent = ` Compare (${SC.cmp.size})`;
        }
    }
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeModals(); window.closeIntroInbox && window.closeIntroInbox(); } });

    // ── Athlete side: intro inbox ───────────────────────────────────────
    const pendingIncoming = () => SC.incoming.filter(r => r.status === 'pending').length;
    (function buildInbox() {
        const el = document.createElement('div'); el.className = 'modal-overlay hidden'; el.id = 'introInboxModal';
        el.innerHTML = `<div class="modal"><button type="button" class="modal-close-x" onclick="window.closeIntroInbox()" aria-label="Close">${svg('close', 16)}</button><h2>Intro requests</h2><p style="font-size:12.5px;color:var(--text-muted);margin:-8px 0 14px">Scouts and sponsors can ask to connect. Nothing about you is shared until you accept, and you choose exactly what.</p><div id="introInboxBody"></div></div>`;
        el.addEventListener('click', e => { if (e.target === el) window.closeIntroInbox(); });
        document.body.appendChild(el);
    })();
    window.openIntroInbox = function () { if (!appState.currentUserId) return; renderInbox(); $('#introInboxModal').classList.remove('hidden'); };
    window.closeIntroInbox = function () { $('#introInboxModal')?.classList.add('hidden'); SC.accepting = null; };
    function renderInbox() {
        const body = $('#introInboxBody'); if (!body) return;
        const list = [...SC.incoming].sort((a, b) => b.createdAt - a.createdAt);
        if (!list.length) { body.innerHTML = '<div class="empty-state" style="padding:26px 0">No requests yet. Make your athlete profile public so scouts can find you.</div>'; return; }
        const card = r => {
            const who = `<strong>${esc(r.scoutName)}</strong> · ${esc(orgLabel(r.scoutOrgType))}: ${esc(r.scoutOrg)}`;
            const base = `<div style="padding:12px 0;border-bottom:1px solid var(--border)"><div style="font-size:13px;line-height:1.5">${who}</div><p style="font-size:13px;color:var(--text-secondary);margin:6px 0">${esc(r.message)}</p><div style="font-size:11px;color:var(--text-muted)">${esc(fmtTs(r.createdAt))}</div>`;
            const id = esc(r.id);
            if (r.status === 'pending') {
                if (SC.accepting === r.id) {
                    const em = (auth && auth.currentUser && auth.currentUser.email) || getCurrentUser()?.email || '';
                    return base + `<div style="margin-top:10px;padding:12px;background:var(--bg-input);border-radius:var(--radius-sm)"><div style="font-size:12px;font-weight:700;margin-bottom:8px">What should they be able to see?</div>${em ? `<label style="display:flex;gap:8px;align-items:center;font-size:13px;margin-bottom:8px"><input type="checkbox" id="scShareEmail" checked> Email: ${esc(em)}</label>` : ''}<input id="scSharePhone" class="sc-select" maxlength="30" placeholder="Phone / WhatsApp (optional)" inputmode="tel"><div style="display:flex;gap:8px;margin-top:10px"><button type="button" class="btn btn-primary btn-sm" onclick="window.scInbox('accept','${id}')">Accept &amp; share</button><button type="button" class="btn btn-outline btn-sm" onclick="window.scInbox('cancel','${id}')">Back</button></div></div></div>`;
                }
                return base + `<div style="display:flex;gap:8px;margin-top:10px"><button type="button" class="btn btn-primary btn-sm" onclick="window.scInbox('start','${id}')">Accept…</button><button type="button" class="btn btn-outline btn-sm" onclick="window.scInbox('decline','${id}')">Decline</button></div></div>`;
            }
            if (r.status === 'accepted') {
                const c = r.athleteContact || {};
                return base + `<div style="font-size:12px;margin-top:8px"><b>Connected.</b> They can see: ${[c.email && 'email', c.phone && 'phone'].filter(Boolean).join(' and ') || 'nothing'}.</div><button type="button" class="btn btn-outline btn-sm" style="margin-top:8px" onclick="window.scInbox('revoke','${id}')">End their access</button></div>`;
            }
            return base + `<div style="font-size:12px;color:var(--text-muted);margin-top:6px">${r.status === 'declined' ? 'You declined.' : 'You ended access.'}</div></div>`;
        };
        body.innerHTML = list.map(card).join('');
    }
    window.scInbox = async function (act, id) {
        if (act === 'start') { SC.accepting = id; return renderInbox(); }
        if (act === 'cancel') { SC.accepting = null; return renderInbox(); }
        const ref = db.collection('introRequests').doc(id);
        try {
            if (act === 'accept') {
                const email = $('#scShareEmail')?.checked ? ((auth && auth.currentUser && auth.currentUser.email) || getCurrentUser()?.email || '') : '';
                const phone = ($('#scSharePhone')?.value || '').trim().slice(0, 30);
                if (!email && !phone) return showToast('Pick at least one way for them to reach you.');
                const contact = {}; if (email) contact.email = email; if (phone) contact.phone = phone;
                await ref.update({ status: 'accepted', respondedAt: Date.now(), athleteContact: contact }); SC.accepting = null; showToast('Accepted — they can now see what you shared.');
            } else if (act === 'decline') { await ref.update({ status: 'declined', respondedAt: Date.now() }); showToast('Declined.'); }
            else if (act === 'revoke') { if (!confirm('End their access to your contact details? They won\'t be able to send another request.')) return; await ref.update({ status: 'revoked', respondedAt: Date.now(), athleteContact: null }); showToast('Access ended.'); }
        } catch (e) { console.error('intro respond failed:', e); showToast('Could not update that request.'); }
    };

    // ── Role subscriptions ──────────────────────────────────────────────
    function teardownLists() { SC.unsubs.forEach(u => { try { u(); } catch (_) {} }); SC.unsubs = []; SC.shortlist = new Map(); SC.requests = new Map(); SC.incoming = []; SC.cmp = new Set(); }
    function subscribeRole() {
        const key = SC.isScout ? 's' : 'a'; if (SC.roleKey === key) return; SC.roleKey = key; teardownLists();
        const uid = appState.currentUserId; if (!uid || !initFirebase()) return;
        if (SC.isScout) {
            SC.unsubs.push(db.collection('scoutShortlists').where('scoutId', '==', uid).onSnapshot(s => { SC.shortlist = new Map(); s.forEach(d => SC.shortlist.set(d.data().athleteId, d.data())); refreshActive(); }, e => console.error('shortlist sub:', e)));
            SC.unsubs.push(db.collection('introRequests').where('scoutId', '==', uid).onSnapshot(s => { SC.requests = new Map(); s.forEach(d => SC.requests.set(d.data().athleteId, { id: d.id, ...d.data() })); refreshActive(); }, e => console.error('requests sub:', e)));
        } else {
            SC.unsubs.push(db.collection('introRequests').where('athleteId', '==', uid).onSnapshot(s => {
                SC.incoming = []; s.forEach(d => SC.incoming.push({ id: d.id, ...d.data() }));
                if (window.updateNotifications) window.updateNotifications();
                if ($('#profileHubModal') && !$('#profileHubModal').classList.contains('hidden') && window.renderProfileHub) window.renderProfileHub();
                if (!$('#introInboxModal').classList.contains('hidden')) renderInbox();
            }, e => console.error('incoming sub:', e)));
        }
    }
    const INTERFACE_KEY = 'topset_active_interface';

    function updateHeaderToggle() {
        const bAth = $('#btnModeAthlete'), bSc = $('#btnModeScout');
        if (bAth) {
            bAth.style.background = SC.isScout ? 'transparent' : 'var(--accent-green)';
            bAth.style.color = SC.isScout ? 'var(--text-secondary)' : 'var(--on-accent)';
            bAth.classList.toggle('active', !SC.isScout);
        }
        if (bSc) {
            bSc.style.background = SC.isScout ? 'var(--accent-green)' : 'transparent';
            bSc.style.color = SC.isScout ? 'var(--on-accent)' : 'var(--text-secondary)';
            bSc.classList.toggle('active', SC.isScout);
        }
    }

    function applyMode() {
        document.body.classList.toggle('scout-mode', SC.isScout);
        updateHeaderToggle();
        if (SC.isScout) {
            buildShell();
            renderOrg();
            setView(SC.view);
            loadProfiles();
        } else {
            closeModals();
            if (typeof updateUIForMode === 'function') updateUIForMode();
        }
    }

    window.switchToAthleteMode = function () {
        localStorage.setItem(INTERFACE_KEY, 'athlete');
        localStorage.removeItem(HINT_KEY);
        SC.isScout = false;
        SC.roleKey = null; // force subscribeRole to re-attach athlete listeners
        applyMode();
        subscribeRole();
        showToast('Switched to Athlete Interface');
    };

    // Stays on the athlete side unless the account really is a scout account.
    function denyScout(msg) {
        localStorage.setItem(INTERFACE_KEY, 'athlete');
        localStorage.removeItem(HINT_KEY);
        SC.isScout = false;
        SC.roleKey = null;
        applyMode();
        subscribeRole();
        showToast(msg || 'The Scout Portal is only for scout and sponsor accounts.');
    }

    window.switchToScoutMode = async function () {
        const uid = appState.currentUserId;
        if (!uid) {
            // Not signed in yet: open auth with the scout option selected.
            window.openAuthModal('signin');
            setType('scout');
            return;
        }
        if (!SC.acct) return denyScout();
        localStorage.setItem(INTERFACE_KEY, 'scout');
        localStorage.setItem(HINT_KEY, '1');
        SC.isScout = true;
        SC.roleKey = null; // force subscribeRole to re-attach scout listeners
        applyMode();
        subscribeRole();
        showToast('Switched to Scout & Talent Discovery Interface');
    };

    // Marks a FRESH account as a scout account (rules allow this once: no gym, nothing logged).
    async function claimScoutType(uid) {
        try {
            const ref = db.collection('users').doc(uid), snap = await ref.get();
            if (snap.exists && snap.data().accountType === 'scout') return true;
            await ref.update({ accountType: 'scout' });
            return true;
        } catch (e) { console.error('scout type claim failed:', e); return false; }
    }
    async function becomeScout(uid, orgName, orgType) {
        if (!(await claimScoutType(uid))) return false;
        return createScoutAcct(uid, orgName, orgType, false);
    }

    async function createScoutAcct(uid, orgName, orgType, isRetry) {
        try {
            await db.collection('scoutAccounts').doc(uid).set({ orgName, orgType, orgVerified: false, createdAt: Date.now() });
            localStorage.removeItem(PENDING_KEY);
            return true;
        } catch (e) {
            console.error('scout account create failed:', e);
            if (e.code === 'permission-denied') {
                showToast("This account can't be a scout account. Scouts and sponsors sign up separately.");
            } else {
                showToast("Account created, but scout setup didn't save. Sign in again and it will retry.");
                if (!isRetry) localStorage.setItem(PENDING_KEY, JSON.stringify({ uid, orgName, orgType }));
            }
            return false;
        }
    }

    function sync() {
        const uid = appState.currentUserId || null;
        if (uid === SC.uid) return;
        if (SC.acctUnsub) { SC.acctUnsub(); SC.acctUnsub = null; }
        SC.uid = uid; SC.roleKey = null; SC.retried = false; SC.isScout = false; SC.acct = null; teardownLists();
        if (!uid || !initFirebase()) { localStorage.removeItem(HINT_KEY); applyMode(); return; }

        SC.acctUnsub = db.collection('scoutAccounts').doc(uid).onSnapshot(snap => {
            SC.acct = snap.exists ? snap.data() : null;
            const pref = localStorage.getItem(INTERFACE_KEY);
            if (SC.acct) {
                SC.isScout = pref !== 'athlete';
            } else if (SC.claiming && pref === 'scout') {
                SC.isScout = true; // scout sign-up in progress; the account doc lands in a moment
            } else {
                // Not a scout account: never scout mode, whatever localStorage says.
                SC.isScout = false;
                if (pref === 'scout') localStorage.setItem(INTERFACE_KEY, 'athlete');
            }
            if (SC.isScout) localStorage.setItem(HINT_KEY, '1'); else localStorage.removeItem(HINT_KEY);
            subscribeRole();
            applyMode();
        }, e => {
            console.error('scoutAccounts sub:', e);
            SC.acct = null; SC.isScout = false;
            subscribeRole();
            applyMode();
        });
    }

    // ── Hooks into the athlete app ──────────────────────────────────────
    const _ui = window.updateUIForMode;
    if (typeof _ui === 'function') window.updateUIForMode = function () {
        const r = _ui.apply(this, arguments);
        try { sync(); } catch (e) { console.error('scout sync failed:', e); }
        return r;
    };

    const _hub = window.renderProfileHub;
    if (typeof _hub === 'function') window.renderProfileHub = function () {
        _hub.apply(this, arguments);
        if (SC.isScout || !appState.currentUserId || typeof hubRow !== 'function') return;
        const rows = document.querySelector('#profileHubBody .hub-rows') || document.querySelector('#profileHubBody');
        if (!rows) return;
        const n = pendingIncoming();
        rows.insertAdjacentHTML('afterbegin', hubRow('user', 'Intro requests', n ? `${n} waiting for your reply` : 'Scouts and sponsors who want to connect', "window.hubGo('openIntroInbox')"));
    };

    if (typeof computeNotifications === 'function') {
        const _cn = computeNotifications;
        window.computeNotifications = function () {
            const items = _cn.apply(this, arguments), n = pendingIncoming();
            if (n && !SC.isScout) {
                items.unshift({
                    id: `intro:${n}`,
                    title: n === 1 ? 'A scout wants to connect' : `${n} scouts want to connect`,
                    desc: 'Review who they are and decide what — if anything — to share.',
                    actionLabel: 'View requests',
                    action: () => { window.closeNotifPanel && window.closeNotifPanel(); window.openIntroInbox(); }
                });
            }
            return items;
        };
    }

    // Account deletion: clear intro/shortlist/scout data so no contact details or names linger.
    const _del = window.deleteAllUserData;
    if (typeof _del === 'function') window.deleteAllUserData = async function (uid) {
        try {
            if (initFirebase()) {
                const empty = { docs: [] }, g = q => q.get().catch(() => empty);
                const [a, b, c] = await Promise.all([
                    g(db.collection('introRequests').where('athleteId', '==', uid)),
                    g(db.collection('introRequests').where('scoutId', '==', uid)),
                    g(db.collection('scoutShortlists').where('scoutId', '==', uid))
                ]);
                await Promise.allSettled([...a.docs, ...b.docs, ...c.docs].map(d => d.ref.delete()));
                await db.collection('scoutAccounts').doc(uid).delete().catch(() => {});
            }
        } catch (e) { console.error('scout cleanup failed:', e); }
        localStorage.removeItem(HINT_KEY);
        localStorage.removeItem(INTERFACE_KEY);
        return _del.apply(this, arguments);
    };

    // ── Dual Interface Selection: Sign-up and Sign-in ───────────────────
    function setType(t) {
        SC.signupType = t;
        localStorage.setItem(INTERFACE_KEY, t);
        document.querySelectorAll('#scTypeSeg button').forEach(b => b.classList.toggle('active', b.dataset.t === t));
        applyType();
    }
    window.setAuthType = setType;
    window.applyType = applyType;
    function applyType() {
        const nameG = $('#authNameGroup'), signup = nameG && !nameG.classList.contains('hidden'), isScout = SC.signupType === 'scout';
        const typeGroup = $('#scTypeGroup');
        if (typeGroup) typeGroup.classList.remove('hidden'); // Always visible in both Sign In and Sign Up!

        $('#scOrgGroup')?.classList.toggle('hidden', !(signup && isScout));
        ['#authAvatarGroup', '#authGenderGroup', '#authSportGroup', '#authGymCodeGroup'].forEach(s => $(s)?.classList.toggle('sc-hide', !!(signup && isScout)));
        const byGroup = $('#authBirthYearGroup');
        if (byGroup) {
            byGroup.classList.toggle('hidden', !signup);
            byGroup.classList.remove('sc-hide');
            const bySel = $('#authBirthYear');
            if (bySel) bySel.required = !!signup;
        }
        const o = $('#scOrgName'); if (o) o.required = !!(signup && isScout);
        const n = $('#authName'); if (n) n.placeholder = isScout ? 'Your name (athletes will see this)' : 'Your name';

        const sub = $('#authSubmitBtn');
        if (sub) {
            if (signup) {
                sub.textContent = isScout ? 'Sign Up as Scout / Sponsor' : 'Sign Up as Athlete';
            } else {
                sub.textContent = isScout ? 'Sign In as Scout / Sponsor' : 'Sign In as Athlete';
            }
        }
    }

    function installSignupUI() {
        const authForm = $('#authForm');
        if (!authForm || $('#scTypeGroup')) return;
        const g = document.createElement('div');
        g.className = 'form-group';
        g.id = 'scTypeGroup';
        g.innerHTML = `<label style="font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:0.8px;color:var(--text-secondary);margin-bottom:6px;display:block;">Select Interface / Role</label><div class="hub-seg" id="scTypeSeg"><button type="button" class="active" data-t="athlete">${svg('account', 15)} Athlete</button><button type="button" data-t="scout">${svg('discover', 15)} Scout / Sponsor</button></div>`;

        const o = document.createElement('div');
        o.className = 'form-group hidden';
        o.id = 'scOrgGroup';
        o.innerHTML = `<label>Organisation</label><input type="text" id="scOrgName" maxlength="60" placeholder="e.g. Soweto Rugby Academy"><select id="scOrgType" style="margin-top:8px">${ORG_TYPES.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select><span style="font-size:11px;color:var(--text-muted);margin-top:4px">Scout and sponsor accounts are for adults (19+). Athletes choose whether to reply to you.</span>`;

        authForm.insertBefore(g, authForm.firstChild);
        const nameG = $('#authNameGroup');
        if (nameG) nameG.parentNode.insertBefore(o, nameG);

        g.addEventListener('click', e => {
            const b = e.target.closest('button[data-t]');
            if (b) setType(b.dataset.t);
        });

        if (nameG) new MutationObserver(applyType).observe(nameG, { attributes: true, attributeFilter: ['class'] });

        // Sync initial preference if stored
        const storedPref = localStorage.getItem(INTERFACE_KEY);
        if (storedPref === 'scout') setType('scout'); else setType('athlete');

        const cta = document.querySelector('#aboutModal .about-cta-row');
        if (cta && !$('#scAboutLink')) {
            const b = document.createElement('button');
            b.type = 'button';
            b.id = 'scAboutLink';
            b.className = 'about-link';
            b.textContent = 'Scout or sponsor? Access portal →';
            b.onclick = () => { window.openAuthModal('signin'); setType('scout'); };
            cta.insertBefore(b, cta.lastElementChild);
        }
    }
    installSignupUI();

    const _signUp = window.signUp;
    if (typeof _signUp === 'function') window.signUp = async function (email, pw, name, av, ageGroup, gender, sport, gymCode, birthYear) {
        if (SC.signupType !== 'scout') {
            localStorage.setItem(INTERFACE_KEY, 'athlete');
            return _signUp.apply(this, arguments);
        }
        const org = ($('#scOrgName')?.value || '').trim().slice(0, 60), ot = $('#scOrgType')?.value || 'other';
        if (org.length < 2) { showToast('Add your organisation name.'); return null; }
        if (!birthYear || isNaN(birthYear)) {
            const byInput = $('#authBirthYear');
            birthYear = byInput ? parseInt(byInput.value, 10) : NaN;
        }
        if (!birthYear || isNaN(birthYear)) {
            birthYear = new Date().getFullYear() - 20;
        }
        localStorage.setItem(INTERFACE_KEY, 'scout');
        localStorage.setItem(HINT_KEY, '1');
        SC.claiming = true;
        SC.isScout = true;
        applyMode();
        let u = null;
        try {
            u = await _signUp.apply(this, arguments);
            if (u) {
                if (await becomeScout(u.uid, org, ot)) {
                    SC.acct = { orgName: org, orgType: ot, orgVerified: false, createdAt: Date.now() };
                    SC.isScout = true;
                    applyMode();
                } else {
                    denyScout("Your account was created, but scout setup didn't save. Sign in and try again.");
                }
            } else {
                denyScout('Sign-up did not complete.');
            }
        } finally { SC.claiming = false; }
        return u;
    };

    // Sign-in never creates a scout account for an existing user. If the account isn't a scout
    // account, the person lands in the athlete app with a clear message.
    const _signIn = window.signIn;
    if (typeof _signIn === 'function') window.signIn = async function (email, pw) {
        const wantScout = SC.signupType === 'scout';
        localStorage.setItem(INTERFACE_KEY, wantScout ? 'scout' : 'athlete');
        SC.claiming = wantScout;
        let u = null;
        try {
            u = await _signIn.apply(this, arguments);
            if (u && wantScout) {
                let snap = null;
                try { snap = await db.collection('scoutAccounts').doc(u.uid).get(); } catch (e) { console.error('scout login check failed:', e); }
                if (snap && snap.exists) {
                    SC.acct = snap.data(); SC.isScout = true;
                    localStorage.setItem(HINT_KEY, '1');
                    applyMode();
                } else {
                    denyScout("This is an athlete account. Scouts and sponsors need their own account: choose Scout / Sponsor and use Sign Up.");
                }
            } else if (u) {
                localStorage.removeItem(HINT_KEY);
                SC.isScout = false;
                applyMode();
            } else if (wantScout) {
                localStorage.setItem(INTERFACE_KEY, 'athlete');
            }
        } finally { SC.claiming = false; }
        return u;
    };

    // Google: a brand-new Google account can start as a scout (the rules allow that once, on a fresh
    // account). An existing athlete account is turned away.
    const _google = window.signInWithGoogle;
    if (typeof _google === 'function') window.signInWithGoogle = async function () {
        const wantScout = SC.signupType === 'scout';
        localStorage.setItem(INTERFACE_KEY, wantScout ? 'scout' : 'athlete');
        SC.claiming = wantScout;
        let u = null;
        try {
            u = await _google.apply(this, arguments);
            if (u && wantScout) {
                let snap = null;
                try { snap = await db.collection('scoutAccounts').doc(u.uid).get(); } catch (e) { console.error('google scout check failed:', e); }
                if (snap && snap.exists) {
                    SC.acct = snap.data();
                } else {
                    const org = ($('#scOrgName')?.value || '').trim() || (u.displayName ? `${u.displayName}'s Org` : 'Independent Scout');
                    if (await becomeScout(u.uid, org, 'scout')) {
                        SC.acct = { orgName: org, orgType: 'scout', orgVerified: false, createdAt: Date.now() };
                    } else {
                        denyScout("This is an athlete account. Scouts and sponsors need their own account.");
                        return u;
                    }
                }
                SC.isScout = true;
                localStorage.setItem(HINT_KEY, '1');
                applyMode();
            } else if (u) {
                localStorage.removeItem(HINT_KEY);
                SC.isScout = false;
                applyMode();
            }
        } finally { SC.claiming = false; }
        return u;
    };

    const _logout = window.handleLogout;
    if (typeof _logout === 'function') window.handleLogout = function() {
        SC.isScout = false;
        document.body.classList.remove('scout-mode');
        localStorage.removeItem(HINT_KEY);
        return _logout.apply(this, arguments);
    };

    // Avoid the athlete UI flashing for a returning scout while auth resolves.
    const initialPref = localStorage.getItem(INTERFACE_KEY);
    if (initialPref === 'scout' || (initialPref !== 'athlete' && localStorage.getItem(HINT_KEY))) {
        document.body.classList.add('scout-mode');
        buildShell();
        setView('discover');
    }
})();
