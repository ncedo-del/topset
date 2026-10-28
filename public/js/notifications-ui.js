// ── notifications-ui.js ───────────────────────────────
// Notification bell: surfaces two things the user can't otherwise see
// without checking manually — (1) a public event just went live (or
// disappeared), and (2) their gym's official-results window is open today
// or scheduled soon. No backend/Cloud Function involved: this is computed
// client-side from state the app is already subscribed to (appState.activeEvent
// via subscribeActiveEvent, appState.myGym via refreshMyGymInfo), and
// "unread" is tracked as a signature of current item IDs stashed in
// localStorage — see KEYS.seenNotif in core.js. Deliberately NOT gated on
// sign-in: the active event is public, so a signed-out visitor can still see
// the bell light up for it. The official-results item only ever appears for
// a signed-in member of a gym with an open/upcoming date, since
// appState.myGym is null otherwise.

// Piggybacks on the shared appState object created in core.js.
appState.notifications = [];

// Builds today's notification list fresh each call — cheap (two already-
// cached values, no network) so there's no need to diff against a previous
// call here; updateNotifications() below does the "is this NEW" comparison.
function computeNotifications(){
    const items = [];
    const ev = appState.activeEvent;
    if (ev){
        items.push({
            id: `event:${ev.id}`,
            title: `New event live: ${ev.name}`,
            desc: ev.description || 'Check it out and log a result to get on the board.',
            actionLabel: 'View Event',
            action: () => { window.closeNotifPanel(); navigateTo('event'); }
        });
    }
    const gym = appState.myGym;
    if (getCurrentUserId() && gym && gym.officialTestDate){
        const today = todayStr();
        if (gym.officialTestDate === today){
            items.push({
                id: `official-open:${gym.id}:${gym.officialTestDate}`,
                title: 'Official results open today',
                desc: `Log your result today at ${gym.name} and tick "Mark as Official" to lock it in.`,
                actionLabel: 'Log Result',
                action: () => { window.closeNotifPanel(); navigateTo('log'); }
            });
        } else if (gym.officialTestDate > today){
            items.push({
                id: `official-upcoming:${gym.id}:${gym.officialTestDate}`,
                title: 'Official results day scheduled',
                desc: `Official results open ${formatDate(gym.officialTestDate)} at ${gym.name}.`,
                actionLabel: null,
                action: null
            });
        }
        // A past officialTestDate is a closed window — deliberately not
        // surfaced here, so the bell doesn't keep nagging about a date that
        // already came and went.
    }
    // Signed-in only: unverified email, and a live streak with nothing journaled yet today.
    if (getCurrentUserId()){
        const fu = (typeof auth !== 'undefined' && auth) ? auth.currentUser : null;
        if (fu && !isGoogleUser(fu) && !fu.emailVerified){
            items.push({
                id: 'verify-email',
                title: 'Verify your email',
                desc: 'Check your inbox for the link from TOPSET.',
                actionLabel: 'Resend email',
                action: () => window.handleResendVerification()
            });
        }
        const streak = calculateStreak(appState.journalEntries || []);
        if (streak > 0 && !getJournalEntry(todayStr())){
            items.push({
                id: `streak:${todayStr()}`,
                title: 'Keep your streak alive',
                desc: `You're on ${streak} day${streak>1?'s':''}. Add today's journal entry before midnight.`,
                actionLabel: 'Open journal',
                action: () => { window.closeNotifPanel(); window.openStreakModal(); window.switchStreakTab('journal'); }
            });
        }
    }
    return items;
}

// Recomputes the list, refreshes the unread dot, and — if the panel happens
// to already be open when this fires (e.g. an event goes live while someone's
// browsing the Event page with Notifications open in another glance) — keeps
// the open panel's content live rather than leaving it stale until next open.
function updateNotifications(){
    const items = computeNotifications();
    appState.notifications = items;
    const seenSig = localStorage.getItem(KEYS.seenNotif) || '';
    const curSig = items.map(i=>i.id).sort().join('|');
    const hasUnread = items.length>0 && curSig!==seenSig;
    // The bell button ships hidden in index.html; show it as soon as this runs.
    $('#notifBtn')?.classList.remove('hidden');
    const badge = $('#notifBadge');
    if (badge){ badge.textContent = items.length; badge.classList.toggle('hidden', !hasUnread); }
    if (!$('#notifModal')?.classList.contains('hidden')) renderNotifList();
}

function renderNotifList(){
    const el = $('#notifList'); if (!el) return;
    const items = appState.notifications || [];
    if (!items.length){ el.innerHTML = '<p class="text-muted" style="padding:16px 4px;text-align:center;">You\'re all caught up — nothing new right now.</p>'; return; }
    el.innerHTML = items.map((it,i)=>`<div class="notif-item"><div class="notif-item-title">${escapeHTML(it.title)}</div><div class="notif-item-desc">${escapeHTML(it.desc)}</div>${it.actionLabel?`<button type="button" class="row-action-btn" onclick="window.handleNotifAction(${i})">${escapeHTML(it.actionLabel)}</button>`:''}</div>`).join('');
}

window.handleNotifAction = function(i){
    const it = (appState.notifications||[])[i];
    if (it && it.action) it.action();
};

window.toggleNotifPanel = function(){
    const modal = $('#notifModal'); if (!modal) return;
    if (modal.classList.contains('hidden')){
        renderNotifList();
        modal.classList.remove('hidden');
        // Opening the panel is what marks the CURRENT set as seen — the badge
        // clears the moment someone checks, even if they don't click through
        // to Event/Log from here. A later change (new event, new date) still
        // produces a fresh, different signature next time, so it lights up again.
        localStorage.setItem(KEYS.seenNotif, (appState.notifications||[]).map(i=>i.id).sort().join('|'));
        $('#notifBadge')?.classList.add('hidden');
    } else {
        modal.classList.add('hidden');
    }
};
window.closeNotifPanel = function(){ $('#notifModal')?.classList.add('hidden'); };

// index.html's bell button and modal use these names.
window.openNotifModal = function(){ const m=$('#notifModal'); if (m && m.classList.contains('hidden')) window.toggleNotifPanel(); };
window.closeNotifModal = window.closeNotifPanel;
