// ── events-ui.js ──────────────────────────────────────
// Public, cross-gym "event" leaderboard — separate feature from the
// gym-scoped leaderboard/tests. See firestore.rules `events`,
// `eventTests`, `eventLeaderboard` for the security model:
//   - Public: no gym membership or invite code required to view or log.
//   - Test catalog is ADMIN-ONLY (a gym manager has no access at all).
//   - isVisible is the "make it disappear" switch — enforced in the
//     rules themselves, not just this file's rendering.
// Loads after leaderboard-ui.js / admin-ui.js, before app-init.js.

let activeEventUnsub = null, eventTestsUnsub = null, eventBoardUnsub = null;
let manageEventsCache = [];       // admin: every event, visible or not
let manageEventTestsScope = null; // admin: which event's tests are being edited right now
let manageEventTestsCache = [];

// Piggybacks on the shared appState object already created in core.js —
// core.js loads first, so appState already exists by the time this runs.
appState.activeEvent = null;
appState.activeEventTests = [];
appState.eventSpotlight = '';

// ── Public-facing: whichever ONE event the admin has made visible ──────
function subscribeActiveEvent(){
    if (activeEventUnsub){ activeEventUnsub(); activeEventUnsub=null; }
    if (!initFirebase()) return;
    activeEventUnsub = db.collection('events').where('isVisible','==',true).limit(1).onSnapshot(snapshot=>{
        const doc = snapshot.docs[0];
        appState.activeEvent = doc ? { id:doc.id, ...doc.data() } : null;
        updateEventNavVisibility();
        subscribeEventTests(appState.activeEvent ? appState.activeEvent.id : null);
        if ($('#page-event')?.classList.contains('active')) renderEventPage();
    }, err=>{ console.error('active event subscription error:', err); appState.activeEvent=null; updateEventNavVisibility(); });
}

// The public nav tab only appears once there's actually something to see —
// admins reach event management through the header/admin button regardless,
// so this doesn't need to also account for isAdmin.
function updateEventNavVisibility(){
    const show = !!appState.activeEvent;
    document.querySelector('.nav-tab[data-page="event"]')?.classList.toggle('hidden', !show);
    document.querySelector('.bottom-nav-item[data-page="event"]')?.classList.toggle('hidden', !show);
}

function subscribeEventTests(eventId){
    if (eventTestsUnsub){ eventTestsUnsub(); eventTestsUnsub=null; }
    appState.activeEventTests = [];
    if (!eventId || !initFirebase()){ populateEventTestSelects(); return; }
    eventTestsUnsub = db.collection('eventTests').where('eventId','==',eventId).onSnapshot(snapshot=>{
        const list=[];
        snapshot.forEach(doc=>list.push({ id:doc.id, ...doc.data() }));
        list.sort((a,b)=>(a.order??0)-(b.order??0));
        appState.activeEventTests = list;
        populateEventTestSelects();
        if ($('#page-event')?.classList.contains('active')) renderEventPage();
    }, err=>console.error('event tests subscription error:', err));
}

function getEventTestConfig(name){ return appState.activeEventTests.find(t=>t.name===name); }

function populateEventTestSelects(){
    const sel=$('#eventLogTest');
    if (sel){
        const cur=sel.value;
        sel.innerHTML='<option value="">-- Select Test --</option>'+appState.activeEventTests.map(t=>`<option value="${escapeHTML(t.name)}" ${t.name===cur?'selected':''}>${escapeHTML(t.name)} (${t.unit==='time'?'mm:ss':escapeHTML(t.unit)})</option>`).join('');
    }
    const spotSel=$('#eventSpotlightSelect');
    if (spotSel){
        const curSpot=spotSel.value||appState.eventSpotlight;
        spotSel.innerHTML='<option value="">-- Select Test --</option>'+appState.activeEventTests.map(t=>`<option value="${escapeHTML(t.name)}" ${t.name===curSpot?'selected':''}>${escapeHTML(t.name)}</option>`).join('');
    }
}

window.updateEventResultField = function(){
    const cfg = getEventTestConfig($('#eventLogTest').value);
    const input = $('#eventLogResult'); if (!input) return;
    if (cfg && cfg.unit==='time'){ input.type='text'; input.placeholder=cfg.placeholder||'12:30'; $('#eventResultLabel').textContent='Time (mm:ss)'; }
    else if (cfg){ input.type='number'; input.step='any'; input.placeholder=cfg.placeholder||'0'; $('#eventResultLabel').textContent=`Result (${cfg.unit})`; }
    else { input.type='text'; input.placeholder='Select test first'; $('#eventResultLabel').textContent='Result'; }
};

