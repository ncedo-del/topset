// ── gyms.js ───────────────────────────────────────────
// Multi-tenancy: gym lookup/creation, invite codes, gym manager
// assignment.

    // ── Multi-tenancy layer (gyms) ─────────────────────────────────────────
    // A 'gym' scopes users, entries, and leaderboard rows to a private pool.
    // Membership is joined via a human-typed invite code rather than a raw
    // Firestore doc ID, since gym owners will be reading codes off a screen
    // or a printed sheet, not copy-pasting IDs.
    //
    // NOTE ON SUBSCRIPTIONS: subscriptionStatus on the gym doc is set by hand
    // in the Firestore console for now. It is NOT settable from this client
    // code, and Firestore security rules should enforce that — a paid-gating
    // check that the browser itself can flip is not a real gate. The eventual
    // payment integration replaces the human clicking a Firestore console
    // button with a Cloud Function doing the same write after a verified
    // webhook from the payment processor. Nothing in this file should be
    // trusted to grant paid access on its own.
    async function findGymByInviteCode(code){
        if (!initFirebase() || !code) return null;
        try {
            const snap = await db.collection('gyms').where('inviteCode','==',code.trim().toUpperCase()).limit(1).get();
            if (snap.empty) return null;
            return { id: snap.docs[0].id, ...snap.docs[0].data() };
        } catch(err){ console.error('findGymByInviteCode failed:', err); return null; }
    }
    async function getGymById(id){
        if (!initFirebase() || !id) return null;
        try {
            const snap = await db.collection('gyms').doc(id).get();
            if (!snap.exists) return null;
            return { id: snap.id, ...snap.data() };
        } catch(err){ console.error('getGymById failed:', err); return null; }
    }
    // Caches the current member's own gym doc, purely so the Log Result form
    // can check officialTestDate without a network round-trip on every
    // keystroke. Refreshed on login and whenever the Log page is opened, so
    // it stays reasonably current if the manager opens a date while the
    // member already has the app open.
    async function refreshMyGymInfo(){
        const u = getCurrentUser();
        appState.myGym = u?.gymId ? await getGymById(u.gymId) : null;
        // Re-evaluates the bell's official-results item whenever the gym doc is (re)loaded.
        if (window.updateNotifications) updateNotifications();
    }
    // Backfills gymId onto a user's existing entries and leaderboard rows —
    // needed because pre-existing users/entries were created before this
    // user joined a gym, so they won't carry the field otherwise.
    async function backfillGymIdOntoUserData(userId, gymId){
        if (!initFirebase()) return;
        try {
            const entriesSnap = await db.collection('entries').where('userId','==',userId).get();
            const batch = db.batch();
            entriesSnap.forEach(doc=>batch.update(doc.ref, { gymId }));
            await batch.commit();
        } catch(err){ console.error('backfillGymIdOntoUserData (entries) failed:', err); }
        try {
            const lbSnap = await db.collection('leaderboard').where('userId','==',userId).get();
            const batch2 = db.batch();
            lbSnap.forEach(doc=>batch2.update(doc.ref, { gymId }));
            await batch2.commit();
        } catch(err){ console.error('backfillGymIdOntoUserData (leaderboard) failed:', err); }
    }
    // ── Gym creation (admin only) ──────────────────────────────────────────
    // IMPORTANT: hiding the "Manage Gyms" button for non-admins in the UI is
    // a convenience, not security. The actual restriction MUST be enforced
    // by a Firestore security rule checking isAdmin on the requesting user's
    // own document server-side — otherwise anyone with dev tools open could
    // call db.collection('gyms').add(...) directly, bypassing this button
    // entirely. See the rule shared alongside this file; it is not optional.
    function generateInviteCode(){
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I — avoids ambiguity when read aloud or handwritten
        let code = 'TOPSET-';
        for (let i=0;i<6;i++) code += chars[Math.floor(Math.random()*chars.length)];
        return code;
    }
    async function createGym(name, tier){
        if (!initFirebase()) return null;
        // Retry on the astronomically rare chance of a collision rather than trusting
        // randomness blindly — cheap insurance, one extra read at worst.
        let code, existing, attempts=0;
        do {
            code = generateInviteCode();
            existing = await findGymByInviteCode(code);
            attempts++;
        } while (existing && attempts < 5);
        try {
            const ref = await db.collection('gyms').add({
                name: name.trim(),
                inviteCode: code,
                subscriptionStatus: 'trial', // manual for now — see payment integration notes; nothing currently reads or enforces this field
                tier: tier || 'small',
                ownerUserId: null,
                ownerEmail: null,
                createdAt: new Date().toISOString()
            });
            return { id: ref.id, inviteCode: code, name: name.trim() };
        } catch(err){ console.error('createGym failed:', err); showToast('Could not create gym. Check your Firestore rules allow admin writes to the gyms collection.'); return null; }
    }
    async function updateGym(gymId, updates){
        if (!initFirebase()) return false;
        try { await db.collection('gyms').doc(gymId).update(updates); return true; }
        catch(err){ console.error('updateGym failed:', err); showToast('Could not update gym. Check your Firestore rules allow admin updates to the gyms collection.'); return false; }
    }
    // One-time fetch rather than a live listener — this list is only ever viewed
    // by an admin opening the modal, so there's no reason to keep a permanent
    // subscription running (and consuming reads) for every signed-in session.
    async function fetchAllGyms(){
        if (!initFirebase()) return [];
        try {
            const snap = await db.collection('gyms').get();
            const list = [];
            snap.forEach(doc=>list.push({ id:doc.id, ...doc.data() }));
            list.sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));
            return list;
        } catch(err){ console.error('fetchAllGyms failed:', err); showToast('Could not load gyms.'); return []; }
    }
    // ── Gym manager (sub-admin) assignment — admin only ────────────────────
    // Looks up an existing account by email so an admin can hand them the
    // manager role for one specific gym. The target user must already have
    // signed up; this doesn't create an account for them.
    async function findUserByEmail(email){
        if (!initFirebase() || !email) return null;
        try {
            const snap = await db.collection('users').where('email','==',email.trim().toLowerCase()).limit(1).get();
            if (snap.empty) return null;
            return { id: snap.docs[0].id, ...snap.docs[0].data() };
        } catch(err){ console.error('findUserByEmail failed:', err); return null; }
    }
    async function assignGymManager(gymId, email){
        const user = await findUserByEmail(email);
        if (!user){ showToast('No account found with that email — they need to sign up first.'); return false; }
        const ok = await updateUserProfile(user.id, { managesGymId: gymId });
        if (!ok) return false;
        // Denormalized onto the gym doc purely for display in Manage Gyms —
        // managesGymId on the user doc is the field security rules actually check.
        await updateGym(gymId, { ownerUserId: user.id, ownerEmail: user.email || email.trim().toLowerCase() });
        showToast(`${user.name || email} is now the manager of this gym.`);
        return true;
    }
    async function removeGymManager(gymId, currentManagerUid){
        if (currentManagerUid){ await updateUserProfile(currentManagerUid, { managesGymId: null }); }
        await updateGym(gymId, { ownerUserId: null, ownerEmail: null });
        showToast('Gym manager removed.');
    }
    // Kicks a member out of a gym (clears their gymId). Callable by a site
    // admin OR the manager of that specific gym — see the rules' third
    // `users.update` branch, which only allows clearing gymId, never setting it.
    async function removeMemberFromGym(memberUid){
        return await updateUserProfile(memberUid, { gymId: null });
    }
    // ─────────────────────────────────────────────────────────────────────
    // `d.gymId` is now an explicit, caller-supplied choice — not always derived
    // from the profile — because a gym member can log to EITHER their own gym
    // (gymId: their gym) or the public/TOPSET-wide pool (gymId: null), via the
    // two separate Log forms. Omitting it falls back to the old default
    // (the user's own profile gym, or null) so any other caller is unaffected.
