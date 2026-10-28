// ── classes.js ────────────────────────────────────────
// Training Club data layer: classes (what a club offers), classExercises
// (what's in a class), classSchedules (when it recurs), classEnrollments
// (who's in it) — plus manager-side fetchers for classLogs/classJournal.
// This is the CRUD backbone the member-facing Club tab (entries-journal.js,
// upcoming chunk) and the manager panel (classes-ui.js, next chunk) both
// build on.
//
// FORWARD-ONLY DATA PHILOSOPHY (locked decision, see memory): deleting a
// class cascades to its exercises/schedules/enrollments, but NEVER touches
// classLogs or classJournal. A member's attendance history and journal
// entries are theirs — the class they were logged against ceasing to exist
// later doesn't erase that they showed up. deleteClass() below is the one
// function in this file that has to get that ordering right.

    // ── Classes ──────────────────────────────────────────────────────────
    async function createClass(clubId, name, description){
        if (!initFirebase() || !clubId) return null;
        try {
            const ref = await db.collection('classes').add({
                clubId, name: (name||'').trim().slice(0,60), description: (description||'').trim().slice(0,200), createdAt: Date.now()
            });
            return ref.id;
        } catch(err){ console.error('createClass failed:', err); showToast('Could not create class.'); return null; }
    }
    async function updateClassDoc(classId, updates){
        if (!initFirebase()) return false;
        try { await db.collection('classes').doc(classId).update(updates); return true; }
        catch(err){ console.error('updateClassDoc failed:', err); showToast('Could not update class.'); return false; }
    }
    // Cascades to classExercises/classSchedules/classEnrollments — the parts
    // that only make sense while the class exists. classLogs/classJournal
    // are deliberately left untouched; see the file-level note above.
    async function deleteClass(classId){
        if (!initFirebase()) return false;
        try {
            const [exSnap, schedSnap, enrollSnap] = await Promise.all([
                db.collection('classExercises').where('classId','==',classId).get(),
                db.collection('classSchedules').where('classId','==',classId).get(),
                db.collection('classEnrollments').where('classId','==',classId).get()
            ]);
            const batch = db.batch();
            exSnap.forEach(d=>batch.delete(d.ref));
            schedSnap.forEach(d=>batch.delete(d.ref));
            enrollSnap.forEach(d=>batch.delete(d.ref));
            batch.delete(db.collection('classes').doc(classId));
            await batch.commit();
            return true;
        } catch(err){ console.error('deleteClass failed:', err); showToast('Could not delete class.'); return false; }
    }
    // One-time fetch — used by the manager panel, which re-fetches after
    // each mutation rather than holding a permanent listener open (same
    // pattern as fetchAllGyms()/fetchTestsForScope() before this rebuild).
    async function fetchClassesForClub(clubId){
        if (!initFirebase() || !clubId) return [];
        try {
            const snap = await db.collection('classes').where('clubId','==',clubId).get();
            const list = []; snap.forEach(d=>list.push({ id:d.id, ...d.data() }));
            list.sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));
            return list;
        } catch(err){ console.error('fetchClassesForClub failed:', err); showToast('Could not load classes.'); return []; }
    }
    // Live listener — used by the MEMBER-facing side (Club tab), so a
    // manager adding/renaming/removing a class updates a member's view
    // without them needing to reopen anything.
    let clubClassesUnsub = null;
    function unsubscribeClubClasses(){ if (clubClassesUnsub){ clubClassesUnsub(); clubClassesUnsub=null; } }
    function subscribeClubClasses(clubId, callback){
        unsubscribeClubClasses();
        if (!clubId || !initFirebase()){ callback([]); return; }
        clubClassesUnsub = db.collection('classes').where('clubId','==',clubId).onSnapshot(snapshot=>{
            const list = []; snapshot.forEach(d=>list.push({ id:d.id, ...d.data() }));
            list.sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));
            callback(list);
        }, err=>{ console.error('club classes subscription error:', err); callback([]); });
    }
    function getClassById(classList, classId){ return (classList||[]).find(c=>c.id===classId) || null; }

    // ── Class exercises (what's in a class, in order) ──────────────────
    async function createClassExercise(classId, name, order){
        if (!initFirebase() || !classId) return null;
        try {
            const ref = await db.collection('classExercises').add({ classId, name: (name||'').trim().slice(0,60), order: order??0 });
            return ref.id;
        } catch(err){ console.error('createClassExercise failed:', err); showToast('Could not add exercise.'); return null; }
    }
    async function deleteClassExercise(id){
        if (!initFirebase()) return false;
        try { await db.collection('classExercises').doc(id).delete(); return true; }
        catch(err){ console.error('deleteClassExercise failed:', err); showToast('Could not remove exercise.'); return false; }
    }
    async function fetchExercisesForClass(classId){
        if (!initFirebase() || !classId) return [];
        try {
            const snap = await db.collection('classExercises').where('classId','==',classId).get();
            const list = []; snap.forEach(d=>list.push({ id:d.id, ...d.data() }));
            list.sort((a,b)=>(a.order??0)-(b.order??0));
            return list;
        } catch(err){ console.error('fetchExercisesForClass failed:', err); showToast('Could not load exercises.'); return []; }
    }

    // ── Class schedules (when it recurs) ────────────────────────────────
    // Display/reminder purposes only — NOT enforced anywhere (a member can
    // log a class check-in on any day; there's no "you can only check in
    // during a scheduled slot" rule, mirroring how same-day enforcement was
    // always UI-only elsewhere in this app, never a hard Firestore gate).
    async function createClassSchedule(classId, daysOfWeek, time){
        if (!initFirebase() || !classId) return null;
        try {
            const ref = await db.collection('classSchedules').add({ classId, daysOfWeek: daysOfWeek||[], time: time||'' });
            return ref.id;
        } catch(err){ console.error('createClassSchedule failed:', err); showToast('Could not add schedule.'); return null; }
    }
    async function deleteClassSchedule(id){
        if (!initFirebase()) return false;
        try { await db.collection('classSchedules').doc(id).delete(); return true; }
        catch(err){ console.error('deleteClassSchedule failed:', err); showToast('Could not remove schedule.'); return false; }
    }
    async function fetchSchedulesForClass(classId){
        if (!initFirebase() || !classId) return [];
        try {
            const snap = await db.collection('classSchedules').where('classId','==',classId).get();
            const list = []; snap.forEach(d=>list.push({ id:d.id, ...d.data() }));
            return list;
        } catch(err){ console.error('fetchSchedulesForClass failed:', err); showToast('Could not load schedule.'); return []; }
    }
    // Every schedule slot across every class in a club, in one shot — this
    // is what the member-facing Schedule tab actually renders (a week/day
    // view spanning all of a club's classes), so it queries by clubId
    // rather than making the caller fan out per-class.
    let clubSchedulesUnsub = null;
    function unsubscribeClubSchedules(){ if (clubSchedulesUnsub){ clubSchedulesUnsub(); clubSchedulesUnsub=null; } }
    function subscribeClubSchedules(clubId, classList, callback){
        unsubscribeClubSchedules();
        if (!clubId || !initFirebase()){ callback([]); return; }
        const classIds = new Set((classList||[]).map(c=>c.id));
        clubSchedulesUnsub = db.collection('classSchedules').onSnapshot(snapshot=>{
            const list = [];
            snapshot.forEach(d=>{ const data=d.data(); if (classIds.has(data.classId)) list.push({ id:d.id, ...data }); });
            callback(list);
        }, err=>{ console.error('club schedules subscription error:', err); callback([]); });
    }

    // ── Class enrollments (who's in it) ─────────────────────────────────
    async function enrollInClass(classId, clubId){
        const uid2 = getCurrentUserId();
        if (!uid2 || !initFirebase() || !classId) return false;
        try {
            // Deterministic doc id (classId_uid) — enrolling twice is a no-op
            // upsert, not a duplicate row, same upsert pattern used for
            // journal/classJournal.
            await db.collection('classEnrollments').doc(`${classId}_${uid2}`).set({ classId, clubId, userId:uid2, joinedAt: Date.now() });
            return true;
        } catch(err){ console.error('enrollInClass failed:', err); showToast('Could not join class.'); return false; }
    }
    async function unenrollFromClass(classId){
        const uid2 = getCurrentUserId();
        if (!uid2 || !initFirebase() || !classId) return false;
        try { await db.collection('classEnrollments').doc(`${classId}_${uid2}`).delete(); return true; }
        catch(err){ console.error('unenrollFromClass failed:', err); showToast('Could not leave class.'); return false; }
    }
    // Manager roster view for one class — one-time fetch, re-run after
    // mutations, matching fetchGymRoster()'s existing pattern.
    async function fetchEnrollmentsForClass(classId){
        if (!initFirebase() || !classId) return [];
        try {
            const snap = await db.collection('classEnrollments').where('classId','==',classId).get();
            const list = []; snap.forEach(d=>list.push({ id:d.id, ...d.data() }));
            return list;
        } catch(err){ console.error('fetchEnrollmentsForClass failed:', err); showToast('Could not load roster.'); return []; }
    }
    // Member-facing: live list of the classes THEY'RE enrolled in, across
    // however many classes their club offers — drives which classes show
    // as "joined" vs "available to join" in the Club tab.
    let myEnrollmentsUnsub = null;
    function unsubscribeMyEnrollments(){ if (myEnrollmentsUnsub){ myEnrollmentsUnsub(); myEnrollmentsUnsub=null; } }
    function subscribeMyEnrollments(callback){
        unsubscribeMyEnrollments();
        const uid2 = getCurrentUserId();
        if (!uid2 || !initFirebase()){ callback([]); return; }
        myEnrollmentsUnsub = db.collection('classEnrollments').where('userId','==',uid2).onSnapshot(snapshot=>{
            const list = []; snapshot.forEach(d=>list.push({ id:d.id, ...d.data() }));
            callback(list);
        }, err=>{ console.error('my enrollments subscription error:', err); callback([]); });
    }

    // ── Manager-side reads of member data ───────────────────────────────
    // Per the locked decision that a club manager gets FULL access to their
    // club (same standing as before, just pointed at the new model): a
    // manager can read every member's classLogs and classJournal for
    // their own club, same as they could read/edit official results
    // before. These are one-time fetches for the manager panel — not live
    // listeners, since they're only ever opened deliberately (viewing a
    // roster's attendance / reviewing journals), not shown continuously.
    async function fetchClassLogsForClub(clubId, sinceDate){
        if (!initFirebase() || !clubId) return [];
        try {
            let query = db.collection('classLogs').where('clubId','==',clubId);
            if (sinceDate) query = query.where('date','>=',sinceDate);
            const snap = await query.get();
            const list = []; snap.forEach(d=>list.push({ id:d.id, ...d.data() }));
            list.sort((a,b)=> b.date.localeCompare(a.date) || (b.timestamp||0)-(a.timestamp||0));
            return list;
        } catch(err){ console.error('fetchClassLogsForClub failed:', err); showToast('Could not load attendance.'); return []; }
    }
    // One club, one week — mirrors how the member writes it (saveClassJournal
    // upserts per clubId+weekStart), so the manager's read shape matches.
    async function fetchClassJournalForClub(clubId, weekStart){
        if (!initFirebase() || !clubId || !weekStart) return [];
        try {
            const snap = await db.collection('classJournal').where('clubId','==',clubId).where('weekStart','==',weekStart).get();
            const list = []; snap.forEach(d=>list.push({ id:d.id, ...d.data() }));
            return list;
        } catch(err){ console.error('fetchClassJournalForClub failed:', err); showToast('Could not load club journal.'); return []; }
    }