function renderEventPage(){
    const titleEl=$('#eventTitle'), descEl=$('#eventDescription'), wrap=$('#eventPageContent'), logCard=$('#eventLogCard');
    if (!titleEl) return;
    const ev = appState.activeEvent;
    if (!ev){
        titleEl.textContent = 'Event';
        descEl.textContent = '';
        wrap.innerHTML = '<div class="empty-state" style="padding:24px 0;">No public event is live right now. Check back soon.</div>';
        logCard?.classList.add('hidden');
        renderEventLeaderboard();
        return;
    }
    titleEl.textContent = ev.name;
    descEl.textContent = ev.description || '';
    if (getCurrentUserId()){
        wrap.innerHTML = '';
        logCard?.classList.remove('hidden');
    } else {
        wrap.innerHTML = '<div class="empty-state" style="padding:12px 0;">Sign in to log a result and appear on this event\'s board.</div>';
        logCard?.classList.add('hidden');
    }
    renderEventLeaderboard();
}

window.renderEventLeaderboard = function(){
    const tb = $('#eventLeaderboardBody'); if (!tb) return;
    const ev = appState.activeEvent;
    if (eventBoardUnsub){ eventBoardUnsub(); eventBoardUnsub=null; }
    if (!ev){ tb.innerHTML='<tr><td colspan="4" class="empty-state">No event is live right now.</td></tr>'; return; }
    const spotlight = $('#eventSpotlightSelect')?.value || appState.eventSpotlight;
    if (!spotlight){ tb.innerHTML='<tr><td colspan="4" class="empty-state">Select a test to see rankings.</td></tr>'; return; }
    appState.eventSpotlight = spotlight;
    const cfg = getEventTestConfig(spotlight);
    tb.innerHTML = skeletonTableRows(4,4);
    eventBoardUnsub = db.collection('eventLeaderboard').where('eventId','==',ev.id).where('testId','==',spotlight).onSnapshot(snapshot=>{
        const rows=[]; snapshot.forEach(d=>rows.push(d.data()));
        if (cfg) rows.sort((a,b)=>cfg.higherIsBetter?b.value-a.value:a.value-b.value);
        if (!rows.length){ tb.innerHTML=`<tr><td colspan="4" class="empty-state">No entries yet for "${escapeHTML(spotlight)}".</td></tr>`; return; }
        tb.innerHTML = rows.map((r,i)=>{
            const rc=i===0?'gold':i===1?'silver':i===2?'bronze':'';
            const disp = cfg && cfg.unit==='time' ? formatTime(r.value) : `${r.value} ${cfg?.unit||''}`;
            return `<tr><td class="leaderboard-rank ${rc}">${i+1}</td><td><div style="display:flex;align-items:center;gap:8px;"><span class="avatar-circle">${escapeHTML(r.avatar||'🏋️')}</span><strong>${escapeHTML(r.name)}</strong></div></td><td class="num-cell highlight-pr">${disp}</td><td>${r.updatedAt?new Date(r.updatedAt).toLocaleDateString('en-US',{month:'short',day:'numeric'}):''}</td></tr>`;
        }).join('');
    }, err=>{ console.error('event leaderboard listener error:', err); tb.innerHTML='<tr><td colspan="4" class="empty-state">Could not load rankings.</td></tr>'; });
};

window.handleEventLogSubmit = async function(e){
    return guardedSubmit(e, 'logEntry', RATE_LIMITS.logEntry, async()=>{
        const ev = appState.activeEvent;
        if (!ev) return showToast('No event is live right now.');
        const uid2 = getCurrentUserId();
        if (!uid2) return showToast('Please sign in first.');
        const testName = $('#eventLogTest').value;
        const cfg = getEventTestConfig(testName);
        if (!testName || !cfg) return showToast('Please select a test.');
        const raw = $('#eventLogResult').value.trim();
        let value;
        if (cfg.unit==='time'){ value=parseTime(raw); if(isNaN(value)) return showToast('Invalid time format (mm:ss).'); }
        else { value=parseFloat(raw); if(isNaN(value)) return showToast('Invalid number.'); }
        if (!isValidEntryValue(value, cfg)) return showToast('That result looks out of range — double check it.');
        const user = getCurrentUser();
        const docId = `${ev.id}__${cfg.id}__${uid2}`;
        if (!initFirebase()) return;
        try {
            const ref = db.collection('eventLeaderboard').doc(docId);
            const existing = await ref.get();
            if (existing.exists){
                const cur = existing.data();
                const better = cfg.higherIsBetter ? value > cur.value : value < cur.value;
                if (!better){ showToast('Logged — but your existing result was already better, so the board keeps that one.'); return; }
                await ref.update({ value, name:user.name, avatar:user.avatar||'🏋️', updatedAt:Date.now() });
            } else {
                await ref.set({ eventId:ev.id, testId:cfg.id, userId:uid2, name:user.name, avatar:user.avatar||'🏋️', value, updatedAt:Date.now() });
            }
            showToast('Result logged to the event board!');
            $('#eventLogForm').reset();
            updateEventResultField();
        } catch(err){ console.error('event log failed:', err); showToast('Could not log that result.'); }
    });
};

