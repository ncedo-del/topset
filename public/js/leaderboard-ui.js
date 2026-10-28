// ── leaderboard-ui.js ─────────────────────────────────
// Percentile cache, Stat Card (radar chart) generation, leaderboard
// rendering, and the edit/delete-entry modal.

    // ── Percentile cache — THE fix for the Stat Card's Firestore-quota problem.
    // Before this: opening the Stat Card fanned out into up to 24 separate
    // Firestore queries (8 tests × up to 3 scopes: gym-regular, gym-official,
    // public), and EVERY query re-read every leaderboard row in that scope
    // just to locate one person's rank — with ZERO caching between opens. Tap
    // the Stat Card icon a handful of times in a session (very plausible —
    // it's a header button, and people reopen/re-share it) and that's the
    // same expensive fetch repeated every single time, well before a single
    // new result was ever logged. This cache de-dupes identical
    // (test, scope, gym, viewer) lookups for a short TTL, so repeated opens —
    // and repeated visits to the Leaderboard's own "rank across TopSet" bar,
    // which calls this exact same function — hit memory instead of Firestore.
    //
    // This does NOT eliminate the cost of the FIRST (cold) computation for a
    // given combo — an exact rank genuinely requires reading every row in
    // that scope, and there's no way around that from the client. The real,
    // complete fix is the Cloud Function that precomputes and caches ranks
    // server-side (already an open item on the TOPSET roadmap) so the client
    // never runs this fan-out at all. This cache is the immediate mitigation
    // for the dominant real-world cost — repeat views, not repeat logging —
    // achievable without standing up Cloud Functions infra today.
    const PERCENTILE_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
    const percentileCache = new Map(); // `${test}|${scope}|${bucket}|${uid}` -> { value, expiresAt }
    function percentileCacheKey(testName, scope, gymFilter, uid){
        const bucket = gymFilter ? `gym:${gymFilter}` : 'public';
        return `${testName}|${scope}|${bucket}|${uid}`;
    }
    // Called after a leaderboard doc is written/deleted for this exact
    // (user, test, scope, bucket) so the viewer's OWN cached percentile for
    // it doesn't keep showing a stale rank for up to 10 minutes right after
    // they log something new. Cheap — a single Map delete, not a re-fetch.
    function invalidatePercentileCache(testName, scope, gymFilter, uid){
        percentileCache.delete(percentileCacheKey(testName, scope, gymFilter, uid));
    }
    async function computeTestPercentile(testName, scope, gymFilter){
        if (!initFirebase()) return null;
        const cfg = getTestConfig(testName);
        if (!cfg) return null;
        const uid = getCurrentUserId();
        const cacheKey = percentileCacheKey(testName, scope, gymFilter, uid);
        const cached = percentileCache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) return cached.value;
        try {
            let query = db.collection('leaderboard').where('test','==',testName).where('scope','==',scope).where('gymId','==',gymFilter);
            const snap = await query.get();
            const rows = []; snap.forEach(d=>{ const x=d.data(); if (lbRowTrusted(x)) rows.push(x); });
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
    // Assembles everything the Stat Card needs: axes (capped at 8 tests for
    // legibility) and per-axis percentiles for gym-regular, gym-official
    // (both only if the member has a gym), and public. Public uses the
    // 'regular' scope specifically — aggregating "official" across many
    // different gyms with different verification standards doesn't have a
    // clean shared meaning the way it does within one gym.
    async function buildStatCardData(){
        const u = getCurrentUser();
        const tests = (appState.tests||[]).filter(testVisibleToUser).slice(0,8);
        const axes = tests.map(t=>({ label: t.name }));
        const gymRegular = [], gymOfficial = [], publicVals = [];
        for (const t of tests){
            const [reg, off, pub] = await Promise.all([
                u?.gymId ? computeTestPercentile(t.name,'regular',u.gymId) : Promise.resolve(null),
                u?.gymId ? computeTestPercentile(t.name,'official',u.gymId) : Promise.resolve(null),
                computeTestPercentile(t.name,'regular',null)
            ]);
            // Kept as raw (possibly null) values now, NOT coerced to 0 — "never
            // logged this test" and "logged it, ranked dead last" used to look
            // identical (both became 0). That was invisible before (just an
            // empty dot at the radar's center either way), but now that actual
            // percentile numbers are printed on the card, showing "0%" for a
            // test someone's never touched would read as an insult rather than
            // a missing stat. Null renders as "—" instead. computeRadarPoints
            // already treats null as 0 for plotting position via `||0`, so the
            // shape of the polygon itself is unaffected — only the printed
            // number and the OVR average now correctly skip it.
            gymRegular.push(reg);
            gymOfficial.push(off);
            publicVals.push(pub);
        }
        return { axes, gymRegular, gymOfficial, publicVals, hasGym: !!u?.gymId };
    }
    // FIFA-card-style overall rating: the average of your BEST shown percentile
    // per axis (across whichever series — regular/official/public — this
    // specific card is displaying), skipping axes with no data at all rather
    // than letting them drag the average toward 0. Returns null (not 0) if
    // there's no data anywhere yet, so the badge can show "—" instead of "0 OVR".
    function computeOverallRating(seriesList, axisCount){
        let sum = 0, counted = 0;
        for (let i=0;i<axisCount;i++){
            let best = null;
            seriesList.forEach(s=>{ const v=s.values[i]; if (v!=null && (best==null || v>best)) best=v; });
            if (best!=null){ sum+=best; counted++; }
        }
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
    function renderStatCardHTML(kind, u, gymName, axes, seriesList, legendItems){
        const infoParts = [];
        if (u.ageGroup) infoParts.push(escapeHTML(u.ageGroup));
        if (u.gender) infoParts.push(escapeHTML(u.gender.charAt(0).toUpperCase()+u.gender.slice(1)));
        if (u.sport) infoParts.push(escapeHTML(u.sport));
        if (kind==='gym' && gymName) infoParts.push(escapeHTML(gymName));
        const infoLine = infoParts.join(' · ') || 'No profile details set yet';
        const radarSVG = buildRadarSVG(axes, seriesList, 220);
        const legendHTML = legendItems.map(l=>`<span style="display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:700;color:var(--text-secondary);"><span style="width:10px;height:10px;border-radius:50%;background:${l.color};display:inline-block;flex-shrink:0;"></span>${escapeHTML(l.label)}</span>`).join('');
        const headlineSeries = seriesList.filter(s=>s.headline);
        const overall = kind==='gym' ? computeOverallRating(headlineSeries, axes.length) : null;
        const overallBadge = overall!=null
            ? `<div style="font-family:var(--font-display);font-size:24px;font-weight:800;color:var(--accent-green);line-height:1;">${overall}<span style="font-size:10px;font-weight:700;color:var(--text-muted);letter-spacing:1px;margin-left:3px;">OFFICIAL OVR</span></div>`
            : (kind==='gym' ? '<div style="font-size:10px;font-weight:700;color:var(--text-muted);">No official results yet</div>' : '');
        return `<div class="stat-card-panel" style="width:300px;max-width:100%;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:20px;box-shadow:var(--shadow);">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
                <div style="font-size:10px;font-weight:800;letter-spacing:1.5px;color:var(--text-muted);">${kind==='gym'?'GYM · OFFICIAL':'PUBLIC · SELF-REPORTED'}</div>
                ${overallBadge}
            </div>
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;">
                ${avatarCircleHTML(u.avatar,52)}
                <div style="min-width:0;">
                    <div style="font-family:var(--font-display);font-size:19px;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHTML(u.name)}</div>
                    <div style="font-size:11px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${infoLine}</div>
                </div>
            </div>
            ${radarSVG}
            <div style="display:flex;gap:14px;justify-content:center;margin-top:10px;flex-wrap:wrap;">${legendHTML}</div>
            <button type="button" class="btn btn-outline btn-sm" style="width:100%;margin-top:16px;justify-content:center;" onclick="window.handleShareStatCard('${kind}')"><svg class="btn-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M16 6l-4-4-4 4"/><path d="M12 2v13"/></svg> Share</button>
        </div>`;
    }
    let statCardDataCache = null;
    window.openStatCard = async function(){
        const u = getCurrentUser();
        if (!u) return;
        $('#statCardContent').innerHTML = '<p class="text-muted" style="padding:24px;">Loading your stats...</p>';
        $('#statCardModal').classList.remove('hidden');
        const data = await buildStatCardData();
        let gymName = null;
        if (u.gymId){ const gym = await getGymById(u.gymId); gymName = gym ? gym.name : null; }
        statCardDataCache = { ...data, profile: u, gymName };
        let html = '';
        if (data.hasGym){
            html += renderStatCardHTML('gym', u, gymName, data.axes,
                [{color:RADAR_COLOR_REGULAR, values:data.gymRegular, footnote:true}, {color:RADAR_COLOR_OFFICIAL, values:data.gymOfficial, headline:true}],
                [{color:RADAR_COLOR_OFFICIAL, label:'Official (verified by your gym)'}, {color:RADAR_COLOR_REGULAR, label:'Self-logged (footnote)'}]
            );
        }
        html += renderStatCardHTML('public', u, gymName, data.axes,
            [{color:RADAR_COLOR_PUBLIC, values:data.publicVals}],
            [{color:RADAR_COLOR_PUBLIC, label:'Public · TopSet-Wide'}]
        );
        $('#statCardContent').innerHTML = html;
    };
    window.closeStatCard = function(){ $('#statCardModal').classList.add('hidden'); statCardDataCache = null; };
    // Renders one stat card (radar + name + info) to a shareable PNG, following
    // the same canvas + Web Share API pattern already used for PR cards.
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
    async function generateStatCardBlob(kind){
        const cache = statCardDataCache;
        if (!cache) return null;
        const seriesList = kind==='gym'
            ? [{color:resolveCSSVar(RADAR_COLOR_REGULAR), values:cache.gymRegular, footnote:true},{color:resolveCSSVar(RADAR_COLOR_OFFICIAL), values:cache.gymOfficial, headline:true}]
            : [{color:resolveCSSVar(RADAR_COLOR_PUBLIC), values:cache.publicVals}];
        const borderColor = resolveCSSVar('var(--border)');
        const mutedColor = resolveCSSVar('var(--text-muted)');
        // Defensive: buildRadarSVG() returns a plain <p> fallback string (not
        // SVG) whenever there are fewer than 3 axes — e.g. an admin trims the
        // test catalog down below 3. Feeding that into the Image()/data-URL
        // pipeline below would always fail to parse and reject, same failure
        // mode as the missing-xmlns bug. Skip the radar image entirely in
        // that case and draw the same message straight onto the canvas
        // instead, so the share button still produces a real PNG.
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
                    // Image error events carry no useful .message — swap in a real
                    // Error so this is actually diagnosable in the console instead
                    // of just logging a bare, uninformative Event object.
                    radarImg.onerror=()=>reject(new Error('radar SVG failed to load as an image (stage: radar-svg-decode)'));
                    radarImg.src=svgDataUrl;
                });
            } catch(err){
                // Don't let a broken radar image take down the whole card — draw
                // the same "not enough data" fallback text instead and keep going,
                // so a share attempt still produces a usable PNG. Still logged so
                // the actual cause is visible, not silently swallowed.
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
            // A rejected font load (e.g. Google Fonts unreachable — very real for
            // a gym-floor PWA on bad wifi/cellular) used to abort the ENTIRE
            // share, even though canvas text still renders fine in a fallback
            // system font. Log it and keep going instead of failing the whole
            // card over a cosmetic font substitution.
            console.error('Stat card font preload failed, continuing with fallback fonts:', err);
        });

        ctx.textAlign='center';
        ctx.fillStyle = mutedColor;
        ctx.font = '800 26px Montserrat';
        ctx.fillText(kind==='gym' ? 'OFFICIAL STAT CARD' : 'SELF-REPORTED STAT CARD', size/2, 80);

        // Same OVR rating shown on the live preview card — kept in sync by
        // computing it the same way, from the same seriesList, right here.
        const overall = kind==='gym' ? computeOverallRating(seriesList.filter(s=>s.headline), (cache.axes||[]).length) : null;
        if (overall != null){
            ctx.fillStyle = resolveCSSVar('var(--accent-green)');
            ctx.font = '800 44px Oswald';
            ctx.fillText(`${overall} OFFICIAL OVR`, size/2, 140);
        }

        ctx.fillStyle = textPrimary;
        ctx.font = '700 60px Oswald';
        ctx.fillText(cache.profile.name || 'TOPSET Athlete', size/2, 210);

        const infoParts = [];
        if (cache.profile.ageGroup) infoParts.push(cache.profile.ageGroup);
        if (cache.profile.gender) infoParts.push(cache.profile.gender.charAt(0).toUpperCase()+cache.profile.gender.slice(1));
        if (cache.profile.sport) infoParts.push(cache.profile.sport);
        if (kind==='gym' && cache.gymName) infoParts.push(cache.gymName);
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

        const legendItems = kind==='gym'
            ? [{color:resolveCSSVar(RADAR_COLOR_OFFICIAL), label:'Official'},{color:resolveCSSVar(RADAR_COLOR_REGULAR), label:'Self-logged'}]
            : [{color:resolveCSSVar(RADAR_COLOR_PUBLIC), label:'Public · TopSet-Wide'}];
        ctx.font = '600 24px Montserrat';
        const widths = legendItems.map(l=>ctx.measureText(l.label).width + 34);
        const totalW = widths.reduce((a,b)=>a+b,0) + (legendItems.length-1)*24;
        let startX = size/2 - totalW/2;
        const legendY = 940;
        ctx.textAlign = 'left';
        legendItems.forEach((l,i)=>{
            ctx.fillStyle = l.color;
            ctx.beginPath(); ctx.arc(startX+10, legendY-8, 9, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = textSecondary;
            ctx.fillText(l.label, startX+26, legendY);
            startX += widths[i] + 24;
        });

        ctx.textAlign = 'center';
        ctx.font = '500 22px Montserrat';
        ctx.fillStyle = mutedColor;
        ctx.fillText('TOPSET', size/2, size-40);

        return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    }
    window.handleShareStatCard = async function(kind){
        if (!statCardDataCache) return showToast('Could not find your stat card data.');
        showToast('Generating your stat card...');
        let blob;
        try { blob = await generateStatCardBlob(kind); }
        catch(err){
            console.error('generateStatCardBlob failed:', err);
            // Surface the real reason instead of a dead-end generic message —
            // this is the difference between "still broken, no idea why" and
            // an actual next step. err.message is safe to show; it never
            // contains anything sensitive, just which stage failed.
            return showToast(`Could not generate the share image (${err?.message || 'unknown error'}). Check your connection and try again.`);
        }
        if (!blob) return showToast('Could not generate the share image — the canvas produced an empty file. Try again in a moment.');
        const fileName = `topset-statcard-${kind}.png`;
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
    function renderRankBarHTML(gymText, publicText){
        if (!gymText && !publicText) return '';
        const cell = (label, text) => text ? `<span><span style="color:var(--text-muted);font-weight:700;text-transform:uppercase;font-size:10px;letter-spacing:0.6px;display:block;">${label}</span>${text}</span>` : '';
        return `<div style="display:flex;gap:24px;flex-wrap:wrap;font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:16px;padding:10px 14px;background:var(--bg-input);border-radius:var(--radius-sm);border:1px solid var(--border);">${cell('Your Rank', gymText)}${cell('TopSet-Wide', publicText)}</div>`;
    }
    async function renderLeaderboard(){
        unsubscribeLeaderboard();
        if (!appState.currentUserId){ $('#leaderboardTableBody').innerHTML='<tr><td colspan="5" class="empty-state"><span class="emoji"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></span>Sign in to view the leaderboard.</td></tr>'; updateSpotlightSelect(); return; }
        updateSpotlightSelect();
        // Static options (unlike spotlight's dynamic list), so the select just
        // needs its displayed value synced to the persisted preference once.
        if (!$('#filterResultScope').dataset.restored){ $('#filterResultScope').value = appState.resultScope || 'regular'; $('#filterResultScope').dataset.restored = '1'; }
        if (!$('#filterBoardScope').dataset.restored){ $('#filterBoardScope').value = appState.boardScope || 'gym'; $('#filterBoardScope').dataset.restored = '1'; }
        const spotlight=$('#spotlightLiftSelect').value||appState.spotlightLift;
        if (!spotlight){ $('#leaderboardTableBody').innerHTML='<tr><td colspan="5" class="empty-state"><span class="emoji"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 16v-4"/><path d="M12 16v-8"/><path d="M17 16v-2"/></svg></span>Select a spotlight test.</td></tr>'; return; }
        appState.spotlightLift=spotlight; localStorage.setItem(KEYS.spotlightLift,spotlight);
        if (!initFirebase()){ $('#leaderboardTableBody').innerHTML='<tr><td colspan="5" class="empty-state"><span class="emoji"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><path d="M12 9v4M12 17h.01"/></svg></span>Cloud leaderboard isn\'t set up yet — add your Firebase config to enable it.</td></tr>'; return; }
        const user=getCurrentUser();
        const gymLabelEl=$('#leaderboardGymLabel');
        const boardScopeEl=$('#filterBoardScope');
        let gym = null;
        if (user?.gymId){
            gym = await getGymById(user.gymId);
            // Only gym members ever get a choice — a gym-less user's own pool
            // already IS the public one, so there's nothing to toggle between.
            boardScopeEl.classList.remove('hidden');
        } else {
            boardScopeEl.classList.add('hidden');
        }
        // For a gym-less user, force public regardless of whatever was last
        // persisted (e.g. from a previous session where they did have a gym).
        const boardScope = (user?.gymId && gym) ? (boardScopeEl.value || 'gym') : 'public';
        appState.boardScope = boardScope; localStorage.setItem(KEYS.boardScope, boardScope);
        if (boardScope === 'public'){
            gymLabelEl.innerHTML='<svg style="width:14px;height:14px;vertical-align:-2px;margin-right:4px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10Z"/><path d="M2 12h20"/></svg>Public · TopSet-Wide';
        } else if (gym){
            gymLabelEl.innerHTML = `<svg style="width:14px;height:14px;vertical-align:-2px;margin-right:4px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M10 22v-4h4v4"/><path d="M2 22h20"/><path d="M10 6h4M10 10h4M10 14h4"/></svg>${escapeHTML(gym.name)}`;
        } else {
            gymLabelEl.innerHTML = '<svg style="width:14px;height:14px;vertical-align:-2px;margin-right:4px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><path d="M12 9v4M12 17h.01"/></svg>Gym not found';
        }
        const cfg=getTestConfig(spotlight), tb=$('#leaderboardTableBody');
        tb.innerHTML=skeletonTableRows(5,5);
        const scope = $('#filterResultScope').value || appState.resultScope || 'regular';
        appState.resultScope = scope; localStorage.setItem(KEYS.resultScope, scope);
        // gymId is a real server-side query filter — this is the privacy boundary between
        // gyms, so it belongs in the Firestore .where(), not filtered client-side like
        // age/gender are below. Which gymId to filter to now follows the Board toggle
        // above rather than being purely derived from the viewer's own membership: a
        // gym member can view either their gym's board (gymId==their gym) or the
        // public/TopSet-wide board (gymId==null) — the same two pools the dual Log
        // form writes into. A gym-less user only ever has the public pool, same as
        // every account did before gyms existed.
        let query = db.collection('leaderboard').where('test','==',spotlight).where('scope','==',scope);
        query = boardScope==='gym' ? query.where('gymId','==',user.gymId) : query.where('gymId','==',null);
        leaderboardUnsub = query.onSnapshot(snapshot=>{
            const rankings=[];
            snapshot.forEach(doc=>{ const x=doc.data(); if (lbRowTrusted(x)) rankings.push(x); });
            // Client-side demographic filtering — avoids needing a composite Firestore index
            // per test+ageGroup+gender combination. Fine at this scale (one gym's worth of entries per test).
            const ageFilter=$('#filterAgeGroup').value, genderFilter=$('#filterGender').value;
            let filtered = rankings;
            if (ageFilter) filtered = filtered.filter(r=>r.ageGroup===ageFilter);
            if (genderFilter) filtered = filtered.filter(r=>r.gender===genderFilter);
            if (cfg) filtered.sort((a,b)=>cfg.higherIsBetter?b.value-a.value:a.value-b.value);
            updateMyRankBar(spotlight, scope, cfg, filtered, gym, boardScope);
            if (!filtered.length){ tb.innerHTML=`<tr><td colspan="5" class="empty-state"><span class="emoji"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z"/></svg></span>No entries for "${escapeHTML(spotlight)}" ${ageFilter||genderFilter?'in this group ':''}yet.</td></tr>`; return; }
            tb.innerHTML=filtered.map((r,i)=>{ const rc=i===0?'gold':i===1?'silver':i===2?'bronze':''; const disp=cfg&&cfg.unit==='time'?formatTime(r.value):`${r.value} ${cfg?.unit||''}`; return `<tr><td class="leaderboard-rank ${rc}">${i+1}</td><td><div style="display:flex;align-items:center;gap:8px;">${avatarCircleHTML(r.avatar,40)}<strong>${escapeHTML(r.name)}</strong></div></td><td>${escapeHTML(r.test)}</td><td class="num-cell highlight-pr">${disp}</td><td>${formatDate(r.date)}</td></tr>`; }).join('');
        }, err=>{ console.error('Leaderboard listener error:', err); tb.innerHTML='<tr><td colspan="5" class="empty-state"><span class="emoji"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><path d="M12 9v4M12 17h.01"/></svg></span>Couldn\'t load the leaderboard. Check your connection.</td></tr>'; });
    }
    function updateSpotlightSelect(){ const sel=$('#spotlightLiftSelect'), cur=sel.value||appState.spotlightLift; sel.innerHTML='<option value="">-- Select Test --</option>'+appState.tests.filter(testVisibleToUser).map(t=>`<option value="${escapeHTML(t.name)}" ${t.name===cur?'selected':''}>${escapeHTML(t.name)}</option>`).join(''); }
    function populateLogTestSelect(){ const sel=$('#logTest'), cur=sel.value; sel.innerHTML='<option value="">-- Select Test --</option>'+appState.tests.filter(testVisibleToUser).map(t=>`<option value="${escapeHTML(t.name)}" ${t.name===cur?'selected':''}>${escapeHTML(t.name)} (${t.unit==='time'?'mm:ss':escapeHTML(t.unit)})</option>`).join(''); }
    // Public form's dropdown is deliberately fed by appState.globalTests, NOT
    // appState.tests — a gym member logging publicly should see the exact same
    // test list as every other public-pool user, not their gym's custom tests.
    function populatePublicLogTestSelect(){ const sel=$('#logTestPublic'); if(!sel) return; const cur=sel.value; sel.innerHTML='<option value="">-- Select Test --</option>'+(appState.globalTests||[]).filter(testVisibleToUser).map(t=>`<option value="${escapeHTML(t.name)}" ${t.name===cur?'selected':''}>${escapeHTML(t.name)} (${t.unit==='time'?'mm:ss':escapeHTML(t.unit)})</option>`).join(''); }
    // Shows/hides the second (public) Log form and labels the first one —
    // ONLY signed-in members who belong to a gym get the dual-form setup, since
    // for a gym-less user the single form already IS the public pool.
    function updateLogFormVisibility(){
        const badge=$('#logGymBadge'), publicCard=$('#publicLogCard'), gym=appState.myGym;
        if (gym){
            badge.textContent = gym.name; badge.classList.remove('hidden');
            publicCard.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
            publicCard.classList.add('hidden');
        }
    }
    // EDIT / DELETE
    let editingEntryId=null;
    // When a gym manager edits an official entry from the My Gym panel (not
    // their own entry), that entry object lives here instead — it isn't in
    // appState.entries (which only ever holds the CURRENT user's own entries),
    // so the submit handler below branches on which of these two is set.
    let editingOfficialEntry=null;
    window.openEditEntryModal=function(id){ const entry=appState.entries.find(e=>e.id===id); if(!entry) return; if(entry.isOfficial){ showToast(entry.officialStatus==='verified' ? 'This result is verified — only your gym manager can edit it.' : 'Official submissions can\'t be edited — delete it and log it again, or ask your gym manager.'); return; } const cfg=getTestConfig(entry.test); editingEntryId=id; $('#editEntryTest').value=entry.test; $('#editEntryDate').value=entry.date; const resultInput=$('#editEntryResult'); if(cfg&&cfg.unit==='time'){ resultInput.type='text'; resultInput.value=formatTime(entry.value); $('#editEntryResultLabel').textContent='Time (mm:ss)'; } else { resultInput.type=cfg?cfg.inputType:'number'; resultInput.step='any'; resultInput.value=entry.value; $('#editEntryResultLabel').textContent=cfg?`Result (${cfg.unit})`:'Result'; } $('#editEntryModal').classList.remove('hidden'); };
    window.closeEditEntryModal=function(){ $('#editEntryModal').classList.add('hidden'); editingEntryId=null; editingOfficialEntry=null; };
    window.handleEditEntrySubmit=async function(e){
        e.preventDefault();
        if (editingOfficialEntry){
            const entry = editingOfficialEntry;
            const cfg=getTestConfig(entry.test), raw=$('#editEntryResult').value.trim(), date=$('#editEntryDate').value;
            let value;
            if(cfg&&cfg.unit==='time'){ value=parseTime(raw); if(isNaN(value)) return showToast('Invalid time format (mm:ss).'); }
            else { value=parseFloat(raw); if(isNaN(value)) return showToast('Invalid number.'); }
            if(!date) return showToast('Please select a date.');
            // Editing a VERIFIED result re-stamps it with the editing manager; a pending one stays pending.
            const ok = await updateEntry(entry.id, entry.officialStatus==='verified' ? { value, date, ...verifyStamp('verified') } : { value, date });
            if(!ok) return;
            await afterOfficialChange({ ...entry, value, date });
            showToast('Official result updated.');
            closeEditEntryModal();
            if (myGymCache) { const roster = await fetchGymRoster(myGymCache.id); const results = await fetchOfficialResults(myGymCache.id); renderOfficialResults(results, roster); }
            return;
        }
        if(!editingEntryId) return closeEditEntryModal(); const entry=appState.entries.find(en=>en.id===editingEntryId); if(!entry) return closeEditEntryModal(); const cfg=getTestConfig(entry.test), raw=$('#editEntryResult').value.trim(), date=$('#editEntryDate').value; let value; if(cfg&&cfg.unit==='time'){ value=parseTime(raw); if(isNaN(value)) return showToast('Invalid time format (mm:ss).'); } else { value=parseFloat(raw); if(isNaN(value)) return showToast('Invalid number.'); } if(!date) return showToast('Please select a date.'); const ok = await updateEntry(editingEntryId,{value,date}); if(!ok) return; await pushBestToCloud(entry.test); showToast('Entry updated.'); closeEditEntryModal(); renderHistory(); renderPRs(); updateStatsRow(); };
    window.handleDeleteEntry=async function(id){ const entry=appState.entries.find(e=>e.id===id); if(entry?.isOfficial && entry.officialStatus==='verified'){ showToast('This result is verified — only your gym manager can delete it.'); return; } if(!confirm('Delete this entry? This cannot be undone.')) return; const testName=entry?entry.test:null; if(await deleteEntry(id)){ if(testName) await pushBestToCloud(testName); showToast('Entry deleted.'); renderHistory(); renderPRs(); updateStatsRow(); } };
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
