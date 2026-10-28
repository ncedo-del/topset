// ── athlete-profile.js ─────────────────────────────────
// Phase 1 "Athlete Identity" — opt-in public athlete profile, stored
// separately from the private `users` doc (TOPSET-ARCHITECTURE.md §5,
// §19). Nothing here is visible to anyone until the user explicitly
// turns "Make my profile public" on (athlete-profile-ui.js). Opting out
// sets isPublic:false rather than deleting the doc — forward-only, same
// pattern as leaving a gym — so the profile someone built stays intact
// if they turn it back on later.

    function athleteProfileRef(uid){ return db.collection('athleteProfiles').doc(uid); }

    // Owner-only read of their own profile doc (may not exist yet — that's
    // not an error, just "hasn't opted in").
    async function getMyAthleteProfile(){
        const uid = getCurrentUserId();
        if (!uid || !initFirebase()) return null;
        try {
            const snap = await athleteProfileRef(uid).get();
            return snap.exists ? snap.data() : null;
        } catch(err){ console.error('getMyAthleteProfile failed:', err); return null; }
    }

    // Public (signed-out-readable) fetch for the /athlete/{uid} page and
    // Discover cards. The security rule only returns data at all when
    // isPublic==true, so a private profile and a profile that never
    // existed look identical from out here — on purpose; there's no way
    // to distinguish "never made one" from "made one, kept it private".
    async function getPublicAthleteProfile(uid){
        if (!uid || !initFirebase()) return null;
        try {
            const snap = await athleteProfileRef(uid).get();
            if (!snap.exists) return null;
            const data = snap.data();
            return data.isPublic ? data : null;
        } catch(err){ console.error('getPublicAthleteProfile failed:', err); return null; }
    }

    // Creates or updates the caller's own athleteProfiles/{uid} doc.
    // name/avatar/ageGroup/gender are always denormalized fresh from the
    // CURRENT user profile here, never trusted from the form — so
    // Discover/the public page can never show a stale name after someone
    // edits their display name elsewhere without also reopening this modal.
    async function saveAthleteProfile(fields){
        const uid = getCurrentUserId();
        if (!uid || !initFirebase()) return false;
        const user = getCurrentUser();
        const data = {
            uid,
            name: user?.name || 'TOPSET Athlete',
            avatar: avatarKey(user?.avatar),
            ageGroup: displayAgeGroup(user),
            gender: user?.gender || null,
            sport: (fields.sport||'').trim().slice(0,60),
            location: (fields.location||'').trim().slice(0,60),
            bio: (fields.bio||'').trim().slice(0,500),
            availability: {
                openToSponsorship: !!fields.availability?.openToSponsorship,
                openToTrials: !!fields.availability?.openToTrials,
                openToOpportunities: !!fields.availability?.openToOpportunities
            },
            isPublic: !!fields.isPublic,
            updatedAt: Date.now()
        };
        // Under-19s need guardian consent on file, and everyone needs a year of birth,
        // before going public (firestore.rules enforces the same; this gives a clear message).
        if (data.isPublic && !profileMayBePublic(user)){ showToast(profileGateMessage(user)); return false; }
        try { await athleteProfileRef(uid).set(data, { merge: true }); return true; }
        catch(err){ console.error('saveAthleteProfile failed:', err); showToast('Could not save athlete profile.'); return false; }
    }

    // Called right after a normal profile edit (name/avatar/ageGroup/gender)
    // saves — same reasoning as updateCloudProfileInfo() does for the
    // leaderboard: keeps the denormalized display fields on an EXISTING
    // athleteProfiles doc from going stale. A no-op, not an error, if the
    // user has never opted into a public profile — there's nothing to sync
    // yet, and this must never throw, since admin-ui.js calls it
    // unconditionally after every profile save.
    async function syncAthleteProfileDisplayInfo(){
        const uid = getCurrentUserId();
        if (!uid || !initFirebase()) return;
        const user = getCurrentUser();
        if (!user) return;
        try {
            const snap = await athleteProfileRef(uid).get();
            if (!snap.exists) return;
            await athleteProfileRef(uid).update({
                name: user.name || 'TOPSET Athlete',
                avatar: avatarKey(user.avatar),
                ageGroup: displayAgeGroup(user),
                gender: user.gender || null
            });
        } catch(err){ console.error('syncAthleteProfileDisplayInfo failed:', err); }
    }
