// ── profile-ui.js ─────────────────────────────────────
// Profile hub, reached via the header settings (gear) button. Shows the
// signed-in athlete's own snapshot — avatar, streak, PRs, this week's
// check-ins, gym affiliation — and rehouses settings that used to be
// scattered around the header: theme, edit profile, admin/manager
// shortcuts, log out.
//
// This is deliberately the seed of the "athlete profile" TopSet is pivoting
// toward (scouts/sponsors reviewing a standardized stat card per sport).
// Nothing here is public yet — it's still just the signed-in user looking
// at their own data — but the Stat Card banner below is framed as "what a
// scout would see" on purpose, so that pivot has a natural landing spot
// later instead of needing this screen rebuilt from scratch.
//
// Loads after admin-ui.js (needs escapeHTML) and leaderboard-ui.js/
// entries-journal.js (needs renderStreakWeekStrip, calculateStreak,
// getPersonalBests, openStatCard) — all already loaded by this point.

// SVG icons only, matching the rest of the app's design language (see
// styles.css / project convention: no emoji in headings, labels, or
// buttons). Reused verbatim from the exact same icons elsewhere in the app
// (Manage Tests, My Gym, PRs tab, Manage Event, Edit Profile, Stat Card,
// Log out) rather than inventing new glyphs, so this screen doesn't
// introduce a second visual vocabulary for the same actions.
const ICON_FLAME = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>';
const ICON_TROPHY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0Z"/><path d="M7 5H4a3 3 0 0 0 3 5"/><path d="M17 5h3a3 3 0 0 1-3 5"/></svg>';
const ICON_CALENDAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/></svg>';
const ICON_PENCIL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>';
const ICON_STATCARD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 20 8.5 17 20 7 20 4 8.5"/><path d="M12 2v12M4 8.5l8 5.5M20 8.5l-8 5.5M7 20l5-6M17 20l-5-6"/></svg>';
const ICON_GYM = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M10 22v-4h4v4"/><path d="M2 22h20"/><path d="M10 6h4M10 10h4M10 14h4"/></svg>';
const ICON_WRENCH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94Z"/></svg>';
const ICON_LOGOUT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>';
const ICON_PLUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';

window.openProfileModal = function(){
    if (!appState.currentUserId) return;
    window.renderProfileModal();
    $('#profileModal').classList.remove('hidden');
};
window.closeProfileModal = function(){ $('#profileModal')?.classList.add('hidden'); };

// Local, not exported — only renderProfileModal/handleNotificationsClick/
// updateNotifDot below need it, and those are the only call sites elsewhere.
function daysSince(dateInput){
    if (!dateInput) return 0;
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return 0;
    const today = new Date(); today.setHours(0,0,0,0);
    const start = new Date(d); start.setHours(0,0,0,0);
    return Math.max(0, Math.floor((today-start)/(1000*60*60*24)));
}

// A simple @handle derived from the display name — TopSet has no real
// username field (name is freeform, editable, and not unique), so this is
// cosmetic only, matching the reference UI's look. Never used for lookups,
// mentions, or anything that would need it to actually be unique.
function handleFromName(name){
    const slug = (name||'').toLowerCase().replace(/[^a-z0-9]+/g,'');
    return '@' + (slug || 'athlete');
}

window.renderProfileModal = function(){
    const u = getCurrentUser();
    if (!u) return;

    // The avatar itself stays as-is — it's the athlete's own chosen emoji
    // (a personalization feature, set in Edit Profile), not a UI icon, so
    // it's exempt from the no-emoji convention the rest of this screen
    // follows.
    $('#profileAvatarBig').textContent = u.avatar || '🏋️';
    $('#profileBigName').textContent = u.name || 'Athlete';
    $('#profileBigHandle').textContent = handleFromName(u.name);

    const streak = calculateStreak(appState.journalEntries);
    const prCount = getPersonalBests(appState.entries).length;
    const memberDays = daysSince(u.createdAt);

    $('#profileStatPills').innerHTML = [
        { icon:ICON_FLAME,    label:'Streak', val: streak },
        { icon:ICON_TROPHY,   label:'PRs',    val: prCount },
        { icon:ICON_CALENDAR, label:'Days',   val: memberDays }
    ].map(s=>`<div class="profile-stat-pill"><div class="profile-stat-icon">${s.icon}</div><div class="profile-stat-val">${s.val}</div><div class="profile-stat-label">${escapeHTML(s.label)}</div></div>`).join('');

    // Reuses the exact same week-strip renderer the Streak modal uses —
    // same colors, same click-to-journal behavior — just pointed at this
    // modal's own container so the two never fight over one DOM node.
    renderStreakWeekStrip('#profileWeekStrip');

    const streakBanner = $('#profileStreakBanner');
    if (streak > 0){
        streakBanner.innerHTML = `<div class="profile-banner-icon">${ICON_TROPHY}</div><div><div class="profile-banner-title">On a roll</div><div class="profile-banner-sub">${streak} day${streak===1?'':'s'} in a row — keep it up!</div></div>`;
    } else {
        streakBanner.innerHTML = `<div class="profile-banner-icon">${ICON_FLAME}</div><div><div class="profile-banner-title">No streak yet</div><div class="profile-banner-sub">Log a result or a journal entry today to start one.</div></div>`;
    }

    const gymCard = $('#profileGymCard');
    if (u.gymId){
        const gym = appState.myGym;
        gymCard.innerHTML = `<div class="profile-banner-icon">${ICON_GYM}</div><div><div class="profile-banner-title">${gym?escapeHTML(gym.name):'Your Gym'}</div><div class="profile-banner-sub">${gym?escapeHTML(tierInfo(gym.tier).label)+' plan':'Loading gym info…'}</div></div>`;
    } else {
        gymCard.innerHTML = `<div class="profile-banner-icon">${ICON_PLUS}</div><div><div class="profile-banner-title">Not in a gym yet</div><div class="profile-banner-sub">Join one with an invite code in Edit Profile.</div></div>`;
    }

    renderProfileThemeToggle();
    renderProfileSettingsList(u);
};

