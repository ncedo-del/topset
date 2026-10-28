// ── discover-ui.js ───────────────────────────────────────
// Phase 2 "Discover" — a public, signed-out-accessible browse/search over
// opted-in athlete profiles. Deliberately NOT gated behind sign-in: scouts
// and sponsors are, by design, people who may never make a TOPSET training
// account at all — gating discovery behind auth would defeat the point.
//
// SCALE NOTE: fetches every public profile in one query and filters/sorts
// entirely client-side (name/sport/location text match + age/gender/
// availability filters), same pattern the existing Leaderboard page
// already uses for its own demographic filters. Fine at dozens-to-low-
// hundreds of profiles; genuinely wrong at thousands (a paginated or
// server-side-filtered query would be needed then). Right tradeoff for
// where this collection actually is right now, not before.
//
// Deliberately does NOT fetch each athlete's verified results for the
// browse grid — that would be one `entries` query per card (an N+1 fan-
// out), the exact kind of Firestore-quota mistake the percentile cache in
// leaderboard-ui.js already exists to avoid elsewhere in this app. Full
// verified results are one tap away on the athlete's own profile page.

    let discoverProfilesCache = [];

    async function fetchAllPublicAthleteProfiles(){
        if (!initFirebase()) return [];
        try {
            const snap = await db.collection('athleteProfiles').where('isPublic','==',true).get();
            const list = []; snap.forEach(d=>list.push({ id:d.id, ...d.data() }));
            list.sort((a,b)=>(a.name||'').localeCompare(b.name||''));
            return list;
        } catch(err){ console.error('fetchAllPublicAthleteProfiles failed:', err); showToast('Could not load athletes.'); return []; }
    }

    window.renderDiscoverPage = async function(){
        const grid = $('#discoverResultsGrid');
        if (!grid) return;
        grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;">Loading athletes...</div>';
        discoverProfilesCache = await fetchAllPublicAthleteProfiles();
        window.applyDiscoverFilters();
    };

    window.applyDiscoverFilters = function(){
        const q = ($('#discoverSearch')?.value || '').trim().toLowerCase();
        const ageFilter = $('#discoverAgeGroup')?.value || '';
        const genderFilter = $('#discoverGender')?.value || '';
        const needSponsorship = !!$('#discoverFilterSponsorship')?.checked;
        const needTrials = !!$('#discoverFilterTrials')?.checked;
        const needOpportunities = !!$('#discoverFilterOpportunities')?.checked;

        const filtered = discoverProfilesCache.filter(p=>{
            if (q){
                const hay = `${p.name||''} ${p.sport||''} ${p.location||''}`.toLowerCase();
                if (!hay.includes(q)) return false;
            }
            if (ageFilter && p.ageGroup !== ageFilter) return false;
            if (genderFilter && p.gender !== genderFilter) return false;
            if (needSponsorship && !p.availability?.openToSponsorship) return false;
            if (needTrials && !p.availability?.openToTrials) return false;
            if (needOpportunities && !p.availability?.openToOpportunities) return false;
            return true;
        });
        renderDiscoverResults(filtered);
    };

    function renderDiscoverResults(list){
        const grid = $('#discoverResultsGrid');
        const countEl = $('#discoverResultCount');
        if (countEl) countEl.textContent = discoverProfilesCache.length ? `${list.length} of ${discoverProfilesCache.length}` : '';
        if (!discoverProfilesCache.length){
            grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;">No athletes have opted into a public profile yet.</div>';
            return;
        }
        if (!list.length){
            grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;">No athletes match these filters.</div>';
            return;
        }
        grid.innerHTML = list.map(p=>{
            const infoParts = [p.sport, p.location].filter(Boolean);
            const availBadges = [
                p.availability?.openToSponsorship ? 'Sponsorship' : null,
                p.availability?.openToTrials ? 'Trials' : null,
                p.availability?.openToOpportunities ? 'Opportunities' : null
            ].filter(Boolean);
            return `<a class="discover-card" href="/athlete/${encodeURIComponent(p.id)}">
                ${avatarCircleHTML(p.avatar,56)}
                <div style="min-width:0;">
                    <div style="font-family:var(--font-display);font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHTML(p.name||'TOPSET Athlete')}</div>
                    <div style="font-size:12px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHTML(infoParts.join(' · ')||'No details yet')}</div>
                    ${availBadges.length ? `<div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:6px;">${availBadges.map(b=>`<span class="badge badge-green" style="font-size:9px;">${escapeHTML(b)}</span>`).join('')}</div>` : ''}
                </div>
            </a>`;
        }).join('');
    }
