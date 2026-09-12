// ── classes-member-ui.js ──────────────────────────────
// Member-facing side of the Training Club system: browse your club's
// classes, join/leave, check in ("showed up"), and write this week's
// private club journal entry. Rendered inside the Streak & Journal
// modal's Club tab (see entries-journal.js's switchStreakTab()), not a
// separate page — keeps the "one place to check your streak/journal"
// mental model intact, club activity is just another facet of that.
//
// DEPENDENCY NOTE: this reads appState.myClub, which core.js renamed from
// appState.myGym — but the function that actually POPULATES it
// (refreshMyGymInfo(), currently in gyms.js) hasn't been updated to write
// to the new field name yet. That lands in the teardown chunk (4e). Until
// then, appState.myClub stays null and this tab shows its "no club"
// empty state for everyone, even actual club members. The code below is
// correct and ready — it's just not fed live data yet.

    let memberClubClasses = [];      // this chunk's live class list for the member's club
    let memberEnrollments = [];      // which of those classes the member is enrolled in
    let memberClubDataClubId = null; // which club the two lists above are currently subscribed to

    // Lazily (re)starts the two live subscriptions this tab needs, only
    // when the member's club actually changes — avoids tearing down and
    // re-subscribing on every single tab-switch/re-render.
    function ensureMemberClubSubscriptions(){
        const clubId = appState.myClub?.id || null;
        if (clubId === memberClubDataClubId) return;
        memberClubDataClubId = clubId;
        subscribeClubClasses(clubId, list=>{
            memberClubClasses = list;
            if ($('#streakPaneClub')?.classList.contains('active')) window.renderMemberClubTab();
        });
        subscribeMyEnrollments(list=>{
            memberEnrollments = list;
            if ($('#streakPaneClub')?.classList.contains('active')) window.renderMemberClubTab();
        });
    }

    window.handleJoinClass = async function(classId){
        const clubId = appState.myClub?.id; if (!clubId) return;
        const ok = await enrollInClass(classId, clubId);
        if (ok) showToast('Joined class!');
    };
    window.handleLeaveClass = async function(classId){
        if (!confirm('Leave this class? Your past check-ins stay on record.')) return;
        const ok = await unenrollFromClass(classId);
        if (ok) showToast('Left class.');
    };
    // "Showed up" — logs a classLogs doc for today and refreshes the streak
    // badge/calendar immediately (optimistic, same pattern saveJournalEntry()
    // uses) rather than waiting on the next onSnapshot round-trip.
    window.handleClassCheckIn = async function(classId){
        const clubId = appState.myClub?.id; if (!clubId) return;
        if (rateLimited('classLog', RATE_LIMITS.classLog)) return;
        const saved = await logClassAttendance(classId, clubId, todayStr(), '');
        if (!saved) return;
        appState.classLogEntries.push(saved);
        updateStreakBadge();
        renderStreakWeekStrip();
        renderStreakCalendar();
        showToast('Checked in — nice work!');
        window.renderMemberClubTab();
    };
    function hasCheckedInToday(classId){
        const today = todayStr();
        return appState.classLogEntries.some(l=>l.classId===classId && l.date===today);
    }
    function isEnrolled(classId){ return memberEnrollments.some(en=>en.classId===classId); }

    let lastClubJournalSaveAt = 0;
    window.saveMemberClubJournal = async function(){
        const clubId = appState.myClub?.id; if (!clubId) return;
        const now = Date.now();
        if (now - lastClubJournalSaveAt < RATE_LIMITS.classJournalSave) return;
        lastClubJournalSaveAt = now;
        const weekStart = mondayOfWeek(new Date());
        const text = $('#clubJournalTextarea').value.trim();
        const ok = await saveClassJournal(clubId, weekStart, text);
        if (!ok) return showToast('Could not save — check your connection and try again.');
        showToast('Club journal entry saved!');
    };

    // Renders the whole Club tab pane: class list (join/leave/check-in) on
    // top, this week's private journal entry below. Exposed on window so
    // entries-journal.js's switchStreakTab() can call it without this file
    // needing to know anything about tab-switching itself.
    window.renderMemberClubTab = function(){
        const el = $('#streakPaneClub'); if (!el) return;
        if (!appState.myClub){
            el.innerHTML = '<div class="empty-state" style="padding:24px 0;">Join a club to see its classes and log your check-ins here. Add an invite code in Edit Profile.</div>';
            return;
        }
        ensureMemberClubSubscriptions();
        const weekStart = mondayOfWeek(new Date());
        const journalEntry = getClassJournalEntry(appState.myClub.id, weekStart);
        const classesHTML = memberClubClasses.length
            ? memberClubClasses.map(c=>{
                const enrolled = isEnrolled(c.id);
                const checkedIn = hasCheckedInToday(c.id);
                return `<div style="padding:10px 0;border-bottom:1px solid var(--border);"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;"><strong>${escapeHTML(c.name)}</strong>${enrolled?`<button type="button" class="btn ${checkedIn?'btn-outline':'btn-primary'} btn-sm" ${checkedIn?'disabled':''} onclick="window.handleClassCheckIn('${c.id}')">${checkedIn?'✓ Checked in today':'Check In'}</button>`:`<button type="button" class="btn btn-outline btn-sm" onclick="window.handleJoinClass('${c.id}')">Join</button>`}</div>${c.description?`<div style="font-size:12px;color:var(--text-muted);margin-top:2px;">${escapeHTML(c.description)}</div>`:''}${enrolled?`<button type="button" class="row-action-btn" style="margin-top:6px;" onclick="window.handleLeaveClass('${c.id}')">Leave class</button>`:''}</div>`;
            }).join('')
            : '<p class="text-muted" style="padding:8px 0;">No classes have been added to your club yet.</p>';
        el.innerHTML = `
            <div style="margin-bottom:18px;">
                <div style="font-size:12.5px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">${escapeHTML(appState.myClub.name||'Your Club')}'s Classes</div>
                ${classesHTML}
            </div>
            <div>
                <div class="streak-journal-date">This Week's Club Journal · Week of ${formatDate(weekStart)}</div>
                <textarea class="streak-journal-textarea" id="clubJournalTextarea" placeholder="How's this week of training going with your club? Private — only you and your club manager can see this.">${escapeHTML(journalEntry ? (journalEntry.text||'') : '')}</textarea>
                <div class="modal-buttons" style="margin-top:14px;">
                    <button type="button" class="btn btn-primary" onclick="window.saveMemberClubJournal()"><svg class="btn-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg> Save Entry</button>
                </div>
            </div>`;
    };
