// ── sports.js ─────────────────────────────────────────
// Admin-managed sports catalog (Firestore `sports` collection) powering the
// Sport dropdowns (signup, Edit Profile, Athlete Profile) and per-test sport
// assignment. A test with no `sports` array (or an empty one) is universal —
// every athlete sees it. A test with sports [ids] is shown only to athletes
// whose profile sport matches one of them. Filtering is a UX convenience for
// the Log dropdowns and Stat Card axes; it is not a security boundary.
// Loads after events-ui.js, before app-init.js.

    appState.sports = [];
    let sportsUnsub = null;
    let sportsLoadFailed = false;
    const STARTER_SPORTS = ['Rugby','Football','HYROX','CrossFit','Boxing','Running','Powerlifting'];
    const SPORT_SELECTS = ['#authSport','#profileSport','#athleteProfileSport'];

    function sportSlug(n){ return String(n||'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,40); }
    function sportIdForName(name){
        const n = (name||'').trim().toLowerCase();
        if (!n) return null;
        const s = appState.sports.find(x=>(x.name||'').toLowerCase()===n);
        return s ? s.id : null;
    }
    function mySportId(){ return sportIdForName(getCurrentUser()?.sport); }
    // Universal tests (no sports tag) always pass; tagged tests pass only for a matching sport.
    function testsForMySport(list){
        const sid = mySportId();
        return (list||[]).filter(t=>!Array.isArray(t.sports) || !t.sports.length || (sid && t.sports.includes(sid)));
    }
    function testSportsSummary(t){
        if (!Array.isArray(t.sports) || !t.sports.length) return 'All sports';
        return t.sports.map(id=>{ const s=appState.sports.find(x=>x.id===id); return s ? s.name : null; }).filter(Boolean).join(', ') || 'All sports';
    }

    function subscribeSports(){
        if (sportsUnsub){ sportsUnsub(); sportsUnsub=null; }
        if (!initFirebase()) return;
        // Public read (signup needs the list before anyone is signed in).
        sportsUnsub = db.collection('sports').onSnapshot(snap=>{
            const list=[]; snap.forEach(d=>list.push({ id:d.id, ...d.data() }));
            list.sort((a,b)=>(a.order??0)-(b.order??0) || (a.name||'').localeCompare(b.name||''));
            appState.sports = list;
            sportsLoadFailed = false;
            populateSportSelects();
            renderNewTestSportChecks();
            refreshSportDependentUI();
            if (!$('#manageSportsModal').classList.contains('hidden')) renderManageSportsList();
        }, err=>{ console.error('sports subscription error:', err); sportsLoadFailed = true; populateSportSelects(); });
    }
    function refreshSportDependentUI(){
        if (typeof populateLogTestSelect === 'function') populateLogTestSelect();
        if (typeof populatePublicLogTestSelect === 'function') populatePublicLogTestSelect();
    }

    // ── Dropdowns ──────────────────────────────────────────────────────
    function populateSportSelects(){
        SPORT_SELECTS.forEach(sel=>{
            const el=$(sel); if (!el) return;
            const cur = el.value;
            const ph = sportsLoadFailed ? 'Sports failed to load (rules deployed?)' : (!appState.sports.length ? 'No sports added yet' : (sel==='#athleteProfileSport'?'Select sport':'Select sport (optional)'));
            el.innerHTML = `<option value="">${ph}</option>` + appState.sports.map(s=>`<option value="${escapeHTML(s.name)}">${escapeHTML(s.name)}</option>`).join('');
            setSportSelectValue(sel, cur);
        });
    }
    // Sets a sport select. A value that isn't in the catalog (a legacy free-text
    // sport, or one an admin removed) is kept as an extra option so saving the
    // form never silently wipes it.
    function setSportSelectValue(sel, value){
        const el=$(sel); if (!el) return;
        value = (value||'').trim();
        if (value && ![...el.options].some(o=>o.value===value)){
            const o=document.createElement('option'); o.value=value; o.textContent=`${value} (not in list)`; el.appendChild(o);
        }
        el.value = value;
    }

    // ── Sport checkboxes (new-test form + per-test editor) ─────────────
    function sportChecksHTML(selected){
        if (!appState.sports.length) return '<p class="text-muted" style="font-size:12px;">No sports yet — an admin can add some in Manage Sports.</p>';
        return appState.sports.map(s=>`<label style="display:flex;align-items:center;gap:8px;text-transform:none;font-weight:500;font-size:13px;color:var(--text-primary);letter-spacing:0;margin-bottom:6px;cursor:pointer;"><input type="checkbox" value="${escapeHTML(s.id)}" ${selected.has(s.id)?'checked':''} style="width:auto;"> ${escapeHTML(s.name)}</label>`).join('');
    }
    function checkedSportIds(container){
        return [...container.querySelectorAll('input[type=checkbox]:checked')].map(c=>c.value);
    }
    function renderNewTestSportChecks(){
        const box=$('#newTestSportsBox'); if (box) box.innerHTML = sportChecksHTML(new Set());
    }
    window.toggleTestSportsEditor = function(testId){
        const box=$(`#testSportsEditor-${testId}`); if (!box) return;
        if (!box.classList.contains('hidden')){ box.classList.add('hidden'); return; }
        const t=manageTestsCache.find(x=>x.id===testId); if (!t) return;
        box.innerHTML = `<div style="padding:8px 4px 4px;">${sportChecksHTML(new Set(t.sports||[]))}<p class="text-muted" style="font-size:11px;margin:4px 0 8px;">Leave all unticked to show this test to every sport.</p><button type="button" class="btn btn-primary btn-sm" onclick="window.saveTestSports('${testId}')">Save sports</button></div>`;
        box.classList.remove('hidden');
    };
    window.saveTestSports = async function(testId){
        if (rateLimited('adminWrite', RATE_LIMITS.adminWrite)) return;
        const box=$(`#testSportsEditor-${testId}`); const t=manageTestsCache.find(x=>x.id===testId);
        if (!box || !t || !initFirebase()) return;
        const ids = checkedSportIds(box);
        try {
            await db.collection('tests').doc(testId).update({ sports: ids });
            t.sports = ids;
            renderManageTestsList();
            showToast(`"${t.name}" updated.`);
        } catch(err){ console.error('saveTestSports failed:', err); showToast('Could not update that test.'); }
    };

    // ── Manage Sports modal (admin) ────────────────────────────────────
    window.openManageSports = function(){
        if (!getCurrentUser()?.isAdmin) return;
        $('#newSportName').value='';
        renderManageSportsList();
        $('#manageSportsModal').classList.remove('hidden');
    };
    window.closeManageSports = function(){ $('#manageSportsModal').classList.add('hidden'); };
    function renderManageSportsList(){
        const el=$('#manageSportsList');
        if (!appState.sports.length){
            el.innerHTML = '<p class="text-muted" style="text-align:center;padding:12px;">No sports yet.</p><div style="text-align:center;margin-bottom:8px;"><button type="button" class="row-action-btn" onclick="window.handleSeedSports()">Add starter sports</button><p class="text-muted" style="font-size:11px;margin-top:6px;">Rugby, Football, HYROX, CrossFit, Boxing, Running, Powerlifting — remove any after.</p></div>';
            return;
        }
        el.innerHTML = appState.sports.map(s=>`<div class="row-actions" style="justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);"><strong>${escapeHTML(s.name)}</strong><button type="button" class="row-action-btn danger" onclick="window.handleDeleteSport('${escapeHTML(s.id)}')">Remove</button></div>`).join('');
    }
    window.handleAddSportSubmit = async function(e){ return guardedSubmit(e, 'adminWrite', RATE_LIMITS.adminWrite, async()=>{
        const name=$('#newSportName').value.trim().slice(0,30);
        if (!name) return showToast('Enter a sport name.');
        const id=sportSlug(name);
        if (!id) return showToast('Use letters or numbers in the sport name.');
        if (appState.sports.some(s=>s.id===id || (s.name||'').toLowerCase()===name.toLowerCase())) return showToast('That sport already exists.');
        if (!initFirebase()) return;
        const order = appState.sports.reduce((m,s)=>Math.max(m,s.order??0),-1)+1;
        try {
            await db.collection('sports').doc(id).set({ name, order, createdAt:Date.now() });
            $('#addSportForm').reset();
            showToast(`"${name}" added.`);
        } catch(err){ console.error('add sport failed:', err); showToast('Could not add sport. Deploy the updated firestore.rules first.'); }
    }); };
    window.handleDeleteSport = async function(id){
        const s=appState.sports.find(x=>x.id===id); if (!s) return;
        if (!confirm(`Remove "${s.name}"? It disappears from the dropdown and is untagged from any tests. Athletes who already picked it keep it on their profile until they change it, and only see universal tests meanwhile.`)) return;
        if (!initFirebase()) return;
        try {
            const tagged = await db.collection('tests').where('sports','array-contains',id).get();
            const batch = db.batch();
            tagged.forEach(d=>batch.update(d.ref, { sports: firebase.firestore.FieldValue.arrayRemove(id) }));
            batch.delete(db.collection('sports').doc(id));
            await batch.commit();
            if (manageTestsCache.length){ manageTestsCache.forEach(t=>{ if (Array.isArray(t.sports)) t.sports=t.sports.filter(x=>x!==id); }); renderManageTestsList(); }
            showToast(`"${s.name}" removed.`);
        } catch(err){ console.error('delete sport failed:', err); showToast('Could not remove sport.'); }
    };
    window.handleSeedSports = async function(){
        if (!initFirebase()) return;
        try {
            const batch=db.batch();
            STARTER_SPORTS.forEach((name,i)=>batch.set(db.collection('sports').doc(sportSlug(name)), { name, order:i, createdAt:Date.now() }));
            await batch.commit();
            showToast('Starter sports added.');
        } catch(err){ console.error('seed sports failed:', err); showToast('Could not add starter sports.'); }
    };
    $('#manageSportsModal').addEventListener('click', e=>{ if (e.target===$('#manageSportsModal')) window.closeManageSports(); });
    document.addEventListener('keydown', e=>{ if (e.key==='Escape') window.closeManageSports(); });