function renderProfileThemeToggle(){
    const row = $('#profileThemeToggle');
    if (!row) return;
    row.innerHTML = `
        <button type="button" class="profile-theme-btn ${appState.theme==='dark'?'active':''}" onclick="window.setProfileTheme('dark')"><svg class="btn-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"/></svg> Dark</button>
        <button type="button" class="profile-theme-btn ${appState.theme==='light'?'active':''}" onclick="window.setProfileTheme('light')"><svg class="btn-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg> Light</button>`;
}
window.setProfileTheme = function(theme){ applyTheme(theme); renderProfileThemeToggle(); };

function renderProfileSettingsList(u){
    const el = $('#profileSettingsList');
    if (!el) return;
    const rows = [];
    rows.push({ label:'Edit Profile',   icon:ICON_PENCIL,   onclick:"window.closeProfileModal(); window.openEditProfileModal();" });
    rows.push({ label:'Your Stat Card', icon:ICON_STATCARD, onclick:"window.closeProfileModal(); window.openStatCard();" });
    if (u.managesGymId) rows.push({ label:'My Gym', icon:ICON_GYM, onclick:"window.closeProfileModal(); window.openMyGym();" });
    if (u.isAdmin){
        rows.push({ label:'Manage Tests', icon:ICON_WRENCH,   onclick:"window.closeProfileModal(); window.openManageTests();" });
        rows.push({ label:'Manage Gyms',  icon:ICON_GYM,      onclick:"window.closeProfileModal(); window.openManageGyms();" });
        rows.push({ label:'Manage Event', icon:ICON_CALENDAR, onclick:"window.closeProfileModal(); window.openManageEvent();" });
    }
    rows.push({ label:'Log Out', icon:ICON_LOGOUT, danger:true, onclick:"window.closeProfileModal(); window.handleLogout();" });
    el.innerHTML = rows.map(r=>`<button type="button" class="profile-settings-row${r.danger?' danger':''}" onclick="${r.onclick}"><span class="profile-settings-icon">${r.icon}</span><span>${escapeHTML(r.label)}</span><svg class="profile-settings-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg></button>`).join('');
}

// ── Notifications — deliberately lightweight. Reads real, already-live
// app state (email verification, whether official results are open today
// at the member's gym) rather than standing up a separate notifications
// collection/backend just for this. No history, no persistence — a quick
// "here's what's relevant right now" tap target, same job the bell icon
// does in the reference UI, without inventing infrastructure for it yet.
window.handleNotificationsClick = function(){
    const msgs = [];
    if (auth && auth.currentUser && !isGoogleUser(auth.currentUser) && !auth.currentUser.emailVerified) msgs.push('Please verify your email — check your inbox.');
    if (appState.myGym && appState.myGym.officialTestDate === todayStr()) msgs.push(`Official results are open today at ${appState.myGym.name}!`);
    if (!msgs.length) msgs.push("You're all caught up.");
    msgs.forEach(m=>showToast(m));
};

window.updateNotifDot = function(){
    const dot = $('#notifDot');
    if (!dot) return;
    const fbUser = auth && auth.currentUser;
    const needsVerify = !!(fbUser && !isGoogleUser(fbUser) && !fbUser.emailVerified);
    const officialOpenToday = !!(appState.myGym && appState.myGym.officialTestDate === todayStr());
    dot.classList.toggle('hidden', !(needsVerify || officialOpenToday));
};
