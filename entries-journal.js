// ── entries-journal.js ────────────────────────────────
// Entry CRUD (log/edit/delete a personal test result), streak calculation,
// and the streak/journal modal (daily check-ins, calendar rendering, and —
// new this chunk — the Club tab).
//
// TRAINING CLUB REBUILD (this chunk):
// - addEntry() no longer carries gymId/isOfficial — personal test-logging
//   was never club-scoped to begin with (Ncedo confirmed: club membership
//   and personal-best logging are separate concerns), and the leaderboard
//   is single-bucket now (see core.js's recomputeBestForUser()), so there's
//   nothing left for those fields to do.
// - The Streak & Journal modal gains a third tab, Club, alongside the
//   existing Calendar/Journal tabs — rendered by classes-member-ui.js's
//   renderMemberClubTab() (kept in its own file since it owns club/class
//   data, not streak data; this file just gives it a pane to render into).
// - updateStreakBadge()/the calendar/week-strip all switched from reading
//   appState.journalEntries directly to getShowedUpEntries() (core.js) —
//   the "showed up" union of daily journal entries AND class check-ins.

    async function addEntry(d){
        const uid2=getCurrentUserId();
        if (!uid2 || !initFirebase()) return null;
        const e={ userId:uid2, test:d.test, value:d.value, date:d.date||todayStr(), timestamp:Date.now() };
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
            // handleLogSubmit should already have caught both before this
            // ever fires; this is the fallback for whatever slips past them
            // (or a non-standard client).
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
    // "Showed up" for streak purposes now means EITHER a daily journal entry
    // (any intensity, including Rest) OR a class check-in — getShowedUpEntries()
    // in core.js unions the two, deduped by date. calculateStreak() itself is
    // untouched: it only ever reads `.date`, so it doesn't care which source
    // a given day's entry came from.
    function updateStreakBadge(){
        const n = calculateStreak(getShowedUpEntries());
        const c1=$('#streakBadgeCount'), c2=$('#streakModalCount');
        if(c1) c1.textContent=n;
        if(c2) c2.textContent=n;
    }
    // Resolves what to show for one calendar/week-strip day: a daily journal
    // entry takes visual priority (it carries an intensity, which is more
    // specific than "some check-in happened"), falling back to "showed up
    // via a class" if there's no journal entry but there IS a classLog for
    // that date. Returns null if neither exists — an untouched day.
    function getDayActivity(dateStr){
        const journal = getJournalEntry(dateStr);
        if (journal) return { kind:'journal', intensity: journal.intensity, entry: journal };
        const classLog = appState.classLogEntries.find(l=>l.date===dateStr);
        if (classLog) return { kind:'class', entry: classLog };
        return null;
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
    // Third tab this chunk: 'club'. Its pane is rendered by
    // classes-member-ui.js's renderMemberClubTab() — this function just
    // owns the tab-switching chrome and hands off rendering when 'club' is
    // selected, same as 'calendar'/'journal' hand off to this file's own
    // render functions.
    window.switchStreakTab=function(tab){
        $('#streakTabBtnCalendar').classList.toggle('active', tab==='calendar');
        $('#streakTabBtnJournal').classList.toggle('active', tab==='journal');
        $('#streakTabBtnClub')?.classList.toggle('active', tab==='club');
        $('#streakPaneCalendar').classList.toggle('active', tab==='calendar');
        $('#streakPaneJournal').classList.toggle('active', tab==='journal');
        $('#streakPaneClub')?.classList.toggle('active', tab==='club');
        if (tab==='club' && typeof window.renderMemberClubTab === 'function') window.renderMemberClubTab();
    };
    // The current week, Sunday-first, matching the leaderboard/calendar convention
    // used elsewhere in the app. Always reflects "this week" regardless of which
    // month the calendar tab is currently browsing.
    function renderStreakWeekStrip(){
        const strip = $('#streakWeekStrip'); if(!strip) return;
        const labels=['S','M','T','W','T','F','S'];
        const now = new Date(); now.setHours(0,0,0,0);
        const sunday = new Date(now); sunday.setDate(now.getDate()-now.getDay());
        const today = todayStr();
        let html='';
        for(let i=0;i<7;i++){
            const d = new Date(sunday); d.setDate(sunday.getDate()+i);
            const dateStr = dateToLocalStr(d);
            const activity = getDayActivity(dateStr);
            const color = activity ? (activity.kind==='journal' ? `var(--streak-${activity.intensity})` : 'var(--streak-class)') : 'var(--streak-none)';
            const isToday = dateStr===today;
            const isFuture = dateStr > today;
            const title = activity ? (activity.kind==='journal' ? `${formatDate(dateStr)} — ${activity.intensity}` : `${formatDate(dateStr)} — class check-in`) : formatDate(dateStr);
            html += `<div class="streak-week-day"><span class="streak-week-day-label">${labels[i]}</span><div class="streak-week-day-dot${isToday?' today':''}" style="background:${color};${isFuture?'opacity:0.4;cursor:default;':''}" ${isFuture?'':`onclick="window.selectJournalDate('${dateStr}')"`} title="${title}"></div></div>`;
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
            const activity = getDayActivity(dateStr);
            const color = activity ? (activity.kind==='journal' ? `var(--streak-${activity.intensity})` : 'var(--streak-class)') : 'var(--streak-none)';
            const isToday = dateStr===today;
            const isFuture = dateStr > today;
            const title = activity ? (activity.kind==='journal' ? `${formatDate(dateStr)} — ${activity.intensity}` : `${formatDate(dateStr)} — class check-in`) : formatDate(dateStr);
            html += `<div class="streak-cal-cell${isToday?' today':''}" style="background:${color};${isFuture?'opacity:0.4;cursor:default;':''}" ${isFuture?'':`onclick="window.selectJournalDate('${dateStr}')"`} title="${title}"></div>`;
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
    // No more updateOfficialAvailability() call here — the official-result
    // checkbox concept is gone. This is now just "set the input type/
    // placeholder for whichever test is selected," full stop.
    function updateResultField(){ const t=$('#logTest').value, cfg=getTestConfig(t), inp=$('#logResult'), lbl=$('#resultLabel'); if(!cfg){ inp.type='text'; inp.step='any'; inp.placeholder='Select test first'; lbl.textContent='Result'; return; } inp.type=cfg.inputType; inp.step='any'; inp.placeholder=cfg.placeholder; lbl.textContent=cfg.unit==='time'?'Time (mm:ss)':`Result (${cfg.unit})`; inp.value=''; }
    // ONE Log form now — no more official checkbox, no more gym/public
    // distinction. Every signed-in user logs personal test results the
    // same way, club member or not; results feed the single public
    // leaderboard (see core.js's recomputeBestForUser()).
    async function handleLogSubmit(e){ return guardedSubmit(e, 'logEntry', RATE_LIMITS.logEntry, async()=>{ const test=$('#logTest').value, raw=$('#logResult').value.trim(), date=$('#logDate').value||todayStr(); if(!test) return showToast('Please select a test.'); const cfg=getTestConfig(test); let value; if(cfg.unit==='time'){ value=parseTime(raw); if(isNaN(value)) return showToast('Invalid time format (mm:ss).'); } else { value=parseFloat(raw); if(isNaN(value)) return showToast('Invalid number.'); } if(!isValidEntryValue(value, cfg)) return showToast('That result looks out of range — double check the number.'); if(!isValidLogDate(date)) return showToast('Please pick a valid date (not in the future).'); const saved = await addEntry({test,value,date}); if(!saved) return; await pushBestToCloud(test); const disp=cfg.unit==='time'?raw:`${value} ${cfg.unit}`; showToast(`${test}: ${disp} logged!`); $('#logTest').value=''; $('#logResult').value=''; $('#logDate').value=todayStr(); updateResultField(); updateStatsRow(); }); }