// ── Admin: event management (create, toggle visible, delete, own test catalog) ──
window.openManageEvent = async function(){
    if (!getCurrentUser()?.isAdmin) return;
    window.backToManageEventList();
    $('#newEventName').value=''; $('#newEventDescription').value='';
    $('#manageEventsList').innerHTML='<p class="text-muted">Loading...</p>';
    $('#manageEventModal').classList.remove('hidden');
    manageEventsCache = await fetchAllEvents();
    renderManageEventsList();
};
window.closeManageEvent = function(){ $('#manageEventModal').classList.add('hidden'); };
window.backToManageEventList = function(){
    $('#manageEventTestsView').classList.add('hidden');
    $('#manageEventListView').classList.remove('hidden');
    manageEventTestsScope = null;
};

async function fetchAllEvents(){
    if (!initFirebase()) return [];
    try {
        const snap = await db.collection('events').orderBy('createdAt','desc').get();
        const list=[]; snap.forEach(d=>list.push({ id:d.id, ...d.data() }));
        return list;
    } catch(err){ console.error('fetchAllEvents failed:', err); showToast('Could not load events.'); return []; }
}

function renderManageEventsList(){
    const el = $('#manageEventsList');
    if (!manageEventsCache.length){ el.innerHTML='<p class="text-muted">No events yet — create one below.</p>'; return; }
    el.innerHTML = manageEventsCache.map(ev=>`<div style="padding:10px 0;border-bottom:1px solid var(--border);"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;"><strong>${escapeHTML(ev.name)}</strong><span class="badge ${ev.isVisible?'badge-green':'badge-new'}">${ev.isVisible?'Public — visible':'Hidden'}</span></div>${ev.description?`<div style="font-size:12px;color:var(--text-muted);margin-top:2px;">${escapeHTML(ev.description)}</div>`:''}<div style="display:flex;align-items:center;gap:8px;margin-top:8px;flex-wrap:wrap;"><button type="button" class="row-action-btn" onclick="window.handleToggleEventVisibility('${ev.id}')">${ev.isVisible?'Hide':'Make visible'}</button><button type="button" class="row-action-btn" onclick="window.openManageEventTests('${ev.id}')">Manage Tests</button><button type="button" class="row-action-btn danger" onclick="window.handleDeleteEvent('${ev.id}')">Delete</button></div></div>`).join('');
}

// Only one event is ever "live" at a time — turning this one visible turns
// any other visible event off first, so the public board and nav tab never
// have to guess which event a visitor means, and there's exactly one thing
// to toggle off when you want everything to disappear.
window.handleToggleEventVisibility = async function(eventId){
    const ev = manageEventsCache.find(e=>e.id===eventId); if (!ev) return;
    if (!initFirebase()) return;
    try {
        const batch = db.batch();
        if (!ev.isVisible){
            manageEventsCache.forEach(other=>{
                if (other.id!==eventId && other.isVisible) batch.update(db.collection('events').doc(other.id), { isVisible:false, name:other.name });
            });
        }
        batch.update(db.collection('events').doc(eventId), { isVisible: !ev.isVisible, name: ev.name });
        await batch.commit();
        manageEventsCache = await fetchAllEvents();
        renderManageEventsList();
        showToast(ev.isVisible ? 'Event hidden from the public board.' : 'Event is now live and public.');
    } catch(err){ console.error('toggle event visibility failed:', err); showToast('Could not update the event.'); }
};

window.handleDeleteEvent = async function(eventId){
    const ev = manageEventsCache.find(e=>e.id===eventId); if (!ev) return;
    if (!confirm(`Delete "${ev.name}"? This removes the event, its tests, and its leaderboard. This cannot be undone.`)) return;
    if (!initFirebase()) return;
    try {
        const [testsSnap, boardSnap] = await Promise.all([
            db.collection('eventTests').where('eventId','==',eventId).get(),
            db.collection('eventLeaderboard').where('eventId','==',eventId).get()
        ]);
        const batch = db.batch();
        testsSnap.forEach(d=>batch.delete(d.ref));
        boardSnap.forEach(d=>batch.delete(d.ref));
        batch.delete(db.collection('events').doc(eventId));
        await batch.commit();
        manageEventsCache = await fetchAllEvents();
        renderManageEventsList();
        showToast('Event deleted.');
    } catch(err){ console.error('delete event failed:', err); showToast('Could not delete the event.'); }
};

