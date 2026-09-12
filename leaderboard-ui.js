// ── leaderboard-ui.js ─────────────────────────────────
// Percentile cache, Stat Card (radar chart) generation, leaderboard
// rendering, and the edit/delete-entry modal.
//
// TRAINING CLUB REBUILD (this chunk) — the leaderboard is single-bucket
// now (see core.js's recomputeBestForUser()): no more gym/public dual
// pool, no more official/regular scope split. That collapses a LOT here:
// - percentileCacheKey/computeTestPercentile lose the scope+gymFilter
//   dimensions — just (test, uid) now.
// - The Stat Card was two cards (Gym + Public) with up to 2 series each;
//   it's one card, one series now.
// - renderLeaderboard() drops the board-scope toggle and result-scope
//   filter entirely — one query per spotlight test, full stop.
// - The Official Results edit path (editingOfficialEntry) is gone — that
//   entry point (openManagerEditEntry) no longer exists in admin-ui.js,
//   so there's nothing left to ever set it.

    // ── Percentile cache — THE fix for the Stat Card's Firestore-quota problem.
    // Opening the Stat Card used to fan out into up to 24 separate queries
    // (8 tests × up to 3 scopes), each re-reading every row in that scope
    // just to locate one person's rank, with zero caching between opens.
    // Now it's at most 8 queries (one per test, single bucket), and this
    // cache still de-dupes repeat opens within the TTL — cheap insurance,
    // not just a leftover from the old complexity.
    //
    // This does NOT eliminate the cost of the FIRST (cold) computation for
    // a given test — an exact rank genuinely requires reading every row for
    // it, and there's no way around that from the client. The real,
    // complete fix is a Cloud Function that precomputes and caches ranks
    // server-side (open item on the roadmap).
    const PERCENTILE_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
    const percentileCache = new Map(); // `${test}|${uid}` -> { value, expiresAt }
    function percentileCacheKey(testName, uid){ return `${testName}|${uid}`; }
    // Called after a leaderboard doc is written/deleted for this exact
    // (user, test) so the viewer's OWN cached percentile doesn't keep
    // showing a stale rank for up to 10 minutes right after they log
    // something new. Cheap — a single Map delete, not a re-fetch. Matches
    // core.js's recomputeBestForUser(), which calls this with exactly
    // these two args.
    function invalidatePercentileCache(testName, uid){
        percentileCache.delete(percentileCacheKey(testName, uid));
    }
    async function computeTestPercentile(testName){
        if (!initFirebase()) return null;
        const cfg = getTestConfig(testName);
        if (!cfg) return null;
        const uid = getCurrentUserId();
        const cacheKey = percentileCacheKey(testName, uid);
        const cached = percentileCache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) return cached.value;
        try {
            const snap = await db.collection('leaderboard').where('test','==',testName).get();
            const rows = []; snap.forEach(d=>rows.push(d.data()));
            let result = null;
            if (rows.length){
                rows.sort((a,b)=>cfg.higherIsBetter?b.value-a.value:a.value-b.value);
                const idx = rows.findIndex(r=>r.userId===uid);
                result = idx<0 ? null : (rows.length>1 ? Math.round(((rows.length-1-idx)/(rows.length-1))*100) : 100);
            }
            percentileCache.set(cacheKey, { value: result, expiresAt: Date.now() + PERCENTILE_CACHE_TTL_MS });
            return result;
        } catch(err){ console.error('computeTestPercentile failed:', err); return null; }
    }
    // Assembles what the Stat Card needs: axes (capped at 8 tests for
    // legibility) and one percentile per axis — no more gym-regular/
    // gym-official/public split, just "your rank for this test."
    async function buildStatCardData(){
        const tests = (appState.tests||[]).slice(0,8);
        const axes = tests.map(t=>({ label: t.name }));
        const values = [];
        for (const t of tests){
            // Kept as raw (possibly null), NOT coerced to 0 — "never logged
            // this test" and "logged it, ranked dead last" would otherwise
            // look identical. Null renders as "—"; computeRadarPoints still
            // treats null as 0 for plotting position via `||0`, so the
            // polygon shape is unaffected, only the printed number is.
            values.push(await computeTestPercentile(t.name));
        }
        return { axes, values };
    }
    // FIFA-card-style overall rating: average of the per-axis percentiles,
    // skipping axes with no data at all rather than letting them drag the
    // average toward 0. Returns null (not 0) if there's no data anywhere
    // yet, so the badge can show "—" instead of "0 OVR".
    function computeOverallRating(values){
        let sum = 0, counted = 0;
        values.forEach(v=>{ if (v!=null){ sum+=v; counted++; } });
        return counted ? Math.round(sum/counted) : null;
    }
    // Resolves a `var(--x)` expression to its current computed value. Needed
    // specifically for the SHARE export path: an SVG loaded into a canvas via
    // a data URL is an isolated image resource, not part of the page's DOM —
    // it can't see this page's CSS custom properties, so var() would silently
    // fail to resolve inside it. The LIVE on-page radar (rendered as real DOM,
    // inside the modal) doesn't need this — CSS vars cascade normally there.
    function resolveCSSVar(expr){
        if (!expr || typeof expr !== 'string' || !expr.startsWith('var(')) return expr;
        const varName = expr.slice(4, -1).trim();
        return getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || '#888';
    }
    const RADAR_COLOR = '#3b82f6'; // single series now — was RADAR_COLOR_PUBLIC; kept the same blue rather than introduce a new brand color for no reason
    function renderStatCardHTML(u, axes, values){
        const infoParts = [];
        if (u.ageGroup) infoParts.push(escapeHTML(u.ageGroup));
        if (u.gender) infoParts.push(escapeHTML(u.gender.charAt(0).toUpperCase()+u.gender.slice(1)));
        if (u.sport) infoParts.push(escapeHTML(u.sport));
        const infoLine = infoParts.join(' · ') || 'No profile details set yet';
        const radarSVG = buildRadarSVG(axes, [{color:RADAR_COLOR, values}], 220);
        const overall = computeOverallRating(values);
        const overallBadge = overall!=null
            ? `<div style="font-family:var(--font-display);font-size:24px;font-weight:800;color:var(--accent-green);line-height:1;">${overall}<span style="font-size:10px;font-weight:700;color:var(--text-muted);letter-spacing:1px;margin-left:3px;">OVR</span></div>`
            : '';
        return `<div class="stat-card-panel" style="width:300px;max-width:100%;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:20px;box-shadow:var(--shadow);">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
                <div style="font-size:10px;font-weight:800;letter-spacing:1.5px;color:var(--text-muted);">TOPSET · PUBLIC</div>
                ${overallBadge}
            </div>
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;">
                <span class="avatar-circle" style="width:52px;height:52px;font-size:26px;flex-shrink:0;">${escapeHTML(u.avatar||'🏋️')}</span>
                <div style="min-width:0;">
                    <div style="font-family:var(--font-display);font-size:19px;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHTML(u.name)}</div>
                    <div style="font-size:11px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${infoLine}</div>
                </div>
            </div>
            ${radarSVG}
            <button type="button" class="btn btn-outline btn-sm" style="width:100%;margin-top:16px;justify-content:center;" onclick="window.handleShareStatCard()"><svg class="btn-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M16 6l-4-4-4 4"/><path d="M12 2v13"/></svg> Share</button>
        </div>`;
    }
    let statCardDataCache = null;
    window.openStatCard = async function(){
        const u = getCurrentUser();
        if (!u) return;
        $('#statCardContent').innerHTML = '<p class="text-muted" style="padding:24px;">Loading your stats...</p>';
        $('#statCardModal').classList.remove('hidden');
        const data = await buildStatCardData();
        statCardDataCache = { ...data, profile: u };
        $('#statCardContent').innerHTML = renderStatCardHTML(u, data.axes, data.values);
    };
    window.closeStatCard = function(){ $('#statCardModal').classList.add('hidden'); statCardDataCache = null; };
    // Simple word-wrap for canvas text — canvas has no native wrapping, and
    // this message is long enough to overflow a single line at the card's
    // font size. Draws each wrapped line centered on x, starting at y.
    function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight){
        const words = text.split(' ');
        let line = '', lines = [];
        for (const word of words){
            const test = line ? line + ' ' + word : word;
            if (ctx.measureText(test).width > maxWidth && line){ lines.push(line); line = word; }
            else line = test;
        }
        if (line) lines.push(line);
        const startY = y - ((lines.length-1)*lineHeight)/2;
        lines.forEach((l,i)=>ctx.fillText(l, x, startY + i*lineHeight));
    }
    // Renders the one stat card (radar + name + info) to a shareable PNG,
    // following the same canvas + Web Share API pattern used for PR cards.
    async function generateStatCardBlob(){
        const cache = statCardDataCache;
        if (!cache) return null;
        const seriesList = [{color:resolveCSSVar(RADAR_COLOR), values:cache.values}];
        const borderColor = resolveCSSVar('var(--border)');
        const mutedColor = resolveCSSVar('var(--text-muted)');
        // Defensive: buildRadarSVG() returns a plain <p> fallback string (not
        // SVG) whenever there are fewer than 3 axes — e.g. an admin trims the
        // test catalog down below 3. Feeding that into the Image()/data-URL
        // pipeline below would always fail to parse and reject, same failure
        // mode as a missing-xmlns bug. Skip the radar image entirely in that
        // case and draw the same message straight onto the canvas instead,
        // so the share button still produces a real PNG.
        const hasRadar = (cache.axes||[]).length >= 3;
        let radarImg = null;
        if (hasRadar){
            let svgString = buildRadarSVG(cache.axes, seriesList, 500)
                .split('var(--border)').join(borderColor)
                .split('var(--text-muted)').join(mutedColor);
            const svgDataUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgString)));
            radarImg = new Image();
            try {
                await new Promise((resolve,reject)=>{
                    radarImg.onload=resolve;
                    radarImg.onerror=()=>reject(new Error('radar SVG failed to load as an image (stage: radar-svg-decode)'));
                    radarImg.src=svgDataUrl;
                });
            } catch(err){
                console.error('Radar SVG image failed to decode, falling back to text:', err);
                radarImg = null;
            }
        }
        const radarLoadFailed = hasRadar && !radarImg;

        const size = 1080;
        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d');
        const bgColor = resolveCSSVar('var(--bg)');
        const textPrimary = resolveCSSVar('var(--text-primary)');
        const textSecondary = resolveCSSVar('var(--text-secondary)');

        ctx.fillStyle = bgColor;
        ctx.fillRect(0,0,size,size);

        await Promise.all([
            document.fonts.load('700 60px Oswald'),
            document.fonts.load('800 44px Oswald'),
            document.fonts.load('800 26px Montserrat'),
            document.fonts.load('600 30px Montserrat'),
            document.fonts.load('600 24px Montserrat')
        ]).catch(err=>{
            console.error('Stat card font preload failed, continuing with fallback fonts:', err);
        });

        ctx.textAlign='center';
        ctx.fillStyle = mutedColor;
        ctx.font = '800 26px Montserrat';
        ctx.fillText('TOPSET STAT CARD', size/2, 80);

        const overall = computeOverallRating(cache.values);
        if (overall != null){
            ctx.fillStyle = resolveCSSVar('var(--accent-green)');
            ctx.font = '800 44px Oswald';
            ctx.fillText(`${overall} OVR`, size/2, 140);
        }

        ctx.fillStyle = textPrimary;
        ctx.font = '700 60px Oswald';
        ctx.fillText(cache.profile.name || 'TOPSET Athlete', size/2, 210);

        const infoParts = [];
        if (cache.profile.ageGroup) infoParts.push(cache.profile.ageGroup);
        if (cache.profile.gender) infoParts.push(cache.profile.gender.charAt(0).toUpperCase()+cache.profile.gender.slice(1));
        if (cache.profile.sport) infoParts.push(cache.profile.sport);
        ctx.fillStyle = textSecondary;
        ctx.font = '600 30px Montserrat';
        ctx.fillText(infoParts.join('   ·   ') || 'TOPSET Athlete', size/2, 250);

        const radarSize = 620;
        if (hasRadar && radarImg){
            ctx.drawImage(radarImg, (size-radarSize)/2, 295, radarSize, radarSize);
        } else {
            ctx.fillStyle = mutedColor;
            ctx.font = '500 26px Montserrat';
            ctx.textAlign = 'center';
            const fallbackMsg = radarLoadFailed
                ? 'Radar chart unavailable right now — try sharing again.'
                : 'Log results for at least 3 tests to unlock your radar chart.';
            wrapCanvasText(ctx, fallbackMsg, size/2, 295+radarSize/2, radarSize-80, 34);
        }

        ctx.textAlign = 'center';
        ctx.font = '500 22px Montserrat';
        ctx.fillStyle = mutedColor;
        ctx.fillText('TOPSET', size/2, size-40);

        return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    }
    window.handleShareStatCard = async function(){
        if (!statCardDataCache) return showToast('Could not find your stat card data.');
        showToast('Generating your stat card...');
        let blob;
        try { blob = await generateStatCardBlob(); }
        catch(err){
            console.error('generateStatCardBlob failed:', err);
            return showToast(`Could not generate the share image (${err?.message || 'unknown error'}). Check your connection and try again.`);
        }
        if (!blob) return showToast('Could not generate the share image — the canvas produced an empty file. Try again in a moment.');
        const fileName = `topset-statcard.png`;
        const file = new File([blob], fileName, { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })){
            try { await navigator.share({ files: [file], title: 'My TOPSET Stat Card', text: 'Check out my TOPSET stats!' }); return; }
            catch(err){ if (err.name === 'AbortError') return; console.error('navigator.share failed:', err); }
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = fileName;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('Image saved — share it anywhere!');
    };
    function renderRankBarHTML(rankText){
        if (!rankText) return '';
        return `<div style="display:flex;gap:24px;flex-wrap:wrap;font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:16px;padding:10px 14px;background:var(--bg-input);border-radius:var(--radius-sm);border:1px solid var(--border);"><span><span style="color:var(--text-muted);font-weight:700;text-transform:uppercase;font-size:10px;letter-spacing:0.6px;display:block;">Your Rank</span>${rankText}</span></div>`;
    }
    // No more gym/public split to update two figures for — one rank,
    // against whatever's currently in `filtered` (already has the
    // age/gender client-side filters applied by the caller).
    function updateMyRankBar(filtered){
        const el = $('#myRankBar');
        if (!el) return;
        const uid = getCurrentUserId();
        if (!uid){ el.innerHTML=''; return; }
        const idx = filtered.findIndex(r=>r.userId===uid);
        const text = idx>=0 ? `#${idx+1} of ${filtered.length} across TopSet` : 'Not ranked yet';
        el.innerHTML = renderRankBarHTML(text);
    }
    async function renderLeaderboard(){
        unsubscribeLeaderboard();
        if (!appState.currentUserId){ $('#leaderboardTableBody').innerHTML='<tr><td colspan="5" class="empty-state"><span class="emoji"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></span>Sign in to view the leaderboard.</td></tr>'; updateSpotlightSelect(); return; }
        updateSpotlightSelect();
        const spotlight=$('#spotlightLiftSelect').value||appState.spotlightLift;
        if (!spotlight){ $('#leaderboardTableBody').innerHTML='<tr><td colspan="5" class="empty-state"><span class="emoji"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 16v-4"/><path d="M12 16v-8"/><path d="M17 16v-2"/></svg></span>Select a spotlight test.</td></tr>'; return; }
        appState.spotlightLift=spotlight; localStorage.setItem(KEYS.spotlightLift,spotlight);
        if (!initFirebase()){ $('#leaderboardTableBody').innerHTML='<tr><td colspan="5" class="empty-state"><span class="emoji"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><path d="M12 9v4M12 17h.01"/></svg></span>Cloud leaderboard isn\'t set up yet — add your Firebase config to enable it.</td></tr>'; return; }
        const cfg=getTestConfig(spotlight), tb=$('#leaderboardTableBody');
        tb.innerHTML=skeletonTableRows(5,5);
        // ONE query now — no scope, no gymId. Public, single bucket, full stop.
        const query = db.collection('leaderboard').where('test','==',spotlight);
        leaderboardUnsub = query.onSnapshot(snapshot=>{
            const rankings=[];
            snapshot.forEach(doc=>rankings.push(doc.data()));
            // Client-side demographic filtering — avoids needing a composite Firestore index
            // per test+ageGroup+gender combination. Fine at this scale.
            const ageFilter=$('#filterAgeGroup').value, genderFilter=$('#filterGender').value;
            let filtered = rankings;
            if (ageFilter) filtered = filtered.filter(r=>r.ageGroup===ageFilter);
            if (genderFilter) filtered = filtered.filter(r=>r.gender===genderFilter);
            if (cfg) filtered.sort((a,b)=>cfg.higherIsBetter?b.value-a.value:a.value-b.value);
            updateMyRankBar(filtered);
            if (!filtered.length){ tb.innerHTML=`<tr><td colspan="5" class="empty-state"><span class="emoji"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z"/></svg></span>No entries for "${escapeHTML(spotlight)}" ${ageFilter||genderFilter?'in this group ':''}yet.</td></tr>`; return; }
            tb.innerHTML=filtered.map((r,i)=>{ const rc=i===0?'gold':i===1?'silver':i===2?'bronze':''; const disp=cfg&&cfg.unit==='time'?formatTime(r.value):`${r.value} ${cfg?.unit||''}`; return `<tr><td class="leaderboard-rank ${rc}">${i+1}</td><td><div style="display:flex;align-items:center;gap:8px;"><span class="avatar-circle">${escapeHTML(r.avatar||'🏋️')}</span><strong>${escapeHTML(r.name)}</strong></div></td><td>${escapeHTML(r.test)}</td><td class="num-cell highlight-pr">${disp}</td><td>${formatDate(r.date)}</td></tr>`; }).join('');
        }, err=>{ console.error('Leaderboard listener error:', err); tb.innerHTML='<tr><td colspan="5" class="empty-state"><span class="emoji"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><path d="M12 9v4M12 17h.01"/></svg></span>Couldn\'t load the leaderboard. Check your connection.</td></tr>'; });
    }
    function updateSpotlightSelect(){ const sel=$('#spotlightLiftSelect'), cur=sel.value||appState.spotlightLift; sel.innerHTML='<option value="">-- Select Test --</option>'+appState.tests.map(t=>`<option value="${escapeHTML(t.name)}" ${t.name===cur?'selected':''}>${escapeHTML(t.name)}</option>`).join(''); }
    function populateLogTestSelect(){ const sel=$('#logTest'), cur=sel.value; sel.innerHTML='<option value="">-- Select Test --</option>'+appState.tests.map(t=>`<option value="${escapeHTML(t.name)}" ${t.name===cur?'selected':''}>${escapeHTML(t.name)} (${t.unit==='time'?'mm:ss':escapeHTML(t.unit)})</option>`).join(''); }
    // populatePublicLogTestSelect() and updateLogFormVisibility() are GONE —
    // there's only one Log form now (see entries-journal.js), so there's no
    // second dropdown to populate and no badge/second-card visibility to
    // toggle. results-ui.js still calls the old public-form handler and
    // app-init.js still references this pair — both are cleaned up in the
    // next chunk (results-ui.js/index.html/app-init.js), tracked in the
    // progress doc.
    // EDIT / DELETE
    let editingEntryId=null;
    window.openEditEntryModal=function(id){ const entry=appState.entries.find(e=>e.id===id); if(!entry) return; const cfg=getTestConfig(entry.test); editingEntryId=id; $('#editEntryTest').value=entry.test; $('#editEntryDate').value=entry.date; const resultInput=$('#editEntryResult'); if(cfg&&cfg.unit==='time'){ resultInput.type='text'; resultInput.value=formatTime(entry.value); $('#editEntryResultLabel').textContent='Time (mm:ss)'; } else { resultInput.type=cfg?cfg.inputType:'number'; resultInput.step='any'; resultInput.value=entry.value; $('#editEntryResultLabel').textContent=cfg?`Result (${cfg.unit})`:'Result'; } $('#editEntryModal').classList.remove('hidden'); };
    window.closeEditEntryModal=function(){ $('#editEntryModal').classList.add('hidden'); editingEntryId=null; };
    window.handleEditEntrySubmit=async function(e){
        e.preventDefault();
        if(!editingEntryId) return closeEditEntryModal(); const entry=appState.entries.find(en=>en.id===editingEntryId); if(!entry) return closeEditEntryModal(); const cfg=getTestConfig(entry.test), raw=$('#editEntryResult').value.trim(), date=$('#editEntryDate').value; let value; if(cfg&&cfg.unit==='time'){ value=parseTime(raw); if(isNaN(value)) return showToast('Invalid time format (mm:ss).'); } else { value=parseFloat(raw); if(isNaN(value)) return showToast('Invalid number.'); } if(!date) return showToast('Please select a date.'); const ok = await updateEntry(editingEntryId,{value,date}); if(!ok) return; await pushBestToCloud(entry.test); showToast('Entry updated.'); closeEditEntryModal(); renderHistory(); renderPRs(); updateStatsRow(); };
    window.handleDeleteEntry=async function(id){ const entry=appState.entries.find(e=>e.id===id); if(!confirm('Delete this entry? This cannot be undone.')) return; const testName=entry?entry.test:null; if(await deleteEntry(id)){ if(testName) await pushBestToCloud(testName); showToast('Entry deleted.'); renderHistory(); renderPRs(); updateStatsRow(); } };
    // Escapes for BOTH text-node content AND quoted-attribute contexts (e.g.
    // value="${escapeHTML(x)}") — the div/textContent trick alone only
    // escapes <, >, & (the only characters that matter in text-node
    // content), NOT quote characters, since browsers don't need to encode
    // quotes when serializing plain text back to innerHTML. That made this
    // function silently unsafe for the option value="..." attribute pattern
    // used for test-name dropdowns: an unescaped `"` in a test name could
    // break out of the attribute entirely. The extra .replace() calls make
    // it safe everywhere, with zero visual difference at any existing
    // text-node call site (a literal quote and its HTML entity render
    // identically as plain text).
