// ── results-ui.js ─────────────────────────────────────
// Stats row, History and PR table rendering, shareable PR card image
// generation, and the generic radar-chart SVG helpers the Stat Card
// (leaderboard-ui.js) builds on.
//
// TRAINING CLUB REBUILD (this chunk) — REMOVED:
// - getTestConfigPublic()/updateResultFieldPublic()/handleLogSubmitPublic():
//   the second (public) Log form is gone. There's one Log form now (see
//   entries-journal.js's handleLogSubmit, consolidated in 4d) — personal
//   test-logging was never club-scoped, so there was never a real reason
//   for two forms once the official/gym-bucket distinction disappeared.
// - renderHistory()'s OFFICIAL/PUBLIC badges and the isOfficial-gated
//   lock icon — every entry is editable/deletable by its owner now.
// - The old updateMyRankBar()/renderRankBarHTML() (gym-rank + public-rank
//   pair) — superseded by the single-rank versions now living in
//   leaderboard-ui.js, which is where renderLeaderboard() actually calls
//   from. Keeping both would have left two definitions of the same
//   function name fighting over which one wins by load order.
// - RADAR_COLOR_REGULAR/RADAR_COLOR_OFFICIAL/RADAR_COLOR_PUBLIC — the
//   Stat Card is one card, one series now; its single color constant
//   lives in leaderboard-ui.js next to the code that actually uses it.
//   computeRadarPoints()/computeAxisEndpoints()/buildRadarSVG() stay here
//   — they're generic SVG math with no gym/official concept baked in,
//   and leaderboard-ui.js calls them as-is.

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
    // No more OFFICIAL/PUBLIC badges, no more lock icon — every entry is
    // the owner's to edit or delete, same as it always was for a non-
    // official result. This is just "your log," full stop.
    function renderHistory(){ const tb=$('#historyTableBody'); if(!appState.entries.length) return tb.innerHTML='<tr><td colspan="4" class="empty-state"><span class="emoji"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z"/></svg></span>No entries yet.</td></tr>'; tb.innerHTML=appState.entries.map(e=>{ const cfg=getTestConfig(e.test); const disp=cfg&&cfg.unit==='time'?formatTime(e.value):`${e.value} ${cfg?.unit||''}`; const actions = `<button class="row-action-btn" title="Edit" onclick="openEditEntryModal('${e.id}')"><svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg></button><button class="row-action-btn danger" title="Delete" onclick="handleDeleteEntry('${e.id}')"><svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg></button>`; return `<tr><td>${formatDate(e.date)}</td><td><strong>${escapeHTML(e.test)}</strong></td><td class="num-cell">${disp}</td><td><div class="row-actions">${actions}</div></td></tr>`; }).join(''); }
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
        ctx.fillText(`${user?.avatar||'🏋️'} ${user?.name||'TOPSET Athlete'}`, size/2, 850);

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
                await navigator.share({ files: [file], title: 'My TOPSET PR', text: `New PR on ${testName}! 💪` });
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
    // ============================================================
    // Generic radar-chart SVG helpers — used by leaderboard-ui.js's Stat
    // Card. No gym/official concept baked in here; just math + markup for
    // an N-axis spider chart from an arbitrary list of {color, values} series.
    // ============================================================
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
            // Percentile number for this axis. "—" (muted) when nobody's
            // logged this test at all, rather than showing a misleading "0%".
            let best=null, bestColor=null;
            seriesList.forEach(s=>{ const v=s.values[i]; if (v!=null && (best==null||v>best)){ best=v; bestColor=s.color; } });
            const pctTxt = best==null ? '—' : `${Math.round(best)}%`;
            const numColor = best==null ? 'var(--text-muted)' : bestColor;
            return `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-size="9" style="fill:var(--text-muted);font-family:Montserrat,sans-serif;font-weight:600;">${escapeHTML(axes[i].label)}</text><text x="${lx.toFixed(1)}" y="${(ly+11).toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-size="10" style="fill:${numColor};font-family:Montserrat,sans-serif;font-weight:800;">${pctTxt}</text>`;
        }).join('');
        const seriesHTML = seriesList.map(s=>{
            const pts = computeRadarPoints(cx,cy,maxR,n,s.values).map(p=>`${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
            return `<polygon points="${pts}" style="fill:${s.color};fill-opacity:0.18;stroke:${s.color};stroke-width:2.5;"/>`;
        }).join('');
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" style="width:100%;max-width:${size}px;display:block;margin:0 auto;">${gridHTML}${axisLines}${seriesHTML}${labelsHTML}</svg>`;
    }
