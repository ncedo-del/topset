// ── admin-ui.js ───────────────────────────────────────
// HTML escaping + page navigation, auth/profile modals, Manage Tests
// (single global catalog, admin-only), Manage Clubs (admin), My Club
// panel (manager).
//
// TRAINING CLUB REBUILD (this chunk) — REMOVED ENTIRELY:
// - Official Results subsystem: fetchOfficialResults/renderOfficialResults/
//   officialResultsCache/refreshOfficialResults/openManagerEditEntry/
//   handleDeleteOfficialEntry, and the "Official Results Day" field on the
//   club panel. There's no official-result concept anymore.
// - Per-club custom test catalogs: openMyGymTests, manageTestsScope, the
//   "start from the default tests" bootstrap button. Manage Tests is now
//   ALWAYS the single global catalog — no scope to pick.
// - manageTestsOpenedFromMyGym back-navigation trick — nothing links to
//   Manage Tests from the club panel anymore, so there's nothing to
//   navigate back to.
//
// ADDED: My Club panel now links out to window.openManageClasses()
// (classes-ui.js) instead of the old "Test Catalog" button — that's where
// a manager's "full access to their club" actually lives now: classes,
// schedules, roster + attendance, weekly journal review.

    function escapeHTML(s){ const d=document.createElement('div'); d.textContent=s; return d.innerHTML.replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
    function navigateTo(page){ $$('.page').forEach(p=>p.classList.remove('active')); $$('.nav-tab').forEach(t=>t.classList.remove('active')); $$('.bottom-nav-item').forEach(t=>t.classList.remove('active')); $('#page-'+page).classList.add('active'); document.querySelector(`.nav-tab[data-page="${page}"]`)?.classList.add('active'); document.querySelector(`.bottom-nav-item[data-page="${page}"]`)?.classList.add('active'); if(page==='history') renderHistory(); if(page==='prs') renderPRs(); if(page==='leaderboard') renderLeaderboard(); if(page==='event') renderEventPage(); if(page==='log'){ updateStatsRow(); refreshMyClubInfo(); } }
    let authMode='signin';
    window.openAuthModal=(m='signin')=>{ authMode=m; $('#aboutModal').classList.add('hidden'); $('#authModal').classList.remove('hidden'); updateAuthModalUI(); };
    // Before About existed as the front door, Auth WAS the front door for a
    // signed-out visitor, so closing it had nowhere to send them — hence the
    // old dead-click behavior. Now About is always reachable behind it, so
    // the X can safely close Auth and fall back there instead of doing
    // nothing. Signed-in users (e.g. re-auth prompts) just close normally.
    window.closeAuthModal=()=>{ $('#authModal').classList.add('hidden'); if(!appState.currentUserId) window.openAboutModal(); };
    window.toggleAuthMode=()=>{ authMode=authMode==='signin'?'signup':'signin'; updateAuthModalUI(); };
    // The About overlay is the front door for every signed-out visit — see
    // updateUIForMode(), which opens this instead of the sign-in modal
    // directly any time there's no active session, not just the first time
    // a device is seen. seenAbout is still recorded (handy if we ever want
    // analytics on first-vs-repeat views) but no longer gates whether About
    // shows. The header "About" button also reopens it any time, signed in
    // or out. Closing it via the X (as opposed to via one of its own CTA
    // buttons, which navigate somewhere on purpose) falls back to the
    // sign-in modal for a signed-out visitor — otherwise dismissing it
    // would strand them on an empty shell with no visible way back in.
    window.openAboutModal=()=>{ localStorage.setItem(KEYS.seenAbout,'1'); $('#authModal').classList.add('hidden'); $('#aboutModal').classList.remove('hidden'); const stamp=$('#aboutBuildStamp'); if(stamp) stamp.textContent=BUILD_STAMP; };
    window.closeAboutModal=()=>{ $('#aboutModal').classList.add('hidden'); if(!appState.currentUserId && $('#authModal').classList.contains('hidden')) window.openAuthModal('signin'); };
    // Install instructions — auto-shown once right after a brand-new signup
    // (see the isNewUser branch in init()'s onAuthStateChanged), and always
    // reachable afterward via the link at the bottom of the About overlay.
    window.openInstallModal=()=>{ localStorage.setItem(KEYS.seenInstall,'1'); $('#installModal').classList.remove('hidden'); };
    window.closeInstallModal=()=>{ $('#installModal').classList.add('hidden'); };
    function updateAuthModalUI(){ if(authMode==='signin'){ $('#authModalTitle').innerHTML='<svg class="btn-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Sign In'; $('#authSubmitBtn').textContent='Sign In'; $('#authToggleBtn').textContent='Need an account? Sign Up'; $('#authNameGroup').classList.add('hidden'); $('#authAvatarGroup').classList.add('hidden'); $('#authAgeGroupGroup').classList.add('hidden'); $('#authGenderGroup').classList.add('hidden'); $('#authSportGroup').classList.add('hidden'); $('#authGymCodeGroup').classList.add('hidden'); $('#authCookieNotice').classList.add('hidden'); $('#forgotPasswordBtn').classList.remove('hidden'); } else { $('#authModalTitle').innerHTML='<svg class="btn-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg> Create Profile'; $('#authSubmitBtn').textContent='Sign Up'; $('#authToggleBtn').textContent='Already have an account? Sign In'; $('#authNameGroup').classList.remove('hidden'); $('#authAvatarGroup').classList.remove('hidden'); $('#authAgeGroupGroup').classList.remove('hidden'); $('#authGenderGroup').classList.remove('hidden'); $('#authSportGroup').classList.remove('hidden'); $('#authGymCodeGroup').classList.remove('hidden'); $('#authCookieNotice').classList.remove('hidden'); $('#forgotPasswordBtn').classList.add('hidden'); } }
    // NOTE: DOM ids below (#authGymCode, #authGymCodeGroup, #profileGymCode,
    // etc.) keep their old "Gym" names until the markup chunk (4f) renames
    // them — only what they MEAN changed (a club invite code now). Renaming
    // ids and JS in the same breath as HTML that doesn't exist yet would be
    // pure churn; this is the same "id names lag a rename" tradeoff core.js
    // already took with subscribeTests()/appState.myClub.
    window.handleAuthSubmit=async function(e){ return guardedSubmit(e, authMode==='signup' ? 'inviteCode' : 'signIn', authMode==='signup' ? RATE_LIMITS.inviteCode : 800, async()=>{
        const email=$('#authEmail').value.trim().toLowerCase(), pw=$('#authPassword').value;
        if(authMode==='signup'){
            const name=$('#authName').value.trim().slice(0,30)||email.split('@')[0], av=$('#authAvatar').value.trim().slice(0,4)||'🏋️';
            const ageGroup=$('#authAgeGroup').value, gender=$('#authGender').value, sport=$('#authSport').value.trim().slice(0,30), clubCode=$('#authGymCode').value.trim().slice(0,20);
            const fbUser = await signUp(email, pw, name, av, ageGroup, gender, sport, clubCode);
            if(!fbUser) return; // signUp() already showed a toast
            // onAuthStateChanged fires automatically and handles the rest
        } else {
            const fbUser = await signIn(email, pw);
            if(!fbUser) return; // signIn() already showed a toast
        }
    }); };
    window.handleForgotPassword = async function(){
        if (rateLimited('passwordReset', RATE_LIMITS.passwordReset)) return;
        const email=$('#authEmail').value.trim();
        if(!email) return showToast('Enter your email address first.');
        const sent = await sendPasswordReset(email);
        if(sent) showToast('Password reset email sent. Check your inbox.');
    };
    window.handleLogout = function(){ if(!auth) return; auth.signOut(); };
    window.handleGoogleAuth = async function(){
        const btn = $('#googleAuthBtn');
        await guardedClick(btn, 'googleAuth', RATE_LIMITS.googleAuth, async()=>{
            const user = await signInWithGoogle();
            if (user) closeAuthModal(); // onAuthStateChanged handles profile load + welcome toast
        });
    };
    // Profile editing
    window.openEditProfileModal = async function(){ if(!appState.currentUserId){ showToast('Please sign in first.'); return; } const user=getCurrentUser(); if(user){ $('#profileName').value=user.name||''; $('#profileAvatar').value=user.avatar||'🏋️'; $('#profileAgeGroup').value=user.ageGroup||''; $('#profileGender').value=user.gender||''; $('#profileSport').value=user.sport||''; $('#profilePassword').value=''; $('#profileGymCode').value=''; const statusEl=$('#profileGymStatus'); const leaveBtn=$('#leaveGymBtn'); if(user.clubId){ statusEl.textContent='Loading...'; const club=await getClubById(user.clubId); statusEl.innerHTML = club ? `<svg style="width:12px;height:12px;vertical-align:-1px;margin-right:3px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>Member of ${escapeHTML(club.name)}` : '<svg style="width:12px;height:12px;vertical-align:-1px;margin-right:3px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><path d="M12 9v4M12 17h.01"/></svg>Club not found'; $('#profileGymCode').placeholder='Enter a new code to switch clubs'; leaveBtn.classList.remove('hidden'); } else { statusEl.textContent='(not in a club yet)'; $('#profileGymCode').placeholder='Enter invite code to join a club'; leaveBtn.classList.add('hidden'); } $('#editProfileModal').classList.remove('hidden'); } };
    // Leaving is forward-only, matching how joining works: it clears clubId on the
    // profile so the member drops off the club's roster, but does NOT
    // retroactively rewrite past entries/check-ins — those stay as an honest
    // history of what actually happened.
    window.handleLeaveClub = async function(){
        if (!appState.currentUserId) return;
        const user = getCurrentUser();
        if (!user?.clubId) return;
        const club = await getClubById(user.clubId);
        const clubName = club ? club.name : 'this club';
        if (!confirm(`Leave ${clubName}? Your past check-ins and journal entries stay recorded, but you'll drop off its roster and won't see its classes until you rejoin.`)) return;
        const ok = await updateUserProfile(appState.currentUserId, { clubId: null });
        if (!ok) return;
        appState.currentUser = { ...appState.currentUser, clubId: null };
        // Re-run the club-dependent UI immediately — otherwise the Club tab
        // would keep showing the old (now stale) club until the user
        // happened to navigate away and back.
        await refreshMyClubInfo();
        showToast(`Left ${clubName}.`);
        closeEditProfileModal();
        renderLeaderboard();
    };
    window.closeEditProfileModal = function(){ $('#editProfileModal').classList.add('hidden'); };
    // Manage Tests — admin-only, single flat global catalog now. No more
    // scope picker: there's only ever one catalog to edit.
    window.openManageTests = async function(){
        if(!getCurrentUser()?.isAdmin) return;
        $('#newTestName').value=''; $('#newTestIsTime').checked=false; $('#newTestUnit').value=''; $('#newTestHigherBetter').checked=true; $('#newTestPlaceholder').value=''; handleNewTestTimeToggle();
        manageTestsCache = await fetchAllTests();
        renderManageTestsList();
        $('#manageTestsModal').classList.remove('hidden');
    };
    window.closeManageTests = function(){ $('#manageTestsModal').classList.add('hidden'); };
    window.openManageGyms = async function(){
        if(!getCurrentUser()?.isAdmin) return;
        $('#manageGymsList').innerHTML='<p class="text-muted">Loading...</p>';
        $('#newGymName').value=''; $('#newGymTier').value='small';
        $('#manageGymsModal').classList.remove('hidden');
        const clubs = await fetchAllClubs();
        await renderManageClubsList(clubs);
    };
    window.closeManageGyms = function(){ $('#manageGymsModal').classList.add('hidden'); };
    let manageClubsCache = []; // holds the last-fetched list so edit/cancel toggles don't need a re-fetch
    async function renderManageClubsList(clubs){
        manageClubsCache = clubs;
        const el=$('#manageGymsList');
        if (!clubs.length){ el.innerHTML='<p class="text-muted">No clubs yet — create one below.</p>'; return; }
        // Render immediately with placeholders, then fill in member counts as
        // they resolve — avoids blocking the whole list on N count queries.
        el.innerHTML = clubs.map(c=>{
            const t = tierInfo(c.tier);
            return `<div id="gymRow-${c.id}" style="padding:10px 0;border-bottom:1px solid var(--border);"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;"><strong>${escapeHTML(c.name)}</strong><span class="badge ${c.subscriptionStatus==='active'?'badge-green':'badge-new'}">${escapeHTML(c.subscriptionStatus||'trial')}</span></div><div style="font-size:12px;color:var(--text-muted);margin-top:2px;">${escapeHTML(t.label)} · <span id="gymCount-${c.id}">…</span>/${t.cap} members${c.ownerEmail?` · Manager: ${escapeHTML(c.ownerEmail)}`:' · No manager assigned'}</div><div style="display:flex;align-items:center;gap:8px;margin-top:6px;flex-wrap:wrap;"><code style="font-size:13px;background:var(--bg-input);padding:4px 10px;border-radius:6px;letter-spacing:0.5px;">${escapeHTML(c.inviteCode)}</code><button type="button" class="row-action-btn" onclick="window.handleCopyInviteCode('${escapeHTML(c.inviteCode)}')">Copy</button><button type="button" class="row-action-btn" onclick="window.toggleClubEdit('${c.id}')">Edit</button></div></div>`;
        }).join('');
        clubs.forEach(async c=>{ const count = await getMemberCount(c.id); const cEl = $(`#gymCount-${c.id}`); if (cEl) cEl.textContent = count; });
    }
    window.toggleClubEdit = function(clubId){
        const club = manageClubsCache.find(c => c.id === clubId);
        if (!club) return;
        const row = $(`#gymRow-${clubId}`);
        row.innerHTML = `<div class="form-group" style="margin-bottom:8px;"><label>Club Name</label><input type="text" id="editGymName-${clubId}" value="${escapeHTML(club.name)}" maxlength="60"></div><div class="form-group" style="margin-bottom:8px;"><label>Tier</label><select id="editGymTier-${clubId}"><option value="small" ${club.tier==='small'||!club.tier?'selected':''}>Small — 50 members</option><option value="medium" ${club.tier==='medium'?'selected':''}>Medium — 126 members</option><option value="large" ${club.tier==='large'?'selected':''}>Large — 250 members</option><option value="xlarge" ${club.tier==='xlarge'?'selected':''}>Extra Large — 520 members</option></select></div><div class="form-group" style="margin-bottom:8px;"><label>Subscription Status</label><select id="editGymStatus-${clubId}"><option value="trial" ${club.subscriptionStatus==='trial'?'selected':''}>Trial</option><option value="active" ${club.subscriptionStatus==='active'?'selected':''}>Active</option><option value="inactive" ${club.subscriptionStatus==='inactive'?'selected':''}>Inactive</option></select></div><div class="form-group" style="margin-bottom:8px;"><label>Club Manager (email)</label><input type="text" id="editGymManagerEmail-${clubId}" placeholder="manager@example.com" value="${club.ownerEmail?escapeHTML(club.ownerEmail):''}">${club.ownerUserId?`<button type="button" class="row-action-btn danger" style="margin-top:6px;width:fit-content;" onclick="window.handleRemoveClubManager('${clubId}','${club.ownerUserId}')">Remove manager</button>`:''}</div><div style="display:flex;gap:8px;flex-wrap:wrap;"><button type="button" class="btn btn-outline btn-sm" onclick="window.openManageGyms()">Cancel</button><button type="button" class="btn btn-primary btn-sm" onclick="window.handleSaveClubEdit('${clubId}')">Save</button></div>`;
    };
    window.handleSaveClubEdit = async function(clubId){
        if (rateLimited('adminWrite', RATE_LIMITS.adminWrite)) return;
        const newName = $(`#editGymName-${clubId}`).value.trim().slice(0,60);
        const newTier = $(`#editGymTier-${clubId}`).value;
        const newStatus = $(`#editGymStatus-${clubId}`).value;
        const managerEmailInput = $(`#editGymManagerEmail-${clubId}`).value.trim();
        if (!newName) return showToast('Club name cannot be empty.');
        const ok = await updateClub(clubId, { name: newName, tier: newTier, subscriptionStatus: newStatus });
        if (!ok) return;
        const club = manageClubsCache.find(c => c.id === clubId);
        // Only touch the manager assignment if the email field actually changed —
        // avoids re-running a lookup + write on every unrelated save.
        if (managerEmailInput && managerEmailInput.toLowerCase() !== (club?.ownerEmail||'').toLowerCase()){
            await assignClubManager(clubId, managerEmailInput);
        } else if (!managerEmailInput && club?.ownerUserId){
            await removeClubManager(clubId, club.ownerUserId);
        }
        showToast('Club updated.');
        const clubs = await fetchAllClubs();
        renderManageClubsList(clubs);
    };
    window.handleRemoveClubManager = async function(clubId, managerUid){
        if (!confirm('Remove this club\'s manager? They will lose access to manage it.')) return;
        await removeClubManager(clubId, managerUid);
        const clubs = await fetchAllClubs();
        renderManageClubsList(clubs);
    };
    window.handleCopyInviteCode = async function(code){
        try { await navigator.clipboard.writeText(code); showToast(`Copied ${code}`); }
        catch(err){ showToast('Could not copy — select and copy the code manually.'); }
    };
    window.handleAddGymSubmit = async function(e){ return guardedSubmit(e, 'adminWrite', RATE_LIMITS.adminWrite, async()=>{
        const name = $('#newGymName').value.trim().slice(0,60);
        const tier = $('#newGymTier').value;
        if (!name) return showToast('Please enter a club name.');
        const club = await createClub(name, tier);
        if (!club) return; // createClub() already showed a toast on failure
        showToast(`"${club.name}" created! Invite code: ${club.inviteCode}`);
        $('#addGymForm').reset();
        const clubs = await fetchAllClubs();
        renderManageClubsList(clubs);
    }); };
    window.handleNewTestTimeToggle = function(){ const isTime=$('#newTestIsTime').checked; $('#newTestUnitGroup').classList.toggle('hidden', isTime); };

    // ── "My Club" panel — the sub-admin / club manager's own scoped view ───
    // Name + roster editable client-side; tier/status/invite-code
    // regeneration stay admin-only, both here (no controls for them) and
    // in the rules. Classes/schedules/roster-attendance/journal review all
    // live in classes-ui.js now (window.openManageClasses()) — this panel
    // just links out to that, same as it used to link to Manage Tests.
    let myGymCache = null;
    window.openMyGym = async function(){
        const u = getCurrentUser();
        if (!u?.managesClubId) return;
        $('#myGymRosterList').innerHTML = '<p class="text-muted" style="padding:8px;">Loading...</p>';
        $('#myGymModal').classList.remove('hidden');
        const club = await getClubById(u.managesClubId);
        if (!club){ showToast('Could not load your club.'); closeMyGym(); return; }
        myGymCache = club;
        $('#myGymName').value = club.name;
        $('#myGymInviteCode').textContent = club.inviteCode;
        const t = tierInfo(club.tier);
        const count = await getMemberCount(club.id);
        $('#myGymTierInfo').textContent = `${t.label} plan · ${count}/${t.cap} members`;
        const roster = await fetchClubRoster(club.id);
        renderClubRoster(roster);
    };
    window.closeMyGym = function(){ $('#myGymModal').classList.add('hidden'); myGymCache = null; };
    async function fetchClubRoster(clubId){
        if (!initFirebase()) return [];
        try {
            const snap = await db.collection('users').where('clubId','==',clubId).get();
            const list = [];
            snap.forEach(doc=>list.push({ id:doc.id, ...doc.data() }));
            list.sort((a,b)=>(a.name||'').localeCompare(b.name||''));
            return list;
        } catch(err){ console.error('fetchClubRoster failed:', err); showToast('Could not load your club\'s member list.'); return []; }
    }
    // classes-ui.js's roster/attendance/journal-review screens call this
    // same function (still named fetchGymRoster there per its own naming
    // note) — kept as an alias so both files resolve to one implementation
    // rather than two copies drifting apart.
    async function fetchGymRoster(clubId){ return fetchClubRoster(clubId); }
    function renderClubRoster(members){
        const el = $('#myGymRosterList');
        if (!members.length){ el.innerHTML = '<p class="text-muted" style="padding:8px;">No members yet — share your invite code to get started.</p>'; return; }
        el.innerHTML = members.map(m=>`<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 4px;border-bottom:1px solid var(--border);"><span><span class="avatar-circle" style="width:28px;height:28px;font-size:14px;display:inline-flex;vertical-align:-8px;margin-right:8px;">${escapeHTML(m.avatar||'🏋️')}</span><strong>${escapeHTML(m.name||'Member')}</strong></span><button type="button" class="row-action-btn danger" title="Remove from club" onclick="window.handleRemoveClubMember('${m.id}','${escapeHTML((m.name||'this member').replace(/'/g,"\\'"))}')"><svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg></button></div>`).join('');
    }
    window.handleSaveMyGymName = async function(){
        if (!myGymCache) return;
        const newName = $('#myGymName').value.trim();
        if (!newName) return showToast('Club name cannot be empty.');
        // Only ever sends {name} — the rules only permit a club manager to touch
        // this one field, so this call must not bundle anything else in.
        const ok = await updateClub(myGymCache.id, { name: newName });
        if (!ok) return;
        myGymCache.name = newName;
        showToast('Club name updated.');
    };
    window.handleRemoveClubMember = async function(memberUid, memberName){
        if (!myGymCache) return;
        if (!confirm(`Remove ${memberName} from your club? Their past check-ins and journal entries stay recorded, but they'll drop off your roster.`)) return;
        const ok = await removeMemberFromClub(memberUid);
        if (!ok) return;
        showToast(`${memberName} removed from your club.`);
        const roster = await fetchClubRoster(myGymCache.id);
        renderClubRoster(roster);
        const count = await getMemberCount(myGymCache.id);
        const t = tierInfo(myGymCache.tier);
        $('#myGymTierInfo').textContent = `${t.label} plan · ${count}/${t.cap} members`;
    };
    window.handleCopyMyInviteCode = async function(){
        if (!myGymCache) return;
        try { await navigator.clipboard.writeText(myGymCache.inviteCode); showToast(`Copied ${myGymCache.inviteCode}`); }
        catch(err){ showToast('Could not copy — select and copy the code manually.'); }
    };
    function renderManageTestsList(){
        const el=$('#manageTestsList');
        if(!manageTestsCache.length){
            el.innerHTML = '<p class="text-muted" style="text-align:center;padding:12px;">No tests yet.</p>';
            return;
        }
        el.innerHTML = manageTestsCache.map(t=>`<div class="row-actions" style="justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);"><span><strong>${escapeHTML(t.name)}</strong> <span class="text-muted">(${t.unit==='time'?'mm:ss':escapeHTML(t.unit)})</span></span><button class="row-action-btn danger" title="Remove" onclick="window.handleDeleteTest('${t.id}')"><svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg></button></div>`).join('');
    }
    window.handleAddTestSubmit = async function(e){ return guardedSubmit(e, 'adminWrite', RATE_LIMITS.adminWrite, async()=>{
        const name=$('#newTestName').value.trim().slice(0,40);
        if(!name) return showToast('Please enter a test name.');
        if(manageTestsCache.find(t=>t.name.toLowerCase()===name.toLowerCase())) return showToast('A test with that name already exists.');
        const isTime=$('#newTestIsTime').checked; const higherIsBetter=$('#newTestHigherBetter').checked; const placeholder=$('#newTestPlaceholder').value.trim().slice(0,12);
        const data = isTime
            ? { name, unit:'time', inputType:'text', higherIsBetter, placeholder:placeholder||'12:30' }
            : { name, unit:$('#newTestUnit').value.trim().slice(0,12)||'units', inputType:'number', higherIsBetter, placeholder:placeholder||'0' };
        const id = await createTest(data);
        if(!id) return;
        showToast(`"${name}" added.`);
        $('#addTestForm').reset(); handleNewTestTimeToggle();
        manageTestsCache = await fetchAllTests();
        renderManageTestsList();
        // Live listener (see subscribeTests in core.js) already tracks the
        // single global catalog — it'll reflect the new test on its own.
    }); };
    window.handleDeleteTest = async function(id){
        const t=manageTestsCache.find(x=>x.id===id); const name=t?t.name:'this test';
        if(!confirm(`Remove "${name}" from the test list? Existing logged results for it are kept, but it won't be loggable anymore.`)) return;
        if(await deleteTestDoc(id)){
            showToast(`"${name}" removed.`);
            manageTestsCache = await fetchAllTests();
            renderManageTestsList();
        }
    };
    window.handleEditProfileSubmit = async function(e){ return guardedSubmit(e, 'profileSave', RATE_LIMITS.profileSave, async()=>{ if(!appState.currentUserId) return; const newName=$('#profileName').value.trim().slice(0,30); const newAvatar=$('#profileAvatar').value.trim().slice(0,4)||'🏋️'; const newAgeGroup=$('#profileAgeGroup').value; const newGender=$('#profileGender').value; const newSport=$('#profileSport').value.trim().slice(0,30); const newPw=$('#profilePassword').value.trim(); const clubCodeInput=$('#profileGymCode').value.trim().slice(0,20); if(!newName) return showToast('Name cannot be empty.'); if(newPw.length>0 && newPw.length<6) return showToast('Password must be at least 6 characters.'); const updates={ name:newName, avatar:newAvatar, ageGroup:newAgeGroup||null, gender:newGender||null, sport:newSport||null };
        // Only touch clubId if the user actually typed something — leaving the field
        // blank means "no change," not "leave my club."
        let joinedNewClub=false;
        if (clubCodeInput){
            // Throttled separately (not just by the outer guardedSubmit spacing) —
            // an invite code lookup is effectively a guess against a small
            // keyspace (TOPSET-XXXXXX, 6 chars from a 32-char alphabet), so this
            // is the one spot in the app closest to a credential-guessing
            // endpoint. Firestore itself won't rate-limit these reads.
            if (rateLimited('inviteCode', RATE_LIMITS.inviteCode)) return;
            const club = await findClubByInviteCode(clubCodeInput);
            if (!club){ showToast('Club invite code not recognized.'); return; }
            const capacity = await checkClubCapacity(club);
            if (capacity.full){ showToast(`This club is at its ${capacity.cap}-member limit. Contact the club manager to see if a spot opens up.`); return; }
            updates.clubId = club.id;
            // The rules require this on any write that changes clubId to a
            // non-null value, checked against that club's real stored
            // inviteCode. Without it, clubId would be a plain self-editable
            // field with NO server-side membership check at all — any
            // signed-in user could set their own clubId to any club's ID
            // directly via a raw Firestore write, no invite code needed. It
            // stays on the profile afterward as a harmless join-audit trail
            // (invite codes aren't secret credentials — club managers hand
            // them out freely via the Copy button).
            updates.claimedInviteCode = club.inviteCode;
            joinedNewClub = true;
        }
        const ok = await updateUserProfile(appState.currentUserId, updates); if(!ok) return; if(newPw){ try { await auth.currentUser.updatePassword(newPw); } catch(err){ if(err.code==='auth/requires-recent-login') return showToast('Please sign out and back in before changing your password.'); showToast('Password update failed.'); return; } } appState.currentUser={ ...appState.currentUser, ...updates }; updateUIForMode(); await updateCloudProfileInfo();
        if (joinedNewClub){
            // Same reasoning as handleLeaveClub: re-run club-dependent UI now, so
            // the Club tab reflects the new club immediately instead of waiting
            // for the next Log page visit.
            await refreshMyClubInfo();
        }
        showToast(joinedNewClub ? 'Joined club! Check the Club tab in your Streak modal to see its classes.' : 'Profile updated successfully!'); closeEditProfileModal(); renderLeaderboard(); }); };
