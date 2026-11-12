// ── athlete-profile-ui.js ────────────────────────────────
// Editor modal (#athleteProfileModal) for the signed-in user's own opt-in
// public profile, plus the signed-out-readable public page rendered at
// /athlete/{uid} (see the route check at the top of init() in
// app-init.js). Data layer lives in athlete-profile.js; this file is
// DOM/UI only.

    window.openAthleteProfileModal = async function(){
        if (!appState.currentUserId){ showToast('Please sign in first.'); return; }
        const profile = await getMyAthleteProfile();
        $('#athleteProfilePublicToggle').checked = !!profile?.isPublic;
        populateSportSelect($('#athleteProfileSport'), profile?.sport || getCurrentUser()?.sport || '', 'No sport selected');
        $('#athleteProfileLocation').value = profile?.location || '';
        $('#athleteProfileBio').value = profile?.bio || '';
        $('#athleteAvailSponsorship').checked = !!profile?.availability?.openToSponsorship;
        $('#athleteAvailTrials').checked = !!profile?.availability?.openToTrials;
        $('#athleteAvailOpportunities').checked = !!profile?.availability?.openToOpportunities;
        window.handleAthleteProfileToggle();
        if (window.applyProfileGate) window.applyProfileGate();
        $('#athleteProfileModal').classList.remove('hidden');
    };
    window.closeAthleteProfileModal = function(){ $('#athleteProfileModal').classList.add('hidden'); };

    // Shows/hides the shareable-link row the moment the checkbox changes —
    // before Save — purely so the person can see what their link will look
    // like. The link only actually resolves publicly once Save writes
    // isPublic:true to Firestore; toggling this alone writes nothing.
    window.handleAthleteProfileToggle = function(){
        const on = $('#athleteProfilePublicToggle').checked;
        $('#athleteProfileLinkRow').classList.toggle('hidden', !on);
        if (on && appState.currentUserId){
            $('#athleteProfileLinkText').textContent = `${location.origin}/athlete/${appState.currentUserId}`;
        }
    };

    window.handleCopyAthleteProfileLink = async function(){
        const text = $('#athleteProfileLinkText').textContent;
        if (!text) return;
        try { await navigator.clipboard.writeText(text); showToast('Link copied!'); }
        catch(err){ showToast('Could not copy — select and copy the link manually.'); }
    };

    window.handleSaveAthleteProfile = async function(e){
        e.preventDefault();
        if (!appState.currentUserId) return;
        const ok = await saveAthleteProfile({
            sport: $('#athleteProfileSport').value,
            location: $('#athleteProfileLocation').value,
            bio: $('#athleteProfileBio').value,
            isPublic: $('#athleteProfilePublicToggle').checked,
            availability: {
                openToSponsorship: $('#athleteAvailSponsorship').checked,
                openToTrials: $('#athleteAvailTrials').checked,
                openToOpportunities: $('#athleteAvailOpportunities').checked
            }
        });
        if (!ok) return;
        showToast($('#athleteProfilePublicToggle').checked ? 'Athlete profile saved and public!' : 'Athlete profile saved (private).');
        window.closeAthleteProfileModal();
    };

    // ── Public, signed-out-readable Athletic CV page (Strategy Deck Move 3) ──
    // Called from app-init.js's init() when the URL matches /athlete/{uid},
    // or when the athlete clicks "View Public CV" from their home hub.
    window.renderPublicAthletePage = async function(uid){
        const el = $('#page-public-athlete');
        if (!el) return;
        el.classList.remove('hidden');
        el.innerHTML = '<div class="public-athlete-card"><p class="text-muted">Loading Athletic CV...</p></div>';

        // Fetch public profile doc (or owner's own draft profile if viewing own CV)
        let p = await getPublicAthleteProfile(uid);
        const isOwner = appState.currentUserId && appState.currentUserId === uid;
        if (!p && isOwner) {
            p = await getMyAthleteProfile();
            if (p) p = { ...p, isPublic: false, name: appState.currentUser?.name, avatar: appState.currentUser?.avatar };
        }

        if (!p){
            el.innerHTML = '<div class="public-athlete-card"><p>This athletic profile isn\'t available — it may be private, or the link may be wrong.</p><a class="btn btn-outline" href="./" style="margin-top:16px;">← Back to TOPSET</a></div>';
            return;
        }

        const infoParts = [p.sport, p.location, p.ageGroup].filter(Boolean);
        const availBadges = [
            p.availability?.openToSponsorship ? 'Open to Sponsorship' : null,
            p.availability?.openToTrials ? 'Open to Trials' : null,
            p.availability?.openToOpportunities ? 'Open to Opportunities' : null
        ].filter(Boolean);

        // Manager-verified results (written by accredited gym verifier)
        const verified = Object.values(p.verifiedResults || {}).filter(v=>v && v.value != null).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
        const isRecruiterReady = verified.length > 0;

        // Query Supabase analytical PRs for complete portfolio
        let prList = [];
        if (window.supabaseClient && window.supabaseClient.isConfigured()) {
            try {
                const spPRs = await window.supabaseClient.getAthletePRs(uid);
                if (Array.isArray(spPRs) && spPRs.length > 0) {
                    prList = spPRs;
                }
            } catch(e) {
                console.warn('Supabase PR query skipped on public CV:', e);
            }
        }
        // Fallback to local entries if owner viewing
        if (!prList.length && isOwner && appState.entries?.length) {
            prList = (typeof getPersonalBests === 'function' ? getPersonalBests(appState.entries) : []).map(b => ({
                test_name: b.test,
                pb_value: b.value,
                unit: (getTestConfig ? getTestConfig(b.test)?.unit : '') || '',
                pb_date: b.date
            }));
        }

        const verifiedHTML = verified.length ? `
                <div class="public-verified" style="margin-top:18px;">
                    <div class="public-verified-title">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                        Officially Verified Benchmarks
                    </div>
                    ${verified.map(v=>`
                        <div class="public-verified-row">
                            <div style="min-width:0;">
                                <div class="pv-test">${escapeHTML(v.test||'')}</div>
                                <div class="pv-meta">📍 ${escapeHTML([v.gymName||'Accredited Gym', v.date ? formatDate(v.date) : ''].filter(Boolean).join(' · '))}</div>
                            </div>
                            <div class="pv-val" style="color:var(--accent-green);font-weight:800;">${escapeHTML(String(v.display ?? v.value))}</div>
                        </div>
                    `).join('')}
                    <p class="pv-note">Independently witnessed under TOPSET testing protocol.</p>
                </div>` : '';

        const prHTML = prList.length ? `
                <div style="margin-top:22px;text-align:left;">
                    <div style="font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:var(--text-muted);margin-bottom:10px;">
                        Performance Benchmark Portfolio (${prList.length})
                    </div>
                    <div class="public-cv-grid">
                        ${prList.map(item => `
                            <div class="public-cv-stat">
                                <span class="public-cv-stat-test">${escapeHTML(item.test_name || item.test || 'Benchmark')}</span>
                                <strong class="public-cv-stat-val">${item.pb_value ?? item.value}${item.unit ? ' <small style="font-size:12px;font-weight:600;color:var(--text-muted);">' + escapeHTML(item.unit) + '</small>' : ''}</strong>
                                <span class="public-cv-stat-sub">${item.pb_date ? formatDate(item.pb_date) : 'Personal Best'}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>` : '';

        const shareUrl = `${location.origin}/athlete/${encodeURIComponent(uid)}`;

        el.innerHTML = `
            <div class="public-cv-container">
                <div class="public-cv-card">
                    <div class="public-cv-header">
                        <div class="public-cv-avatar-wrap">
                            ${avatarCircleHTML(p.avatar, 84)}
                        </div>
                        <h1 class="public-cv-name">${escapeHTML(p.name||'TOPSET Athlete')}</h1>
                        <div class="public-cv-meta">${escapeHTML(infoParts.join(' · ')||'Athlete Portfolio')}</div>
                        
                        <div class="public-cv-badges">
                            ${isRecruiterReady 
                                ? `<span class="home-cv-badge badge-green" style="display:inline-flex;align-items:center;gap:4px;"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6 9 17l-5-5"/></svg> Recruiter Ready</span>`
                                : `<span class="home-cv-badge badge-blue">Active Athlete CV</span>`
                            }
                            ${availBadges.map(b=>`<span class="home-cv-badge badge-gold">${escapeHTML(b)}</span>`).join('')}
                        </div>
                    </div>

                    ${p.bio ? `<div class="public-cv-bio">"${escapeHTML(p.bio)}"</div>` : ''}

                    ${verifiedHTML}

                    ${prHTML}

                    <div style="display:flex;gap:10px;justify-content:center;margin-top:28px;flex-wrap:wrap;">
                        <button type="button" class="btn btn-primary btn-sm" onclick="navigator.clipboard.writeText('${shareUrl}').then(()=>showToast('Athletic CV Link Copied!')).catch(()=>showToast('${shareUrl}'))">
                            <svg class="btn-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                            Copy Shareable CV Link
                        </button>
                        ${isOwner ? `<button type="button" class="btn btn-outline btn-sm" onclick="openStatCardModal()">
                            <svg class="btn-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
                            Export Athlete Card
                        </button>` : ''}
                        <a class="btn btn-ghost btn-sm" href="./">
                            ← Back to TOPSET
                        </a>
                    </div>
                </div>
            </div>`;
    };
