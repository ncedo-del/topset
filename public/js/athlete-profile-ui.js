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

    // ── Public, signed-out-readable profile page ────────────────────────
    // Called from app-init.js's init() when the URL matches /athlete/{uid},
    // BEFORE any of the normal signed-in app chrome is shown.
    window.renderPublicAthletePage = async function(uid){
        const el = $('#page-public-athlete');
        if (!el) return;
        el.classList.remove('hidden');
        el.innerHTML = '<div class="public-athlete-card"><p class="text-muted">Loading athlete profile...</p></div>';
        const p = await getPublicAthleteProfile(uid);
        if (!p){
            el.innerHTML = '<div class="public-athlete-card"><p>This athlete profile isn\'t available — it may be private, or the link may be wrong.</p><a class="btn btn-outline" href="/" style="margin-top:16px;">← Back to TOPSET</a></div>';
            return;
        }
        const infoParts = [p.sport, p.location].filter(Boolean);
        const availBadges = [
            p.availability?.openToSponsorship ? 'Open to Sponsorship' : null,
            p.availability?.openToTrials ? 'Open to Trials' : null,
            p.availability?.openToOpportunities ? 'Open to Opportunities' : null
        ].filter(Boolean);
        // Manager-verified results (written by the gym manager's browser at verification
        // time — see syncVerifiedSnapshot in core.js). Athletes can't write this field (rules).
        const verified = Object.values(p.verifiedResults || {}).filter(v=>v && v.value != null).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
        const verifiedHTML = verified.length ? `
                <div class="public-verified">
                    <div class="public-verified-title"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg> Verified results</div>
                    ${verified.map(v=>`<div class="public-verified-row"><div style="min-width:0;"><div class="pv-test">${escapeHTML(v.test||'')}</div><div class="pv-meta">${escapeHTML([v.gymName||'Gym', v.date ? formatDate(v.date) : ''].filter(Boolean).join(' · '))}</div></div><div class="pv-val">${escapeHTML(String(v.display ?? v.value))}</div></div>`).join('')}
                    <p class="pv-note">Confirmed by the athlete's gym manager — not self-reported.</p>
                </div>` : '';
        el.innerHTML = `
            <div class="public-athlete-card">
                <span style="display:block;width:fit-content;margin:0 auto;">${avatarCircleHTML(p.avatar,72)}</span>
                <h1>${escapeHTML(p.name||'TOPSET Athlete')}</h1>
                <div class="public-athlete-meta">${escapeHTML(infoParts.join(' · ')||'')}</div>
                ${p.bio ? `<p class="public-athlete-bio">${escapeHTML(p.bio)}</p>` : ''}
                ${availBadges.length ? `<div class="public-athlete-badges">${availBadges.map(b=>`<span class="badge badge-green">${escapeHTML(b)}</span>`).join('')}</div>` : ''}
                ${verifiedHTML}
                <a class="btn btn-outline" href="/" style="margin-top:20px;">← Back to TOPSET</a>
            </div>`;
    };
