// ── app-init.js ───────────────────────────────────────
// Top-level UI state sync (updateUIForMode), app init() — wires up
// auth state listener, theme, service worker — and window.* exports
// for onclick handlers. Loads LAST.
//
// TRAINING CLUB REBUILD (this chunk) — fixed two real bugs left over from
// earlier in the chunk, not just terminology:
// 1. subscribeTests(profile?.gymId || null, callback) — core.js's
//    subscribeTests() has been single-arg (callback only) since 4a. That
//    extra first argument was silently binding to the `callback`
//    parameter, and the actual callback function was being dropped
//    entirely — the very next line inside subscribeTests() that tries to
//    invoke `callback()` would throw. Fixed: subscribeTests(callback).
// 2. updateOfficialAvailability() — deleted from entries-journal.js back
//    in 4d (I'd mis-tracked this as a harmless no-op at the time; it
//    wasn't, see the 4e progress notes). Both call sites here removed.
// Also newly wired: subscribeClassLogs()/subscribeClassJournal() — these
// existed in core.js since 4a but nothing ever actually called them.
// Without this, appState.classLogEntries/classJournalEntries would have
// stayed permanently empty and getShowedUpEntries() would have silently
// degraded to "journal entries only," quietly breaking the whole point
// of the streak union.

    function updateUIForMode(){ const loggedIn=!!appState.currentUserId; $('#userIndicator').style.display=loggedIn?'flex':'none'; if(loggedIn){ const u=getCurrentUser(); const adminBtns = u?.isAdmin ? `<button class="btn btn-outline btn-sm" onclick="window.openManageTests()" title="Manage Tests" style="margin-left:6px;"><svg class="btn-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94Z"/></svg></button><button class="btn btn-outline btn-sm" onclick="window.openManageGyms()" title="Manage Clubs" style="margin-left:4px;"><svg class="btn-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M10 22v-4h4v4"/><path d="M2 22h20"/><path d="M10 6h4M10 10h4M10 14h4"/></svg></button><button class="btn btn-outline btn-sm" onclick="window.openManageEvent()" title="Manage Event" style="margin-left:4px;"><svg class="btn-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/></svg></button>` : (u?.managesClubId ? `<button class="btn btn-outline btn-sm" onclick="window.openMyGym()" title="My Club" style="margin-left:6px;"><svg class="btn-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M10 22v-4h4v4"/><path d="M2 22h20"/><path d="M10 6h4M10 10h4M10 14h4"/></svg></button>` : ''); if(u) $('#userIndicator').innerHTML=`${escapeHTML(u.avatar||'🏋️')} ${escapeHTML(u.name)} <button class="btn btn-ghost btn-sm" onclick="window.handleLogout()" style="margin-left:4px;" title="Log out"><svg class="btn-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg></button> <button class="btn btn-ghost btn-sm" onclick="window.openEditProfileModal()" style="margin-left:4px;" title="Edit profile"><svg class="btn-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg></button> <button class="btn btn-ghost btn-sm" onclick="window.openStatCard()" style="margin-left:4px;" title="Stat Card"><svg class="btn-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 20 8.5 17 20 7 20 4 8.5"/><path d="M12 2v12M4 8.5l8 5.5M20 8.5l-8 5.5M7 20l5-6M17 20l-5-6"/></svg></button>${adminBtns}`; if (u?.isAdmin) { $('#bottomNavManageTestsBtn')?.classList.remove('hidden'); } else { $('#bottomNavManageTestsBtn')?.classList.add('hidden'); } if (u?.managesClubId) { $('#bottomNavMyGymBtn')?.classList.remove('hidden'); } else { $('#bottomNavMyGymBtn')?.classList.add('hidden'); } } else { window.openAboutModal(); $('#bottomNavManageTestsBtn')?.classList.add('hidden'); $('#bottomNavMyGymBtn')?.classList.add('hidden'); } if(!loggedIn&&$('#page-leaderboard').classList.contains('active')) navigateTo('log'); $('#streakBadgeBtn')?.classList.toggle('hidden', !loggedIn); subscribeEntries(()=>{ updateStatsRow(); if($('#page-history').classList.contains('active')) renderHistory(); if($('#page-prs').classList.contains('active')) renderPRs(); }); subscribeJournal(()=>{ updateStreakBadge(); if(!$('#streakModal').classList.contains('hidden')){ renderStreakWeekStrip(); renderStreakCalendar(); } }); subscribeClassLogs(()=>{ updateStreakBadge(); if(!$('#streakModal').classList.contains('hidden')){ renderStreakWeekStrip(); renderStreakCalendar(); } if($('#streakPaneClub')?.classList.contains('active')) window.renderMemberClubTab(); }); subscribeClassJournal(()=>{ if($('#streakPaneClub')?.classList.contains('active')) window.renderMemberClubTab(); }); updateSpotlightSelect(); }
    async function init(){
        applyTheme(localStorage.getItem(KEYS.theme)||'dark');
        appState.spotlightLift=localStorage.getItem(KEYS.spotlightLift)||'';

        // Wire up all DOM event listeners immediately — independent of auth state.
        $('#logDate').value=todayStr(); updateResultField();
        $$('.nav-tab').forEach(t=>t.addEventListener('click',()=>navigateTo(t.dataset.page)));
        $$('.bottom-nav-item').forEach(t=>t.addEventListener('click',e=>{ if (t.id === 'bottomNavManageTestsBtn' || t.id === 'bottomNavMyGymBtn') return; navigateTo(t.dataset.page); }));
        $('#authModal').addEventListener('click',e=>{ if(e.target===$('#authModal')) closeAuthModal(); });
        $('#aboutModal').addEventListener('click',e=>{ if(e.target===$('#aboutModal')) closeAboutModal(); });
        $('#installModal').addEventListener('click',e=>{ if(e.target===$('#installModal')) closeInstallModal(); });
        $('#editEntryModal').addEventListener('click',e=>{ if(e.target===$('#editEntryModal')) closeEditEntryModal(); });
        $('#editProfileModal').addEventListener('click',e=>{ if(e.target===$('#editProfileModal')) closeEditProfileModal(); });
        $('#manageTestsModal').addEventListener('click',e=>{ if(e.target===$('#manageTestsModal')) closeManageTests(); });
        $('#manageGymsModal').addEventListener('click',e=>{ if(e.target===$('#manageGymsModal')) closeManageGyms(); });
        $('#myGymModal').addEventListener('click',e=>{ if(e.target===$('#myGymModal')) closeMyGym(); });
        $('#manageClassesModal')?.addEventListener('click',e=>{ if(e.target===$('#manageClassesModal')) closeManageClasses(); });
        $('#manageEventModal').addEventListener('click',e=>{ if(e.target===$('#manageEventModal')) closeManageEvent(); });
        $('#statCardModal').addEventListener('click',e=>{ if(e.target===$('#statCardModal')) closeStatCard(); });
        $('#streakModal').addEventListener('click',e=>{ if(e.target===$('#streakModal')) closeStreakModal(); });
        document.addEventListener('keydown',e=>{ if(e.key==='Escape'){ closeAuthModal(); closeAboutModal(); closeInstallModal(); closeEditEntryModal(); closeEditProfileModal(); closeManageTests(); closeManageGyms(); closeMyGym(); closeManageClasses(); closeStatCard(); closeStreakModal(); closeManageEvent(); } });

        if (!initFirebase()){
            // No Firebase on this deployment (e.g. pure GitHub Pages UI preview).
            // Still resolve the stat-card skeletons so the Log page looks
            // complete, rather than shimmering forever with no data behind it.
            updateStatsRow();
            return;
        }

        // The event board is public — no sign-in required to view it — so this
        // runs unconditionally here, not inside the auth branch below.
        subscribeActiveEvent();

        // onAuthStateChanged is the single source of truth for auth state.
        // Firebase Auth persists sessions natively — no localStorage user ID needed.
        // Fires immediately on page load with the existing session (or null).
        auth.onAuthStateChanged(async (firebaseUser) => {
            // Tear down all live subscriptions before reconfiguring for the new auth state.
            unsubscribeLeaderboard(); unsubscribeEntries(); unsubscribeTests(); unsubscribeOwnLeaderboard(); unsubscribeJournal(); unsubscribeClassLogs(); unsubscribeClassJournal();
            if (ownProfileUnsub){ ownProfileUnsub(); ownProfileUnsub=null; }

            if (firebaseUser) {
                appState.currentUserId = firebaseUser.uid;
                updateEmailVerifyBanner();
                let ownProfileFirstLoad = true;
                // LIVE listener on the signed-in user's own profile doc — this used
                // to be a ONE-TIME get(), meaning appState.currentUser (and role
                // fields like managesClubId/isAdmin specifically) stayed frozen at
                // whatever they were at login for the rest of the session. If an
                // admin later changed someone's managesClubId — reassigning or
                // revoking club-manager status — while that person's tab stayed
                // open, the UI kept showing "My Club" access based on the STALE
                // cached value. Subscribing live means a permission change takes
                // effect immediately, no logout/login required to notice.
                await new Promise(resolve=>{
                    ownProfileUnsub = db.collection('users').doc(firebaseUser.uid).onSnapshot(async (snap)=>{
                        const profile = snap.exists ? { id:snap.id, ...snap.data() } : null;
                        appState.currentUser = profile || { name: firebaseUser.email, avatar:'🏋️' };
                        if (ownProfileFirstLoad){
                            ownProfileFirstLoad = false;
                            subscribeOwnLeaderboard();
                            await refreshMyClubInfo();
                            // Seed the shared default test catalog once if it's empty (e.g. after a data wipe).
                            await seedDefaultTestsIfEmpty();
                            subscribeTests(()=>{
                                populateLogTestSelect(); updateSpotlightSelect();
                            });
                            const isNewUser = (new Date() - new Date(profile?.createdAt||0)) < 10000;
                            if(isNewUser) await pushAllBestsToCloud();
                            showToast(isNewUser ? `Welcome, ${appState.currentUser.name}!` : `Welcome back, ${appState.currentUser.name}!`);
                            // Nudge toward installing as an app right after the moment someone's
                            // actually bought in (just made a profile) — not before, and not on
                            // every sign-in. Small delay so it doesn't collide with the welcome
                            // toast or the modal-closing animation from signup.
                            if (isNewUser && !localStorage.getItem(KEYS.seenInstall)) setTimeout(()=>window.openInstallModal(), 900);
                            resolve();
                        } else {
                            // A later change — an admin edited our role, or we updated
                            // our own profile in another tab — just refresh the UI
                            // pieces that depend on it, not the whole login sequence.
                            await refreshMyClubInfo();
                            updateUIForMode();
                        }
                    }, err => { console.error('Own profile subscription error:', err); resolve(); });
                });
            } else {
                unsubscribeOwnLeaderboard();
                appState.currentUserId = null;
                appState.currentUser = null;
                appState.myClub = null;
                updateEmailVerifyBanner();
                // Show default tests in the dropdown while signed out so the UI isn't empty.
                appState.tests = DEFAULT_TESTS;
                populateLogTestSelect(); updateSpotlightSelect();
            }

            updateUIForMode();
            navigateTo('log');
            updateStatsRow();
        });
    }
    init();
    // Expose plain `function` declarations called from inline HTML (onclick/onsubmit/onchange).
    // Functions already declared as `window.X = ...` above don't need to be listed here.
    window.navigateTo = navigateTo;
    window.handleLogSubmit = handleLogSubmit;
    window.updateResultField = updateResultField;
    window.renderLeaderboard = renderLeaderboard;

    // Register the PWA service worker after everything else has loaded, so it
    // never competes with the initial render for network/CPU resources.
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('sw.js').catch(err => console.error('Service worker registration failed:', err));
        });
    }
