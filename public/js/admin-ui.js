// ── admin-ui.js ───────────────────────────────────────
// HTML escaping + page navigation, auth/profile modals, Manage Tests,
// Manage Gyms (admin), My Gym panel (manager), official results
// review.

    // ── Avatar icon picker (used by Sign Up and Edit Profile) ──────────────
    function buildAvatarPicker(pickerSel, inputSel){
        const el=$(pickerSel); if(!el) return;
        el.innerHTML = Object.keys(AVATAR_ICONS).map(k=>`<button type="button" class="avatar-pick-btn" data-key="${k}" title="${AVATAR_ICONS[k].label}" aria-label="${AVATAR_ICONS[k].label}">${avatarIconSVG(k,22)}</button>`).join('');
        el.addEventListener('click', e=>{ const b=e.target.closest('.avatar-pick-btn'); if(b) setAvatarPickerValue(pickerSel, inputSel, b.dataset.key); });
        setAvatarPickerValue(pickerSel, inputSel, $(inputSel)?.value);
    }
    function setAvatarPickerValue(pickerSel, inputSel, key){
        key = avatarKey(key);
        const input=$(inputSel); if(input) input.value=key;
        $(pickerSel)?.querySelectorAll('.avatar-pick-btn').forEach(b=>b.classList.toggle('active', b.dataset.key===key));
    }
    // ── Sport dropdowns ────────────────────────────────────────────────────
    // Fills a <select> from the ADMIN-MANAGED sports list (core.js getSportNames(),
    // backed by the `sports` collection). The same list feeds the signup/Edit Profile
    // picker, the Athlete Profile picker and each test's sport tag — one shared
    // vocabulary is what makes the profile-sport <-> test-sport filter actually match.
    // If currentValue isn't in the list (a free-text sport from before this was a
    // dropdown, or a sport an admin later removed) it's kept as an extra "(custom)"
    // option instead of being silently dropped, so nobody's existing sport gets wiped.
    function populateSportSelect(selectEl, currentValue, emptyLabel){
        if (!selectEl) return;
        const names = getSportNames();
        const custom = currentValue && !names.includes(currentValue) ? [currentValue] : [];
        selectEl.innerHTML = `<option value="">${escapeHTML(emptyLabel || 'No sport selected')}</option>`
            + custom.map(x=>`<option value="${escapeHTML(x)}">${escapeHTML(x)} (custom)</option>`).join('')
            + names.map(x=>`<option value="${escapeHTML(x)}">${escapeHTML(x)}</option>`).join('');
        selectEl.value = currentValue || '';
    }
    // Re-fills every sport dropdown on the page (keeping what's currently picked)
    // whenever the sports list changes — wired as the subscribeSports() callback.
    window.refreshSportSelects = function(){
        [['#authSport','No sport selected'],['#profileSport','No sport selected'],['#athleteProfileSport','No sport selected'],['#newTestSport','General (visible to everyone)']].forEach(([sel,label])=>{
            const el=$(sel); if (el) populateSportSelect(el, el.value, label);
        });
        if (!$('#manageSportsModal')?.classList.contains('hidden')) renderManageSportsList();
        if (!$('#manageTestsModal')?.classList.contains('hidden')) renderManageTestsList();
        if (typeof populateLogTestSelect==='function'){ populateLogTestSelect(); populatePublicLogTestSelect(); updateSpotlightSelect(); }
    };
    function escapeHTML(s){ const d=document.createElement('div'); d.textContent=s; return d.innerHTML.replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
    function navigateTo(page){ $$('.page').forEach(p=>p.classList.remove('active')); $$('.nav-tab').forEach(t=>t.classList.remove('active')); $$('.bottom-nav-item').forEach(t=>t.classList.remove('active')); $('#page-'+page)?.classList.add('active'); document.querySelector(`.nav-tab[data-page="${page}"]`)?.classList.add('active'); document.querySelector(`.bottom-nav-item[data-page="${page}"]`)?.classList.add('active'); if(page==='history') renderHistory(); if(page==='prs') renderPRs(); if(page==='leaderboard') renderLeaderboard(); if(page==='event') renderEventPage(); if(page==='log'){ updateStatsRow(); refreshMyGymInfo().then(updateOfficialAvailability); } }
    let authMode='signin';
    window.openAuthModal=(m='signin')=>{ authMode=m; populateSportSelect($('#authSport'), $('#authSport')?.value||'', 'No sport selected'); $('#aboutModal').classList.add('hidden'); $('#authModal').classList.remove('hidden'); updateAuthModalUI(); };
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
    function updateAuthModalUI(){ if(authMode==='signin'){ $('#authModalTitle').innerHTML='<svg class="btn-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Sign In'; $('#authSubmitBtn').textContent='Sign In'; $('#authToggleBtn').textContent='Need an account? Sign Up'; $('#authNameGroup').classList.add('hidden'); $('#authAvatarGroup').classList.add('hidden'); $('#authAgeGroupGroup').classList.add('hidden'); $('#authGenderGroup').classList.add('hidden'); $('#authSportGroup').classList.add('hidden'); $('#authGymCodeGroup').classList.add('hidden'); $('#authCookieNotice').classList.add('hidden'); $('#forgotPasswordBtn').classList.remove('hidden'); } else { $('#authModalTitle').innerHTML='<svg class="btn-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg> Create Profile'; $('#authSubmitBtn').textContent='Sign Up'; $('#authToggleBtn').textContent='Already have an account? Sign In'; $('#authNameGroup').classList.remove('hidden'); $('#authAvatarGroup').classList.remove('hidden'); $('#authAgeGroupGroup').classList.remove('hidden'); $('#authGenderGroup').classList.remove('hidden'); $('#authSportGroup').classList.remove('hidden'); $('#authGymCodeGroup').classList.remove('hidden'); $('#authCookieNotice').classList.remove('hidden'); $('#forgotPasswordBtn').classList.add('hidden'); } if(typeof window.applyType==='function') window.applyType(); }
    window.handleAuthSubmit=async function(e){ return guardedSubmit(e, authMode==='signup' ? 'inviteCode' : 'signIn', authMode==='signup' ? RATE_LIMITS.inviteCode : 800, async()=>{
        const email=$('#authEmail').value.trim().toLowerCase(), pw=$('#authPassword').value;
        if(authMode==='signup'){
            const name=$('#authName').value.trim().slice(0,30)||email.split('@')[0], av=avatarKey($('#authAvatar').value);
            const ageGroup=$('#authAgeGroup').value, gender=$('#authGender').value, sport=$('#authSport').value.trim().slice(0,60), gymCode=$('#authGymCode').value.trim().slice(0,20);
            const birthYear = parseInt(($('#authBirthYear')||{}).value, 10);
            const fbUser = await signUp(email, pw, name, av, ageGroup, gender, sport, gymCode, birthYear);
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
    // NEW: Profile editing
    window.openEditProfileModal = async function(){ if(!appState.currentUserId){ showToast('Please sign in first.'); return; } const user=getCurrentUser(); if(user){ $('#profileName').value=user.name||''; setAvatarPickerValue('#profileAvatarPicker','#profileAvatar',user.avatar); $('#profileAgeGroup').value=user.ageGroup||''; $('#profileGender').value=user.gender||''; populateSportSelect($('#profileSport'), user.sport||'', 'No sport selected'); $('#profilePassword').value=''; $('#profileGymCode').value=''; const statusEl=$('#profileGymStatus'); const leaveBtn=$('#leaveGymBtn'); if(user.gymId){ statusEl.textContent='Loading...'; const gym=await getGymById(user.gymId); statusEl.innerHTML = gym ? `<svg style="width:12px;height:12px;vertical-align:-1px;margin-right:3px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>Member of ${escapeHTML(gym.name)}` : '<svg style="width:12px;height:12px;vertical-align:-1px;margin-right:3px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><path d="M12 9v4M12 17h.01"/></svg>Gym not found'; $('#profileGymCode').placeholder='Enter a new code to switch gyms'; leaveBtn.classList.remove('hidden'); } else { statusEl.textContent='(not in a gym yet)'; $('#profileGymCode').placeholder='Enter invite code to join a gym'; leaveBtn.classList.add('hidden'); } $('#editProfileModal').classList.remove('hidden'); } };
    // Leaving is forward-only, matching how joining works: it clears gymId on the
    // profile so future entries/leaderboard rows go to the public pool, but does NOT
    // retroactively rewrite past entries — those stay tagged to the gym they were
    // actually logged under, preserving an honest history rather than silently
    // erasing which gym a past PR belonged to.
    window.handleLeaveGym = async function(){
        if (!appState.currentUserId) return;
        const user = getCurrentUser();
        if (!user?.gymId) return;
        const gym = await getGymById(user.gymId);
        const gymName = gym ? gym.name : 'this gym';
        if (!confirm(`Leave ${gymName}? Your past results stay recorded, but you'll drop off its leaderboard and future results won't count toward it until you rejoin.`)) return;
        const ok = await updateUserProfile(appState.currentUserId, { gymId: null });
        if (!ok) return;
        appState.currentUser = { ...appState.currentUser, gymId: null };
        // Re-run the gym-dependent UI immediately — otherwise the public Log
        // form and the gym badge would keep showing the old (now stale) gym
        // until the user happened to navigate away from Log and back.
        await refreshMyGymInfo();
        subscribeTests(null, ()=>{ populateLogTestSelect(); updateSpotlightSelect(); populatePublicLogTestSelect(); });
        updateOfficialAvailability();
        showToast(`Left ${gymName}.`);
        closeEditProfileModal();
        renderLeaderboard();
    };
    window.closeEditProfileModal = function(){ $('#editProfileModal').classList.add('hidden'); };
    window.openManageTests = async function(){
        if(!getCurrentUser()?.isAdmin) return;
        manageTestsScope = null; // the shared default catalog
        // Sport tagging only applies to the shared/global catalog — a gym's own custom
        // tests (openMyGymTests below) aren't sport-scoped, so that field stays hidden there.
        $('#newTestSportGroup').classList.remove('hidden');
        populateSportSelect($('#newTestSport'), '', 'General (visible to everyone)');
        $('#newTestName').value=''; $('#newTestIsTime').checked=false; $('#newTestUnit').value=''; $('#newTestHigherBetter').checked=true; $('#newTestPlaceholder').value=''; handleNewTestTimeToggle();
        $('#manageTestsModalScope').textContent = 'Default Catalog';
        manageTestsCache = await fetchTestsForScope(null);
        renderManageTestsList();
        $('#manageTestsModal').classList.remove('hidden');
    };
    // Tracks whether Manage Tests was opened FROM My Gym (as opposed to the
    // admin header button), so closing it can drill back to My Gym instead
    // of leaving the user on a blank background. Also fixes a real stacking
    // bug: manageTestsModal sits earlier in the DOM than myGymModal, so with
    // both .modal-overlay elements at the same z-index, myGymModal (later in
    // the DOM) was painting ON TOP of manageTestsModal whenever both were
    // left visible at once — the modal appeared to open "behind" My Gym.
    // Hiding My Gym before showing Manage Tests avoids the ambiguity entirely
    // rather than relying on z-index ordering between two overlays that can
    // each be opened independently.
    let manageTestsOpenedFromMyGym = false;
    window.closeManageTests = function(){
        $('#manageTestsModal').classList.add('hidden');
        manageTestsScope=null;
        if (manageTestsOpenedFromMyGym){
            manageTestsOpenedFromMyGym = false;
            window.openMyGym();
        }
    };
    // Gym manager's own equivalent of openManageTests, scoped to the one gym
    // they manage. The subscription check here is a UX convenience — the
    // real gate is the gymSubscriptionActive() check in the tests.create/
    // update/delete rules, so even a forced-open modal can't write past it.
    window.openMyGymTests = async function(){
        const u = getCurrentUser();
        if (!u?.managesGymId) return;
        const gym = myGymCache || await getGymById(u.managesGymId);
        if (!gym) return;
        if (gym.subscriptionStatus !== 'active'){
            showToast('Custom tests unlock once your gym\'s subscription is active — contact TOPSET support to upgrade.');
            return;
        }
        $('#myGymModal').classList.add('hidden');
        manageTestsOpenedFromMyGym = true;
        manageTestsScope = gym.id;
        $('#newTestSportGroup').classList.add('hidden');
        $('#newTestName').value=''; $('#newTestIsTime').checked=false; $('#newTestUnit').value=''; $('#newTestHigherBetter').checked=true; $('#newTestPlaceholder').value=''; handleNewTestTimeToggle();
        $('#manageTestsModalScope').textContent = `${gym.name}'s Tests`;
        manageTestsCache = await fetchTestsForScope(gym.id);
        renderManageTestsList();
        $('#manageTestsModal').classList.remove('hidden');
    };
    window.openManageGyms = async function(){
        if(!getCurrentUser()?.isAdmin) return;
        $('#manageGymsList').innerHTML='<p class="text-muted">Loading...</p>';
        $('#newGymName').value=''; $('#newGymTier').value='small';
        $('#manageGymsModal').classList.remove('hidden');
        const gyms = await fetchAllGyms();
        await renderManageGymsList(gyms);
    };
    window.closeManageGyms = function(){ $('#manageGymsModal').classList.add('hidden'); };
    let manageGymsCache = []; // holds the last-fetched list so edit/cancel toggles don't need a re-fetch
    async function renderManageGymsList(gyms){
        manageGymsCache = gyms;
        const el=$('#manageGymsList');
        if (!gyms.length){ el.innerHTML='<p class="text-muted">No gyms yet — create one below.</p>'; return; }
        // Render immediately with placeholders, then fill in member counts as
        // they resolve — avoids blocking the whole list on N count queries.
        el.innerHTML = gyms.map(g=>{
            const t = tierInfo(g.tier);
            return `<div id="gymRow-${g.id}" style="padding:10px 0;border-bottom:1px solid var(--border);"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;"><strong>${escapeHTML(g.name)}</strong><span class="badge ${g.subscriptionStatus==='active'?'badge-green':'badge-new'}">${escapeHTML(g.subscriptionStatus||'trial')}</span></div><div style="font-size:12px;color:var(--text-muted);margin-top:2px;">${escapeHTML(t.label)} · <span id="gymCount-${g.id}">…</span>/${t.cap} members${g.ownerEmail?` · Manager: ${escapeHTML(g.ownerEmail)}`:' · No manager assigned'}</div><div style="display:flex;align-items:center;gap:8px;margin-top:6px;flex-wrap:wrap;"><code style="font-size:13px;background:var(--bg-input);padding:4px 10px;border-radius:6px;letter-spacing:0.5px;">${escapeHTML(g.inviteCode)}</code><button type="button" class="row-action-btn" onclick="window.handleCopyInviteCode('${escapeHTML(g.inviteCode)}')">Copy</button><button type="button" class="row-action-btn" onclick="window.toggleGymEdit('${g.id}')">Edit</button></div></div>`;
        }).join('');
        gyms.forEach(async g=>{ const count = await getMemberCount(g.id); const cEl = $(`#gymCount-${g.id}`); if (cEl) cEl.textContent = count; });
    }
    window.toggleGymEdit = function(gymId){
        const gym = manageGymsCache.find(g => g.id === gymId);
        if (!gym) return;
        const row = $(`#gymRow-${gymId}`);
        row.innerHTML = `<div class="form-group" style="margin-bottom:8px;"><label>Gym Name</label><input type="text" id="editGymName-${gymId}" value="${escapeHTML(gym.name)}" maxlength="60"></div><div class="form-group" style="margin-bottom:8px;"><label>Tier</label><select id="editGymTier-${gymId}"><option value="small" ${gym.tier==='small'||!gym.tier?'selected':''}>Small — 50 members</option><option value="medium" ${gym.tier==='medium'?'selected':''}>Medium — 126 members</option><option value="large" ${gym.tier==='large'?'selected':''}>Large — 250 members</option><option value="xlarge" ${gym.tier==='xlarge'?'selected':''}>Extra Large — 520 members</option></select></div><div class="form-group" style="margin-bottom:8px;"><label>Subscription Status</label><select id="editGymStatus-${gymId}"><option value="trial" ${gym.subscriptionStatus==='trial'?'selected':''}>Trial</option><option value="active" ${gym.subscriptionStatus==='active'?'selected':''}>Active</option><option value="inactive" ${gym.subscriptionStatus==='inactive'?'selected':''}>Inactive</option></select></div><div class="form-group" style="margin-bottom:8px;"><label>Gym Manager (email)</label><input type="text" id="editGymManagerEmail-${gymId}" placeholder="manager@example.com" value="${gym.ownerEmail?escapeHTML(gym.ownerEmail):''}">${gym.ownerUserId?`<button type="button" class="row-action-btn danger" style="margin-top:6px;width:fit-content;" onclick="window.handleRemoveGymManager('${gymId}','${gym.ownerUserId}')">Remove manager</button>`:''}</div><div style="display:flex;gap:8px;flex-wrap:wrap;"><button type="button" class="btn btn-outline btn-sm" onclick="window.openManageGyms()">Cancel</button><button type="button" class="btn btn-primary btn-sm" onclick="window.handleSaveGymEdit('${gymId}')">Save</button></div>`;
    };
    window.handleSaveGymEdit = async function(gymId){
        if (rateLimited('adminWrite', RATE_LIMITS.adminWrite)) return;
        const newName = $(`#editGymName-${gymId}`).value.trim().slice(0,60);
        const newTier = $(`#editGymTier-${gymId}`).value;
        const newStatus = $(`#editGymStatus-${gymId}`).value;
        const managerEmailInput = $(`#editGymManagerEmail-${gymId}`).value.trim();
        if (!newName) return showToast('Gym name cannot be empty.');
        const ok = await updateGym(gymId, { name: newName, tier: newTier, subscriptionStatus: newStatus });
        if (!ok) return;
        const gym = manageGymsCache.find(g => g.id === gymId);
        // Only touch the manager assignment if the email field actually changed —
        // avoids re-running a lookup + write on every unrelated save.
        if (managerEmailInput && managerEmailInput.toLowerCase() !== (gym?.ownerEmail||'').toLowerCase()){
            await assignGymManager(gymId, managerEmailInput);
        } else if (!managerEmailInput && gym?.ownerUserId){
            await removeGymManager(gymId, gym.ownerUserId);
        }
        showToast('Gym updated.');
        const gyms = await fetchAllGyms();
        renderManageGymsList(gyms);
    };
    window.handleRemoveGymManager = async function(gymId, managerUid){
        if (!confirm('Remove this gym\'s manager? They will lose access to manage it.')) return;
        await removeGymManager(gymId, managerUid);
        const gyms = await fetchAllGyms();
        renderManageGymsList(gyms);
    };
    window.handleCopyInviteCode = async function(code){
        try { await navigator.clipboard.writeText(code); showToast(`Copied ${code}`); }
        catch(err){ showToast('Could not copy — select and copy the code manually.'); }
    };
    window.handleAddGymSubmit = async function(e){ return guardedSubmit(e, 'adminWrite', RATE_LIMITS.adminWrite, async()=>{
        const name = $('#newGymName').value.trim().slice(0,60);
        const tier = $('#newGymTier').value;
        if (!name) return showToast('Please enter a gym name.');
        const gym = await createGym(name, tier);
        if (!gym) return; // createGym() already showed a toast on failure
        showToast(`"${gym.name}" created! Invite code: ${gym.inviteCode}`);
        $('#addGymForm').reset();
        const gyms = await fetchAllGyms();
        renderManageGymsList(gyms);
    }); };
    window.handleNewTestTimeToggle = function(){ const isTime=$('#newTestIsTime').checked; $('#newTestUnitGroup').classList.toggle('hidden', isTime); };


    // ── Manage Sports (admin) ──────────────────────────────────────────────
    // Add/remove the sports athletes can pick from. Removing a sport doesn't touch
    // anyone's saved sport or any test's tag — they just show as "(custom)" until
    // reassigned — so it can never silently hide a test or wipe a profile.
    window.openManageSports = function(){
        if (!getCurrentUser()?.isAdmin) return;
        $('#newSportName').value='';
        renderManageSportsList();
        $('#manageSportsModal').classList.remove('hidden');
    };
    window.closeManageSports = function(){ $('#manageSportsModal').classList.add('hidden'); };
    function renderManageSportsList(){
        const el = $('#manageSportsList'); if (!el) return;
        const docs = appState.sportDocs || [];
        if (!docs.length){
            el.innerHTML = `<p class="text-muted" style="padding:8px 0;">No custom list yet — athletes currently see the ${SPORTS_LIST.length} built-in sports. Add your own below, or load the built-ins to edit them.</p><button type="button" class="row-action-btn" onclick="window.handleLoadDefaultSports()">Load default sports</button>`;
            return;
        }
        el.innerHTML = docs.map(x=>`<div class="row-actions" style="justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--border);"><strong>${escapeHTML(x.name)}</strong><button type="button" class="row-action-btn danger" title="Remove" onclick="window.handleDeleteSport('${escapeHTML(x.id)}')"><svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg></button></div>`).join('');
    }
    function sportDocId(name){ return name.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,60) || ('sport_'+Date.now()); }
    window.handleAddSportSubmit = async function(e){ return guardedSubmit(e, 'adminWrite', RATE_LIMITS.adminWrite, async()=>{
        const name = $('#newSportName').value.trim().slice(0,40);
        if (!name) return showToast('Please enter a sport name.');
        if ((appState.sportDocs||[]).some(x=>x.name.toLowerCase()===name.toLowerCase())) return showToast('That sport is already in the list.');
        if (!initFirebase()) return;
        try {
            const order = (appState.sportDocs||[]).reduce((m,x)=>Math.max(m,x.order??0),-1) + 1;
            await db.collection('sports').doc(sportDocId(name)).set({ name, order });
            $('#addSportForm').reset();
            showToast(`"${name}" added.`);
        } catch(err){ console.error('add sport failed:', err); showToast('Could not add sport. Check your Firestore rules allow admin writes to the sports collection.'); }
    }); };
    window.handleDeleteSport = async function(id){
        const x = (appState.sportDocs||[]).find(d=>d.id===id); if (!x || !initFirebase()) return;
        if (!confirm(`Remove "${x.name}" from the sports list? Athletes who already picked it, and tests tagged with it, keep that value (shown as "custom") — nothing is deleted from them.`)) return;
        try { await db.collection('sports').doc(id).delete(); showToast(`"${x.name}" removed.`); }
        catch(err){ console.error('delete sport failed:', err); showToast('Could not remove sport.'); }
    };
    window.handleLoadDefaultSports = async function(){
        if (!getCurrentUser()?.isAdmin || !initFirebase()) return;
        try {
            const batch = db.batch();
            SPORTS_LIST.forEach((name,i)=>batch.set(db.collection('sports').doc(sportDocId(name)), { name, order:i }));
            await batch.commit();
            showToast('Default sports loaded — add or remove any of them.');
        } catch(err){ console.error('load default sports failed:', err); showToast('Could not load default sports.'); }
    };

    // ── "My Gym" panel — the sub-admin / gym manager's own scoped view ─────
    // Deliberately much smaller than Manage Gyms: only name + roster are
    // editable client-side; tier/status/invite-code regeneration stay
    // admin-only, both here (no controls for them) and in the rules.
    let myGymCache = null;
    window.openMyGym = async function(){
        const u = getCurrentUser();
        if (!u?.managesGymId) return;
        $('#myGymRosterList').innerHTML = '<p class="text-muted" style="padding:8px;">Loading...</p>';
        $('#myGymOfficialResultsList').innerHTML = '<p class="text-muted" style="padding:8px;">Loading...</p>';
        $('#myGymModal').classList.remove('hidden');
        const gym = await getGymById(u.managesGymId);
        if (!gym){ showToast('Could not load your gym.'); closeMyGym(); return; }
        myGymCache = gym;
        $('#myGymName').value = gym.name;
        $('#myGymInviteCode').textContent = gym.inviteCode;
        $('#myGymOfficialDate').value = gym.officialTestDate || '';
        const t = tierInfo(gym.tier);
        const count = await getMemberCount(gym.id);
        $('#myGymTierInfo').textContent = `${t.label} plan · ${count}/${t.cap} members`;
        const roster = await fetchGymRoster(gym.id);
        renderGymRoster(roster);
        const results = await fetchOfficialResults(gym.id);
        renderOfficialResults(results, roster);
    };
    window.closeMyGym = function(){ $('#myGymModal').classList.add('hidden'); myGymCache = null; };
    async function fetchGymRoster(gymId){
        if (!initFirebase()) return [];
        try {
            const snap = await db.collection('users').where('gymId','==',gymId).get();
            const list = [];
            snap.forEach(doc=>list.push({ id:doc.id, ...doc.data() }));
            list.sort((a,b)=>(a.name||'').localeCompare(b.name||''));
            return list;
        } catch(err){ console.error('fetchGymRoster failed:', err); showToast('Could not load your gym\'s member list.'); return []; }
    }
    function renderGymRoster(members){
        const el = $('#myGymRosterList');
        if (!members.length){ el.innerHTML = '<p class="text-muted" style="padding:8px;">No members yet — share your invite code to get started.</p>'; return; }
        el.innerHTML = members.map(m=>{
            const nm = escapeHTML((m.name||'this member').replace(/'/g,"\\'"));
            let age = '';
            if (!Number.isInteger(m.birthYear)) age = '<span class="badge badge-new">Age not provided</span>';
            else if (!isAdultByYear(m)) age = m.guardianConsentAt
                ? `<span class="badge badge-green">Under 19 · guardian OK</span> <button type="button" class="row-action-btn" style="padding:3px 9px;font-size:11px;" onclick="window.handleSetGuardianConsent('${m.id}','${nm}',false)">Revoke</button>`
                : `<span class="badge badge-new">Under 19 · no guardian consent</span> <button type="button" class="row-action-btn" style="padding:3px 9px;font-size:11px;" onclick="window.handleSetGuardianConsent('${m.id}','${nm}',true)">Record guardian consent</button>`;
            return `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 4px;border-bottom:1px solid var(--border);"><div style="min-width:0;"><span style="display:inline-flex;vertical-align:-8px;margin-right:8px;">${avatarCircleHTML(m.avatar,28)}</span><strong>${escapeHTML(m.name||'Member')}</strong>${age?`<div style="margin:4px 0 0 36px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;">${age}</div>`:''}</div><button type="button" class="row-action-btn danger" title="Remove from gym" onclick="window.handleRemoveMember('${m.id}','${nm}')"><svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg></button></div>`;
        }).join('');
    }
    // Manager-attested guardian consent for a member under 19. Only record this after
    // actually speaking to the parent/guardian — the manager's uid + the time are stored.
    window.handleSetGuardianConsent = async function(memberUid, memberName, on){
        if (!myGymCache) return;
        const msg = on
            ? `Record guardian consent for ${memberName}?\n\nOnly do this after you have spoken to their parent or guardian and they have agreed to ${memberName} having a TOPSET account and, if ${memberName} chooses, a public athlete profile. Your name and today's date are stored with the record.`
            : `Revoke guardian consent for ${memberName}? Their public profile (if they have one) is switched to private.`;
        if (!confirm(msg)) return;
        if (rateLimited('adminWrite', RATE_LIMITS.adminWrite)) return;
        const ok = await updateUserProfile(memberUid, on ? { guardianConsentAt:Date.now(), guardianConsentBy:appState.currentUserId } : { guardianConsentAt:null, guardianConsentBy:null });
        if (!ok) return;
        if (!on){ try { await db.collection('athleteProfiles').doc(memberUid).update({ isPublic:false }); } catch(e){ if (e.code!=='not-found') console.error('could not switch profile to private:', e); } }
        showToast(on ? 'Guardian consent recorded.' : 'Guardian consent revoked.');
        renderGymRoster(await fetchGymRoster(myGymCache.id));
    };
    window.handleSaveMyGymName = async function(){
        if (!myGymCache) return;
        const newName = $('#myGymName').value.trim();
        if (!newName) return showToast('Gym name cannot be empty.');
        // Only ever sends {name} — the rules only permit a gym manager to touch
        // this one field, so this call must not bundle anything else in.
        const ok = await updateGym(myGymCache.id, { name: newName });
        if (!ok) return;
        myGymCache.name = newName;
        showToast('Gym name updated.');
    };
    // Opens (or closes, if cleared) the one-day window during which members
    // logging a result dated to match this can tick "Mark as Official". This
    // is the ONLY thing that controls the checkbox — see updateOfficialAvailability
    // and the entries.create rule, both of which check this same field.
    window.handleSaveOfficialDate = async function(){
        if (!myGymCache) return;
        const dateVal = $('#myGymOfficialDate').value || null;
        const ok = await updateGym(myGymCache.id, { officialTestDate: dateVal });
        if (!ok) return;
        myGymCache.officialTestDate = dateVal;
        showToast(dateVal ? `Official results open for ${formatDate(dateVal)}.` : 'Official results window cleared.');
    };
    window.handleRemoveMember = async function(memberUid, memberName){
        if (!myGymCache) return;
        if (!confirm(`Remove ${memberName} from your gym? Their past results stay recorded, but they'll drop off your leaderboard.`)) return;
        const ok = await removeMemberFromGym(memberUid);
        if (!ok) return;
        showToast(`${memberName} removed from your gym.`);
        const roster = await fetchGymRoster(myGymCache.id);
        renderGymRoster(roster);
        const count = await getMemberCount(myGymCache.id);
        const t = tierInfo(myGymCache.tier);
        $('#myGymTierInfo').textContent = `${t.label} plan · ${count}/${t.cap} members`;
    };
    window.handleCopyMyInviteCode = async function(){
        if (!myGymCache) return;
        try { await navigator.clipboard.writeText(myGymCache.inviteCode); showToast(`Copied ${myGymCache.inviteCode}`); }
        catch(err){ showToast('Could not copy — select and copy the code manually.'); }
    };
    // ── Official results — visible and editable only by this gym's manager ──
    let officialResultsCache = [];
    async function fetchOfficialResults(gymId){
        if (!initFirebase()) return [];
        try {
            const snap = await db.collection('entries').where('gymId','==',gymId).where('isOfficial','==',true).get();
            const list = [];
            snap.forEach(doc=>list.push({ id:doc.id, ...doc.data() }));
            list.sort((a,b)=> b.date.localeCompare(a.date) || (b.timestamp||0)-(a.timestamp||0));
            // Temporary diagnostic — remove once the "only one shows" issue is
            // confirmed fixed. Open the browser console (F12) right before
            // opening My Gym and check this line: it shows exactly what the
            // query returned, including each entry's gymId/isOfficial/userId,
            // so a mismatch (e.g. a second entry with a different or missing
            // gymId) is visible directly instead of guessed at.
            console.log(`[TOPSET debug] fetchOfficialResults(gymId="${gymId}") returned ${list.length} entr${list.length===1?'y':'ies'}:`, list);
            return list;
        } catch(err){ console.error('fetchOfficialResults failed:', err); showToast('Could not load official results.'); return []; }
    }
    window.refreshOfficialResults = async function(){
        if (!myGymCache) return;
        const roster = await fetchGymRoster(myGymCache.id);
        const results = await fetchOfficialResults(myGymCache.id);
        renderOfficialResults(results, roster);
    };
    // Stamp written onto an entry whenever a manager verifies / rejects / re-saves it.
    // firestore.rules requires verifiedBy to be the caller's own uid.
    function verifyStamp(status){
        const u = getCurrentUser();
        return { officialStatus:status, verifiedBy:appState.currentUserId, verifiedByName:(u&&u.name)||'Gym manager', verifiedAt:Date.now(), verifiedGymName:(myGymCache&&myGymCache.name)||'' };
    }
    // After ANY manager change to an official entry, rebuild what's derived from
    // verified entries: the official leaderboard doc and the public profile snapshot.
    async function afterOfficialChange(entry){
        const gymName = myGymCache ? myGymCache.name : '';
        const a = await syncOfficialLeaderboard(entry.userId, entry.test, entry.gymId);
        const b = await syncVerifiedSnapshot(entry.userId, entry.test, entry.gymId, gymName);
        if (!a || !b) showToast('Saved, but the leaderboard / public profile could not be fully refreshed. Tap Refresh and try again.');
    }
    window.handleVerifyOfficialEntry = async function(entryId){
        const entry = officialResultsCache.find(r=>r.id===entryId);
        if (!entry || !myGymCache) return;
        if (entry.userId === appState.currentUserId){ showToast("You can't verify your own result — another manager or TOPSET support has to."); return; }
        if (rateLimited('adminWrite', RATE_LIMITS.adminWrite)) return;
        if (!(await updateEntry(entry.id, verifyStamp('verified')))) return;
        await afterOfficialChange(entry);
        showToast('Verified — it now counts as official.');
        window.refreshOfficialResults();
    };
    window.handleRejectOfficialEntry = async function(entryId){
        const entry = officialResultsCache.find(r=>r.id===entryId);
        if (!entry || !myGymCache) return;
        if (entry.userId === appState.currentUserId){ showToast("You can't review your own result."); return; }
        if (!confirm('Reject this result? It will not count as official and the athlete will see it as REJECTED.')) return;
        if (rateLimited('adminWrite', RATE_LIMITS.adminWrite)) return;
        if (!(await updateEntry(entry.id, verifyStamp('rejected')))) return;
        await afterOfficialChange(entry);
        showToast('Result rejected.');
        window.refreshOfficialResults();
    };
    function renderOfficialResults(results, roster){
        officialResultsCache = results;
        const el = $('#myGymOfficialResultsList');
        if (!results.length){ el.innerHTML = '<p class="text-muted" style="padding:8px;">No official results yet — members submit them on your open date and they show up here to verify.</p>'; return; }
        const nameById = {}; (roster||[]).forEach(m=>nameById[m.id]=m.name||'Member');
        const st = r => r.officialStatus==='verified' ? 'verified' : r.officialStatus==='rejected' ? 'rejected' : 'pending';
        const ico = {
            edit:'<svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>',
            del:'<svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>'
        };
        const btnEdit = r => `<button type="button" class="row-action-btn" title="Edit" onclick="window.openManagerEditEntry('${r.id}')">${ico.edit}</button>`;
        const btnDel = r => `<button type="button" class="row-action-btn danger" title="Delete" onclick="window.handleDeleteOfficialEntry('${r.id}')">${ico.del}</button>`;
        const row = (r, actions) => {
            const cfg = getTestConfig(r.test);
            const disp = cfg&&cfg.unit==='time' ? formatTime(r.value) : `${r.value} ${cfg?.unit||''}`;
            const stamp = (st(r)==='verified' && r.verifiedAt) ? `<div style="font-size:11px;color:var(--text-muted);">Verified by ${escapeHTML(r.verifiedByName||'manager')} · ${escapeHTML(new Date(r.verifiedAt).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}))}</div>` : '';
            return `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 4px;border-bottom:1px solid var(--border);flex-wrap:wrap;"><div><strong>${escapeHTML(nameById[r.userId]||'Member')}</strong><span style="color:var(--text-muted);font-size:12px;"> · ${r.test?escapeHTML(r.test)+' · ':''}${disp} · ${formatDate(r.date)}</span>${stamp}</div><div class="row-actions">${actions}</div></div>`;
        };
        const label = (t, n) => `<div style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:0.6px;color:var(--text-muted);padding:6px 4px 4px;">${t} <span style="font-weight:600;text-transform:none;letter-spacing:normal;">(${n})</span></div>`;
        const own = r => r.userId === appState.currentUserId;
        let html = '';
        const pending = results.filter(r=>st(r)==='pending');
        if (pending.length){
            html += `<div style="margin-bottom:12px;">${label('Awaiting your verification', pending.length)}${pending.map(r=>row(r, own(r)
                ? '<span style="font-size:11px;color:var(--text-muted);">Your own result — can\'t self-verify</span>'
                : `<button type="button" class="row-action-btn" style="border-color:var(--accent-green);color:var(--accent-green);" onclick="window.handleVerifyOfficialEntry('${r.id}')">Verify</button>${btnEdit(r)}<button type="button" class="row-action-btn danger" onclick="window.handleRejectOfficialEntry('${r.id}')">Reject</button>`)).join('')}</div>`;
        }
        const byTest = {};
        results.filter(r=>st(r)==='verified').forEach(r=>{ (byTest[r.test] = byTest[r.test] || []).push(r); });
        Object.keys(byTest).sort((a,b)=>a.localeCompare(b)).forEach(testName=>{
            const group = byTest[testName];
            html += `<div style="margin-bottom:10px;">${label('Verified · '+escapeHTML(testName), group.length)}${group.map(r=>row(r, own(r) ? '' : btnEdit(r)+btnDel(r))).join('')}</div>`;
        });
        const rejected = results.filter(r=>st(r)==='rejected');
        if (rejected.length) html += `<div style="margin-bottom:10px;">${label('Rejected', rejected.length)}${rejected.map(r=>row(r, own(r) ? '' : btnDel(r))).join('')}</div>`;
        el.innerHTML = html;
    }
    window.openManagerEditEntry = function(entryId){
        const entry = officialResultsCache.find(r=>r.id===entryId);
        if (!entry) return;
        const cfg = getTestConfig(entry.test);
        editingOfficialEntry = entry;
        editingEntryId = null;
        $('#editEntryTest').value = entry.test;
        $('#editEntryDate').value = entry.date;
        const resultInput = $('#editEntryResult');
        if (cfg && cfg.unit==='time'){ resultInput.type='text'; resultInput.value=formatTime(entry.value); $('#editEntryResultLabel').textContent='Time (mm:ss)'; }
        else { resultInput.type = cfg ? cfg.inputType : 'number'; resultInput.step='any'; resultInput.value=entry.value; $('#editEntryResultLabel').textContent = cfg ? `Result (${cfg.unit})` : 'Result'; }
        $('#editEntryModal').classList.remove('hidden');
    };
    window.handleDeleteOfficialEntry = async function(entryId){
        const entry = officialResultsCache.find(r=>r.id===entryId);
        if (!entry) return;
        if (!confirm('Delete this official result? This cannot be undone.')) return;
        if (!(await deleteEntry(entryId))) return;
        await afterOfficialChange(entry);
        showToast('Official result deleted.');
        if (myGymCache){ const roster = await fetchGymRoster(myGymCache.id); const results = await fetchOfficialResults(myGymCache.id); renderOfficialResults(results, roster); }
    };
    function renderManageTestsList(){
        const el=$('#manageTestsList');
        const bootstrapBtn = (manageTestsScope)
            ? `<div style="padding:8px 4px 14px;border-bottom:1px solid var(--border);margin-bottom:8px;"><button type="button" class="row-action-btn" onclick="window.handleCopyDefaultTests()">Start from the default tests</button><p class="text-muted" style="font-size:11px;margin-top:6px;">Copies the shared default tests into your gym as a starting point — edit or remove any of them below without affecting other gyms.</p></div>`
            : '';
        if(!manageTestsCache.length){
            el.innerHTML = bootstrapBtn + '<p class="text-muted" style="text-align:center;padding:12px;">No tests yet.</p>';
            return;
        }
        el.innerHTML = bootstrapBtn + manageTestsCache.map(t=>`<div class="row-actions" style="justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);"><span><strong>${escapeHTML(t.name)}</strong> <span class="text-muted">(${t.unit==='time'?'mm:ss':escapeHTML(t.unit)})</span></span><span style="display:flex;align-items:center;gap:6px;">${manageTestsScope ? '' : sportAssignSelectHTML(t)}<button class="row-action-btn danger" title="Remove" onclick="window.handleDeleteTest('${t.id}')"><svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg></button></span></div>`).join('');
    }
    // Per-test sport assignment (admin, global catalog only): a one-tap dropdown on each
    // row so an admin can move a test between General and any sport after the fact,
    // not just at creation. A removed/legacy sport value stays selectable as "(custom)".
    function sportAssignSelectHTML(t){
        const names = getSportNames();
        const cur = t.sport || '';
        const custom = cur && !names.includes(cur) ? [cur] : [];
        const opts = `<option value=""${cur===''?' selected':''}>General</option>`
            + custom.map(x=>`<option value="${escapeHTML(x)}" selected>${escapeHTML(x)} (custom)</option>`).join('')
            + names.map(x=>`<option value="${escapeHTML(x)}"${x===cur?' selected':''}>${escapeHTML(x)}</option>`).join('');
        return `<select title="Which sport sees this test" onchange="window.handleSetTestSport('${t.id}', this.value)" style="font-family:var(--font-body);font-size:11.5px;font-weight:600;padding:5px 8px;border-radius:30px;border:1px solid var(--border);background:var(--bg-input);color:var(--text-primary);max-width:150px;">${opts}</select>`;
    }
    window.handleSetTestSport = async function(testId, sport){
        if (!getCurrentUser()?.isAdmin || !initFirebase()) return;
        if (rateLimited('adminWrite', RATE_LIMITS.adminWrite)) return;
        const t = manageTestsCache.find(x=>x.id===testId);
        try {
            await db.collection('tests').doc(testId).update({ sport: sport || null });
            if (t) t.sport = sport || null;
            showToast(`${t?t.name:'Test'} → ${sport || 'General'}.`);
        } catch(err){ console.error('handleSetTestSport failed:', err); showToast('Could not update that test.'); manageTestsCache = await fetchTestsForScope(manageTestsScope); renderManageTestsList(); }
    };
    // Clones the shared default tests into the gym scope currently open in
    // Manage Tests — the client-friendly on-ramp for "start from the default
    // tests instead of a blank list" without the manager retyping everything.
    window.handleCopyDefaultTests = async function(){
        if (!manageTestsScope) return;
        const defaults = await fetchTestsForScope(null);
        const source = defaults.length ? defaults : DEFAULT_TESTS;
        for (const t of source){
            const { id, ...data } = t; // keep order — createTest() now respects an explicit one
            await createTest({ ...data, gymId: manageTestsScope });
        }
        manageTestsCache = await fetchTestsForScope(manageTestsScope);
        renderManageTestsList();
        showToast('Default tests copied — edit or remove any of them below.');
        // No need to re-run subscribeTests here: the member-facing dual-source
        // listener is already live on this gym's scope and picks up the newly
        // created docs on its own.
    };
    window.handleAddTestSubmit = async function(e){ return guardedSubmit(e, 'adminWrite', RATE_LIMITS.adminWrite, async()=>{
        const name=$('#newTestName').value.trim().slice(0,40);
        if(!name) return showToast('Please enter a test name.');
        if(manageTestsCache.find(t=>t.name.toLowerCase()===name.toLowerCase())) return showToast('A test with that name already exists.');
        const isTime=$('#newTestIsTime').checked; const higherIsBetter=$('#newTestHigherBetter').checked; const placeholder=$('#newTestPlaceholder').value.trim().slice(0,12);
        // Only the global-catalog form shows the Sport field — hidden for a gym's own tests,
        // where '' -> null (General) is also the right default.
        const sport = (!manageTestsScope && $('#newTestSport')) ? ($('#newTestSport').value.trim() || null) : null;
        const data = isTime
            ? { name, unit:'time', inputType:'text', higherIsBetter, placeholder:placeholder||'12:30', gymId: manageTestsScope, sport }
            : { name, unit:$('#newTestUnit').value.trim().slice(0,12)||'units', inputType:'number', higherIsBetter, placeholder:placeholder||'0', gymId: manageTestsScope, sport };
        const id = await createTest(data);
        if(!id) return;
        showToast(`"${name}" added.`);
        $('#addTestForm').reset(); handleNewTestTimeToggle(); if (!manageTestsScope) populateSportSelect($('#newTestSport'), '', 'General (visible to everyone)');
        manageTestsCache = await fetchTestsForScope(manageTestsScope);
        renderManageTestsList();
        // Live dual-source listener (see subscribeTests) already tracks this
        // scope, gym or global — it'll reflect the new test on its own.
    }); };
    window.handleDeleteTest = async function(id){
        const t=manageTestsCache.find(x=>x.id===id); const name=t?t.name:'this test';
        if(!confirm(`Remove "${name}" from the test list? Existing logged results for it are kept, but it won't be loggable anymore.`)) return;
        if(await deleteTestDoc(id)){
            showToast(`"${name}" removed.`);
            manageTestsCache = await fetchTestsForScope(manageTestsScope);
            renderManageTestsList();
        }
    };
    window.handleEditProfileSubmit = async function(e){ return guardedSubmit(e, 'profileSave', RATE_LIMITS.profileSave, async()=>{ if(!appState.currentUserId) return; const newName=$('#profileName').value.trim().slice(0,30); const newAvatar=avatarKey($('#profileAvatar').value); const newAgeGroup=$('#profileAgeGroup').value; const newGender=$('#profileGender').value; const newSport=$('#profileSport').value.trim().slice(0,60); const newPw=$('#profilePassword').value.trim(); const gymCodeInput=$('#profileGymCode').value.trim().slice(0,20); if(!newName) return showToast('Name cannot be empty.'); if(newPw.length>0 && newPw.length<6) return showToast('Password must be at least 6 characters.'); const updates={ name:newName, avatar:newAvatar, ageGroup:newAgeGroup||null, gender:newGender||null, sport:newSport||null };
        // Year of birth is set ONCE (firestore.rules lock it afterwards); age group is always derived from it.
        { const cu=getCurrentUser(); const picked=parseInt(($('#profileBirthYear')||{}).value,10); const hasBY=Number.isInteger(cu?.birthYear); const by = hasBY ? cu.birthYear : (validBirthYear(picked) ? picked : null);
          if (by){ updates.ageGroup = ageGroupFromBirthYear(by); if (!hasBY) updates.birthYear = by; }
          else if (!isNaN(picked)) return showToast('TOPSET is for ages 14 and up.'); }
        // Only touch gymId if the user actually typed something — leaving the field
        // blank means "no change," not "leave my gym."
        let joinedNewGym=false;
        if (gymCodeInput){
            // Throttled separately (not just by the outer guardedSubmit spacing) —
            // an invite code lookup is effectively a guess against a small
            // keyspace (TOPSET-XXXXXX, 6 chars from a 32-char alphabet), so this
            // is the one spot in the app closest to a credential-guessing
            // endpoint. Firestore itself won't rate-limit these reads.
            if (rateLimited('inviteCode', RATE_LIMITS.inviteCode)) return;
            const gym = await findGymByInviteCode(gymCodeInput);
            if (!gym){ showToast('Gym invite code not recognized.'); return; }
            const capacity = await checkGymCapacity(gym);
            if (capacity.full){ showToast(`This gym is at its ${capacity.cap}-member limit. Contact the gym manager to see if a spot opens up.`); return; }
            updates.gymId = gym.id;
            // The rules now require this on any write that changes gymId to a
            // non-null value, checked against that gym's real stored inviteCode.
            // Without it, gymId was a plain self-editable field with NO
            // server-side membership check at all — any signed-in user could
            // set their own gymId to any gym's ID directly via a raw Firestore
            // write, no invite code needed, completely bypassing this whole
            // lookup. It stays on the profile afterward as a harmless join-audit
            // trail (invite codes aren't secret credentials — gym managers hand
            // them out freely via the Copy button).
            updates.claimedInviteCode = gym.inviteCode;
            joinedNewGym = true;
        }
        const ok = await updateUserProfile(appState.currentUserId, updates); if(!ok) return; if(newPw){ try { await auth.currentUser.updatePassword(newPw); } catch(err){ if(err.code==='auth/requires-recent-login') return showToast('Please sign out and back in before changing your password.'); showToast('Password update failed.'); return; } } appState.currentUser={ ...appState.currentUser, ...updates }; updateUIForMode(); await updateCloudProfileInfo(); await syncAthleteProfileDisplayInfo();
        // Sport-scoped tests depend on profile.sport — re-filter every test dropdown
        // even if only the sport changed (no gym change at all).
        populateLogTestSelect(); populatePublicLogTestSelect(); updateSpotlightSelect(); updateResultField(); updateResultFieldPublic();
        if (joinedNewGym) await backfillGymIdOntoUserData(appState.currentUserId, updates.gymId);
        if (joinedNewGym){
            // Same reasoning as handleLeaveGym: re-run gym-dependent UI now, so the
            // public Log form and gym-scoped test catalog appear immediately instead
            // of waiting for the next Log page visit.
            await refreshMyGymInfo();
            subscribeTests(updates.gymId, ()=>{ populateLogTestSelect(); updateSpotlightSelect(); populatePublicLogTestSelect(); });
            updateOfficialAvailability();
        }
        showToast(joinedNewGym ? 'Joined gym! Your existing results now count toward its leaderboard.' : 'Profile updated successfully!'); closeEditProfileModal(); renderLeaderboard(); }); };
