// ── profile-hub.js ────────────────────────────────────
// Gear-icon Profile hub (avatar, stats, week strip, gym, theme, settings
// rows) and the bell's notification list. Reads existing app state only —
// no new backend. Loads after admin-ui.js/events-ui.js, before app-init.js.

    const HUB_ICON = {
        edit:'<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
        user:'<circle cx="12" cy="8" r="4"/><path d="M6 21v-2a6 6 0 0 1 12 0v2"/>',
        statcard:'<polygon points="12 2 20 8.5 17 20 7 20 4 8.5"/><path d="M12 2v12M4 8.5l8 5.5M20 8.5l-8 5.5M7 20l5-6M17 20l-5-6"/>',
        tests:'<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94Z"/>',
        gym:'<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M10 22v-4h4v4"/><path d="M2 22h20"/><path d="M10 6h4M10 10h4M10 14h4"/>',
        event:'<path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/>',
        logout:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
        fire:'<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
        trophy:'<path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0Z"/><path d="M7 5H4a3 3 0 0 0 3 5"/><path d="M17 5h3a3 3 0 0 1-3 5"/>',
        chev:'<path d="M9 18l6-6-6-6"/>',
        sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
        moon:'<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"/>',
        sport:'<circle cx="12" cy="12" r="10"/><path d="M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20M2 12h20"/>',
        bell:'<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>'
    };
    function hubSvg(k, size){ size = size || 18; return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">${HUB_ICON[k]}</svg>`; }
    function hubRow(icon, label, sub, js, danger){
        return `<button type="button" class="hub-row${danger?' danger':''}" onclick="${js}"><span class="hub-row-icon">${hubSvg(icon)}</span><span class="hub-row-text"><strong>${label}</strong>${sub?`<small>${sub}</small>`:''}</span><span class="hub-row-chev">${hubSvg('chev',16)}</span></button>`;
    }
    function hubThemeControl(){
        const dark = appState.theme !== 'light';
        return `<div class="hub-seg" id="hubThemeSeg"><button type="button" class="${dark?'active':''}" onclick="window.setTheme('dark')">${hubSvg('moon',15)} Dark</button><button type="button" class="${dark?'':'active'}" onclick="window.setTheme('light')">${hubSvg('sun',15)} Light</button></div>`;
    }
    window.syncThemeControl = function(){
        const seg = $('#hubThemeSeg'); if (!seg) return;
        const dark = appState.theme !== 'light';
        const btns = seg.querySelectorAll('button');
        if (btns[0]) btns[0].classList.toggle('active', dark);
        if (btns[1]) btns[1].classList.toggle('active', !dark);
    };
    // Close the hub, then run a window-level function (keeps modals from stacking).
    window.hubGo = function(name){ window.closeProfileHub(); const f = window[name]; if (typeof f === 'function') f(); };
    window.hubJournalDate = function(date){ window.closeProfileHub(); window.openStreakModal(); window.selectJournalDate(date); };

    window.renderProfileHub = function(){
        const body = $('#profileHubBody'); if (!body) return;
        const u = getCurrentUser();
        if (!appState.currentUserId || !u){
            body.innerHTML = `<h2>Settings</h2><div class="hub-section-label">Theme</div>${hubThemeControl()}<button type="button" class="btn btn-primary" style="width:100%;justify-content:center;margin-top:20px;" onclick="window.closeProfileHub(); window.openAuthModal('signin');">Sign in or create a profile</button>`;
            return;
        }
        const streak = calculateStreak(appState.journalEntries);
        const prs = getPersonalBests(appState.entries).length;
        const joined = u.createdAt ? Math.max(0, Math.floor((Date.now() - new Date(u.createdAt).getTime())/86400000)) : 0;
        const handleBase = (u.name||'').toLowerCase().replace(/[^a-z0-9]+/g,'') || (u.email||'athlete').split('@')[0].toLowerCase().replace(/[^a-z0-9]+/g,'');
        const gym = appState.myGym;
        const streakBanner = streak > 0
            ? `<div class="hub-banner">${hubSvg('fire',22)}<div><strong>${streak}-day streak</strong><small>You're on a roll. Journal or log today to keep it alive.</small></div></div>`
            : `<div class="hub-banner muted">${hubSvg('fire',22)}<div><strong>No streak yet</strong><small>Journal or log a session today to start one.</small></div></div>`;
        const gymCard = gym
            ? `<div class="hub-banner">${hubSvg('gym',22)}<div><strong>${escapeHTML(gym.name)}</strong><small>${gym.officialTestDate ? 'Official results day: '+escapeHTML(formatDate(gym.officialTestDate)) : 'Your official results are locked in by this gym.'}</small></div></div>`
            : `<div class="hub-banner muted">${hubSvg('gym',22)}<div><strong>Not in a gym yet</strong><small>Join with an invite code in Edit Profile. Only gym-verified results count as official.</small></div></div>`;
        let rows = hubRow('edit','Edit Profile','Name, avatar, sport, gym','window.hubGo(\'openEditProfileModal\')')
                 + hubRow('user','Public Athlete Profile','What scouts and sponsors see','window.hubGo(\'openAthleteProfileModal\')')
                 + hubRow('event','Opportunities','Trials, sponsorships & grants','window.hubGo(\'openOpportunitiesModal\')')
                 + hubRow('statcard','Stat Card','Official results lead','window.hubGo(\'openStatCard\')');
        // Scout accounts only. Athlete accounts never see this row (and switchToScoutMode
        // refuses them anyway; firestore.rules is the real gate).
        if (typeof window.topsetIsScout === 'function' && window.topsetIsScout()){
            rows += hubRow('user','Scout & Sponsor Portal','Back to talent discovery','window.hubGo(\'switchToScoutMode\')');
        }
        if (u.isAdmin){
            rows += hubRow('tests','Manage Tests','Default catalog, sport assignment','window.hubGo(\'openManageTests\')')
                  + hubRow('sport','Manage Sports','The list athletes pick from','window.hubGo(\'openManageSports\')')
                  + hubRow('gym','Manage Gyms','Tiers, codes, managers','window.hubGo(\'openManageGyms\')')
                  + hubRow('event','Manage Event','Public event board','window.hubGo(\'openManageEvent\')');
        } else if (u.managesGymId){
            rows += hubRow('gym','My Gym','Roster, official day, tests','window.hubGo(\'openMyGym\')');
        }
        rows += hubRow('logout','Log Out','','window.hubGo(\'handleLogout\')', true);
        body.innerHTML = `
            <div class="hub-head">${avatarCircleHTML(u.avatar, 88)}<h2>${escapeHTML(u.name||'Athlete')}</h2><div class="hub-handle">@${escapeHTML(handleBase)}${u.sport?' · '+escapeHTML(u.sport):''}</div></div>
            <div class="hub-pills">
                <div class="hub-pill">${hubSvg('fire',16)}<strong>${streak}</strong><small>Streak</small></div>
                <div class="hub-pill">${hubSvg('trophy',16)}<strong>${prs}</strong><small>PRs</small></div>
                <div class="hub-pill">${hubSvg('event',16)}<strong>${joined}</strong><small>Days in</small></div>
            </div>
            <div class="streak-week-strip" id="hubWeekStrip"></div>
            ${streakBanner}
            <button type="button" class="hub-banner hub-banner-btn" onclick="window.hubGo('openStatCard')">${hubSvg('statcard',22)}<div><strong>Your TopSet Stat Card</strong><small>Official results are the headline. Self-logged is a footnote.</small></div><span class="hub-row-chev">${hubSvg('chev',16)}</span></button>
            ${gymCard}
            <div class="hub-section-label">Theme</div>${hubThemeControl()}
            <div class="hub-section-label">Settings</div><div class="hub-rows">${rows}</div>`;
        renderStreakWeekStrip('#hubWeekStrip', 'window.hubJournalDate');
    };
    window.openProfileHub = function(){ window.renderProfileHub(); $('#profileHubModal').classList.remove('hidden'); };
    window.closeProfileHub = function(){ $('#profileHubModal')?.classList.add('hidden'); };

    // The bell lives in notifications-ui.js (computeNotifications / toggleNotifPanel).
