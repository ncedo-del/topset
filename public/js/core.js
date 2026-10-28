// ── core.js ───────────────────────────────────────────
// Firebase init, shared app state, Firestore subscription plumbing,
// leaderboard-mirror push logic, gym tiers/default tests, date/uid
// helpers, rate limiting + input validation. Loads FIRST — everything
// else reads shared state (appState, RATE_LIMITS, db, auth, etc.)
// that lives in this file.

    // --- Full app logic with profile editing ---

    const firebaseConfig = {
        apiKey: "AIzaSyAeRLFevxRetMqvWqBtxXI1C50GBJVepb8",
        authDomain: "topset-leaderboard.firebaseapp.com",
        projectId: "topset-leaderboard",
        storageBucket: "topset-leaderboard.firebasestorage.app",
        messagingSenderId: "583421199873",
        appId: "1:583421199873:web:10f8458cbaf6d2caf9a200"
    };
    let fbApp=null, db=null, auth=null, leaderboardUnsub=null, entriesUnsub=null, testsUnsub=null, testsGymUnsub=null, ownProfileUnsub=null, ownLeaderboardUnsub=null, journalUnsub=null;
    // Which test-catalog scope the Manage Tests modal is currently editing:
    // null = the shared default/admin catalog, or a gymId string = one gym
    // manager's own catalog. manageTestsCache holds that scope's RAW list
    // ONLY (never merged with the other scope) — unlike appState.tests,
    // which is the DUAL-SOURCE merge (global + gym) that members actually
    // see on the Log Result page. See subscribeTests().
    let manageTestsScope = null, manageTestsCache = [];
    function isFirebaseConfigured(){ return firebaseConfig.apiKey !== "YOUR_API_KEY"; }
    function initFirebase(){
        if (db) return true;
        if (!isFirebaseConfigured() || typeof firebase === 'undefined') return false;
        try {
            fbApp = firebase.initializeApp(firebaseConfig);
            auth = firebase.auth();
            db = firebase.firestore();
            db.enablePersistence({ synchronizeTabs: true }).catch(()=>{});
            return true;
        }
        catch(e){ console.error('Firebase init failed:', e); return false; }
    }
    function unsubscribeLeaderboard(){ if (leaderboardUnsub){ leaderboardUnsub(); leaderboardUnsub=null; } }
    function unsubscribeEntries(){ if (entriesUnsub){ entriesUnsub(); entriesUnsub=null; } }
    function unsubscribeTests(){ if (testsUnsub){ testsUnsub(); testsUnsub=null; } if (testsGymUnsub){ testsGymUnsub(); testsGymUnsub=null; } }
    function unsubscribeOwnLeaderboard(){ if (ownLeaderboardUnsub){ ownLeaderboardUnsub(); ownLeaderboardUnsub=null; } }
    function unsubscribeJournal(){ if (journalUnsub){ journalUnsub(); journalUnsub=null; } }
    // Keeps the CURRENT USER's own percentile cache honest against changes
    // nobody in THIS tab made. computeTestPercentile() caches per (test,
    // scope, gym, uid) for PERCENTILE_CACHE_TTL_MS, and invalidatePercentileCache()
    // is only ever called by whoever performs the leaderboard write — which,
    // for an official result, is the GYM MANAGER editing/deleting it from
    // their My Gym panel, not the athlete. That left the athlete's own
    // browser tab holding a stale cached percentile (and therefore a stale
    // "official" Stat Card / leaderboard rank) for up to 10 minutes after
    // their manager changed it — the underlying entries/leaderboard docs
    // were already correct and live-updating, only the percentile READ was
    // stuck showing the old number. Subscribing to just this user's own
    // leaderboard docs (cheap — a handful of docs, not a full scope query)
    // busts the cache the instant ANY of them changes, regardless of who
    // wrote the change, so the next Stat Card open or Leaderboard visit
    // recomputes fresh instead of waiting out the TTL.
    function subscribeOwnLeaderboard(){
        unsubscribeOwnLeaderboard();
        const uid2 = getCurrentUserId();
        if (!uid2 || !initFirebase()) return;
        ownLeaderboardUnsub = db.collection('leaderboard').where('userId','==',uid2).onSnapshot(snapshot=>{
            snapshot.docChanges().forEach(change=>{
                if (change.type==='added' || change.type==='modified' || change.type==='removed'){
                    const d = change.doc.data();
                    if (d) invalidatePercentileCache(d.test, d.scope, d.gymId, d.userId);
                }
            });
        }, err=>{ console.error('own-leaderboard subscription error:', err); });
    }

    // Pushes ONE test's personal best for the current user up to the shared 'leaderboard' collection.
    // Deletes the cloud record if the user no longer has any entries for that test.
    // Recomputes and writes BOTH the official and regular leaderboard docs
    // for one user/test pair. Generalized over targetUid (rather than
    // always assuming "the current user") because a gym manager editing or
    // deleting a MEMBER's official entry needs to recompute THAT member's
    // leaderboard doc, not their own — the rules allow this via the
    // managesGym() branch on leaderboard create/update.
    // BUCKETS: a gym member can now have entries in TWO pools for the same test —
    // their gym's (entry.gymId === their gym) and the public/TOPSET-wide pool
    // (entry.gymId === null) — logged via the two separate Log forms. Each pool
    // needs its OWN leaderboard doc, or a public PR would silently clobber a gym
    // PR (or vice versa) since they'd share one "best of all my entries" number.
    //
    // Doc IDs: the user's HOME bucket (their gym if they have one, else null —
    // i.e. exactly what every user's single bucket already was before this
    // feature existed) keeps the ORIGINAL id format `uid__testId__scope`, so
    // existing leaderboard data for gym members and gym-less users needs no
    // migration. The public bucket — which only exists at all for a member who
    // ALSO has a gym — gets a new, non-colliding id: `uid__testId__scope__public`.
    async function recomputeBestForUser(targetUid, testName, knownProfile){
        if (!initFirebase() || !targetUid) return;
        const snap = await db.collection('entries').where('userId','==',targetUid).where('test','==',testName).get();
        const all = [];
        snap.forEach(doc=>all.push(doc.data()));
        const user = knownProfile || await getUserById(targetUid);
        if (!user) return;
        const homeGymId = user.gymId || null;

        async function writeBucket(bucketGymId, docSuffix){
            // Resolve test config against the catalog that bucket's Log form actually
            // draws from — the public form only ever offers appState.globalTests, so a
            // gym that happens to shadow this test's name with a different unit/
            // higherIsBetter shouldn't affect how a PUBLIC entry gets ranked.
            const cfg = (bucketGymId === null)
                ? ((appState.globalTests||[]).find(t=>t.name===testName) || getTestConfig(testName))
                : getTestConfig(testName);
            if (!cfg) return;
            // A minor without guardian consent stays off the PUBLIC (TOPSET-wide) board:
            // remove any public doc and write nothing. Gym boards are unaffected.
            if (bucketGymId === null && isMinorWithoutConsent(user)){
                try { await db.collection('leaderboard').doc(`${targetUid}__${cfg.id}__regular${docSuffix}`).delete(); } catch(e){}
                invalidatePercentileCache(testName, 'regular', null, targetUid);
                return;
            }
            for (const scope of ['official','regular']){
                // Official is a gym-scoped concept (tied to a gym's officialTestDate) —
                // the public bucket can never legitimately contain one, so don't even
                // write/delete a doc for it.
                if (scope==='official' && bucketGymId===null) continue;
                // Official leaderboard docs are MANAGER-WRITTEN ONLY (firestore.rules) and are
                // built from verified entries by syncOfficialLeaderboard() below. An athlete's
                // own recompute must never touch them.
                if (scope==='official') continue;
                const matches = all.filter(e => (e.gymId||null)===bucketGymId && (scope==='official' ? e.isOfficial===true : e.isOfficial!==true));
                const docId = `${targetUid}__${cfg.id}__${scope}${docSuffix}`;
                const ref = db.collection('leaderboard').doc(docId);
                if (!matches.length){ try{ await ref.delete(); }catch(e){} invalidatePercentileCache(testName, scope, bucketGymId, targetUid); continue; }
                const best = matches.reduce((b,e)=>{
                    if (cfg.higherIsBetter ? e.value > b.value : e.value < b.value) return e;
                    if (e.value === b.value && e.date > b.date) return e;
                    return b;
                }, matches[0]);
                try {
                    await ref.set({ userId:targetUid, name:user.name, avatar:avatarKey(user.avatar), ageGroup:displayAgeGroup(user), gender:user.gender||null, gymId:bucketGymId, test:testName, scope, value:best.value, date:best.date, updatedAt:Date.now() });
                    invalidatePercentileCache(testName, scope, bucketGymId, targetUid);
                } catch(e){ console.error('Leaderboard sync failed:', e); }
            }
        }

        await writeBucket(homeGymId, '');
        if (homeGymId !== null) await writeBucket(null, '__public');
    }
    async function pushBestToCloud(testName){
        const uid2 = getCurrentUserId();
        if (!uid2) return;
        await recomputeBestForUser(uid2, testName, getCurrentUser());
    }


    // ── Official results: verification chain ─────────────────────────────
    // An official entry is created 'pending' by the athlete and only counts once the
    // gym's manager marks it 'verified' (stamped with who/when/which gym). Everything
    // public-facing about "official" is derived from VERIFIED entries only:
    //   • leaderboard docs, scope 'official'  -> syncOfficialLeaderboard()
    //   • public athlete page verifiedResults -> syncVerifiedSnapshot()
    // Both run in the MANAGER's browser right after they verify/edit/reject/delete.
    // The queries below pin gymId + isOfficial in the .where() on purpose: it's what
    // lets firestore.rules prove a manager may read every doc the query could return.
    // A future Cloud Function can replace these two writers without changing the rules.
    // Legacy official rows with no entryId are treated as untrusted and hidden.
    function lbRowTrusted(r){ return !r || r.scope !== 'official' || !!r.entryId; }
    async function fetchVerifiedOfficialEntries(targetUid, gymId, testName){
        const snap = await db.collection('entries').where('gymId','==',gymId).where('isOfficial','==',true).where('userId','==',targetUid).where('test','==',testName).get();
        const list = [];
        snap.forEach(d=>{ const x = { id:d.id, ...d.data() }; if (x.officialStatus === 'verified') list.push(x); });
        return list;
    }
    function bestOfEntries(list, cfg){
        return list.reduce((b,e)=>{
            if (cfg.higherIsBetter ? e.value > b.value : e.value < b.value) return e;
            if (e.value === b.value && e.date > b.date) return e;
            return b;
        }, list[0]);
    }
    async function syncOfficialLeaderboard(targetUid, testName, gymId){
        if (!initFirebase() || !targetUid || !testName || !gymId) return false;
        const cfg = getTestConfig(testName); if (!cfg) return false;
        const ref = db.collection('leaderboard').doc(`${targetUid}__${cfg.id}__official`);
        try {
            const verified = await fetchVerifiedOfficialEntries(targetUid, gymId, testName);
            if (!verified.length){
                try { await ref.delete(); } catch(e){}
                invalidatePercentileCache(testName, 'official', gymId, targetUid);
                return true;
            }
            const best = bestOfEntries(verified, cfg);
            // Display fields: prefer the live profile; if the member has since left the
            // gym the manager can't read it, so fall back to what's already on the doc.
            let who = await getUserById(targetUid);
            if (!who){ const prev = await ref.get(); who = prev.exists ? prev.data() : null; }
            if (!who){ console.warn('syncOfficialLeaderboard: no profile to copy name from'); return false; }
            await ref.set({ userId:targetUid, name:who.name||'Member', avatar:avatarKey(who.avatar), ageGroup:displayAgeGroup(who), gender:who.gender||null, gymId, test:testName, scope:'official', value:best.value, date:best.date, entryId:best.id, verifiedBy:best.verifiedBy||null, verifiedAt:best.verifiedAt||null, updatedAt:Date.now() });
            invalidatePercentileCache(testName, 'official', gymId, targetUid);
            return true;
        } catch(err){ console.error('syncOfficialLeaderboard failed:', err); return false; }
    }
    function verifiedResultKey(gymId, testName){
        return `${gymId}_${String(testName).toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'')}`;
    }
    // Public proof for scouts: one small map entry per (gym, test) on the athlete's
    // athleteProfiles doc. Holds gym, date and the number — NOT the verifier's name
    // (that stays on the entry itself; no reason to publish a staff member's name).
    async function syncVerifiedSnapshot(targetUid, testName, gymId, gymName){
        if (!initFirebase() || !targetUid || !testName || !gymId) return false;
        const cfg = getTestConfig(testName); if (!cfg) return false;
        const key = verifiedResultKey(gymId, testName);
        try {
            const verified = await fetchVerifiedOfficialEntries(targetUid, gymId, testName);
            let payload;
            if (verified.length){
                const best = bestOfEntries(verified, cfg);
                payload = { test:testName, unit:cfg.unit, value:best.value, display: cfg.unit==='time' ? formatTime(best.value) : `${best.value} ${cfg.unit}`, date:best.date, gymName: gymName || best.verifiedGymName || '', verifiedAt: best.verifiedAt || Date.now() };
            } else {
                payload = firebase.firestore.FieldValue.delete();
            }
            const ref = db.collection('athleteProfiles').doc(targetUid);
            try { await ref.update({ [`verifiedResults.${key}`]: payload }); return true; }
            catch(err){
                if (err.code === 'not-found' && verified.length){
                    // Athlete hasn't made a profile yet: park the proof on a PRIVATE stub
                    // (isPublic:false) so it's there the moment they opt in.
                    await ref.set({ uid:targetUid, isPublic:false, updatedAt:Date.now(), verifiedResults:{ [key]: payload } });
                    return true;
                }
                if (err.code === 'not-found') return true; // nothing to remove
                throw err;
            }
        } catch(err){ console.error('syncVerifiedSnapshot failed:', err); return false; }
    }

    // Seeds the cloud leaderboard with ALL of the current user's existing personal bests.
    // Runs once right after signup, in case they already had local history before going multi-user.
    async function pushAllBestsToCloud(){
        if (!initFirebase()) return;
        const uid2 = getCurrentUserId();
        if (!uid2) return;
        const snap = await db.collection('entries').where('userId','==',uid2).get();
        const tests = new Set();
        snap.forEach(doc=>tests.add(doc.data().test));
        for (const t of tests) await pushBestToCloud(t);
    }

    // Keeps the name/avatar shown on the leaderboard in sync after a profile edit.
    async function updateCloudProfileInfo(){
        if (!initFirebase()) return;
        const user = getCurrentUser();
        if (!user) return;
        try {
            const snap = await db.collection('leaderboard').where('userId','==',user.id).get();
            if (snap.empty) return;
            const batch = db.batch();
            snap.forEach(doc=>batch.update(doc.ref, { name:user.name, avatar:avatarKey(user.avatar), ageGroup:displayAgeGroup(user), gender:user.gender||null }));
            await batch.commit();
        } catch(e){ console.error('Profile sync to leaderboard failed:', e); }
    }
    // Logo: real image files (logo-dark.png / logo-light.png), swapped by src on theme
    // change. Deliberately NOT base64 — embedding large images as inline strings is what
    // caused repeated silent corruption during manual copy/paste in earlier iterations of
    // this file. Plain files sitting in /public are one clean upload, nothing to transcribe.
    // Gym subscription tiers — cap is enforced client-side at join time (see
    // checkGymCapacity). Prices/labels live here so there's one place to
    // change them if the business terms change.
    const GYM_TIERS = {
        small:  { label: 'Small',       cap: 50  },
        medium: { label: 'Medium',      cap: 126 },
        large:  { label: 'Large',       cap: 250 },
        xlarge: { label: 'Extra Large', cap: 520 }
    };
    function tierInfo(tier){ return GYM_TIERS[tier] || GYM_TIERS.small; }
    // Default tests, seeded into Firestore once (with their original IDs preserved)
    // if the 'tests' collection is ever empty — e.g. on first run, or after a data wipe.
    const DEFAULT_TESTS = [
        { id:'broad_jump', name:'Broad Jump', unit:'m', higherIsBetter:true, inputType:'number', placeholder:'2.50', order:0, gymId:null, sport:null },
        { id:'3km_run', name:'3km Run', unit:'time', higherIsBetter:false, inputType:'text', placeholder:'12:30', order:1, gymId:null, sport:null },
        { id:'pushups', name:'2:00 Push-ups', unit:'reps', higherIsBetter:true, inputType:'number', placeholder:'50', order:2, gymId:null, sport:null },
        { id:'situps', name:'2:00 Sit-ups', unit:'reps', higherIsBetter:true, inputType:'number', placeholder:'45', order:3, gymId:null, sport:null },
        { id:'sit_reach', name:'Sit and Reach', unit:'cm', higherIsBetter:true, inputType:'number', placeholder:'30', order:4, gymId:null, sport:null },
        { id:'bodyweight', name:'Bodyweight', unit:'kg', higherIsBetter:true, inputType:'number', placeholder:'80', order:5, gymId:null, sport:null }
    ];

    // ── Sports catalog ───────────────────────────────────────────────────
    // ADMIN-MANAGED: the `sports` Firestore collection is the source of truth
    // (Manage Sports, admin only). SPORTS_LIST is only the fallback used while
    // that collection is empty or unreachable, and the seed for the admin's
    // "Load default sports" button. It backs BOTH the profile "Sport" dropdown
    // and the per-test "Sport" tag — one shared vocabulary is what makes
    // filtering work: a test tagged "Rugby" only reaches members whose profile
    // sport is exactly "Rugby". A test with sport:null (every DEFAULT_TESTS
    // entry and every test made before this existed) is General — visible to
    // everyone — so nothing that already existed disappears.
    const SPORTS_LIST = ['Rugby','Football (Soccer)','Basketball','Netball','Cricket','Athletics / Track & Field','Boxing','Combat Sports (MMA/Kickboxing)','CrossFit / Functional Fitness','HYROX','Powerlifting','Bodybuilding','Swimming'];
    let sportsUnsub = null;
    function subscribeSports(callback){
        if (sportsUnsub){ sportsUnsub(); sportsUnsub = null; }
        appState.sportDocs = []; appState.sports = SPORTS_LIST.slice();
        if (!initFirebase()){ if (callback) callback(); return; }
        // Public read (see firestore.rules) — the signup form needs this list before anyone is signed in.
        sportsUnsub = db.collection('sports').onSnapshot(snapshot=>{
            const list = []; snapshot.forEach(doc=>list.push({ id:doc.id, ...doc.data() }));
            list.sort((a,b)=>(a.order??0)-(b.order??0) || (a.name||'').localeCompare(b.name||''));
            appState.sportDocs = list;
            appState.sports = list.length ? list.map(x=>x.name) : SPORTS_LIST.slice();
            if (callback) callback();
        }, err=>{ console.error('sports subscription error:', err); appState.sportDocs = []; appState.sports = SPORTS_LIST.slice(); if (callback) callback(); });
    }
    function getSportNames(){ return (appState.sports && appState.sports.length) ? appState.sports : SPORTS_LIST; }
    // Single source of truth for "should THIS viewer see this test" — used by both
    // Log dropdowns, the leaderboard spotlight picker and the Stat Card axes.
    // General (no sport tag) = everyone; sport-tagged = members of exactly that
    // sport only; signed-out visitors and members with no sport see General only.
    function testVisibleToUser(t){
        if (!t || !t.sport) return true;
        const u = getCurrentUser();
        return !!u && u.sport === t.sport;
    }
    async function seedDefaultTestsIfEmpty(){
        if (!initFirebase()) return;
        try {
            // "Empty" now specifically means no shared DEFAULT (gymId:null) tests
            // exist yet — a gym having zero custom tests of its own is a normal,
            // expected state (it just falls back to the defaults), not something
            // to seed.
            const snap = await db.collection('tests').where('gymId','==',null).limit(1).get();
            if (!snap.empty) return;
            const batch = db.batch();
            DEFAULT_TESTS.forEach(t=>{ const { id, ...data } = t; batch.set(db.collection('tests').doc(id), data); });
            await batch.commit();
        } catch(err){ console.error('Seeding default tests failed:', err); }
    }
    // Keeps appState.tests live for the CURRENT user's effective test catalog —
    // a DUAL-SOURCE MERGE, not an either/or fallback. Every user, gym or not,
    // gets the shared global catalog (gymId:null) as the base. A gym member
    // additionally gets their own gym's custom tests layered on top of it,
    // via a second independent live listener — so a manager adding/removing
    // a custom test updates the member's Log Result dropdown immediately,
    // with no need to re-decide or re-invoke subscribeTests() the way the
    // old single-scope-with-fallback version required.
    //
    // Name collisions are resolved in the gym's favor: if a gym test shares
    // a name with a global test, the gym's version SHADOWS it for that
    // gym's members only (global stays untouched for everyone else). This
    // is what lets a manager redefine a standard test — different unit,
    // placeholder, whatever — without forking every other test in the
    // global set just to change one.
    //
    // Ordering: global tests first (by their own `order`), then the gym's
    // own tests appended after (by their own `order`). Two separate sort
    // namespaces on purpose — interleaving raw `order` values across scopes
    // would jumble the list any time a gym's order values happened to
    // overlap the global set's.
    async function subscribeTests(gymId, callback){
        unsubscribeTests();
        if (!initFirebase()){ appState.tests=DEFAULT_TESTS; callback(appState.tests); return; }

        let globalList = [], gymList = [];
        function mergeAndEmit(){
            const gymNames = new Set(gymList.map(t=>t.name));
            const merged = [...globalList.filter(t=>!gymNames.has(t.name)), ...gymList];
            appState.tests = merged.length ? merged : DEFAULT_TESTS;
            callback(appState.tests);
        }

        testsUnsub = db.collection('tests').where('gymId','==',null).onSnapshot(snapshot=>{
            globalList = [];
            snapshot.forEach(doc=>globalList.push({ id:doc.id, ...doc.data() }));
            globalList.sort((a,b)=>(a.order??0)-(b.order??0));
            // Kept separate from the merged appState.tests below — this is the exact
            // list the public/TOPSET-wide Log form draws from.
            appState.globalTests = globalList.length ? globalList : DEFAULT_TESTS;
            mergeAndEmit();
        }, err=>{ console.error('tests (global) subscription error:', err); appState.tests=DEFAULT_TESTS; appState.globalTests=DEFAULT_TESTS; callback(appState.tests); });

        if (gymId){
            testsGymUnsub = db.collection('tests').where('gymId','==',gymId).onSnapshot(snapshot=>{
                gymList = [];
                snapshot.forEach(doc=>gymList.push({ id:doc.id, ...doc.data() }));
                gymList.sort((a,b)=>(a.order??0)-(b.order??0));
                mergeAndEmit();
            }, err=>{ console.error('tests (gym) subscription error:', err); });
        }
    }
    // Fetches the RAW test list for a given scope (no default-catalog fallback) —
    // used by the Manage Tests modal, which always manages exactly the scope it
    // was opened for (global for admin, one gym's own for a manager), even if
    // that scope happens to be empty right now.
    async function fetchTestsForScope(gymId){
        if (!initFirebase()) return [];
        try {
            const snap = await db.collection('tests').where('gymId','==',gymId).get();
            const list = [];
            snap.forEach(doc=>list.push({ id:doc.id, ...doc.data() }));
            list.sort((a,b)=>(a.order??0)-(b.order??0));
            return list;
        } catch(err){ console.error('fetchTestsForScope failed:', err); showToast('Could not load tests.'); return []; }
    }
    async function createTest(data){
        if (!initFirebase()) return null;
        try {
            // Bulk-copy (handleCopyDefaultTests) passes its own order per item so
            // cloned tests keep their relative sequence — recomputing from
            // manageTestsCache inside a loop would give every clone the same
            // order, since the cache isn't refreshed between iterations.
            const order = (typeof data.order === 'number') ? data.order : (manageTestsCache.reduce((m,t)=>Math.max(m,t.order??0),-1) + 1);
            const ref = await db.collection('tests').add({ ...data, order });
            return ref.id;
        } catch(err){ console.error('createTest failed:', err); showToast('Could not add test.'); return null; }
    }
    async function deleteTestDoc(id){
        if (!initFirebase()) return false;
        try { await db.collection('tests').doc(id).delete(); return true; }
        catch(err){ console.error('deleteTestDoc failed:', err); showToast('Could not remove test.'); return false; }
    }
    function getTestConfig(n){ return appState.tests.find(t=>t.name===n); }


    // ── Avatar icons ────────────────────────────────────────────────────
    // Avatars are icon KEYS (short, <=4 chars) instead of emoji. Anything
    // stored that isn't a known key — including every old emoji avatar —
    // renders as the default icon, so existing accounts keep working with
    // no migration; their key gets written the next time they save a profile.
    const AVATAR_ICONS = {
        gym:  { label:'Dumbbell', svg:'<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/>' },
        bolt: { label:'Bolt',     svg:'<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>' },
        fire: { label:'Flame',    svg:'<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>' },
        cup:  { label:'Trophy',   svg:'<path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0Z"/><path d="M7 5H4a3 3 0 0 0 3 5"/><path d="M17 5h3a3 3 0 0 1-3 5"/>' },
        star: { label:'Star',     svg:'<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>' },
        love: { label:'Heart',    svg:'<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>' },
        mtn:  { label:'Mountain', svg:'<path d="m8 3 4 8 5-5 5 15H2L8 3z"/>' },
        shld: { label:'Shield',   svg:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>' },
        aim:  { label:'Target',   svg:'<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>' },
        crwn: { label:'Crown',    svg:'<path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7z"/><path d="M5 20h14"/>' },
        timr: { label:'Stopwatch',svg:'<circle cx="12" cy="14" r="8"/><path d="M12 10v4l2 2"/><path d="M10 2h4"/>' },
        bike: { label:'Bike',     svg:'<circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm-3 11.5V14l-3-3 4-3 2 3h2"/>' }
    };
    const DEFAULT_AVATAR = 'gym';
    function avatarKey(v){ return (typeof v === 'string' && AVATAR_ICONS[v]) ? v : DEFAULT_AVATAR; }
    function avatarIconSVG(v, size){
        size = size || 20;
        return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">${AVATAR_ICONS[avatarKey(v)].svg}</svg>`;
    }
    // Icon size scales with the circle it sits in (roughly half its width).
    function avatarCircleHTML(v, circlePx){
        circlePx = circlePx || 40;
        return `<span class="avatar-circle" style="width:${circlePx}px;height:${circlePx}px;flex-shrink:0;">${avatarIconSVG(v, Math.round(circlePx*0.5))}</span>`;
    }

    const STORAGE_PREFIX='topset_', KEYS={ theme:STORAGE_PREFIX+'theme', spotlightLift:STORAGE_PREFIX+'spotlight_lift', resultScope:STORAGE_PREFIX+'result_scope', boardScope:STORAGE_PREFIX+'board_scope', seenAbout:STORAGE_PREFIX+'seen_about', seenInstall:STORAGE_PREFIX+'seen_install', seenNotif:STORAGE_PREFIX+'seen_notif' };
    // appState.tests = the effective merged catalog (global + gym, gym shadows on name
    // collision) — what the GYM-scoped Log form and spotlight picker use.
    // appState.globalTests = the pure global (gymId:null) catalog only — what the
    // separate PUBLIC/TOPSET-wide Log form uses, so a gym member logging publicly is
    // always choosing from the exact same list every other public-pool user sees.
    let appState={ currentUserId:null, currentUser:null, theme:'dark', entries:[], tests:[], globalTests:[], spotlightLift:'', resultScope:'regular', boardScope:'gym', myGym:null, journalEntries:[], sports:[], sportDocs:[] };
    // Bump this string on every deploy — shown in the About modal footer so
    // you (or anyone testing) can confirm at a glance whether a fresh reload
    // actually got the new code, or is still looking at a cached build. Not
    // tied to sw.js's CACHE_NAME on purpose: this covers EVERY file (JS
    // included), where CACHE_NAME only ever covered the shell.
    const BUILD_STAMP = '2026-10-15 scout shell';
    // Month currently shown in the streak calendar (1st-of-month Date, local time), plus
    // which date the journal tab is editing. Kept outside appState since it's pure UI
    // navigation state, not data — resets to "today" each time the modal opens fresh.
    let streakCalendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    let streakEditingDate = todayStr();
    let streakSelectedIntensity = null;
    const $=s=>document.querySelector(s), $$=s=>document.querySelectorAll(s);
    function uid(){ return Date.now().toString(36)+Math.random().toString(36).substr(2,6); }
    // todayStr() must match local calendar days everywhere the app cares about
    // "today" — logging, streaks, journal upserts. toISOString() converts to
    // UTC, which silently disagrees with local time for a window each night
    // (e.g. ~2 hours after midnight in SAST, UTC+2) — during that window the
    // old version thought it was still yesterday while every calendar cell
    // was already showing today. Since journal saves are an upsert keyed by
    // date, that mismatch didn't just mislabel a date, it could overwrite
    // yesterday's journal entry with a late-night one instead of creating
    // today's. dateToLocalStr() lives here (not in entries-journal.js, where
    // it used to be) specifically because todayStr() needs it at *script load
    // time* (see streakEditingDate below) — core.js runs before
    // entries-journal.js, so calling into a not-yet-loaded file's function
    // here threw a ReferenceError on every single page load, which halted
    // the rest of this script and left `$` (declared further down) stuck
    // uninitialized for the rest of the app's life. That's the actual root
    // cause of the "loading skeleton forever" symptom — not a deploy/caching
    // issue, though the service worker caching JS (see sw.js note) meant a
    // fix here wouldn't even reach you until that cache was busted too.
    function dateToLocalStr(d){ const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${day}`; }
    function todayStr(){ return dateToLocalStr(new Date()); }
    function formatDate(d){ return new Date(d+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}); }
    // Truncate "now" to local midnight before diffing — otherwise the day-gap
    // count drifts by time-of-day (e.g. checking at 11pm vs 1am the same
    // local day used to give different answers for the same two dates).
    function daysAgo(d){ const t=new Date(); t.setHours(0,0,0,0); return Math.floor((t-new Date(d+'T00:00:00'))/(1000*60*60*24)); }
    function showToast(m){ const t=document.createElement('div'); t.className='toast'; t.textContent=m; $('#toastContainer').appendChild(t); setTimeout(()=>t.remove(),3000); }
    // ── Rate limiting & input validation ────────────────────────────────
    // This is a UX / abuse-deterrence layer only — it stops accidental
    // double-submits and casual spam-clicking from a normal browser. It is
    // NOT the security boundary: a modified client (console, curl, a
    // rewritten fetch) skips this file entirely, so the real backstop is
    // server-side — see the lastWriteAt cooldown and field validation added
    // to firestore.rules alongside this. Client-side limiting exists so
    // that 99% of accidental abuse (fast double-taps, a stuck key, a user
    // mashing "Log Result") never even reaches Firestore, saving reads/
    // writes and giving instant feedback instead of a rejected write.
    const RATE_LIMITS = { logEntry:1200, inviteCode:2500, passwordReset:30000, profileSave:1500, adminWrite:800, journalSave:1000, deleteAccount:3000, googleAuth:1500, resendVerify:20000 };
    const rateLimitState = {};
    function rateLimited(key, minIntervalMs){
        const now = Date.now();
        const last = rateLimitState[key] || 0;
        if (now - last < minIntervalMs){
            const waitSec = Math.max(1, Math.ceil((minIntervalMs - (now - last)) / 1000));
            showToast(`Please wait ${waitSec>1?waitSec+'s':'a moment'} and try again.`);
            return true;
        }
        rateLimitState[key] = now;
        return false;
    }
    // Wraps a <form> submit handler: blocks a second submit while the first
    // is still in flight (the double-submit problem — two overlapping
    // requests) AND enforces a minimum spacing between submits via
    // rateLimited() (the spam problem — many sequential requests). Both are
    // needed; disabling the button alone doesn't stop someone re-enabling
    // it and firing again a moment later.
    async function guardedSubmit(e, rateKey, minIntervalMs, fn){
        e.preventDefault();
        const form = e.target;
        const btn = form && form.querySelector('button[type="submit"]');
        if (btn && btn.disabled) return;
        if (rateKey && rateLimited(rateKey, minIntervalMs)) return;
        if (btn) btn.disabled = true;
        try { await fn(); }
        finally { if (btn) btn.disabled = false; }
    }
    // Same idea for a plain onclick button (not inside a <form onsubmit>).
    async function guardedClick(btn, rateKey, minIntervalMs, fn){
        if (btn && btn.disabled) return;
        if (rateKey && rateLimited(rateKey, minIntervalMs)) return;
        if (btn) btn.disabled = true;
        try { await fn(); }
        finally { if (btn) btn.disabled = false; }
    }
    // Sanity bounds for a logged result — generous enough to never block a
    // real human performance, tight enough to reject garbage/injected
    // values (NaN, Infinity, negatives, absurd magnitudes). Mirrors (but
    // doesn't replace) the bound check enforced server-side in
    // firestore.rules, since this same value also gets written to the
    // leaderboard and averaged into percentiles — one bad number pollutes
    // everyone's stat card, not just the person who logged it.
    function isValidEntryValue(value, cfg){
        if (typeof value !== 'number' || !isFinite(value)) return false;
        if (value < 0) return false;
        const ceiling = (cfg && cfg.unit === 'time') ? 86400 : 100000; // 24h, or a generous rep/kg/cm ceiling
        return value <= ceiling;
    }
    function isValidLogDate(dateStr){
        if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
        const d = new Date(dateStr+'T00:00:00');
        if (isNaN(d.getTime())) return false;
        const endOfToday = new Date(); endOfToday.setHours(23,59,59,999);
        const earliest = new Date('2000-01-01T00:00:00');
        return d <= endOfToday && d >= earliest;
    }
    function updateLogoForTheme(th){ $('#logoImg').src=th==='dark'?'/logo-dark.png':'/logo-light.png'; }
    function applyTheme(th){ document.documentElement.setAttribute('data-theme',th); appState.theme=th; localStorage.setItem(KEYS.theme,th); const ti=$('#themeIcon'); if(ti) ti.innerHTML=th==='dark'?'<svg class="btn-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>':'<svg class="btn-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"/></svg>'; updateLogoForTheme(th); if (window.syncThemeControl) window.syncThemeControl(); }
    window.toggleTheme=()=>applyTheme(appState.theme==='dark'?'light':'dark');
    window.setTheme=(th)=>applyTheme(th==='light'?'light':'dark');
    function getCurrentUserId(){ return appState.currentUserId; }
    // Keeps appState.entries live for whoever's currently signed in (or this device, in single mode).
    // Sorted client-side rather than via Firestore orderBy, since combining an equality filter
    // with orderBy on a different field would require a manually-created composite index.
    function subscribeEntries(callback){
        unsubscribeEntries();
        const uid2 = getCurrentUserId();
        if (!uid2 || !initFirebase()){ appState.entries=[]; callback([]); return; }
        entriesUnsub = db.collection('entries').where('userId','==',uid2).onSnapshot(snapshot=>{
            const list=[];
            snapshot.forEach(doc=>list.push({ id:doc.id, ...doc.data() }));
            list.sort((a,b)=>b.timestamp-a.timestamp);
            appState.entries=list;
            callback(list);
        }, err=>{ console.error('entries subscription error:', err); appState.entries=[]; callback([]); });
    }
    // Keeps appState.journalEntries live for whoever's currently signed in. One doc per
    // user per day (docId = `${uid}_${date}`), so writes are upserts, not appends —
    // matches the "one journal entry per day" model, same as one PR per test.
    function subscribeJournal(callback){
        unsubscribeJournal();
        const uid2 = getCurrentUserId();
        if (!uid2 || !initFirebase()){ appState.journalEntries=[]; callback([]); return; }
        journalUnsub = db.collection('journal').where('userId','==',uid2).onSnapshot(snapshot=>{
            const list=[];
            snapshot.forEach(doc=>list.push({ id:doc.id, ...doc.data() }));
            appState.journalEntries=list;
            callback(list);
        }, err=>{ console.error('journal subscription error:', err); appState.journalEntries=[]; callback([]); });
    }
    function getJournalEntry(date){ return appState.journalEntries.find(j=>j.date===date) || null; }
    // Upsert — one doc per user per day. set() with a deterministic doc ID means saving
    // the same date twice edits in place instead of creating duplicates.
    // Batched with the profile's lastWriteAt bump, same as addEntry() — the
    // server-side withinEntryRateLimit() cooldown in firestore.rules (shared
    // between entries and journal) reads this field, and without this write
    // it would never actually engage for journal saves.
    async function saveJournal(date, intensity, comment){
        const uid2 = getCurrentUserId();
        if (!uid2 || !initFirebase()) return false;
        try {
            const journalRef = db.collection('journal').doc(`${uid2}_${date}`);
            const batch = db.batch();
            batch.set(journalRef, { userId:uid2, date, intensity, comment: comment.slice(0,500), updatedAt: Date.now() });
            batch.update(db.collection('users').doc(uid2), { lastWriteAt: Date.now() });
            await batch.commit();
            return true;
        } catch(err){ console.error('saveJournal failed:', err); return false; }
    }

