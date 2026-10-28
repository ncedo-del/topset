// ── entries-journal.js ────────────────────────────────
// Entry CRUD (log/edit/delete a result), streak calculation, and the
// streak/journal modal (daily check-ins, calendar rendering).

    async function addEntry(d){
        const uid2=getCurrentUserId();
        if (!uid2 || !initFirebase()) return null;
        const u = getCurrentUser();
        const gymId = ('gymId' in d) ? d.gymId : (u?.gymId || null);
        const e={ userId:uid2, test:d.test, value:d.value, date:d.date||todayStr(), timestamp:Date.now(), gymId, isOfficial: !!d.isOfficial };
        // An official entry is only ever a REQUEST until the gym's manager verifies it
        // (firestore.rules enforces 'pending' on create — nobody can self-verify).
        if (e.isOfficial) e.officialStatus = 'pending';
        try {
            // Batched with the profile's lastWriteAt bump so the two writes
            // succeed or fail together — this is what the server-side
            // withinEntryRateLimit() cooldown in firestore.rules reads.
            // Without this write, that rule's `!('lastWriteAt' in myProfile())`
            // branch would stay true forever and the cooldown would never
            // actually engage.
            const entryRef = db.collection('entries').doc();
            const batch = db.batch();
            batch.set(entryRef, e);
            batch.update(db.collection('users').doc(uid2), { lastWriteAt: Date.now() });
            await batch.commit();
            return { id: entryRef.id, ...e };
        }
        catch(err){
            console.error('addEntry failed:', err);
            // Firestore doesn't tell us WHICH rule clause rejected a
            // permission-denied write, so this can't distinguish "too fast"
            // from "value out of range" — the client-side checks in
            // handleLogSubmit/handleLogSubmitPublic should already have
            // caught both before this ever fires; this is the fallback for
            // whatever slips past them (or a non-standard client).
            const msg = err && err.code === 'permission-denied'
                ? "That couldn't be saved — check the value and date, or wait a moment if you're logging quickly."
                : 'Could not save entry. Check your connection.';
            showToast(msg);
            return null;
        }
    }
    async function updateEntry(id,c){
        if (!initFirebase()) return null;
        try { await db.collection('entries').doc(id).update(c); return true; }
        catch(err){ console.error('updateEntry failed:', err); showToast('Could not update entry.'); return null; }
    }
    async function deleteEntry(id){
        if (!initFirebase()) return false;
        try { await db.collection('entries').doc(id).delete(); return true; }
        catch(err){ console.error('deleteEntry failed:', err); showToast('Could not delete entry.'); return false; }
    }
    // Synchronous because appState.currentUser is kept fresh on login, signup, and profile edits.
    function getCurrentUser(){ return appState.currentUser; }
    function calculateStreak(entries){ if(!entries.length) return 0; const dates=[...new Set(entries.map(e=>e.date))].sort().reverse(); if(dates[0]!==todayStr()&&daysAgo(dates[0])>1) return 0; let s=0; const today=new Date(); today.setHours(0,0,0,0); for(let i=0;i<dates.length;i++){ const d=new Date(dates[i]+'T00:00:00'); const exp=new Date(today); exp.setDate(exp.getDate()-i); if(d.getTime()===exp.getTime())s++; else if(i===0&&daysAgo(dates[0])===1){ const y=new Date(today); y.setDate(y.getDate()-1); if(d.getTime()===y.getTime()){s=1;continue;}else break;} else break; } return s; }

    // ── Streak / Journal modal ──────────────────────────────────────────
    // A journal entry (any intensity, including Rest) counts as "showed up" for
    // streak purposes — reuses calculateStreak() since it only ever reads e.date.
    function updateStreakBadge(){
        const n = calculateStreak(appState.journalEntries);
        const c1=$('#streakBadgeCount'), c2=$('#streakModalCount');
        if(c1) c1.textContent=n;
        if(c2) c2.textContent=n;
    }
    // dateToLocalStr() now lives in core.js — it needs to exist before
    // core.js's own todayStr() runs at script-load time, which this file
    // loading after core.js can't satisfy. Calls below resolve to that
    // definition (both files share the same global scope).
    window.openStreakModal=function(){
        if(!appState.currentUserId) return;
        streakCalendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        updateStreakBadge();
        renderStreakWeekStrip();
        renderStreakCalendar();
        window.switchStreakTab('calendar');
        $('#streakModal').classList.remove('hidden');
    };
    window.closeStreakModal=function(){ $('#streakModal').classList.add('hidden'); };
    window.switchStreakTab=function(tab){
        $('#streakTabBtnCalendar').classList.toggle('active', tab==='calendar');
        $('#streakTabBtnJournal').classList.toggle('active', tab==='journal');
        $('#streakPaneCalendar').classList.toggle('active', tab==='calendar');
        $('#streakPaneJournal').classList.toggle('active', tab==='journal');
    };
    // The current week, Sunday-first, matching the leaderboard/calendar convention
    // used elsewhere in the app. Always reflects "this week" regardless of which
    // month the calendar tab is currently browsing.
    function renderStreakWeekStrip(sel, clickFn){
        // sel/clickFn let the Profile hub reuse this exact strip (its own container,
        // and a click handler that closes the hub first); defaults = the Streak modal.
        const strip = $(sel || '#streakWeekStrip'); if(!strip) return;
        clickFn = clickFn || 'window.selectJournalDate';
        const labels=['S','M','T','W','T','F','S'];
        const now = new Date(); now.setHours(0,0,0,0);
        const sunday = new Date(now); sunday.setDate(now.getDate()-now.getDay());
        const today = todayStr();
        let html='';
        for(let i=0;i<7;i++){
            const d = new Date(sunday); d.setDate(sunday.getDate()+i);
            const dateStr = dateToLocalStr(d);
            const entry = getJournalEntry(dateStr);
            const color = entry ? `var(--streak-${entry.intensity})` : 'var(--streak-none)';
            const isToday = dateStr===today;
            const isFuture = dateStr > today;
            html += `<div class="streak-week-day"><span class="streak-week-day-label">${labels[i]}</span><div class="streak-week-day-dot${isToday?' today':''}" style="background:${color};${isFuture?'opacity:0.4;cursor:default;':''}" ${isFuture?'':`onclick="${clickFn}('${dateStr}')"`} title="${formatDate(dateStr)}${entry?' — '+entry.intensity:''}"></div></div>`;
        }
        strip.innerHTML = html;
    }
    function renderStreakCalendar(){
        const grid = $('#streakCalGrid'); if(!grid) return;
        const year = streakCalendarMonth.getFullYear(), month = streakCalendarMonth.getMonth();
        $('#streakCalMonthLabel').textContent = streakCalendarMonth.toLocaleDateString('en-US',{month:'long',year:'numeric'});
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month+1, 0).getDate();
        const today = todayStr();
        let html = ['S','M','T','W','T','F','S'].map(w=>`<div class="streak-cal-weekday">${w}</div>`).join('');
        for(let i=0;i<firstDay;i++) html += `<div class="streak-cal-cell empty-slot"></div>`;
        for(let day=1;day<=daysInMonth;day++){
            const dateStr = dateToLocalStr(new Date(year, month, day));
            const entry = getJournalEntry(dateStr);
            const color = entry ? `var(--streak-${entry.intensity})` : 'var(--streak-none)';
            const isToday = dateStr===today;
            const isFuture = dateStr > today;
            html += `<div class="streak-cal-cell${isToday?' today':''}" style="background:${color};${isFuture?'opacity:0.4;cursor:default;':''}" ${isFuture?'':`onclick="window.selectJournalDate('${dateStr}')"`} title="${formatDate(dateStr)}${entry?' — '+entry.intensity:''}"></div>`;
        }
        grid.innerHTML = html;
    }
    window.streakCalPrevMonth=function(){ streakCalendarMonth = new Date(streakCalendarMonth.getFullYear(), streakCalendarMonth.getMonth()-1, 1); renderStreakCalendar(); };
    window.streakCalNextMonth=function(){ streakCalendarMonth = new Date(streakCalendarMonth.getFullYear(), streakCalendarMonth.getMonth()+1, 1); renderStreakCalendar(); };
    window.selectJournalDate=function(date){
        if(date > todayStr()) return; // no journaling the future
        streakEditingDate = date;
        const entry = getJournalEntry(date);
        streakSelectedIntensity = entry ? entry.intensity : null;
        $('#streakJournalDateLabel').textContent = date===todayStr() ? `Today · ${formatDate(date)}` : formatDate(date);
        $('#streakJournalTextarea').value = entry ? entry.comment||'' : '';
        document.querySelectorAll('#streakIntensityRow .streak-intensity-btn').forEach(btn=>{
            btn.classList.toggle('active', btn.dataset.intensity===streakSelectedIntensity);
        });
        window.switchStreakTab('journal');
    };
    window.selectIntensity=function(val){
        streakSelectedIntensity = val;
        document.querySelectorAll('#streakIntensityRow .streak-intensity-btn').forEach(btn=>{
            btn.classList.toggle('active', btn.dataset.intensity===val);
        });
    };
    let lastJournalSaveAt = 0;
    window.saveJournalEntry=async function(){
        if(!appState.currentUserId) return;
        if(!streakSelectedIntensity) return showToast('Pick an intensity — Rest, Light, Moderate, or Hard.');
        const now = Date.now();
        if(now - lastJournalSaveAt < RATE_LIMITS.journalSave) return;
        lastJournalSaveAt = now;
        const comment = $('#streakJournalTextarea').value.trim();
        const ok = await saveJournal(streakEditingDate, streakSelectedIntensity, comment);
        if(!ok) return showToast('Could not save — check your connection and try again.');
        // Optimistic local update so the calendar/strip/badge reflect the save
        // immediately, without waiting on the next onSnapshot round-trip.
        const idx = appState.journalEntries.findIndex(j=>j.date===streakEditingDate);
        const updated = { id:`${appState.currentUserId}_${streakEditingDate}`, userId:appState.currentUserId, date:streakEditingDate, intensity:streakSelectedIntensity, comment };
        if(idx>=0) appState.journalEntries[idx]=updated; else appState.journalEntries.push(updated);
        updateStreakBadge();
        renderStreakWeekStrip();
        renderStreakCalendar();
        showToast('Journal entry saved!');
    };
    function getPersonalBests(entries){ const map={}; entries.forEach(e=>{ const cfg=getTestConfig(e.test); if(!cfg)return; const k=e.test; if(!map[k])map[k]=e; else { if(cfg.higherIsBetter?e.value>map[k].value:e.value<map[k].value) map[k]=e; else if(e.value===map[k].value&&e.date>map[k].date) map[k]=e; } }); return Object.values(map); }
    function formatTime(sec){ const m=Math.floor(sec/60), s=Math.floor(sec%60); return `${m}:${s.toString().padStart(2,'0')}`; }
    function parseTime(raw){ const p=raw.split(':'); if(p.length===2){ const m=parseInt(p[0]), s=parseInt(p[1]); if(!isNaN(m)&&!isNaN(s)) return m*60+s; } return NaN; }
    function updateResultField(){ const t=$('#logTest').value, cfg=getTestConfig(t), inp=$('#logResult'), lbl=$('#resultLabel'); if(!cfg){ inp.type='text'; inp.step='any'; inp.placeholder='Select test first'; lbl.textContent='Result'; return; } inp.type=cfg.inputType; inp.step='any'; inp.placeholder=cfg.placeholder; lbl.textContent=cfg.unit==='time'?'Time (mm:ss)':`Result (${cfg.unit})`; inp.value=''; updateOfficialAvailability(); }
    // The "Mark as Official" checkbox only appears — and is only enabled — when
    // the currently-selected log date matches the member's gym's officialTestDate.
    // This mirrors the entries.create security rule (which re-checks the same
    // condition server-side), so this is a UX convenience, not the enforcement.
    function updateOfficialAvailability(){
        updateLogFormVisibility();
        const wrap=$('#officialCheckboxWrap'), cb=$('#logIsOfficial'), hint=$('#officialHint'), gym=appState.myGym, date=$('#logDate').value;
        if (!gym || !gym.officialTestDate){ wrap.classList.add('hidden'); cb.checked=false; return; }
        const isOpenToday = date === gym.officialTestDate;
        wrap.classList.remove('hidden');
        cb.disabled = !isOpenToday;
        if (!isOpenToday) cb.checked=false;
        hint.textContent = isOpenToday
            ? `Official results are open for this date at ${gym.name}. Your result counts as official once your gym manager verifies it; after that only they can edit or delete it.`
            : `Official results open on ${formatDate(gym.officialTestDate)} at ${gym.name} — pick that date to mark a result official.`;
    }
    async function handleLogSubmit(e){ return guardedSubmit(e, 'logEntry', RATE_LIMITS.logEntry, async()=>{ const test=$('#logTest').value, raw=$('#logResult').value.trim(), date=$('#logDate').value||todayStr(); if(!test) return showToast('Please select a test.'); const cfg=getTestConfig(test); let value; if(cfg.unit==='time'){ value=parseTime(raw); if(isNaN(value)) return showToast('Invalid time format (mm:ss).'); } else { value=parseFloat(raw); if(isNaN(value)) return showToast('Invalid number.'); } if(!isValidEntryValue(value, cfg)) return showToast('That result looks out of range — double check the number.'); if(!isValidLogDate(date)) return showToast('Please pick a valid date (not in the future).'); const isOfficial = !$('#logIsOfficial').disabled && $('#logIsOfficial').checked; const saved = await addEntry({test,value,date,isOfficial}); if(!saved) return; await pushBestToCloud(test); const disp=cfg.unit==='time'?raw:`${value} ${cfg.unit}`; showToast(isOfficial ? `${test}: ${disp} submitted as OFFICIAL — it counts once your gym manager verifies it.` : `${test}: ${disp} logged!`); $('#logTest').value=''; $('#logResult').value=''; $('#logDate').value=todayStr(); $('#logIsOfficial').checked=false; updateResultField(); updateStatsRow(); }); }