window.handleAddEventSubmit = async function(e){
    return guardedSubmit(e, 'adminWrite', RATE_LIMITS.adminWrite, async()=>{
        const name = $('#newEventName').value.trim().slice(0,60);
        if (!name) return showToast('Please enter an event name.');
        const description = $('#newEventDescription').value.trim().slice(0,140);
        if (!initFirebase()) return;
        try {
            await db.collection('events').add({ name, description, isVisible:false, createdBy:getCurrentUserId(), createdAt:Date.now() });
            $('#addEventForm').reset();
            manageEventsCache = await fetchAllEvents();
            renderManageEventsList();
            showToast(`"${name}" created — hidden until you make it visible.`);
        } catch(err){ console.error('create event failed:', err); showToast('Could not create the event.'); }
    });
};

// ── Admin: per-event test catalog ───────────────────────────────────────
window.openManageEventTests = async function(eventId){
    const ev = manageEventsCache.find(e=>e.id===eventId); if (!ev) return;
    manageEventTestsScope = eventId;
    $('#manageEventTestsScope').textContent = `${ev.name}'s Tests`;
    $('#newEventTestName').value=''; $('#newEventTestIsTime').checked=false; $('#newEventTestUnit').value=''; $('#newEventTestHigherBetter').checked=true;
    window.handleNewEventTestTimeToggle();
    $('#manageEventListView').classList.add('hidden');
    $('#manageEventTestsView').classList.remove('hidden');
    manageEventTestsCache = await fetchEventTests(eventId);
    renderManageEventTestsList();
};

window.handleNewEventTestTimeToggle = function(){
    const isTime = $('#newEventTestIsTime').checked;
    $('#newEventTestUnitGroup').classList.toggle('hidden', isTime);
};

async function fetchEventTests(eventId){
    if (!initFirebase()) return [];
    try {
        const snap = await db.collection('eventTests').where('eventId','==',eventId).get();
        const list=[]; snap.forEach(d=>list.push({ id:d.id, ...d.data() }));
        list.sort((a,b)=>(a.order??0)-(b.order??0));
        return list;
    } catch(err){ console.error('fetchEventTests failed:', err); showToast('Could not load tests.'); return []; }
}

function renderManageEventTestsList(){
    const el = $('#manageEventTestsList');
    if (!manageEventTestsCache.length){ el.innerHTML='<p class="text-muted">No tests yet — add one below.</p>'; return; }
    el.innerHTML = manageEventTestsCache.map(t=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);"><div><strong>${escapeHTML(t.name)}</strong><span style="font-size:12px;color:var(--text-muted);margin-left:8px;">${t.unit==='time'?'mm:ss':escapeHTML(t.unit)} · ${t.higherIsBetter?'higher is better':'lower is better'}</span></div><button type="button" class="row-action-btn danger" onclick="window.handleDeleteEventTest('${t.id}')">Remove</button></div>`).join('');
}

window.handleAddEventTestSubmit = async function(e){
    return guardedSubmit(e, 'adminWrite', RATE_LIMITS.adminWrite, async()=>{
        if (!manageEventTestsScope) return;
        const name = $('#newEventTestName').value.trim().slice(0,40);
        if (!name) return showToast('Please enter a test name.');
        if (manageEventTestsCache.find(t=>t.name.toLowerCase()===name.toLowerCase())) return showToast('A test with that name already exists for this event.');
        const isTime = $('#newEventTestIsTime').checked;
        const higherIsBetter = $('#newEventTestHigherBetter').checked;
        const order = manageEventTestsCache.reduce((m,t)=>Math.max(m,t.order??0),-1) + 1;
        const data = isTime
            ? { eventId:manageEventTestsScope, name, unit:'time', inputType:'text', higherIsBetter, placeholder:'12:30', order }
            : { eventId:manageEventTestsScope, name, unit:$('#newEventTestUnit').value.trim().slice(0,12)||'units', inputType:'number', higherIsBetter, placeholder:'0', order };
        if (!initFirebase()) return;
        try {
            await db.collection('eventTests').add(data);
            $('#addEventTestForm').reset(); window.handleNewEventTestTimeToggle();
            manageEventTestsCache = await fetchEventTests(manageEventTestsScope);
            renderManageEventTestsList();
            showToast(`"${name}" added to the event.`);
        } catch(err){ console.error('create event test failed:', err); showToast('Could not add test.'); }
    });
};

window.handleDeleteEventTest = async function(testId){
    const t = manageEventTestsCache.find(x=>x.id===testId); const name = t?t.name:'this test';
    if (!confirm(`Remove "${name}"? Any logged results for it stay recorded but won't be loggable anymore.`)) return;
    if (!initFirebase()) return;
    try {
        await db.collection('eventTests').doc(testId).delete();
        manageEventTestsCache = await fetchEventTests(manageEventTestsScope);
        renderManageEventTestsList();
        showToast(`"${name}" removed.`);
    } catch(err){ console.error('delete event test failed:', err); showToast('Could not remove test.'); }
};
