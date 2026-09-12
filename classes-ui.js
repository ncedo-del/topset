// ── classes-ui.js ─────────────────────────────────────
// Club manager panel for the Training Club system: create/edit/delete
// classes, manage each class's exercises + recurring schedule, view
// roster + attendance (classLogs), and review members' weekly club
// journal entries (classJournal). This is the manager's "full access"
// to their club (per the locked decision), same standing the old gym
// manager had over Official Results — just pointed at the new model.
//
// NAMING NOTE: user.managesGymId is still the actual Firestore field name
// (rename to managesClubId lands in the teardown chunk, alongside
// auth.js/gyms.js) — its VALUE is a club id and is used as one everywhere
// below. Same story for getGymById()/fetchGymRoster() from gyms.js: still
// named as-is until that rename, but already return/accept club docs/ids.
//
// Modal DOM (#manageClassesModal and friends) is wired up in the HTML/CSS
// chunk — this file assumes those ids exist, same build order as every
// other manager panel in this app (JS logic first, markup follows).

    let manageClassesCache = [];      // every class in the manager's club
    let manageClassesScope = null;    // this manager's clubId
    let classDetailScope = null;      // classId currently drilled into (exercises/schedule view)
    let classDetailExercisesCache = [];
    let classDetailSchedulesCache = [];
    let classRosterScope = null;      // classId currently shown in roster/attendance view
    let classRosterEnrollments = [];
    let classRosterLogs = [];
    let journalReviewWeek = null;     // weekStart (Monday, YYYY-MM-DD) currently shown in journal review
    let journalReviewEntries = [];
    let journalReviewRoster = [];

    // ── Entry point / list view ─────────────────────────────────────────
    window.openManageClasses = async function(){
        const u = getCurrentUser();
        if (!u?.managesGymId) return;
        manageClassesScope = u.managesGymId;
        window.backToClassList();
        $('#newClassName').value=''; $('#newClassDescription').value='';
        $('#manageClassesList').innerHTML='<p class="text-muted">Loading...</p>';
        $('#manageClassesModal').classList.remove('hidden');
        manageClassesCache = await fetchClassesForClub(manageClassesScope);
        renderManageClassesList();
    };
    window.closeManageClasses = function(){ $('#manageClassesModal').classList.add('hidden'); };
    window.backToClassList = function(){
        $('#classDetailView')?.classList.add('hidden');
        $('#classRosterView')?.classList.add('hidden');
        $('#classJournalReviewView')?.classList.add('hidden');
        $('#manageClassesListView')?.classList.remove('hidden');
        classDetailScope = null;
        classRosterScope = null;
    };
    function renderManageClassesList(){
        const el = $('#manageClassesList');
        if (!manageClassesCache.length){ el.innerHTML='<p class="text-muted">No classes yet — create one below.</p>'; return; }
        el.innerHTML = manageClassesCache.map(c=>`<div style="padding:10px 0;border-bottom:1px solid var(--border);"><strong>${escapeHTML(c.name)}</strong>${c.description?`<div style="font-size:12px;color:var(--text-muted);margin-top:2px;">${escapeHTML(c.description)}</div>`:''}<div style="display:flex;align-items:center;gap:8px;margin-top:8px;flex-wrap:wrap;"><button type="button" class="row-action-btn" onclick="window.openClassDetail('${c.id}')">Exercises &amp; Schedule</button><button type="button" class="row-action-btn" onclick="window.openClassRoster('${c.id}')">Roster &amp; Attendance</button><button type="button" class="row-action-btn danger" onclick="window.handleDeleteClass('${c.id}')">Delete</button></div></div>`).join('');
    }
    window.handleAddClassSubmit = async function(e){
        return guardedSubmit(e, 'adminWrite', RATE_LIMITS.adminWrite, async()=>{
            if (!manageClassesScope) return;
            const name = $('#newClassName').value.trim().slice(0,60);
            if (!name) return showToast('Please enter a class name.');
            const description = $('#newClassDescription').value.trim().slice(0,200);
            const id = await createClass(manageClassesScope, name, description);
            if (!id) return;
            $('#addClassForm').reset();
            manageClassesCache = await fetchClassesForClub(manageClassesScope);
            renderManageClassesList();
            showToast(`"${name}" created.`);
        });
    };
    window.handleDeleteClass = async function(classId){
        const c = manageClassesCache.find(x=>x.id===classId); const name = c?c.name:'this class';
        if (!confirm(`Delete "${name}"? This removes its exercises, schedule, and enrollments. Members' past check-ins and journal entries stay on record. This cannot be undone.`)) return;
        if (!(await deleteClass(classId))) return;
        showToast(`"${name}" deleted.`);
        manageClassesCache = await fetchClassesForClub(manageClassesScope);
        renderManageClassesList();
    };

    // ── Class detail: exercises + schedule ──────────────────────────────
    window.openClassDetail = async function(classId){
        const c = manageClassesCache.find(x=>x.id===classId); if (!c) return;
        classDetailScope = classId;
        $('#classDetailScopeName').textContent = `${c.name} — Exercises & Schedule`;
        $('#manageClassesListView').classList.add('hidden');
        $('#classDetailView').classList.remove('hidden');
        $('#newClassExerciseName').value='';
        $('#newScheduleTime').value='';
        $$('#newScheduleDays input[type="checkbox"]').forEach(cb=>cb.checked=false);
        [classDetailExercisesCache, classDetailSchedulesCache] = await Promise.all([
            fetchExercisesForClass(classId),
            fetchSchedulesForClass(classId)
        ]);
        renderClassDetailExercises();
        renderClassDetailSchedules();
    };
    function renderClassDetailExercises(){
        const el = $('#classDetailExercisesList');
        if (!classDetailExercisesCache.length){ el.innerHTML='<p class="text-muted">No exercises yet — add one below.</p>'; return; }
        el.innerHTML = classDetailExercisesCache.map(ex=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border);"><span>${escapeHTML(ex.name)}</span><button type="button" class="row-action-btn danger" onclick="window.handleDeleteClassExercise('${ex.id}')">Remove</button></div>`).join('');
    }
    window.handleAddClassExerciseSubmit = async function(e){
        return guardedSubmit(e, 'adminWrite', RATE_LIMITS.adminWrite, async()=>{
            if (!classDetailScope) return;
            const name = $('#newClassExerciseName').value.trim().slice(0,60);
            if (!name) return showToast('Please enter an exercise name.');
            const order = classDetailExercisesCache.reduce((m,x)=>Math.max(m,x.order??0),-1) + 1;
            const id = await createClassExercise(classDetailScope, name, order);
            if (!id) return;
            $('#addClassExerciseForm').reset();
            classDetailExercisesCache = await fetchExercisesForClass(classDetailScope);
            renderClassDetailExercises();
        });
    };
    window.handleDeleteClassExercise = async function(id){
        if (!(await deleteClassExercise(id))) return;
        classDetailExercisesCache = await fetchExercisesForClass(classDetailScope);
        renderClassDetailExercises();
    };
    function renderClassDetailSchedules(){
        const el = $('#classDetailSchedulesList');
        const dayLabel = d=>({SU:'Sun',MO:'Mon',TU:'Tue',WE:'Wed',TH:'Thu',FR:'Fri',SA:'Sat'}[d]||d);
        if (!classDetailSchedulesCache.length){ el.innerHTML='<p class="text-muted">No scheduled times yet — add one below. Display only, doesn\'t restrict check-ins.</p>'; return; }
        el.innerHTML = classDetailSchedulesCache.map(s=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border);"><span>${(s.daysOfWeek||[]).map(dayLabel).join(', ')||'—'} ${s.time?`· ${escapeHTML(s.time)}`:''}</span><button type="button" class="row-action-btn danger" onclick="window.handleDeleteClassSchedule('${s.id}')">Remove</button></div>`).join('');
    }
    window.handleAddClassScheduleSubmit = async function(e){
        return guardedSubmit(e, 'adminWrite', RATE_LIMITS.adminWrite, async()=>{
            if (!classDetailScope) return;
            const days = Array.from($$('#newScheduleDays input[type="checkbox"]:checked')).map(cb=>cb.value);
            const time = $('#newScheduleTime').value.trim().slice(0,10);
            if (!days.length) return showToast('Pick at least one day.');
            const id = await createClassSchedule(classDetailScope, days, time);
            if (!id) return;
            $('#addClassScheduleForm').reset();
            classDetailSchedulesCache = await fetchSchedulesForClass(classDetailScope);
            renderClassDetailSchedules();
        });
    };
    window.handleDeleteClassSchedule = async function(id){
        if (!(await deleteClassSchedule(id))) return;
        classDetailSchedulesCache = await fetchSchedulesForClass(classDetailScope);
        renderClassDetailSchedules();
    };

    // ── Roster & attendance ──────────────────────────────────────────────
    // Shows who's enrolled AND a recent-attendance log (classLogs) for this
    // one class, side by side — a manager checking "who's actually showing
    // up" needs both in view at once, not two separate screens to flip
    // between.
    window.openClassRoster = async function(classId){
        const c = manageClassesCache.find(x=>x.id===classId); if (!c) return;
        classRosterScope = classId;
        $('#classRosterScopeName').textContent = `${c.name} — Roster & Attendance`;
        $('#manageClassesListView').classList.add('hidden');
        $('#classRosterView').classList.remove('hidden');
        $('#classRosterEnrolledList').innerHTML = '<p class="text-muted">Loading...</p>';
        $('#classRosterAttendanceList').innerHTML = '<p class="text-muted">Loading...</p>';
        const [enrollments, allClubLogs] = await Promise.all([
            fetchEnrollmentsForClass(classId),
            fetchClassLogsForClub(manageClassesScope)
        ]);
        classRosterEnrollments = enrollments;
        classRosterLogs = allClubLogs.filter(l=>l.classId===classId).slice(0,50); // most-recent-first, capped — this is a review list, not a full export
        renderClassRoster();
    };
    async function renderClassRoster(){
        const enrolledEl = $('#classRosterEnrolledList'), attendEl = $('#classRosterAttendanceList');
        if (!classRosterEnrollments.length){
            enrolledEl.innerHTML = '<p class="text-muted">No one enrolled yet.</p>';
        } else {
            // Names aren't denormalized onto the enrollment doc, so resolve them
            // via the club roster (same users collection, already scoped by
            // gymId — see fetchGymRoster() in gyms.js) rather than one getUserById
            // call per enrollee.
            const roster = await fetchGymRoster(manageClassesScope);
            const nameById = {}; roster.forEach(m=>nameById[m.id]=m.name||'Member');
            enrolledEl.innerHTML = classRosterEnrollments.map(en=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border);"><span>${escapeHTML(nameById[en.userId]||'Member')}</span><button type="button" class="row-action-btn danger" title="Remove from class" onclick="window.handleRemoveEnrollment('${en.classId}','${en.userId}')">Remove</button></div>`).join('');
        }
        if (!classRosterLogs.length){
            attendEl.innerHTML = '<p class="text-muted">No check-ins logged yet.</p>';
        } else {
            const roster = await fetchGymRoster(manageClassesScope);
            const nameById = {}; roster.forEach(m=>nameById[m.id]=m.name||'Member');
            attendEl.innerHTML = classRosterLogs.map(l=>`<div style="padding:6px 0;border-bottom:1px solid var(--border);font-size:13px;"><strong>${escapeHTML(nameById[l.userId]||'Member')}</strong><span style="color:var(--text-muted);"> · ${formatDate(l.date)}</span>${l.note?`<div style="color:var(--text-muted);font-size:12px;margin-top:2px;">${escapeHTML(l.note)}</div>`:''}</div>`).join('');
        }
    }
    window.handleRemoveEnrollment = async function(classId, userId){
        if (!confirm('Remove this member from the class? Their past check-ins stay on record.')) return;
        if (!initFirebase()) return;
        try {
            await db.collection('classEnrollments').doc(`${classId}_${userId}`).delete();
            classRosterEnrollments = await fetchEnrollmentsForClass(classId);
            renderClassRoster();
            showToast('Member removed from class.');
        } catch(err){ console.error('handleRemoveEnrollment failed:', err); showToast('Could not remove member.'); }
    };

    // ── Weekly club journal review ───────────────────────────────────────
    // Manager's read-only view into members' private weekly journal entries
    // for THIS club — full access per the locked decision, same standing
    // the old gym manager had over Official Results. One week at a time,
    // defaulting to the current week (mondayOfWeek(new Date())).
    window.openClubJournalReview = async function(){
        if (!manageClassesScope) return;
        journalReviewWeek = mondayOfWeek(new Date());
        $('#manageClassesListView').classList.add('hidden');
        $('#classJournalReviewView').classList.remove('hidden');
        await renderClubJournalReview();
    };
    window.journalReviewPrevWeek = async function(){
        const d = new Date(journalReviewWeek+'T00:00:00'); d.setDate(d.getDate()-7);
        journalReviewWeek = mondayOfWeek(d);
        await renderClubJournalReview();
    };
    window.journalReviewNextWeek = async function(){
        const d = new Date(journalReviewWeek+'T00:00:00'); d.setDate(d.getDate()+7);
        journalReviewWeek = mondayOfWeek(d);
        await renderClubJournalReview();
    };
    async function renderClubJournalReview(){
        $('#classJournalReviewWeekLabel').textContent = `Week of ${formatDate(journalReviewWeek)}`;
        const el = $('#classJournalReviewList');
        el.innerHTML = '<p class="text-muted">Loading...</p>';
        const [entries, roster] = await Promise.all([
            fetchClassJournalForClub(manageClassesScope, journalReviewWeek),
            fetchGymRoster(manageClassesScope)
        ]);
        journalReviewEntries = entries;
        journalReviewRoster = roster;
        if (!entries.length){ el.innerHTML = '<p class="text-muted">No journal entries for this week yet.</p>'; return; }
        const nameById = {}; roster.forEach(m=>nameById[m.id]=m.name||'Member');
        el.innerHTML = entries.map(en=>`<div style="padding:10px 0;border-bottom:1px solid var(--border);"><strong>${escapeHTML(nameById[en.userId]||'Member')}</strong><div style="font-size:13px;color:var(--text-secondary);margin-top:4px;white-space:pre-wrap;">${escapeHTML(en.text||'')}</div></div>`).join('');
    }
