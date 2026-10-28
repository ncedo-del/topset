// ── minors.js ─────────────────────────────────────────
// Age + guardian-consent policy (POPIA: anyone under 18 is a "child").
//   • Minimum age 14, enforced at account creation (firestore.rules too).
//   • Year of birth replaces the self-picked age band. It can be set ONCE by
//     the athlete; after that only an admin can change it (rules). Age band is
//     always derived from it, so it can't go stale or be gamed.
//   • "Minor" is deliberately conservative: with only a birth YEAR we can't tell
//     17 from 18, so anyone with (thisYear - birthYear) < 19 is treated as a minor.
//   • A minor can't have a public profile, or appear on the public (TOPSET-wide)
//     board, until their gym manager records guardian consent (users.guardianConsentAt/By,
//     writable only by that gym's manager or an admin).
// Helpers are plain globals (same pattern as the rest of the app). The DOM bits
// are injected here so index.html only needs one <script> line. Load after
// profile-hub.js, before app-init.js.

    const MIN_AGE = 14;
    function currentYear(){ return new Date().getFullYear(); }
    function validBirthYear(y){ return Number.isInteger(y) && y >= 1920 && y <= currentYear() - MIN_AGE; }
    function ageGroupFromBirthYear(y){
        const a = currentYear() - y;
        return a <= 17 ? '14-17' : a <= 24 ? '18-24' : a <= 34 ? '25-34' : a <= 44 ? '35-44' : a <= 54 ? '45-54' : '55+';
    }
    // The age band to PUBLISH for a user: derived from birth year when we have one,
    // otherwise whatever legacy band they self-picked.
    function displayAgeGroup(u){ return (u && Number.isInteger(u.birthYear)) ? ageGroupFromBirthYear(u.birthYear) : ((u && u.ageGroup) || null); }
    function isAdultByYear(u){ return !!u && Number.isInteger(u.birthYear) && currentYear() - u.birthYear >= 19; }
    function hasGuardianConsent(u){ return !!u && !!u.guardianConsentAt; }
    function isMinorWithoutConsent(u){ return !!u && Number.isInteger(u.birthYear) && !isAdultByYear(u) && !hasGuardianConsent(u); }
    function profileMayBePublic(u){ return !!u && Number.isInteger(u.birthYear) && (isAdultByYear(u) || hasGuardianConsent(u)); }
    function profileGateMessage(u){
        if (!u || !Number.isInteger(u.birthYear)) return 'Add your year of birth in Edit Profile before you can have a public profile.';
        return u.gymId
            ? "You're under 19, so a public profile needs a parent or guardian's OK. Ask your gym manager to record it."
            : "You're under 19, so a public profile needs a parent or guardian's OK. Join a gym and ask its manager to record it, or contact TOPSET support.";
    }
    function birthYearOptionsHTML(selected){
        let h = '<option value="">Select year</option>';
        for (let y = currentYear() - MIN_AGE; y >= currentYear() - 80; y--) h += `<option value="${y}"${y===selected?' selected':''}>${y}</option>`;
        return h;
    }

    // Promise-based year-of-birth prompt, used for brand-new Google sign-ins
    // (they skip the signup form). Resolves a valid year, or null if cancelled.
    window.askBirthYear = function(){
        return new Promise(resolve=>{
            const ov = document.createElement('div');
            ov.className = 'modal-overlay'; ov.style.zIndex = 400;
            ov.innerHTML = `<div class="modal"><h2>One quick thing</h2><p style="font-size:13px;color:var(--text-secondary);margin-bottom:14px;">TOPSET is for ages 14 and up. What year were you born?</p><div class="form-group"><select id="byAskSel">${birthYearOptionsHTML()}</select></div><div class="modal-buttons"><button type="button" class="btn btn-outline" id="byAskCancel">Cancel</button><button type="button" class="btn btn-primary" id="byAskOk">Continue</button></div></div>`;
            document.body.appendChild(ov);
            const done = v => { ov.remove(); resolve(v); };
            ov.querySelector('#byAskCancel').onclick = () => done(null);
            ov.querySelector('#byAskOk').onclick = () => {
                const y = parseInt(ov.querySelector('#byAskSel').value, 10);
                if (!validBirthYear(y)){ showToast('Please select your year of birth.'); return; }
                done(y);
            };
        });
    };

    // Athlete-profile editor gate: lock the "public" toggle (with the reason) when
    // the user isn't eligible. Called from openAthleteProfileModal().
    window.applyProfileGate = function(){
        const cb = $('#athleteProfilePublicToggle'); if (!cb) return;
        const u = getCurrentUser(), ok = profileMayBePublic(u);
        let note = $('#athleteProfileGateNote');
        if (!note){
            note = document.createElement('p'); note.id = 'athleteProfileGateNote';
            note.style.cssText = 'font-size:12px;color:var(--danger);margin-top:6px;';
            cb.closest('.form-group').appendChild(note);
        }
        note.textContent = ok ? '' : profileGateMessage(u);
        note.classList.toggle('hidden', ok);
        cb.disabled = !ok;
        if (!ok){ cb.checked = false; window.handleAthleteProfileToggle(); }
    };

    // Edit Profile: year-of-birth field (set-once) + guardian-consent status.
    function refreshProfileBirthYearField(){
        const box = $('#profileBirthYearBody'), u = getCurrentUser(); if (!box || !u) return;
        if (Number.isInteger(u.birthYear)){
            const consent = isAdultByYear(u) ? '' : (hasGuardianConsent(u) ? '<div style="font-size:12px;color:var(--text-muted);margin-top:4px;">Guardian consent is on file with your gym.</div>' : '<div style="font-size:12px;color:var(--text-muted);margin-top:4px;">No guardian consent on file yet — needed before you can have a public profile.</div>');
            box.innerHTML = `<div style="font-weight:600;">${u.birthYear} <span style="font-weight:500;font-size:12px;color:var(--text-muted);">(locked — contact TOPSET support to correct it)</span></div>${consent}`;
        } else {
            box.innerHTML = `<select id="profileBirthYear">${birthYearOptionsHTML()}</select><span style="font-size:11px;color:var(--text-muted);display:block;margin-top:4px;">You can set this once. TOPSET is for ages 14+. Required before you can have a public profile.</span>`;
        }
    }

    (function installMinorsUI(){
        // 14-17 band in every age filter / picker.
        ['#filterAgeGroup','#discoverAgeGroup','#authAgeGroup','#profileAgeGroup'].forEach(sel=>{
            const el = $(sel); if (!el || [...el.options].some(o=>o.value==='14-17')) return;
            const o = document.createElement('option'); o.value = '14-17'; o.textContent = '14-17';
            el.insertBefore(o, el.options[1] || null);
        });
        // The manual age pickers in the forms are replaced by year of birth.
        const a1 = $('#authAgeGroupGroup'); if (a1) a1.style.display = 'none';
        const a2 = $('#profileAgeGroup'); if (a2 && a2.closest('.form-group')) a2.closest('.form-group').style.display = 'none';

        // Signup field, shown/hidden in step with the other signup-only fields.
        const gymGrp = $('#authGymCodeGroup'), sportGrp = $('#authSportGroup');
        if (gymGrp && !$('#authBirthYearGroup')){
            const g = document.createElement('div');
            g.className = 'form-group hidden'; g.id = 'authBirthYearGroup';
            g.innerHTML = `<label>Year of Birth</label><select id="authBirthYear">${birthYearOptionsHTML()}</select><span style="font-size:11px;color:var(--text-muted);margin-top:4px;">TOPSET is for ages 14 and up. If you're under 18, a public profile also needs your parent or guardian's OK, recorded by your gym manager.</span>`;
            gymGrp.parentNode.insertBefore(g, gymGrp);
            if (sportGrp){
                const sync = () => { const hide = sportGrp.classList.contains('hidden'); g.classList.toggle('hidden', hide); $('#authBirthYear').required = !hide; };
                new MutationObserver(sync).observe(sportGrp, { attributes:true, attributeFilter:['class'] });
                sync();
            }
        }
        // Edit Profile field.
        const sportEl = $('#profileSport');
        if (sportEl && !$('#profileBirthYearGroup')){
            const g = document.createElement('div');
            g.className = 'form-group'; g.id = 'profileBirthYearGroup';
            g.innerHTML = '<label>Year of Birth</label><div id="profileBirthYearBody"></div>';
            sportEl.closest('.form-group').insertAdjacentElement('afterend', g);
        }
        const _open = window.openEditProfileModal;
        if (typeof _open === 'function'){
            window.openEditProfileModal = async function(){ await _open.apply(this, arguments); refreshProfileBirthYearField(); };
        }
    })();
