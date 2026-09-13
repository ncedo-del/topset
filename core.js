// ── core.js ───────────────────────────────────────────
// Firebase init, shared app state, Firestore subscription plumbing,
// leaderboard-mirror push logic, club tiers/default tests, date/uid
// helpers, rate limiting + input validation. Loads FIRST — everything
// else reads shared state (appState, RATE_LIMITS, db, auth, etc.)
// that lives in this file.
//
// ── TRAINING CLUB REBUILD (this chunk) ──────────────────────────────
// This file was rebuilt from the pre-rebuild "gym/leaderboard" baseline.
// The gym-scoped Official Results system, gym-scoped test catalog, and
// dual (gym + public) leaderboard buckets are GONE — not hidden, removed.
// What's left of that system is: the public leaderboard (now single-
// bucket, no scope split) and clubs themselves (renamed from gyms, same
// underlying doc shape — name/inviteCode/tier/subscriptionStatus/
// ownerUserId/ownerEmail — see clubs.js for CRUD).
//
// New in this chunk: classLogs (a member logging that they showed up to
// a class) and classJournal (a private, per-club, per-week journal
// entry). Both feed the "showed up" streak alongside the existing daily
// journal — see getShowedUpEntries() below.

    // --- Full app logic with profile editing ---

    const firebaseConfig = {
        apiKey: "AIzaSyAeRLFevxRetMqvWqBtxXI1C50GBJVepb8",
        authDomain: "topset-leaderboard.firebaseapp.com",
        projectId: "topset-leaderboard",
        storageBucket: "topset-leaderboard.firebasestorage.app",
        messagingSenderId: "583421199873",
        appId: "1:583421199873:web:10f8458cbaf6d2caf9a200"
    };
    let fbApp=null, db=null, auth=null, leaderboardUnsub=null, entriesUnsub=null, testsUnsub=null, ownProfileUnsub=null, ownLeaderboardUnsub=null, journalUnsub=null, classLogsUnsub=null, classJournalUnsub=null;
    // Manage Tests modal cache — the test catalog is now a single flat global
    // list (no more per-club scoping), so there's no "scope" to track anymore,
    // just the raw list currently being edited.
    let manageTestsCache = [];
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
    function unsubscribeTests(){ if (testsUnsub){ testsUnsub(); testsUnsub=null; } }
    function unsubscribeOwnLeaderboard(){ if (ownLeaderboardUnsub){ ownLeaderboardUnsub(); ownLeaderboardUnsub=null; } }
    function unsubscribeJournal(){ if (journalUnsub){ journalUnsub(); journalUnsub=null; } }
    function unsubscribeClassLogs(){ if (classLogsUnsub){ classLogsUnsub(); classLogsUnsub=null; } }
    function unsubscribeClassJournal(){ if (classJournalUnsub){ classJournalUnsub(); classJournalUnsub=null; } }
    // Keeps the CURRENT USER's own percentile cache honest against changes
    // nobody in THIS tab made. computeTestPercentile() caches per (test, uid)
    // for PERCENTILE_CACHE_TTL_MS, and invalidatePercentileCache() is only
    // ever called by whoever performs the leaderboard write. Now that the
    // leaderboard is single-bucket (no more admin-writes-someone-else's-
    // official-doc case), this mostly matters for multi-tab same-user use,
    // but it's cheap to keep regardless — a handful of docs, not a full
    // scope query.
    function subscribeOwnLeaderboard(){
        unsubscribeOwnLeaderboard();
        const uid2 = getCurrentUserId();
        if (!uid2 || !initFirebase()) return;
        ownLeaderboardUnsub = db.collection('leaderboard').where('userId','==',uid2).onSnapshot(snapshot=>{
            snapshot.docChanges().forEach(change=>{
                if (change.type==='added' || change.type==='modified' || change.type==='removed'){
                    const d = change.doc.data();
                    if (d) invalidatePercentileCache(d.test, d.userId);
                }
            });
        }, err=>{ console.error('own-leaderboard subscription error:', err); });
    }

    // Pushes ONE test's personal best for the current user up to the shared
    // 'leaderboard' collection. Deletes the cloud record if the user no
    // longer has any entries for that test.
    //
    // SIMPLIFIED THIS CHUNK: the old version wrote up to 4 docs per
    // (user, test) — official/regular × gym-bucket/public-bucket — because
    // official results were gym-scoped and a gym member could log to either
    // their gym or the public pool. Both of those concepts are gone: there
    // is no "official" result anymore, and personal test-logging was never
    // club-scoped to begin with (it's the same log form for everyone,
    // club member or not). So there's exactly ONE leaderboard doc per
    // (user, test) now — this is just "your best result for this test,
    // full stop." Doc id keeps the plain `uid__testId` shape.
    //
    // Generalized over targetUid (not always "the current user") because
    // an admin editing/deleting someone else's entry still needs to
    // recompute THAT user's leaderboard doc, not their own.
    async function recomputeBestForUser(targetUid, testName, knownProfile){
        if (!initFirebase() || !targetUid) return;
        const cfg = getTestConfig(testName);
        if (!cfg) return;
        const snap = await db.collection('entries').where('userId','==',targetUid).where('test','==',testName).get();
        const all = [];
        snap.forEach(doc=>all.push(doc.data()));
        const user = knownProfile || await getUserById(targetUid);
        if (!user) return;
        const docId = `${targetUid}__${cfg.id}`;
        const ref = db.collection('leaderboard').doc(docId);
        if (!all.length){
            try{ await ref.delete(); }catch(e){}
            invalidatePercentileCache(testName, targetUid);
            return;
        }
        const best = all.reduce((b,e)=>{
            if (cfg.higherIsBetter ? e.value > b.value : e.value < b.value) return e;
            if (e.value === b.value && e.date > b.date) return e;
            return b;
        }, all[0]);
        try {
            await ref.set({ userId:targetUid, name:user.name, avatar:user.avatar||'🏋️', ageGroup:user.ageGroup||null, gender:user.gender||null, test:testName, value:best.value, date:best.date, updatedAt:Date.now() });
            invalidatePercentileCache(testName, targetUid);
        } catch(e){ console.error('Leaderboard sync failed:', e); }
    }
    async function pushBestToCloud(testName){
        const uid2 = getCurrentUserId();
        if (!uid2) return;
        await recomputeBestForUser(uid2, testName, getCurrentUser());
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
            snap.forEach(doc=>batch.update(doc.ref, { name:user.name, avatar:user.avatar||'🏋️', ageGroup:user.ageGroup||null, gender:user.gender||null }));
            await batch.commit();
        } catch(e){ console.error('Profile sync to leaderboard failed:', e); }
    }
    // Logo: real image files (logo-dark.png / logo-light.png), swapped by src on theme
    // change. Deliberately NOT base64 — embedding large images as inline strings is what
    // caused repeated silent corruption during manual copy/paste in earlier iterations of
    // this file. Plain files sitting in /public are one clean upload, nothing to transcribe.
    // Club subscription tiers (renamed from GYM_TIERS — same shape, same
    // caps) — cap is enforced client-side at join time (see
    // checkClubCapacity). Prices/labels live here so there's one place to
    // change them if the business terms change.
    const CLUB_TIERS = {
        small:  { label: 'Small',       cap: 50  },
        medium: { label: 'Medium',      cap: 126 },
        large:  { label: 'Large',       cap: 250 },
        xlarge: { label: 'Extra Large', cap: 520 }
    };
    function tierInfo(tier){ return CLUB_TIERS[tier] || CLUB_TIERS.small; }
    // Default tests, seeded into Firestore once (with their original IDs preserved)
    // if the 'tests' collection is ever empty — e.g. on first run, or after a data wipe.
    // No more `gymId` field — the test catalog is a single flat global list now
    // (see subscribeTests() below); custom per-club test catalogs were torn out
    // this chunk along with Manage Tests' club-scope picker.
    const DEFAULT_TESTS = [
        { id:'broad_jump', name:'Broad Jump', unit:'m', higherIsBetter:true, inputType:'number', placeholder:'2.50', order:0 },
        { id:'3km_run', name:'3km Run', unit:'time', higherIsBetter:false, inputType:'text', placeholder:'12:30', order:1 },
        { id:'pushups', name:'2:00 Push-ups', unit:'reps', higherIsBetter:true, inputType:'number', placeholder:'50', order:2 },
        { id:'situps', name:'2:00 Sit-ups', unit:'reps', higherIsBetter:true, inputType:'number', placeholder:'45', order:3 },
        { id:'sit_reach', name:'Sit and Reach', unit:'cm', higherIsBetter:true, inputType:'number', placeholder:'30', order:4 },
        { id:'bodyweight', name:'Bodyweight', unit:'kg', higherIsBetter:true, inputType:'number', placeholder:'80', order:5 }
    ];
    async function seedDefaultTestsIfEmpty(){
        if (!initFirebase()) return;
        try {
            const snap = await db.collection('tests').limit(1).get();
            if (!snap.empty) return;
            const batch = db.batch();
            DEFAULT_TESTS.forEach(t=>{ const { id, ...data } = t; batch.set(db.collection('tests').doc(id), data); });
            await batch.commit();
        } catch(err){ console.error('Seeding default tests failed:', err); }
    }
    // Keeps appState.tests live — a single flat global catalog, one listener,
    // no merge. Replaces the old dual-source (global + per-club) version: with
    // club-scoped test catalogs removed, every signed-in user (club member or
    // not) sees exactly the same test list.
    function subscribeTests(callback){
        unsubscribeTests();
        if (!initFirebase()){ appState.tests=DEFAULT_TESTS; callback(appState.tests); return; }
        testsUnsub = db.collection('tests').onSnapshot(snapshot=>{
            const list = [];
            snapshot.forEach(doc=>list.push({ id:doc.id, ...doc.data() }));
            list.sort((a,b)=>(a.order??0)-(b.order??0));
            appState.tests = list.length ? list : DEFAULT_TESTS;
            callback(appState.tests);
        }, err=>{ console.error('tests subscription error:', err); appState.tests=DEFAULT_TESTS; callback(appState.tests); });
    }
    // One-time fetch of the raw test list — used by the Manage Tests modal
    // (admin-only now; no club-manager variant, since custom per-club test
    // catalogs no longer exist).
    async function fetchAllTests(){
        if (!initFirebase()) return [];
        try {
            const snap = await db.collection('tests').get();
            const list = [];
            snap.forEach(doc=>list.push({ id:doc.id, ...doc.data() }));
            list.sort((a,b)=>(a.order??0)-(b.order??0));
            return list;
        } catch(err){ console.error('fetchAllTests failed:', err); showToast('Could not load tests.'); return []; }
    }
    async function createTest(data){
        if (!initFirebase()) return null;
        try {
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

    const STORAGE_PREFIX='topset_', KEYS={ theme:STORAGE_PREFIX+'theme', spotlightLift:STORAGE_PREFIX+'spotlight_lift', seenAbout:STORAGE_PREFIX+'seen_about', seenInstall:STORAGE_PREFIX+'seen_install' };
    // appState.tests = the single global test catalog (see subscribeTests()).
    // appState.myClub = the current member's own club doc (renamed from myGym),
    // kept fresh for UI that needs it without a network round-trip.
    // appState.classLogEntries / appState.classJournalEntries = this chunk's
    // new live-synced collections — see subscribeClassLogs()/subscribeClassJournal().
    let appState={ currentUserId:null, currentUser:null, theme:'dark', entries:[], tests:[], spotlightLift:'', myClub:null, journalEntries:[], classLogEntries:[], classJournalEntries:[] };
    // Bump this string on every deploy — shown in the About modal footer so
    // you (or anyone testing) can confirm at a glance whether a fresh reload
    // actually got the new code, or is still looking at a cached build. Not
    // tied to sw.js's CACHE_NAME on purpose: this covers EVERY file (JS
    // included), where CACHE_NAME only ever covered the shell.
    const BUILD_STAMP = '2026-09-09 Training Club rebuild — chunk 4';
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
    // time* (see streakEditingDate above) — core.js runs before
    // entries-journal.js, so calling into a not-yet-loaded file's function
    // here threw a ReferenceError on every single page load, which halted
    // the rest of this script and left `$` (declared further down) stuck
    // uninitialized for the rest of the app's life. That's the actual root
    // cause of the "loading skeleton forever" symptom — not a deploy/caching
    // issue, though the service worker caching JS (see sw.js note) meant a
    // fix here wouldn't even reach you until that cache was busted too.
    function dateToLocalStr(d){ const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${day}`; }
    function todayStr(){ return dateToLocalStr(new Date()); }
    // Monday-first week-start, local time — used to key classJournal docs
    // (one per user per club per week) and to group classLogs into a weekly
    // view. Deliberately Monday (not Sunday, which the streak calendar/week
    // strip elsewhere in the app use) because a "training week" for a club
    // reads Mon-Sun to most people, independent of how the personal daily
    // streak calendar happens to lay its own grid out.
    function mondayOfWeek(d){
        const date = new Date(d); date.setHours(0,0,0,0);
        const day = date.getDay(); // 0=Sun..6=Sat
        const diff = day===0 ? -6 : 1-day; // shift back to Monday
        date.setDate(date.getDate()+diff);
        return dateToLocalStr(date);
    }
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
    // classLog reuses the same spacing as logEntry/journalSave — a class
    // check-in is the same shape of write (one doc, rate-limited, batched
    // with a lastWriteAt bump) as either of those.
    const RATE_LIMITS = { logEntry:1200, inviteCode:2500, passwordReset:30000, profileSave:1500, adminWrite:800, journalSave:1000, classLog:1200, classJournalSave:1000, deleteAccount:3000, googleAuth:1500, resendVerify:20000 };
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
    function updateLogoForTheme(th){ $('#logoImg').src=th==='dark'?'logo-dark.png':'logo-light.png'; }
    function applyTheme(th){ document.documentElement.setAttribute('data-theme',th); appState.theme=th; localStorage.setItem(KEYS.theme,th); $('#themeIcon').innerHTML=th==='dark'?'<svg class="btn-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>':'<svg class="btn-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"/></svg>'; updateLogoForTheme(th); }
    window.toggleTheme=()=>applyTheme(appState.theme==='dark'?'light':'dark');
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

    // ── Class attendance ("showed up") ──────────────────────────────────
    // A classLogs doc means "I attended/completed a class session" — no
    // value, no test, no official/regular split, just a date + which class.
    // This is the direct replacement for the old gym-scoped Log form +
    // Official Results: showing up IS the result. Multiple check-ins on the
    // same day (two different classes, say) are allowed — each is its own
    // doc — since the streak union below dedupes by date anyway, logging
    // twice in a day never double-counts toward the streak, it just keeps
    // an honest attendance record.
    function subscribeClassLogs(callback){
        unsubscribeClassLogs();
        const uid2 = getCurrentUserId();
        if (!uid2 || !initFirebase()){ appState.classLogEntries=[]; callback([]); return; }
        classLogsUnsub = db.collection('classLogs').where('userId','==',uid2).onSnapshot(snapshot=>{
            const list=[];
            snapshot.forEach(doc=>list.push({ id:doc.id, ...doc.data() }));
            appState.classLogEntries=list;
            callback(list);
        }, err=>{ console.error('classLogs subscription error:', err); appState.classLogEntries=[]; callback([]); });
    }
    // Batched with the lastWriteAt bump, same pattern as addEntry()/saveJournal() —
    // withinEntryRateLimit() in firestore.rules is shared across all three writers.
    async function logClassAttendance(classId, clubId, date, note){
        const uid2 = getCurrentUserId();
        if (!uid2 || !initFirebase()) return null;
        try {
            const logRef = db.collection('classLogs').doc();
            const batch = db.batch();
            const data = { userId:uid2, classId, clubId, date: date||todayStr(), note: (note||'').slice(0,300), timestamp: Date.now() };
            batch.set(logRef, data);
            batch.update(db.collection('users').doc(uid2), { lastWriteAt: Date.now() });
            await batch.commit();
            return { id: logRef.id, ...data };
        } catch(err){ console.error('logClassAttendance failed:', err); showToast('Could not log your check-in. Check your connection.'); return null; }
    }
    async function deleteClassLog(id){
        if (!initFirebase()) return false;
        try { await db.collection('classLogs').doc(id).delete(); return true; }
        catch(err){ console.error('deleteClassLog failed:', err); showToast('Could not delete check-in.'); return false; }
    }

    // ── Weekly club journal ─────────────────────────────────────────────
    // Private, per-user, per-club, per-week (Monday-start) entry — separate
    // from the daily personal streak journal. One doc per (user, club,
    // week): docId `${uid}_${clubId}_${weekStart}`, upserted the same way
    // saveJournal() upserts a day. "Private" means visible to the writer
    // and to that club's manager/admin (see firestore.rules), never to
    // other members.
    function subscribeClassJournal(callback){
        unsubscribeClassJournal();
        const uid2 = getCurrentUserId();
        if (!uid2 || !initFirebase()){ appState.classJournalEntries=[]; callback([]); return; }
        classJournalUnsub = db.collection('classJournal').where('userId','==',uid2).onSnapshot(snapshot=>{
            const list=[];
            snapshot.forEach(doc=>list.push({ id:doc.id, ...doc.data() }));
            appState.classJournalEntries=list;
            callback(list);
        }, err=>{ console.error('classJournal subscription error:', err); appState.classJournalEntries=[]; callback([]); });
    }
    function getClassJournalEntry(clubId, weekStart){
        return appState.classJournalEntries.find(j=>j.clubId===clubId && j.weekStart===weekStart) || null;
    }
    async function saveClassJournal(clubId, weekStart, text){
        const uid2 = getCurrentUserId();
        if (!uid2 || !initFirebase()) return false;
        try {
            const ref = db.collection('classJournal').doc(`${uid2}_${clubId}_${weekStart}`);
            const batch = db.batch();
            batch.set(ref, { userId:uid2, clubId, weekStart, text: (text||'').slice(0,2000), updatedAt: Date.now() });
            batch.update(db.collection('users').doc(uid2), { lastWriteAt: Date.now() });
            await batch.commit();
            return true;
        } catch(err){ console.error('saveClassJournal failed:', err); return false; }
    }

    // ── Streak union — "showed up" philosophy ───────────────────────────
    // Any exercise log on any day counts toward the streak, regardless of
    // WHAT was logged: a free-form daily journal entry (even "Rest") OR a
    // class check-in. This is the union of appState.journalEntries and
    // appState.classLogEntries, deduped by date — calculateStreak() (in
    // entries-journal.js) only ever reads `.date`, so it's untouched by
    // this change; it just now receives a richer, merged list instead of
    // journalEntries alone.
    function getShowedUpEntries(){
        const seen = new Set();
        const merged = [];
        [...appState.journalEntries, ...appState.classLogEntries].forEach(e=>{
            if (!e || !e.date || seen.has(e.date)) return;
            seen.add(e.date);
            merged.push(e);
        });
        return merged;
    }
