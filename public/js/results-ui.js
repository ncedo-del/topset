// ── results-ui.js ─────────────────────────────────────
// Public (gym-less) log form, stats row, History and PR table
// rendering, shareable PR card image generation.

    // ── Public/TOPSET-wide Log form — mirrors the gym form above, but always
    // scoped to the pure global catalog and always writes gymId:null, regardless
    // of which gym the member actually belongs to. No official-result concept
    // here at all, so there's no equivalent of updateOfficialAvailability.
    function getTestConfigPublic(n){ return (appState.globalTests||[]).find(t=>t.name===n); }
    function updateResultFieldPublic(){ const t=$('#logTestPublic').value, cfg=getTestConfigPublic(t), inp=$('#logResultPublic'), lbl=$('#resultLabelPublic'); if(!cfg){ inp.type='text'; inp.step='any'; inp.placeholder='Select test first'; lbl.textContent='Result'; return; } inp.type=cfg.inputType; inp.step='any'; inp.placeholder=cfg.placeholder; lbl.textContent=cfg.unit==='time'?'Time (mm:ss)':`Result (${cfg.unit})`; inp.value=''; }
    async function handleLogSubmitPublic(e){ return guardedSubmit(e, 'logEntry', RATE_LIMITS.logEntry, async()=>{ const test=$('#logTestPublic').value, raw=$('#logResultPublic').value.trim(), date=$('#logDatePublic').value||todayStr(); if(!test) return showToast('Please select a test.'); const cfg=getTestConfigPublic(test); if(!cfg) return showToast('Please select a test.'); let value; if(cfg.unit==='time'){ value=parseTime(raw); if(isNaN(value)) return showToast('Invalid time format (mm:ss).'); } else { value=parseFloat(raw); if(isNaN(value)) return showToast('Invalid number.'); } if(!isValidEntryValue(value, cfg)) return showToast('That result looks out of range — double check the number.'); if(!isValidLogDate(date)) return showToast('Please pick a valid date (not in the future).'); const saved = await addEntry({test,value,date,isOfficial:false,gymId:null}); if(!saved) return; await pushBestToCloud(test); const disp=cfg.unit==='time'?raw:`${value} ${cfg.unit}`; showToast(`${test}: ${disp} logged to TOPSET Public!`); $('#logTestPublic').value=''; $('#logResultPublic').value=''; $('#logDatePublic').value=todayStr(); updateResultFieldPublic(); updateStatsRow(); }); }
    function skeletonTableRows(cols, count=5){
        const widths=['skeleton-cell-md','skeleton-cell-lg','skeleton-cell-sm','skeleton-cell-sm','skeleton-cell-md'];
        return Array.from({length:count},(_,i)=>`<tr class="skeleton-row">${Array.from({length:cols},(_,c)=>`<td><div class="skeleton skeleton-cell ${widths[c]||'skeleton-cell-md'}"></div></td>`).join('')}</tr>`).join('');
    }
    function updateStatsRow(){
        const prs=getPersonalBests(appState.entries);
        // First call: swap skeleton cards for real stat cards
        if (!$('#statTotalEntries')) {
            $('#statsRow').innerHTML = [
                {label:'Total Entries',  val:appState.entries.length,           cls:'',      sub:'tests logged', id:'statTotalEntries'},
                {label:'Tests Tracked',  val:[...new Set(appState.entries.map(e=>e.test))].length, cls:'yellow', sub:'unique tests', id:'statUniqueTests'},
                {label:'PRs Achieved',   val:prs.length,                        cls:'green', sub:'personal bests', id:'statPRCount'},
            ].map(s=>`<div class="stat-card"><div class="stat-label">${s.label}</div><div class="stat-value ${s.cls}" id="${s.id}">${s.val}</div><div class="stat-sub">${s.sub}</div></div>`).join('');
        } else {
            $('#statTotalEntries').textContent=appState.entries.length;
            $('#statUniqueTests').textContent=[...new Set(appState.entries.map(e=>e.test))].length;
            $('#statPRCount').textContent=prs.length;
        }
    }
    function renderHistory(){
        // ── Chronological Delta & Progression Helpers ───────────────────────────
        function formatDeltaHTML(current, prev, cfg) {
            if (!prev) return '<span class="delta-baseline">Baseline attempt</span>';
            if (!cfg) return '–';
            const diff = current.value - prev.value;
            if (Math.abs(diff) < 0.0001) return '<span class="delta-neutral">= No change</span>';
            const isImprovement = cfg.higherIsBetter ? (diff > 0) : (diff < 0);
            const absDiff = Math.abs(diff);
            const pct = prev.value !== 0 ? Math.abs((diff / prev.value) * 100).toFixed(1) : null;
            const pctStr = pct ? ` (${pct}%)` : '';

            if (cfg.unit === 'time') {
                const secStr = absDiff < 60 ? `${absDiff.toFixed(1)}s` : formatTime(absDiff);
                if (isImprovement) {
                    return `<span class="delta-improved" title="Faster than previous attempt"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"/></svg> -${secStr} faster${pctStr}</span>`;
                } else {
                    return `<span class="delta-declined" title="Slower than previous attempt"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg> +${secStr} slower${pctStr}</span>`;
                }
            } else {
                const sign = diff > 0 ? '+' : '-';
                const valStr = `${sign}${absDiff.toFixed(absDiff >= 10 ? 1 : 2)} ${cfg.unit || ''}`;
                if (isImprovement) {
                    return `<span class="delta-improved" title="Improved vs previous attempt"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"/></svg> ${valStr}${pctStr}</span>`;
                } else {
                    return `<span class="delta-declined" title="Below previous attempt"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg> ${valStr}${pctStr}</span>`;
                }
            }
        }

        function renderProgressionSVG(testEntries, cfg) {
            if (!testEntries || testEntries.length < 2) {
                const single = testEntries && testEntries[0];
                const msg = single
                    ? `Baseline established: <strong>${cfg && cfg.unit === 'time' ? formatTime(single.value) : `${single.value} ${cfg?.unit || ''}`}</strong> on ${formatDate(single.date)}. Log another attempt to see your progression curve!`
                    : 'Log at least 2 attempts for this benchmark to view your progression curve.';
                return `<div style="padding:28px 20px;text-align:center;font-size:13.5px;color:var(--text-secondary);background:var(--bg-input);border-radius:var(--radius-sm);">${msg}</div>`;
            }

            const width = 640;
            const height = 180;
            const padL = 60, padR = 25, padT = 20, padB = 35;
            const plotW = width - padL - padR;
            const plotH = height - padT - padB;

            const vals = testEntries.map(e => e.value);
            let minVal = Math.min(...vals);
            let maxVal = Math.max(...vals);
            if (minVal === maxVal) {
                minVal = minVal * 0.9;
                maxVal = maxVal * 1.1 || 1;
            } else {
                const pad = (maxVal - minVal) * 0.12;
                minVal -= pad;
                maxVal += pad;
            }

            const n = testEntries.length;
            const pts = testEntries.map((e, i) => {
                const x = padL + (n > 1 ? (i / (n - 1)) * plotW : plotW / 2);
                const norm = (e.value - minVal) / (maxVal - minVal);
                const y = padT + (1 - norm) * plotH;
                return { x, y, entry: e };
            });

            const pointsStr = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
            const areaPointsStr = `${pts[0].x.toFixed(1)},${(padT + plotH).toFixed(1)} ${pointsStr} ${pts[pts.length - 1].x.toFixed(1)},${(padT + plotH).toFixed(1)}`;

            const gridLines = [0, 0.5, 1].map(frac => {
                const y = padT + frac * plotH;
                const valAtY = maxVal - frac * (maxVal - minVal);
                const label = cfg && cfg.unit === 'time' ? formatTime(Math.round(valAtY)) : `${valAtY.toFixed(valAtY >= 10 ? 1 : 2)}`;
                return `
                    <line x1="${padL}" y1="${y.toFixed(1)}" x2="${width - padR}" y2="${y.toFixed(1)}" stroke="var(--border)" stroke-width="1" stroke-dasharray="3 3"/>
                    <text x="${padL - 8}" y="${(y + 3.5).toFixed(1)}" text-anchor="end" font-size="10" font-family="Montserrat,sans-serif" font-weight="600" fill="var(--text-muted)">${label}</text>
                `;
            }).join('');

            const circles = pts.map(p => {
                const isPB = cfg && cfg.higherIsBetter ? p.entry.value === Math.max(...vals) : p.entry.value === Math.min(...vals);
                const isVerified = p.entry.isOfficial && p.entry.officialStatus === 'verified';
                const color = isPB ? 'var(--accent-gold)' : (isVerified ? '#4ade80' : 'var(--accent-green)');
                const disp = cfg && cfg.unit === 'time' ? formatTime(p.entry.value) : `${p.entry.value} ${cfg?.unit || ''}`;
                return `
                    <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" fill="${color}" stroke="var(--bg-card)" stroke-width="2">
                        <title>${formatDate(p.entry.date)}: ${disp}${isPB ? ' (Personal Best)' : ''}</title>
                    </circle>
                `;
            }).join('');

            const firstDate = formatDate(testEntries[0].date);
            const lastDate = formatDate(testEntries[testEntries.length - 1].date);
            const dateLabels = `
                <text x="${padL}" y="${height - 10}" text-anchor="start" font-size="10" font-family="Montserrat,sans-serif" font-weight="600" fill="var(--text-muted)">${firstDate}</text>
                <text x="${width - padR}" y="${height - 10}" text-anchor="end" font-size="10" font-family="Montserrat,sans-serif" font-weight="600" fill="var(--text-muted)">${lastDate}</text>
            `;

            return `
                <svg class="history-chart-svg" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                        <linearGradient id="histProgGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stop-color="#4ade80" stop-opacity="0.28"/>
                            <stop offset="100%" stop-color="#4ade80" stop-opacity="0.0"/>
                        </linearGradient>
                    </defs>
                    ${gridLines}
                    <polygon points="${areaPointsStr}" fill="url(#histProgGradient)"/>
                    <polyline points="${pointsStr}" fill="none" stroke="#4ade80" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                    ${circles}
                    ${dateLabels}
                </svg>
            `;
        }

        const tb = $('#historyTableBody');
        if (!tb) return;

        const entries = appState.entries || [];
        const prs = getPersonalBests(entries);

        // 1. Update Hero stats strip
        if ($('#histTotalCount')) $('#histTotalCount').textContent = entries.length;
        if ($('#histPrCount')) $('#histPrCount').textContent = prs.length;
        if ($('#histUniqueCount')) $('#histUniqueCount').textContent = new Set(entries.map(e => e.test)).size;
        if ($('#histVerifiedCount')) $('#histVerifiedCount').textContent = entries.filter(e => e.isOfficial && e.officialStatus === 'verified').length;

        if (!entries.length) {
            tb.innerHTML = '<tr><td colspan="6" class="empty-state"><span class="emoji"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z"/></svg></span>No tests logged yet. Record your first benchmark to start your performance timeline!</td></tr>';
            const chartBody = $('#histChartBody');
            if (chartBody) chartBody.innerHTML = '<div style="padding:28px 20px;text-align:center;font-size:13px;color:var(--text-muted);">Log your first benchmark to establish a progression baseline.</div>';
            return;
        }

        // 2. Populate Test Filter Select if needed
        const testFilterEl = $('#historyTestFilter');
        if (testFilterEl) {
            const currentSelected = testFilterEl.value;
            const uniqueTests = [...new Set(entries.map(e => e.test))].sort();
            testFilterEl.innerHTML = '<option value="">All Tests</option>' + uniqueTests.map(t => `<option value="${escapeHTML(t)}" ${t === currentSelected ? 'selected' : ''}>${escapeHTML(t)}</option>`).join('');
        }

        // 3. Chronologically sort ascending to calculate relative progression deltas
        const sortedAsc = entries.slice().sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.timestamp || 0) - (b.timestamp || 0));
        
        // Track the predecessor attempt for every entry of the same test
        const testLastAttempt = {};
        const entryPrevMap = new Map();
        for (const e of sortedAsc) {
            const prev = testLastAttempt[e.test] || null;
            entryPrevMap.set(e.id, prev);
            testLastAttempt[e.test] = e;
        }

        // 4. Determine Active Filters
        const selectedTest = testFilterEl?.value || '';
        const timeFilter = $('#historyTimeFilter')?.value || 'all';
        const statusFilter = $('#historyStatusFilter')?.value || 'all';

        let filtered = entries.slice();
        if (selectedTest) {
            filtered = filtered.filter(e => e.test === selectedTest);
        }
        if (timeFilter !== 'all') {
            const maxDays = parseInt(timeFilter, 10);
            if (!isNaN(maxDays)) {
                filtered = filtered.filter(e => daysAgo(e.date) <= maxDays);
            }
        }
        if (statusFilter === 'verified') {
            filtered = filtered.filter(e => e.isOfficial && e.officialStatus === 'verified');
        } else if (statusFilter === 'self') {
            filtered = filtered.filter(e => !e.isOfficial);
        }

        // 5. Update Filtered Count Badge
        const countBadge = $('#historyFilteredCountBadge');
        if (countBadge) countBadge.textContent = `${filtered.length} ${filtered.length === 1 ? 'entry' : 'entries'}`;

        // 6. Update Trend Chart
        const chartTestName = selectedTest || (prs.length ? prs[0].test : (entries[0] ? entries[0].test : 'Broad Jump'));
        const chartTestCfg = getTestConfig(chartTestName);
        const chartEntries = sortedAsc.filter(e => e.test === chartTestName);
        
        const chartTestNameEl = $('#histChartTestName');
        const chartPbBadgeEl = $('#histChartPbBadge');
        const chartDeltaEl = $('#histChartDelta');
        const chartBodyEl = $('#histChartBody');

        if (chartTestNameEl) chartTestNameEl.textContent = chartTestName;
        if (chartEntries.length) {
            const prObj = prs.find(p => p.test === chartTestName);
            const bestVal = prObj ? (chartTestCfg && chartTestCfg.unit === 'time' ? formatTime(prObj.value) : `${prObj.value} ${chartTestCfg?.unit || ''}`) : '–';
            if (chartPbBadgeEl) chartPbBadgeEl.textContent = `All-Time PB: ${bestVal}`;

            if (chartEntries.length >= 2) {
                const first = chartEntries[0];
                const latest = chartEntries[chartEntries.length - 1];
                const totalDiff = latest.value - first.value;
                const isImproved = chartTestCfg ? (chartTestCfg.higherIsBetter ? totalDiff > 0 : totalDiff < 0) : true;
                const absDiff = Math.abs(totalDiff);
                const diffDisp = chartTestCfg && chartTestCfg.unit === 'time' ? (absDiff < 60 ? `${absDiff.toFixed(1)}s` : formatTime(absDiff)) : `${absDiff.toFixed(absDiff >= 10 ? 1 : 2)} ${chartTestCfg?.unit || ''}`;
                if (chartDeltaEl) {
                    chartDeltaEl.textContent = isImproved ? `+${diffDisp} overall progression` : `${diffDisp} vs initial attempt`;
                    chartDeltaEl.style.color = isImproved ? '#4ade80' : 'var(--text-secondary)';
                }
            } else {
                if (chartDeltaEl) chartDeltaEl.textContent = 'Baseline established';
            }
        }
        if (chartBodyEl) {
            chartBodyEl.innerHTML = renderProgressionSVG(chartEntries, chartTestCfg);
        }

        // 7. Render Timeline Table (Newest First)
        if (!filtered.length) {
            tb.innerHTML = '<tr><td colspan="6" class="empty-state">No benchmark results match your active filters. <button type="button" class="btn btn-ghost btn-sm" onclick="window.resetHistoryFilters()" style="margin-left:8px;">Reset Filters</button></td></tr>';
            return;
        }

        // Sort filtered newest first
        filtered.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.timestamp || 0) - (a.timestamp || 0));

        tb.innerHTML = filtered.map(e => {
            const cfg = getTestConfig(e.test);
            const disp = cfg && cfg.unit === 'time' ? formatTime(e.value) : `${e.value} ${cfg?.unit || ''}`;
            const prevEntry = entryPrevMap.get(e.id);
            const deltaHTML = formatDeltaHTML(e, prevEntry, cfg);

            // Is this entry the athlete's all-time personal best?
            const isPr = prs.some(p => p.test === e.test && p.value === e.value && p.date === e.date);
            const prBadge = isPr ? '<span class="badge-pr" title="All-time personal record on this benchmark">PR</span>' : '';

            // Verification badges
            const offStatus = e.isOfficial ? (e.officialStatus === 'verified' ? 'verified' : e.officialStatus === 'rejected' ? 'rejected' : 'pending') : null;
            const officialBadge = !e.isOfficial ? '<span class="badge" style="background:var(--bg-input);color:var(--text-muted);font-size:10.5px;">Self-Reported</span>'
                : offStatus === 'verified' ? '<span class="badge badge-green" title="Verified by your gym manager">VERIFIED</span>'
                : offStatus === 'rejected' ? '<span class="badge" style="background:var(--danger-bg);color:var(--danger);">REJECTED</span>'
                : '<span class="badge badge-new" title="Pending manager verification">PENDING</span>';

            const publicBadge = (appState.myGym && !e.gymId) ? ' <span class="badge" style="background:var(--bg-input);color:var(--text-secondary);" title="Public TOPSET pool">PUBLIC</span>' : '';

            // Locked actions if official verified
            const actions = (e.isOfficial && offStatus === 'verified')
                ? '<span style="font-size:11px;color:var(--text-muted);" title="Locked — only gym manager can edit verified entries"><svg style="width:14px;height:14px;vertical-align:-2px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></span>'
                : `<button class="row-action-btn" title="Edit" onclick="openEditEntryModal('${e.id}')"><svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg></button><button class="row-action-btn danger" title="Delete" onclick="handleDeleteEntry('${e.id}')"><svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg></button>`;

            return `
                <tr>
                    <td style="white-space:nowrap;">${formatDate(e.date)}</td>
                    <td><strong>${escapeHTML(e.test)}</strong>${prBadge}${publicBadge}</td>
                    <td class="num-cell highlight-pr">${disp}</td>
                    <td>${deltaHTML}</td>
                    <td>${officialBadge}</td>
                    <td><div class="row-actions">${actions}</div></td>
                </tr>
            `;
        }).join('');
    }
    window.renderHistory = renderHistory;
    function renderPRs(){ const prs=getPersonalBests(appState.entries), tb=$('#prTableBody'); if(!prs.length) return tb.innerHTML='<tr><td colspan="5" class="empty-state"><span class="emoji"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0Z"/><path d="M7 5H4a3 3 0 0 0 3 5"/><path d="M17 5h3a3 3 0 0 1-3 5"/></svg></span>No PRs yet.</td></tr>'; tb.innerHTML=prs.map(p=>{ const cfg=getTestConfig(p.test); const disp=cfg&&cfg.unit==='time'?formatTime(p.value):`${p.value} ${cfg?.unit||''}`; const recent=daysAgo(p.date)<=7; return `<tr><td><strong>${escapeHTML(p.test)}</strong></td><td class="num-cell highlight-pr">${disp}</td><td>${formatDate(p.date)}</td><td><span class="badge ${recent?'badge-new':'badge-green'}">${recent?'RECENT':'PR'}</span></td><td><button class="row-action-btn" title="Share this PR" onclick="window.handleSharePR('${escapeHTML(p.test).replace(/'/g,"\\'")}')"><svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M16 6l-4-4-4 4"/><path d="M12 2v13"/></svg></button></td></tr>`; }).join(''); }
    // ── Shareable PR card ───────────────────────────────────────────────────
    // Draws a 1080x1080 image (square — the safe default for Instagram/TikTok)
    // client-side via Canvas. No server, no image-generation API, nothing new
    // to host — just the browser's own drawing surface.
    async function generatePRCardBlob(pr){
        const cfg = getTestConfig(pr.test);
        const disp = cfg && cfg.unit==='time' ? formatTime(pr.value) : `${pr.value}`;
        const unitLabel = cfg && cfg.unit!=='time' ? cfg.unit : '';
        const user = getCurrentUser();
        const size = 1080;
        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d');

        // Canvas silently falls back to a system font on first draw unless the
        // actual web font has already been loaded — this makes sure Oswald and
        // Montserrat are genuinely ready before any text gets drawn with them.
        await Promise.all([
            document.fonts.load('600 36px Oswald'),
            document.fonts.load('700 160px Oswald'),
            document.fonts.load('600 48px Oswald'),
            document.fonts.load('600 44px Montserrat'),
            document.fonts.load('800 32px Montserrat'),
            document.fonts.load('500 32px Montserrat'),
            document.fonts.load('500 26px Montserrat')
        ]);

        ctx.fillStyle = '#0b0b0b';
        ctx.fillRect(0, 0, size, size);

        // Soft green glow, top-left — purely decorative, echoes the app's accent color
        const glow = ctx.createRadialGradient(size*0.1, size*0.1, 0, size*0.1, size*0.1, size*0.6);
        glow.addColorStop(0, 'rgba(255,255,255,0.10)');
        glow.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, size, size);

        // TOPSET wordmark, top-left
        ctx.textAlign = 'left';
        ctx.fillStyle = '#f5f5f5';
        ctx.font = '600 36px Oswald';
        ctx.fillText('TOPSET', 70, 100);
        ctx.fillStyle = '#d4d4d4';
        ctx.beginPath();
        ctx.arc(70 + ctx.measureText('TOPSET').width + 20, 88, 8, 0, Math.PI*2);
        ctx.fill();

        ctx.textAlign = 'center';

        ctx.fillStyle = '#d4d4d4';
        ctx.font = '800 32px Montserrat';
        ctx.fillText('PERSONAL RECORD', size/2, 300);

        ctx.fillStyle = '#f5f5f5';
        ctx.font = '700 160px Oswald';
        ctx.fillText(disp, size/2, 480);

        if (unitLabel){
            ctx.font = '600 48px Oswald';
            ctx.fillStyle = '#b0b0b0';
            ctx.fillText(unitLabel, size/2, 560);
        }

        ctx.font = '600 44px Montserrat';
        ctx.fillStyle = '#f5f5f5';
        ctx.fillText(pr.test, size/2, unitLabel ? 650 : 600);

        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(size*0.3, 780);
        ctx.lineTo(size*0.7, 780);
        ctx.stroke();

        ctx.font = '500 32px Montserrat';
        ctx.fillStyle = '#b0b0b0';
        ctx.fillText(user?.name||'TOPSET Athlete', size/2, 850);

        ctx.font = '500 26px Montserrat';
        ctx.fillStyle = '#6e6e6e';
        ctx.fillText(formatDate(pr.date), size/2, 900);

        return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    }
    window.handleSharePR = async function(testName){
        const prs = getPersonalBests(appState.entries);
        const pr = prs.find(p => p.test === testName);
        if (!pr) return showToast('Could not find that PR.');
        showToast('Generating your share card...');
        let blob;
        try { blob = await generatePRCardBlob(pr); }
        catch(err){ console.error('generatePRCardBlob failed:', err); return showToast('Could not generate the share image.'); }
        const fileName = `topset-pr-${testName.replace(/\s+/g,'-').toLowerCase()}.png`;
        const file = new File([blob], fileName, { type: 'image/png' });

        // Web Share API with file support — this is what lets someone on mobile
        // share straight into TikTok/Instagram/WhatsApp instead of just saving
        // a file and hunting for it later. Not supported on desktop browsers
        // generally, hence the download fallback below.
        if (navigator.canShare && navigator.canShare({ files: [file] })){
            try {
                await navigator.share({ files: [file], title: 'My TOPSET PR', text: `New PR on ${testName}!` });
                return;
            } catch(err){
                if (err.name === 'AbortError') return; // user backed out of the share sheet — not a failure
                console.error('navigator.share failed:', err);
                // fall through to the download fallback
            }
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = fileName;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('Image saved — share it anywhere!');
    };
    // Always shows BOTH "my gym" and "TopSet-wide" ranks side by side,
    // regardless of which board the Board toggle currently has the main
    // table showing — `filtered` already IS whichever board that is (and
    // already has demographic filters applied by the caller), so only the
    // OTHER board needs a fresh side-query here. `gym` is the full gym
    // object (or null if the viewer has no gym at all, in which case
    // there's only ever the one board and `filtered` already is it).
    //
    // The side-query is a one-time .get(), not a live listener — re-run
    // whenever renderLeaderboard runs (test/scope/filter/board change, or
    // the main board's own data updates), not continuously. At larger scale
    // this would be worth moving to a server-computed rank instead of
    // fetching every row client-side to find one position, but that's a
    // scaling concern for later, not a correctness issue now.
    async function updateMyRankBar(spotlight, scope, cfg, filtered, gym, boardScope){
        const el = $('#myRankBar');
        if (!el) return;
        const uid = getCurrentUserId();
        if (!uid || !cfg){ el.innerHTML=''; return; }
        function rankText(rows, label){
            const idx = rows.findIndex(r=>r.userId===uid);
            return idx>=0 ? `#${idx+1} of ${rows.length} ${label}` : `Not ranked ${label} yet`;
        }
        if (!gym){
            // No gym at all — there's only ever the one (public) board.
            el.innerHTML = renderRankBarHTML('', rankText(filtered, 'across TopSet'));
            return;
        }
        const ageFilter=$('#filterAgeGroup').value, genderFilter=$('#filterGender').value;
        function applyDemoFilters(rows){
            let r = rows;
            if (ageFilter) r = r.filter(x=>x.ageGroup===ageFilter);
            if (genderFilter) r = r.filter(x=>x.gender===genderFilter);
            return r;
        }
        let gymRows = boardScope==='gym' ? filtered : null;
        let pubRows = boardScope==='public' ? filtered : null;
        el.innerHTML = renderRankBarHTML(
            gymRows ? rankText(gymRows, `in ${escapeHTML(gym.name)}`) : 'Loading…',
            pubRows ? rankText(pubRows, 'across TopSet') : 'Loading…'
        );
        try {
            if (boardScope === 'gym'){
                const pubSnap = await db.collection('leaderboard').where('test','==',spotlight).where('scope','==',scope).where('gymId','==',null).get();
                let rows = []; pubSnap.forEach(d=>{ const x=d.data(); if (lbRowTrusted(x)) rows.push(x); });
                rows = applyDemoFilters(rows);
                rows.sort((a,b)=>cfg.higherIsBetter?b.value-a.value:a.value-b.value);
                pubRows = rows;
            } else {
                const gymSnap = await db.collection('leaderboard').where('test','==',spotlight).where('scope','==',scope).where('gymId','==',gym.id).get();
                let rows = []; gymSnap.forEach(d=>{ const x=d.data(); if (lbRowTrusted(x)) rows.push(x); });
                rows = applyDemoFilters(rows);
                rows.sort((a,b)=>cfg.higherIsBetter?b.value-a.value:a.value-b.value);
                gymRows = rows;
            }
            el.innerHTML = renderRankBarHTML(rankText(gymRows, `in ${escapeHTML(gym.name)}`), rankText(pubRows, 'across TopSet'));
        } catch(err){
            console.error('rank side-query failed:', err);
            el.innerHTML = renderRankBarHTML(
                gymRows ? rankText(gymRows, `in ${escapeHTML(gym.name)}`) : 'Could not load your gym rank.',
                pubRows ? rankText(pubRows, 'across TopSet') : 'Could not load your TopSet-wide rank.'
            );
        }
    }
    // ============================================================
    // STAT CARD — a FIFA-style player card with a radar/spider chart
    // per axis = one test in the member's effective catalog, plotted as a
    // 0-100 percentile within a given leaderboard pool. Colors follow a
    // deliberate scheme: Regular (gym) = grey (reads fine in both themes),
    // Official (gym) = var(--text-primary), which is ALREADY black in light
    // mode and white in dark mode in this app's existing theme tokens — so
    // reusing it gets the "black flips to white in dark mode" behavior for
    // free instead of hand-rolling theme detection. Public = a fixed blue,
    // same in both themes.
    // ============================================================
    const RADAR_COLOR_REGULAR = '#9ca3af';
    const RADAR_COLOR_OFFICIAL = 'var(--text-primary)';
    const RADAR_COLOR_PUBLIC = '#3b82f6';

    function computeRadarPoints(cx, cy, maxRadius, axisCount, valuesPercent){
        const pts = [];
        for (let i=0;i<axisCount;i++){
            const angle = (Math.PI*2/axisCount)*i - Math.PI/2;
            const r = (Math.max(0,Math.min(100, valuesPercent[i]||0))/100) * maxRadius;
            pts.push({ x: cx + r*Math.cos(angle), y: cy + r*Math.sin(angle) });
        }
        return pts;
    }
    function computeAxisEndpoints(cx, cy, maxRadius, axisCount){
        const pts = [];
        for (let i=0;i<axisCount;i++){
            const angle = (Math.PI*2/axisCount)*i - Math.PI/2;
            pts.push({ x: cx + maxRadius*Math.cos(angle), y: cy + maxRadius*Math.sin(angle) });
        }
        return pts;
    }
    // Builds an inline SVG spider chart. seriesList: [{color, values:[0-100,...]}].
    // Needs at least 3 axes to read as a real polygon rather than a line.
    // The root <svg> carries an explicit xmlns — dropping this string into the
    // page's own innerHTML (the live on-page radar) works fine without it,
    // since the HTML parser auto-namespaces a bare <svg> tag from context. But
    // the share-image path (generateStatCardBlob) base64-encodes this same
    // string and loads it as a STANDALONE image/svg+xml document via
    // new Image() — outside any HTML parsing context, a root <svg> with no
    // namespace isn't guaranteed to parse as a valid document, which is
    // exactly what was firing radarImg.onerror and breaking every share.
    function buildRadarSVG(axes, seriesList, size){
        size = size || 240;
        if (!axes.length || axes.length < 3){
            return '<p class="text-muted" style="padding:16px;font-size:12px;">Log results for at least 3 tests to unlock your radar chart.</p>';
        }
        const cx = size/2, cy = size/2, maxR = size/2 - 38;
        const n = axes.length;
        let gridHTML = '';
        [25,50,75,100].forEach(pct=>{
            const ringPts = computeAxisEndpoints(cx,cy,(pct/100)*maxR,n).map(p=>`${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
            gridHTML += `<polygon points="${ringPts}" fill="none" style="stroke:var(--border);stroke-width:1;"/>`;
        });
        const outerPts = computeAxisEndpoints(cx,cy,maxR,n);
        const axisLines = outerPts.map(p=>`<line x1="${cx}" y1="${cy}" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}" style="stroke:var(--border);stroke-width:1;"/>`).join('');
        const labelsHTML = outerPts.map((p,i)=>{
            const angle = (Math.PI*2/n)*i - Math.PI/2;
            const lx = cx + (maxR+20)*Math.cos(angle), ly = cy + (maxR+20)*Math.sin(angle);
            // Percentile number for this axis: the best value among the series
            // shown on THIS card (e.g. for the gym card, whichever is higher of
            // regular/official). Colored to match whichever series it came
            // from, so a glance tells you not just the number but which pool
            // it's from. "—" (muted) when nobody's logged this test at all,
            // rather than showing a misleading "0%".
            const headSeries = seriesList.filter(s=>s.headline);
            const labelSeries = headSeries.length ? headSeries : seriesList;
            let best=null, bestColor=null;
            labelSeries.forEach(s=>{ const v=s.values[i]; if (v!=null && (best==null||v>best)){ best=v; bestColor=s.color; } });
            const pctTxt = best==null ? '—' : `${Math.round(best)}%`;
            const numColor = best==null ? 'var(--text-muted)' : bestColor;
            return `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-size="9" style="fill:var(--text-muted);font-family:Montserrat,sans-serif;font-weight:600;">${escapeHTML(axes[i].label)}</text><text x="${lx.toFixed(1)}" y="${(ly+11).toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-size="10" style="fill:${numColor};font-family:Montserrat,sans-serif;font-weight:800;">${pctTxt}</text>`;
        }).join('');
        const seriesHTML = [...seriesList].sort((a,b)=>(a.footnote?0:1)-(b.footnote?0:1)).map(s=>{
            const pts = computeRadarPoints(cx,cy,maxR,n,s.values).map(p=>`${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
            if (s.footnote) return `<polygon points="${pts}" style="fill:${s.color};fill-opacity:0.05;stroke:${s.color};stroke-width:1.5;stroke-dasharray:4 3;"/>`;
            return `<polygon points="${pts}" style="fill:${s.color};fill-opacity:0.22;stroke:${s.color};stroke-width:2.5;"/>`;
        }).join('');
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" style="width:100%;max-width:${size}px;display:block;margin:0 auto;">${gridHTML}${axisLines}${seriesHTML}${labelsHTML}</svg>`;
    }
    // Percentile (0-100, higher = better) of the CURRENT user for one test,
    // within a leaderboard pool. gymFilter: a real gymId to scope to one
    // gym, or null to mean the genuine public/TOPSET-wide bucket (docs where
    // gymId IS null) — NOT "every gym pooled together with no filter at
    // all". That distinction matters now that a gym member can hold BOTH a
    // gym-bucket AND a public-bucket leaderboard doc for the same test: an
    // unfiltered query would double-count that person (once per doc) and
    // treat their gym PR as if it were a public one. gymFilter is always
    // applied as an exact match — including null, which Firestore correctly
    // resolves to "gymId IS null" — rather than being skipped when falsy.
    // Returns null if the user has no entry in that pool (not "0").
