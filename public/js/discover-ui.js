// ── discover-ui.js ───────────────────────────────────────
// Move 4: Scout / Coach Discovery Portal & Quick-Filter View
// Public talent discovery engine allowing scouts, coaches, and visitors
// to search and filter athletes by verified benchmarks, threshold metrics,
// readiness tiers, age brackets, and sports disciplines.

(function (window) {
    'use strict';

    let discoverProfilesCache = [];

    async function fetchAllPublicAthleteProfiles() {
        if (!initFirebase()) return [];
        try {
            const snap = await db.collection('athleteProfiles').where('isPublic', '==', true).get();
            const list = [];
            snap.forEach(d => list.push({ id: d.id, ...d.data() }));
            list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            return list;
        } catch (err) {
            console.error('fetchAllPublicAthleteProfiles failed:', err);
            showToast('Could not load athletes.');
            return [];
        }
    }

    function parseThreshold(raw, cfg) {
        if (!raw) return NaN;
        const trimmed = String(raw).trim();
        if (cfg && cfg.unit === 'time') {
            if (trimmed.includes(':')) {
                const parts = trimmed.split(':');
                const m = parseInt(parts[0], 10), s = parseInt(parts[1], 10);
                if (!isNaN(m) && !isNaN(s)) return m * 60 + s;
            }
            const sec = parseFloat(trimmed);
            return isNaN(sec) ? NaN : sec;
        }
        return parseFloat(trimmed);
    }

    window.onDiscoverBenchmarkChange = function () {
        const testSelect = document.getElementById('discoverBenchmarkSelect');
        const wrap = document.getElementById('discoverThresholdWrap');
        const label = document.getElementById('discoverThresholdLabel');
        const input = document.getElementById('discoverBenchmarkThreshold');

        if (!testSelect || !wrap) return;
        const testName = testSelect.value;
        if (!testName) {
            wrap.classList.add('hidden');
            if (input) input.value = '';
        } else {
            const cfg = typeof window.getTestConfig === 'function' ? window.getTestConfig(testName) : null;
            const isTime = cfg ? (cfg.unit === 'time' || cfg.higherIsBetter === false) : testName.toLowerCase().includes('run');
            if (label) label.textContent = isTime ? 'Max Time:' : 'Min Score:';
            if (input) input.placeholder = isTime ? 'e.g. 12:30' : (cfg ? `e.g. ${cfg.placeholder || '2.40'}` : 'Threshold');
            wrap.classList.remove('hidden');
        }
        window.applyDiscoverFilters();
    };

    window.renderDiscoverPage = async function () {
        const grid = document.getElementById('discoverResultsGrid');
        if (!grid) return;
        grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;">Loading verified athletes...</div>';

        // 1. Populate Sport dropdown if not yet populated
        const sportSelect = document.getElementById('discoverSportFilter');
        if (sportSelect && sportSelect.options.length <= 1) {
            const sports = typeof window.getSportNames === 'function' ? window.getSportNames() : [];
            sports.forEach(sp => {
                const opt = document.createElement('option');
                opt.value = sp;
                opt.textContent = sp;
                sportSelect.appendChild(opt);
            });
        }

        // 2. Populate Benchmark Select
        const bmSelect = document.getElementById('discoverBenchmarkSelect');
        if (bmSelect && bmSelect.options.length <= 1) {
            const tests = (window.appState && window.appState.globalTests) || window.DEFAULT_TESTS || [];
            tests.forEach(t => {
                const opt = document.createElement('option');
                opt.value = t.name;
                opt.textContent = `${t.name} (${t.unit})`;
                bmSelect.appendChild(opt);
            });
        }

        discoverProfilesCache = await fetchAllPublicAthleteProfiles();
        window.applyDiscoverFilters();
    };

    window.applyDiscoverFilters = function () {
        const q = (document.getElementById('discoverSearch')?.value || '').trim().toLowerCase();
        const sportFilter = document.getElementById('discoverSportFilter')?.value || '';
        const ageFilter = document.getElementById('discoverAgeGroup')?.value || '';
        const tierFilter = document.getElementById('discoverTierFilter')?.value || '';
        const needSponsorship = !!document.getElementById('discoverFilterSponsorship')?.checked;
        const needTrials = !!document.getElementById('discoverFilterTrials')?.checked;
        const needOpportunities = !!document.getElementById('discoverFilterOpportunities')?.checked;

        const benchmarkTest = document.getElementById('discoverBenchmarkSelect')?.value || '';
        const thresholdRaw = (document.getElementById('discoverBenchmarkThreshold')?.value || '').trim();
        const cfg = benchmarkTest && typeof window.getTestConfig === 'function' ? window.getTestConfig(benchmarkTest) : null;
        const parsedThreshold = thresholdRaw ? parseThreshold(thresholdRaw, cfg) : NaN;

        const filtered = discoverProfilesCache.filter(p => {
            if (q) {
                const hay = `${p.name || ''} ${p.sport || ''} ${p.location || ''} ${p.bio || ''}`.toLowerCase();
                if (!hay.includes(q)) return false;
            }
            if (sportFilter && p.sport !== sportFilter) return false;
            if (ageFilter && p.ageGroup !== ageFilter) return false;

            const verifiedEntries = Object.values(p.verifiedResults || {}).filter(v => v && v.value != null);
            const hasVerified = verifiedEntries.length > 0;

            // Tier filtering
            if (tierFilter === 'recruiter_ready') {
                if (!hasVerified) return false;
                // Full recruiter ready check
                const isReady = p.name && p.sport && p.location && verifiedEntries.length >= 1;
                if (!isReady) return false;
            } else if (tierFilter === 'verified_only') {
                if (!hasVerified) return false;
            } else if (tierFilter === 'contender') {
                if (!hasVerified && !p.sport) return false;
            }

            // Benchmark Threshold Filtering
            if (benchmarkTest) {
                const matchingResults = verifiedEntries.filter(r => r.test === benchmarkTest);
                if (!matchingResults.length) return false;
                if (!isNaN(parsedThreshold)) {
                    const isHigher = cfg ? cfg.higherIsBetter !== false : (cfg?.unit !== 'time' && !benchmarkTest.toLowerCase().includes('run'));
                    const bestVal = matchingResults.reduce((best, cur) => {
                        return isHigher ? Math.max(best, cur.value) : Math.min(best, cur.value);
                    }, isHigher ? -Infinity : Infinity);

                    if (isHigher && bestVal < parsedThreshold) return false;
                    if (!isHigher && bestVal > parsedThreshold) return false;
                }
            }

            // Availability filters
            if (needSponsorship && !p.availability?.openToSponsorship) return false;
            if (needTrials && !p.availability?.openToTrials) return false;
            if (needOpportunities && !p.availability?.openToOpportunities) return false;

            return true;
        });

        renderDiscoverResults(filtered);
    };

    function renderDiscoverResults(list) {
        const grid = document.getElementById('discoverResultsGrid');
        const countEl = document.getElementById('discoverResultCount');
        if (!grid) return;

        if (countEl) {
            const verifiedCount = list.filter(p => Object.keys(p.verifiedResults || {}).length > 0).length;
            countEl.textContent = discoverProfilesCache.length 
                ? `${list.length} athlete${list.length === 1 ? '' : 's'} (${verifiedCount} verified)` 
                : '';
        }

        if (!discoverProfilesCache.length) {
            grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;">No athletes have opted into a public profile yet.</div>';
            return;
        }
        if (!list.length) {
            grid.innerHTML = `
                <div class="empty-state" style="grid-column:1/-1;">
                    <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom:8px;color:var(--text-muted);"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                    <div>No athletes match the current benchmark or filter criteria.</div>
                    <button type="button" class="btn btn-ghost btn-sm" onclick="document.getElementById('discoverSearch').value=''; document.getElementById('discoverSportFilter').value=''; document.getElementById('discoverAgeGroup').value=''; document.getElementById('discoverTierFilter').value=''; document.getElementById('discoverBenchmarkSelect').value=''; window.onDiscoverBenchmarkChange();" style="margin-top:10px;">
                        Reset Filters
                    </button>
                </div>`;
            return;
        }

        grid.innerHTML = list.map(p => {
            const infoParts = [p.sport, p.ageGroup ? `Age ${p.ageGroup}` : null, p.location].filter(Boolean);
            const verifiedList = Object.values(p.verifiedResults || {}).filter(v => v && v.value != null);
            const isRecruiterReady = p.name && p.sport && p.location && verifiedList.length > 0;

            const availBadges = [
                p.availability?.openToTrials ? 'Trials' : null,
                p.availability?.openToSponsorship ? 'Sponsorship' : null,
                p.availability?.openToOpportunities ? 'Opportunities' : null
            ].filter(Boolean);

            const verifiedSnippets = verifiedList.slice(0, 3).map(v => `
                <div class="discover-card-metric">
                    <span class="dcm-test">${escapeHTML(v.test || 'Test')}</span>
                    <strong class="dcm-val">${escapeHTML(String(v.display ?? v.value))}</strong>
                </div>
            `).join('');

            return `
                <div class="discover-athlete-card" onclick="location.href='/athlete/${encodeURIComponent(p.id)}'">
                    <div class="discover-card-header">
                        <div class="discover-card-avatar">
                            ${typeof avatarCircleHTML === 'function' ? avatarCircleHTML(p.avatar, 52, p.photoURL) : ''}
                        </div>
                        <div class="discover-card-title">
                            <h3 class="discover-card-name">${escapeHTML(p.name || 'TOPSET Athlete')}</h3>
                            <div class="discover-card-meta">${escapeHTML(infoParts.join(' · ') || 'Unlisted')}</div>
                        </div>
                        ${isRecruiterReady 
                            ? `<span class="home-cv-badge badge-green" style="margin-left:auto;font-size:10px;" title="Meets verified recruiter threshold">Recruiter Ready</span>`
                            : (verifiedList.length ? `<span class="home-cv-badge badge-blue" style="margin-left:auto;font-size:10px;">Verified Contender</span>` : '')
                        }
                    </div>

                    ${p.bio ? `<div class="discover-card-bio">"${escapeHTML(p.bio)}"</div>` : ''}

                    ${verifiedList.length ? `
                        <div class="discover-card-benchmarks">
                            <div class="discover-benchmarks-title">
                                <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                                Verified Performance
                            </div>
                            <div class="discover-metrics-grid">
                                ${verifiedSnippets}
                            </div>
                        </div>
                    ` : `
                        <div class="discover-card-no-verified">
                            <span>Self-reported baselines in progress</span>
                        </div>
                    `}

                    <div class="discover-card-footer">
                        <div class="discover-avail-chips">
                            ${availBadges.map(b => `<span class="badge badge-green" style="font-size:9.5px;">${escapeHTML(b)}</span>`).join('')}
                        </div>
                        <a class="btn btn-outline btn-sm discover-view-btn" href="/athlete/${encodeURIComponent(p.id)}" onclick="event.stopPropagation()">
                            View Athletic CV →
                        </a>
                    </div>
                </div>
            `;
        }).join('');
    }

    window.fetchAllPublicAthleteProfiles = fetchAllPublicAthleteProfiles;
    window.renderDiscoverResults = renderDiscoverResults;

})(window);
