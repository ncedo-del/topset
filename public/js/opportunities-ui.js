// ── opportunities-ui.js ───────────────────────────────────────
// Phase 3 — Opportunities + "Apply with TopSet Profile" + Applicant Viewer.
// Collections: opportunities/{id}, applications/{opportunityId__athleteId}.
// Firestore rules for both live in firestore.rules — the UI
// gating below (who sees "Post Opportunity" and "Applicants") is convenience only.

(function(global) {
    'use strict';

    let opportunitiesCache = [];
    let myApplicationsCache = [];

    const SAMPLE_OPPORTUNITIES = [
        { id:'sample_rugby', isSample:true, title:'U23 Provincial Rugby Trial', organizationName:'Sample Rugby Union', sport:'Rugby', location:'Johannesburg, ZA', opportunityType:'Team Trial', requirements:'Verified 40m Sprint under 5.1s', description:'Example listing: what a team trial post looks like.', deadline:'', createdAt:3 },
        { id:'sample_hyrox', isSample:true, title:'HYROX Brand Ambassador', organizationName:'Sample Apparel Brand', sport:'HYROX', location:'National / Remote', opportunityType:'Sponsorship', requirements:'Active HYROX competitor with a race time', description:'Example listing: what a sponsorship post looks like.', deadline:'', createdAt:2 },
        { id:'sample_running', isSample:true, title:'Distance Running Development Grant', organizationName:'Sample Athletics Foundation', sport:'Running', location:'Soweto, ZA', opportunityType:'Development Grant', requirements:'Verified 5km under 18:30', description:'Example listing: what a grant post looks like.', deadline:'', createdAt:1 }
    ];

    function canPost() {
        const u = getCurrentUser();
        return !!(u && (u.isAdmin || u.managesGymId));
    }

    global.updateOpportunityAdminUI = function() {
        const btn = $('#createOpportunityBtn');
        if (btn) btn.style.display = canPost() ? '' : 'none';
    };

    async function fetchOpportunities() {
        if (!initFirebase()) return SAMPLE_OPPORTUNITIES;
        try {
            const snap = await db.collection('opportunities').orderBy('createdAt', 'desc').get();
            const list = [];
            snap.forEach(doc => list.push({ ...doc.data(), id: doc.id }));
            return list.length ? list : SAMPLE_OPPORTUNITIES;
        } catch (err) {
            console.error('fetchOpportunities failed:', err);
            return SAMPLE_OPPORTUNITIES;
        }
    }
    global.fetchOpportunities = fetchOpportunities;

    async function fetchMyApplications() {
        const uid = getCurrentUserId();
        if (!uid || !initFirebase()) return [];
        try {
            const snap = await db.collection('applications').where('athleteId', '==', uid).get();
            const list = [];
            snap.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
            return list;
        } catch (err) {
            console.error('fetchMyApplications failed:', err);
            return [];
        }
    }

    function isExpired(op) {
        return !!op.deadline && op.deadline < todayStr();
    }

    global.openOpportunitiesModal = function() {
        $('#opportunitiesModal')?.classList.remove('hidden');
        if (typeof populateSportSelect === 'function' && $('#oppSportFilter')) {
            populateSportSelect($('#oppSportFilter'), $('#oppSportFilter').value, 'All sports');
        }
        global.renderOpportunitiesPage();
    };

    global.closeOpportunitiesModal = function() {
        $('#opportunitiesModal')?.classList.add('hidden');
    };

    global.renderOpportunitiesPage = async function() {
        const grid = $('#opportunitiesGrid');
        if (!grid) return;
        global.updateOpportunityAdminUI();
        grid.innerHTML = '<div class="empty-state">Loading opportunities...</div>';
        [opportunitiesCache, myApplicationsCache] = await Promise.all([fetchOpportunities(), fetchMyApplications()]);
        global.applyOpportunityFilters();
    };

    global.applyOpportunityFilters = function() {
        const q = ($('#oppSearch')?.value || '').trim().toLowerCase();
        const sportFilter = $('#oppSportFilter')?.value || '';
        const typeFilter = $('#oppTypeFilter')?.value || '';
        const filtered = opportunitiesCache.filter(op => {
            if (q) {
                const hay = `${op.title || ''} ${op.organizationName || ''} ${op.location || ''} ${op.description || ''}`.toLowerCase();
                if (!hay.includes(q)) return false;
            }
            if (sportFilter && op.sport !== sportFilter) return false;
            if (typeFilter && op.opportunityType !== typeFilter) return false;
            return true;
        });
        renderOpportunitiesGrid(filtered);
    };

    function renderOpportunitiesGrid(list) {
        const grid = $('#opportunitiesGrid');
        if (!grid) return;
        if (!list.length) {
            grid.innerHTML = '<div class="empty-state">No opportunities match these filters.</div>';
            return;
        }
        const currentUser = getCurrentUser();
        const uid = appState.currentUserId;

        grid.innerHTML = list.map(op => {
            const applied = myApplicationsCache.some(app => app.opportunityId === op.id);
            const expired = isExpired(op);
            const isOwner = !!(uid && !op.isSample && (op.createdBy === uid || currentUser?.isAdmin));

            let actionBtn;
            if (op.isSample) {
                actionBtn = `<span class="badge badge-sample" style="background:var(--bg-input);color:var(--text-muted);padding:4px 8px;border-radius:var(--radius-sm);font-size:11px;">Sample listing</span>`;
            } else if (applied) {
                actionBtn = `<button type="button" class="btn btn-outline btn-sm" disabled style="opacity:0.7;">Applied</button>`;
            } else if (expired) {
                actionBtn = `<button type="button" class="btn btn-outline btn-sm" disabled style="opacity:0.7;">Closed</button>`;
            } else {
                actionBtn = `<button type="button" class="btn btn-primary btn-sm" data-opp-id="${escapeHTML(op.id)}" onclick="window.handleApplyOpportunity(this.dataset.oppId)">Apply with TopSet Profile</button>`;
            }

            const ownerControls = isOwner ? `
                <div style="display:flex;align-items:center;gap:6px;margin-top:8px;">
                    <button type="button" class="btn btn-outline btn-sm" onclick="window.openOpportunityApplicants('${escapeHTML(op.id)}')"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>Applicants</button>
                    <button type="button" class="row-action-btn danger" title="Delete opportunity" onclick="window.handleDeleteOpportunity('${escapeHTML(op.id)}')"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg></button>
                </div>` : '';

            return `
                <div class="card opportunity-card" style="display:flex;flex-direction:column;justify-content:space-between;margin-bottom:0;">
                    <div>
                        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">
                            <span class="badge" style="background:var(--accent-tint-bg);color:var(--text-primary);font-size:10px;padding:3px 8px;border-radius:40px;">${escapeHTML(op.opportunityType || 'Opportunity')}</span>
                            ${ownerControls}
                        </div>
                        <h3 style="font-family:var(--font-display);font-size:20px;line-height:1.2;margin:4px 0 6px;">${escapeHTML(op.title)}</h3>
                        <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">${escapeHTML(op.organizationName)} · ${escapeHTML(op.location || 'Remote')}${op.sport ? ' · ' + escapeHTML(op.sport) : ''}</div>
                        <p style="font-size:13px;color:var(--text-secondary);margin-bottom:12px;line-height:1.4;">${escapeHTML(op.description || '')}</p>
                        <div style="background:var(--bg-input);padding:8px 12px;border-radius:var(--radius-sm);font-size:12px;margin-bottom:14px;border:1px solid var(--border);">
                            <strong style="color:var(--text-primary);">Requirements:</strong> ${escapeHTML(op.requirements || 'Open to all athletes')}
                        </div>
                    </div>
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;border-top:1px solid var(--border);padding-top:12px;">
                        <span style="font-size:11px;color:var(--text-muted);">${op.deadline ? 'Deadline: ' + escapeHTML(formatDate(op.deadline)) : 'Open call'}</span>
                        ${actionBtn}
                    </div>
                </div>`;
        }).join('');
    }

    global.handleApplyOpportunity = async function(opportunityId) {
        const user = getCurrentUser();
        if (!user || !appState.currentUserId) {
            showToast('Sign in or create a profile to apply.');
            global.openAuthModal('signin');
            return;
        }
        const opp = opportunitiesCache.find(o => o.id === opportunityId);
        if (!opp || opp.isSample) return showToast('That listing isn\'t open for applications.');
        if (isExpired(opp)) return showToast('This opportunity has closed.');
        if (rateLimited('applyOpp', 2000)) return;
        if (!confirm(`Apply for "${opp.title}" with your TopSet profile (${user.name})?`)) return;
        if (!initFirebase()) return showToast('Could not reach the server. Try again.');

        const ap = await getMyAthleteProfile();
        const uid = appState.currentUserId;
        const application = {
            opportunityId,
            athleteId: uid,
            athleteName: user.name || 'TOPSET Athlete',
            athleteAvatar: (typeof avatarKey === 'function' ? avatarKey(user.avatar) : (user.avatar || 'gym')),
            athleteSport: ap?.sport || user.sport || '',
            athleteLocation: ap?.location || '',
            athleteProfileUrl: ap?.isPublic ? `${location.origin}/athlete/${uid}` : '',
            organizationName: opp.organizationName || '',
            status: 'submitted',
            submittedAt: Date.now()
        };
        try {
            await db.collection('applications').doc(`${opportunityId}__${uid}`).set(application);
        } catch (err) {
            console.error('Submit application failed:', err);
            return showToast('Could not submit your application. Check your connection and try again.');
        }
        myApplicationsCache.push(application);
        showToast(ap?.isPublic ? 'Application sent with your TopSet profile.' : 'Application sent. Tip: make your athlete profile public so they can open it.');
        global.applyOpportunityFilters();
    };

    global.openOpportunityApplicants = async function(opportunityId) {
        const opp = opportunitiesCache.find(o => o.id === opportunityId);
        const modal = $('#opportunityApplicantsModal');
        const listEl = $('#oppApplicantsList');
        const titleEl = $('#oppApplicantsTitle');
        if (!modal || !listEl) return;
        if (titleEl) titleEl.textContent = opp ? `Applicants: ${opp.title}` : 'Applicants';
        listEl.innerHTML = '<div class="empty-state">Loading applicants...</div>';
        modal.classList.remove('hidden');

        if (!initFirebase()) {
            listEl.innerHTML = '<div class="empty-state">Unable to reach the server.</div>';
            return;
        }

        try {
            const snap = await db.collection('applications').where('opportunityId', '==', opportunityId).get();
            const apps = [];
            snap.forEach(doc => apps.push({ id: doc.id, ...doc.data() }));
            if (!apps.length) {
                listEl.innerHTML = '<div class="empty-state">No athletes have applied for this opportunity yet.</div>';
                return;
            }
            listEl.innerHTML = apps.map(a => {
                const dateStr = a.submittedAt ? new Date(a.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
                const profileBtn = a.athleteProfileUrl
                    ? `<a href="/athlete/${escapeHTML(a.athleteId)}" target="_blank" class="btn btn-outline btn-sm" style="text-decoration:none;display:inline-flex;align-items:center;gap:6px;"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>View Profile</a>`
                    : `<span style="font-size:11px;color:var(--text-muted);font-style:italic;">Private profile</span>`;
                return `
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px;margin-bottom:8px;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--radius-sm);">
                        <div style="display:flex;align-items:center;gap:12px;">
                            ${typeof avatarCircleHTML === 'function' ? avatarCircleHTML(a.athleteAvatar, 44) : ''}
                            <div>
                                <div style="font-weight:700;color:var(--text-primary);font-size:15px;">${escapeHTML(a.athleteName || 'Athlete')}</div>
                                <div style="font-size:12px;color:var(--text-muted);">${escapeHTML([a.athleteSport, a.athleteLocation].filter(Boolean).join(' · ') || 'No sport/location')} · Applied ${escapeHTML(dateStr)}</div>
                            </div>
                        </div>
                        <div>${profileBtn}</div>
                    </div>`;
            }).join('');
        } catch (err) {
            console.error('Fetch applicants failed:', err);
            listEl.innerHTML = '<div class="empty-state">Could not load applicants. You must be the opportunity poster or an admin.</div>';
        }
    };

    global.closeOpportunityApplicantsModal = function() {
        $('#opportunityApplicantsModal')?.classList.add('hidden');
    };

    global.handleDeleteOpportunity = async function(opportunityId) {
        if (!confirm('Are you sure you want to delete this opportunity?')) return;
        if (!initFirebase()) return;
        try {
            await db.collection('opportunities').doc(opportunityId).delete();
            opportunitiesCache = opportunitiesCache.filter(o => o.id !== opportunityId);
            showToast('Opportunity deleted.');
            global.applyOpportunityFilters();
        } catch (err) {
            console.error('Delete opportunity failed:', err);
            showToast('Could not delete opportunity.');
        }
    };

    global.openCreateOpportunityModal = function() {
        if (!canPost()) return showToast('Only admins and gym managers can post opportunities.');
        if (typeof populateSportSelect === 'function' && $('#newOppSport')) {
            populateSportSelect($('#newOppSport'), '', 'General');
        }
        $('#createOpportunityModal')?.classList.remove('hidden');
    };
    global.closeCreateOpportunityModal = function() {
        $('#createOpportunityModal')?.classList.add('hidden');
    };

    global.handleCreateOpportunitySubmit = async function(e) {
        return guardedSubmit(e, 'adminWrite', RATE_LIMITS.adminWrite, async () => {
            if (!canPost()) return showToast('Only admins and gym managers can post opportunities.');
            const title = $('#newOppTitle').value.trim().slice(0, 80);
            const orgName = $('#newOppOrgName').value.trim().slice(0, 60);
            if (!title || !orgName) return showToast('Please enter a title and organization name.');
            if (!initFirebase()) return;
            const newOpp = {
                title,
                organizationName: orgName,
                sport: $('#newOppSport').value || 'General',
                opportunityType: $('#newOppType').value || 'Sponsorship',
                location: $('#newOppLocation').value.trim().slice(0, 60) || 'Remote',
                requirements: $('#newOppReqs').value.trim().slice(0, 160) || 'Open to all athletes',
                description: $('#newOppDesc').value.trim().slice(0, 300),
                deadline: $('#newOppDeadline').value || '',
                createdBy: appState.currentUserId,
                createdAt: Date.now()
            };
            try {
                const ref = await db.collection('opportunities').add(newOpp);
                opportunitiesCache = opportunitiesCache.filter(o => !o.isSample);
                opportunitiesCache.unshift({ ...newOpp, id: ref.id });
            } catch (err) {
                console.error('Opportunity save failed:', err);
                return showToast('Could not publish. Check that the Firestore rules for opportunities are deployed.');
            }
            $('#createOpportunityForm').reset();
            showToast('Opportunity published.');
            global.closeCreateOpportunityModal();
            global.applyOpportunityFilters();
        });
    };

})(window);
