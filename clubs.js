// ── clubs.js ──────────────────────────────────────────
// Multi-tenancy: club lookup/creation, invite codes, club manager
// assignment. Renamed from gyms.js this chunk — same doc shape
// (name/inviteCode/tier/subscriptionStatus/ownerUserId/ownerEmail), just
// "club" terminology throughout, and the user-profile field is now
// `clubId` (member) / `managesClubId` (manager) instead of
// `gymId`/`managesGymId`.
//
// DROPPED THIS CHUNK: backfillGymIdOntoUserData(). It existed to stamp a
// newly-joined club's id onto a user's EXISTING entries/leaderboard docs —
// but entries no longer carry a club id at all (personal test-logging was
// never club-scoped, see core.js), and leaderboard docs don't carry one
// either (single global bucket now). There's nothing left to backfill.

    // ── Multi-tenancy layer (clubs) ─────────────────────────────────────────
    // A 'club' scopes users, classes, and club-only features (roster,
    // weekly journal) to a private pool. Membership is joined via a
    // human-typed invite code rather than a raw Firestore doc ID, since
    // club owners will be reading codes off a screen or a printed sheet,
    // not copy-pasting IDs.
    //
    // NOTE ON SUBSCRIPTIONS: subscriptionStatus on the club doc is set by
    // hand in the Firestore console for now. It is NOT settable from this
    // client code, and Firestore security rules should enforce that — a
    // paid-gating check that the browser itself can flip is not a real
    // gate. The eventual payment integration replaces the human clicking a
    // Firestore console button with a Cloud Function doing the same write
    // after a verified webhook from the payment processor. Nothing in this
    // file should be trusted to grant paid access on its own.
    async function findClubByInviteCode(code){
        if (!initFirebase() || !code) return null;
        try {
            const snap = await db.collection('clubs').where('inviteCode','==',code.trim().toUpperCase()).limit(1).get();
            if (snap.empty) return null;
            return { id: snap.docs[0].id, ...snap.docs[0].data() };
        } catch(err){ console.error('findClubByInviteCode failed:', err); return null; }
    }
    async function getClubById(id){
        if (!initFirebase() || !id) return null;
        try {
            const snap = await db.collection('clubs').doc(id).get();
            if (!snap.exists) return null;
            return { id: snap.id, ...snap.data() };
        } catch(err){ console.error('getClubById failed:', err); return null; }
    }
    // Caches the current member's own club doc onto appState.myClub — this
    // is the field core.js renamed from appState.myGym. Refreshed on login
    // and whenever the Log page is opened, so it stays reasonably current.
    async function refreshMyClubInfo(){
        const u = getCurrentUser();
        appState.myClub = u?.clubId ? await getClubById(u.clubId) : null;
    }
    // ── Club creation (admin only) ──────────────────────────────────────────
    // IMPORTANT: hiding the "Manage Clubs" button for non-admins in the UI is
    // a convenience, not security. The actual restriction MUST be enforced
    // by a Firestore security rule checking isAdmin on the requesting user's
    // own document server-side — otherwise anyone with dev tools open could
    // call db.collection('clubs').add(...) directly, bypassing this button
    // entirely. See firestore.rules; this is not optional.
    function generateInviteCode(){
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I — avoids ambiguity when read aloud or handwritten
        let code = 'TOPSET-';
        for (let i=0;i<6;i++) code += chars[Math.floor(Math.random()*chars.length)];
        return code;
    }
    async function createClub(name, tier){
        if (!initFirebase()) return null;
        // Retry on the astronomically rare chance of a collision rather than trusting
        // randomness blindly — cheap insurance, one extra read at worst.
        let code, existing, attempts=0;
        do {
            code = generateInviteCode();
            existing = await findClubByInviteCode(code);
            attempts++;
        } while (existing && attempts < 5);
        try {
            const ref = await db.collection('clubs').add({
                name: name.trim(),
                inviteCode: code,
                subscriptionStatus: 'trial', // manual for now — see payment integration notes; nothing currently reads or enforces this field
                tier: tier || 'small',
                ownerUserId: null,
                ownerEmail: null,
                createdAt: new Date().toISOString()
            });
            return { id: ref.id, inviteCode: code, name: name.trim() };
        } catch(err){ console.error('createClub failed:', err); showToast('Could not create club. Check your Firestore rules allow admin writes to the clubs collection.'); return null; }
    }
    async function updateClub(clubId, updates){
        if (!initFirebase()) return false;
        try { await db.collection('clubs').doc(clubId).update(updates); return true; }
        catch(err){ console.error('updateClub failed:', err); showToast('Could not update club. Check your Firestore rules allow admin updates to the clubs collection.'); return false; }
    }
    // One-time fetch rather than a live listener — this list is only ever viewed
    // by an admin opening the modal, so there's no reason to keep a permanent
    // subscription running (and consuming reads) for every signed-in session.
    async function fetchAllClubs(){
        if (!initFirebase()) return [];
        try {
            const snap = await db.collection('clubs').get();
            const list = [];
            snap.forEach(doc=>list.push({ id:doc.id, ...doc.data() }));
            list.sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));
            return list;
        } catch(err){ console.error('fetchAllClubs failed:', err); showToast('Could not load clubs.'); return []; }
    }
    // ── Club manager (sub-admin) assignment — admin only ────────────────────
    // Looks up an existing account by email so an admin can hand them the
    // manager role for one specific club. The target user must already have
    // signed up; this doesn't create an account for them.
    async function findUserByEmail(email){
        if (!initFirebase() || !email) return null;
        try {
            const snap = await db.collection('users').where('email','==',email.trim().toLowerCase()).limit(1).get();
            if (snap.empty) return null;
            return { id: snap.docs[0].id, ...snap.docs[0].data() };
        } catch(err){ console.error('findUserByEmail failed:', err); return null; }
    }
    async function assignClubManager(clubId, email){
        const user = await findUserByEmail(email);
        if (!user){ showToast('No account found with that email — they need to sign up first.'); return false; }
        const ok = await updateUserProfile(user.id, { managesClubId: clubId });
        if (!ok) return false;
        // Denormalized onto the club doc purely for display in Manage Clubs —
        // managesClubId on the user doc is the field security rules actually check.
        await updateClub(clubId, { ownerUserId: user.id, ownerEmail: user.email || email.trim().toLowerCase() });
        showToast(`${user.name || email} is now the manager of this club.`);
        return true;
    }
    async function removeClubManager(clubId, currentManagerUid){
        if (currentManagerUid){ await updateUserProfile(currentManagerUid, { managesClubId: null }); }
        await updateClub(clubId, { ownerUserId: null, ownerEmail: null });
        showToast('Club manager removed.');
    }
    // Kicks a member out of a club (clears their clubId). Callable by a site
    // admin OR the manager of that specific club — see the rules' third
    // `users.update` branch, which only allows clearing clubId, never setting it.
    async function removeMemberFromClub(memberUid){
        return await updateUserProfile(memberUid, { clubId: null });
    }
