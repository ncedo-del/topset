// ── app-init.js ───────────────────────────────────────
// Top-level UI state sync (updateUIForMode), app init() — wires up
// auth state listener, theme, service worker — and window.* exports
// for onclick handlers. Loads LAST.

    function updateUIForMode(){
        const loggedIn=!!appState.currentUserId;
        if(loggedIn){ $('#authModal').classList.add('hidden'); $('#aboutModal').classList.add('hidden'); }
        const u=getCurrentUser();
        // Role shortcuts that used to live in the header user block now live in the Profile
        // hub (gear); only the mobile bottom-nav buttons stay, role-gated as before.
        if (loggedIn && u?.isAdmin) { $('#bottomNavManageTestsBtn')?.classList.remove('hidden'); } else { $('#bottomNavManageTestsBtn')?.classList.add('hidden'); }
        if (loggedIn && u?.managesGymId) { $('#bottomNavMyGymBtn')?.classList.remove('hidden'); } else { $('#bottomNavMyGymBtn')?.classList.add('hidden'); }
        if(!loggedIn) window.openAboutModal();
        if(!loggedIn&&$('#page-leaderboard').classList.contains('active')) navigateTo('log');
        $('#streakBadgeBtn')?.classList.toggle('hidden', !loggedIn);
        subscribeEntries(()=>{ updateStatsRow(); if($('#page-history').classList.contains('active')) renderHistory(); if($('#page-prs').classList.contains('active')) renderPRs(); if(!$('#profileHubModal').classList.contains('hidden')) window.renderProfileHub(); });
        subscribeJournal(()=>{ updateStreakBadge(); if(!$('#streakModal').classList.contains('hidden')) renderStreakWeekStrip(); if(!$('#streakModal').classList.contains('hidden')) renderStreakCalendar(); updateNotifications(); if(!$('#profileHubModal').classList.contains('hidden')) window.renderProfileHub(); });
        updateSpotlightSelect();
        // Sport can change (own edit, or via the profile listener) -> keep every test dropdown filtered to match.
        populateLogTestSelect(); populatePublicLogTestSelect();
        updateNotifications();
        if(!$('#profileHubModal').classList.contains('hidden')) window.renderProfileHub();
    }
    async function init(){
        // Signed-out-readable public athlete profile route — checked before
        // anything else so a scout/sponsor following a /athlete/{uid} link
        // never sees the normal signed-in app shell flash first. See
        // renderPublicAthletePage() in athlete-profile-ui.js.
        const athleteRouteMatch = location.pathname.match(/^\/athlete\/([^/]+)\/?$/);
        if (athleteRouteMatch){
            applyTheme(localStorage.getItem(KEYS.theme)||'dark');
            document.querySelector('.header')?.classList.add('hidden');
            document.querySelector('.main-container')?.classList.add('hidden');
            document.querySelector('.bottom-nav')?.classList.add('hidden');
            $('#emailVerifyBanner')?.classList.add('hidden');
            if (initFirebase()) await window.renderPublicAthletePage(decodeURIComponent(athleteRouteMatch[1]));
            else $('#page-public-athlete')?.classList.remove('hidden');
            return;
        }
        applyTheme(localStorage.getItem(KEYS.theme)||'dark');
        appState.spotlightLift=localStorage.getItem(KEYS.spotlightLift)||'';
        appState.resultScope=localStorage.getItem(KEYS.resultScope)||'regular';
        appState.boardScope=localStorage.getItem(KEYS.boardScope)||'gym';

        // Wire up all DOM event listeners immediately — independent of auth state.
        buildAvatarPicker('#authAvatarPicker','#authAvatar'); buildAvatarPicker('#profileAvatarPicker','#profileAvatar');
        $('#logDate').value=todayStr(); updateResultField();
        $('#logDate').addEventListener('change', updateOfficialAvailability);
        $('#logDatePublic').value=todayStr(); updateResultFieldPublic();
        $$('.nav-tab').forEach(t=>t.addEventListener('click',()=>{ if (t.dataset.page) navigateTo(t.dataset.page); }));
        $$('.bottom-nav-item').forEach(t=>t.addEventListener('click',e=>{ if (t.id === 'bottomNavManageTestsBtn' || t.id === 'bottomNavMyGymBtn' || !t.dataset.page) return; navigateTo(t.dataset.page); }));
        $('#authModal').addEventListener('click',e=>{ if(e.target===$('#authModal')) closeAuthModal(); });
        $('#aboutModal').addEventListener('click',e=>{ if(e.target===$('#aboutModal')) closeAboutModal(); });
        $('#installModal').addEventListener('click',e=>{ if(e.target===$('#installModal')) closeInstallModal(); });
        $('#editEntryModal').addEventListener('click',e=>{ if(e.target===$('#editEntryModal')) closeEditEntryModal(); });
        $('#editProfileModal').addEventListener('click',e=>{ if(e.target===$('#editProfileModal')) closeEditProfileModal(); });
        $('#manageTestsModal').addEventListener('click',e=>{ if(e.target===$('#manageTestsModal')) closeManageTests(); });
        $('#manageGymsModal').addEventListener('click',e=>{ if(e.target===$('#manageGymsModal')) closeManageGyms(); });
        $('#myGymModal').addEventListener('click',e=>{ if(e.target===$('#myGymModal')) closeMyGym(); });
        $('#manageEventModal').addEventListener('click',e=>{ if(e.target===$('#manageEventModal')) closeManageEvent(); });
        $('#statCardModal').addEventListener('click',e=>{ if(e.target===$('#statCardModal')) closeStatCard(); });
        $('#streakModal').addEventListener('click',e=>{ if(e.target===$('#streakModal')) closeStreakModal(); });
        $('#profileHubModal').addEventListener('click',e=>{ if(e.target===$('#profileHubModal')) closeProfileHub(); });
        $('#notifModal').addEventListener('click',e=>{ if(e.target===$('#notifModal')) closeNotifPanel(); });
        $('#manageSportsModal').addEventListener('click',e=>{ if(e.target===$('#manageSportsModal')) closeManageSports(); });
        document.addEventListener('keydown',e=>{ if(e.key==='Escape'){ closeAuthModal(); closeAboutModal(); closeInstallModal(); closeEditEntryModal(); closeEditProfileModal(); closeManageTests(); closeManageGyms(); closeMyGym(); closeStatCard(); closeStreakModal(); closeManageEvent(); closeProfileHub(); closeNotifPanel(); closeManageSports(); } });

        if (!initFirebase()) return;

        // The sports list is public (signup needs it before anyone is signed in) — see firestore.rules `sports`.
        subscribeSports(()=>window.refreshSportSelects());
        updateNotifications();

        // The event board is public — no sign-in required to view it — so this
        // runs unconditionally here, not inside the auth branch below.
        subscribeActiveEvent();

        // onAuthStateChanged is the single source of truth for auth state.
        // Firebase Auth persists sessions natively — no localStorage user ID needed.
        // Fires immediately on page load with the existing session (or null).
        auth.onAuthStateChanged(async (firebaseUser) => {
            // Tear down all live subscriptions before reconfiguring for the new auth state.
            unsubscribeLeaderboard(); unsubscribeEntries(); unsubscribeTests(); unsubscribeOwnLeaderboard(); unsubscribeJournal();
            if (ownProfileUnsub){ ownProfileUnsub(); ownProfileUnsub=null; }

            if (firebaseUser) {
                appState.currentUserId = firebaseUser.uid;
                updateEmailVerifyBanner();
                let ownProfileFirstLoad = true, testsGymId = null;
                // LIVE listener on the signed-in user's own profile doc — this used
                // to be a ONE-TIME get(), meaning appState.currentUser (and role
                // fields like managesGymId/isAdmin specifically) stayed frozen at
                // whatever they were at login for the rest of the session. If an
                // admin later changed someone's managesGymId — reassigning or
                // revoking gym-manager status — while that person's tab stayed
                // open, the UI kept showing "My Gym" access based on the STALE
                // cached value. Every mutating write still got checked against the
                // real, CURRENT server-side doc by the security rules though, so
                // edits/deletes on official entries would silently fail — while
                // reads of entries they happened to own still succeeded via the
                // ownership rule branch regardless. That combination (can see it,
                // can't touch it, UI insists they're still the manager) is exactly
                // this bug. Subscribing live means a permission change takes effect
                // immediately, no logout/login required to notice.
                await new Promise(resolve=>{
                    ownProfileUnsub = db.collection('users').doc(firebaseUser.uid).onSnapshot(async (snap)=>{
                        const profile = snap.exists ? { id:snap.id, ...snap.data() } : null;
                        appState.currentUser = profile || { name: firebaseUser.email, avatar:DEFAULT_AVATAR };
                        if (ownProfileFirstLoad){
                            ownProfileFirstLoad = false;
                            try {
                            subscribeOwnLeaderboard();
                            await refreshMyGymInfo();
                            // Seed the shared default test catalog once if it's empty (e.g. after a data wipe).
                            await seedDefaultTestsIfEmpty();
                            testsGymId = profile?.gymId || null;
                            subscribeTests(testsGymId, ()=>{
                                populateLogTestSelect(); updateSpotlightSelect(); populatePublicLogTestSelect();
                            });
                            const isNewUser = (new Date() - new Date(profile?.createdAt||0)) < 10000;
                            if(isNewUser) await pushAllBestsToCloud();
                            showToast(isNewUser ? `Welcome, ${appState.currentUser.name}!` : `Welcome back, ${appState.currentUser.name}!`);
                            // Nudge toward installing as an app right after the moment someone's
                            // actually bought in (just made a profile) — not before, and not on
                            // every sign-in. Small delay so it doesn't collide with the welcome
                            // toast or the modal-closing animation from signup.
                            if (isNewUser && !localStorage.getItem(KEYS.seenInstall)) setTimeout(()=>window.openInstallModal(), 900);
                            } catch(setupErr){ console.error('Post-login setup failed:', setupErr); }
                            resolve();
                        } else {
                            // A later change — an admin edited our role, or we updated
                            // our own profile in another tab — just refresh the UI
                            // pieces that depend on it, not the whole login sequence.
                            // Gym changed (joined right after signup, removed by a manager...): re-point the test catalog.
                            if ((profile?.gymId || null) !== testsGymId){ testsGymId = profile?.gymId || null; subscribeTests(testsGymId, ()=>{ populateLogTestSelect(); updateSpotlightSelect(); populatePublicLogTestSelect(); }); }
                            await refreshMyGymInfo();
                            updateUIForMode();
                            updateOfficialAvailability();
                        }
                    }, err => { console.error('Own profile subscription error:', err); resolve(); });
                });
            } else {
                unsubscribeOwnLeaderboard();
                appState.currentUserId = null;
                appState.currentUser = null;
                appState.myGym = null;
                updateEmailVerifyBanner();
                // Show default tests in the dropdown while signed out so the UI isn't empty.
                appState.tests = DEFAULT_TESTS;
                appState.globalTests = DEFAULT_TESTS;
                populateLogTestSelect(); updateSpotlightSelect(); populatePublicLogTestSelect();
            }

            updateUIForMode();
            updateOfficialAvailability();
            navigateTo('home');
            updateStatsRow();
        });
    }
    init();
    // Expose plain `function` declarations called from inline HTML (onclick/onsubmit/onchange).
    // Functions already declared as `window.X = ...` above don't need to be listed here.
    window.navigateTo = navigateTo;
    window.handleLogSubmit = handleLogSubmit;
    window.updateResultField = updateResultField;
    window.handleLogSubmitPublic = handleLogSubmitPublic;
    window.updateResultFieldPublic = updateResultFieldPublic;
    window.renderLeaderboard = renderLeaderboard;

    // Register the PWA service worker after everything else has loaded, so it
    // never competes with the initial render for network/CPU resources.
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js').catch(err => console.error('Service worker registration failed:', err));
        });
    }
