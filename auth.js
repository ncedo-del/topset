// ── auth.js ───────────────────────────────────────────
// Firebase Authentication: sign up, sign in, Google sign-in, email
// verification, password reset, account deletion.
//
// TRAINING CLUB REBUILD (this chunk): gymId → clubId on the user profile,
// checkGymCapacity → checkClubCapacity. Account deletion no longer
// excludes "official" entries — that concept doesn't exist anymore, so
// deleteAllUserData() now deletes every entry the user owns, full stop.

    // ── Auth layer (Firebase Authentication) ──────────────────────────────
    // Firebase Auth handles password hashing, session tokens, and email delivery.
    // Firestore 'users' documents store profile data only — no passwords, ever.

    // Counts current members of a club by reading the matching user docs and
    // taking the result size, rather than Firestore's aggregate .count().get().
    // .count() was silently returning 0 here even when matching users.clubId
    // docs genuinely existed (same query, same rules, as the roster fetch
    // elsewhere in admin-ui.js that DOES work) — swallowed by the catch below
    // with no visible error, so it just looked like "0 members" forever.
    // Reading the docs directly trades a slightly heavier read (docs instead
    // of a server-side count) for a number that's actually correct, which
    // matters far more at these member caps (50-520).
    async function getMemberCount(clubId){
        if (!initFirebase() || !clubId) return 0;
        try {
            const snap = await db.collection('users').where('clubId','==',clubId).get();
            return snap.size;
        } catch(err){ console.error('getMemberCount failed:', err); return 0; }
    }
    // Client-side capacity gate — the authoritative record is the tier cap
    // stored on the club doc. This is enforced here (not in security rules)
    // because rules can't cheaply do "is this the Nth member" checks; same
    // trust model the rest of this app already uses for business logic.
    async function checkClubCapacity(club){
        const cap = tierInfo(club.tier).cap;
        const count = await getMemberCount(club.id);
        return { count, cap, full: count >= cap };
    }
    async function signUp(email, password, name, avatar, ageGroup, gender, sport, clubCode){
        if (!initFirebase()) return null;
        try {
            // Resolve the invite code to a club BEFORE creating the account, so a bad
            // code fails loudly during signup rather than leaving a user silently
            // club-less with no clear signal anything went wrong.
            let clubId = null;
            if (clubCode && clubCode.trim()){
                const club = await findClubByInviteCode(clubCode);
                if (!club){ showToast('Club invite code not recognized. Check it and try again, or leave it blank to join without a club.'); return null; }
                const capacity = await checkClubCapacity(club);
                if (capacity.full){ showToast(`This club is at its ${capacity.cap}-member limit. Contact the club manager, or leave the invite code blank to join without a club for now.`); return null; }
                clubId = club.id;
            }
            const cred = await auth.createUserWithEmailAndPassword(email, password);
            // Create the Firestore profile using the Firebase Auth UID as the doc ID.
            // This is what ties auth identity to display data.
            await db.collection('users').doc(cred.user.uid).set({
                name: name || email.split('@')[0],
                email: email.trim().toLowerCase(),
                avatar: avatar || '🏋️',
                ageGroup: ageGroup || null,
                gender: gender || null,
                sport: sport || null,
                clubId: clubId,
                createdAt: new Date().toISOString()
                // isAdmin / managesClubId are intentionally NOT set here — both are
                // role fields, only settable by a site admin. Security rules
                // prevent users from writing either field themselves.
            });
            // Fire-and-forget: confirms the address is real and reachable.
            // Not a hard gate on signup — the emailVerifyBanner nudges the
            // user post-signup instead of blocking them at the door.
            cred.user.sendEmailVerification().catch(err=>console.error('sendEmailVerification failed:', err));
            return cred.user;
        } catch(err){
            console.error('signUp failed:', err);
            const msg = err.code === 'auth/email-already-in-use' ? 'An account with that email already exists.'
                : err.code === 'auth/weak-password' ? 'Password must be at least 6 characters.'
                : err.code === 'auth/invalid-email' ? 'Invalid email address.'
                : 'Could not create account. Try again.';
            showToast(`${msg}`);
            return null;
        }
    }
    async function signIn(email, password){
        if (!initFirebase()) return null;
        try {
            const cred = await auth.signInWithEmailAndPassword(email, password);
            return cred.user;
        } catch(err){
            console.error('signIn failed:', err);
            const msg = err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential'
                ? 'Invalid email or password.'
                : err.code === 'auth/too-many-requests' ? 'Too many failed attempts. Try again later.'
                : 'Sign-in failed. Check your connection.';
            showToast(`${msg}`);
            return null;
        }
    }
    async function sendPasswordReset(email){
        if (!initFirebase() || !email) return false;
        try { await auth.sendPasswordResetEmail(email); return true; }
        catch(err){
            console.error('password reset failed:', err);
            showToast('Could not send reset email. Check the address and try again.');
            return false;
        }
    }
    // ── Google Sign-In ──────────────────────────────────────────────────
    // Google accounts arrive pre-verified (Google already confirmed the
    // address), so these users never see the emailVerifyBanner. New Google
    // sign-ins get the same bare-bones profile shape as email signup;
    // clubId stays null — joining a club still happens via Edit Profile,
    // same as any user who signed up without an invite code.
    async function signInWithGoogle(){
        if (!initFirebase()) return null;
        try {
            const provider = new firebase.auth.GoogleAuthProvider();
            const result = await auth.signInWithPopup(provider);
            const user = result.user;
            const isNewUser = !!(result.additionalUserInfo && result.additionalUserInfo.isNewUser);
            if (isNewUser){
                await db.collection('users').doc(user.uid).set({
                    name: user.displayName || (user.email ? user.email.split('@')[0] : 'Athlete'),
                    email: (user.email || '').trim().toLowerCase(),
                    avatar: '🏋️',
                    ageGroup: null,
                    gender: null,
                    sport: null,
                    clubId: null,
                    createdAt: new Date().toISOString()
                });
            }
            return user;
        } catch(err){
            console.error('Google sign-in failed:', err);
            if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') return null;
            const msg = err.code === 'auth/account-exists-with-different-credential'
                ? 'An account already exists with this email using a different sign-in method.'
                : 'Google sign-in failed. Try again.';
            showToast(msg);
            return null;
        }
    }
    // ── Email verification ─────────────────────────────────────────────
    // Soft gate, not a hard block: unverified users can still use the app,
    // but the banner nudges them until they confirm. Google users are
    // always treated as verified since Google already owns that check.
    function isGoogleUser(firebaseUser){
        return !!(firebaseUser && firebaseUser.providerData && firebaseUser.providerData.some(p=>p.providerId==='google.com'));
    }
    function updateEmailVerifyBanner(){
        const u = auth && auth.currentUser;
        const show = !!u && !isGoogleUser(u) && !u.emailVerified;
        const el = $('#emailVerifyBanner');
        if (el) el.classList.toggle('hidden', !show);
    }
    window.handleResendVerification = async function(){
        if (!auth || !auth.currentUser) return;
        if (rateLimited('resendVerify', RATE_LIMITS.resendVerify)) return;
        try { await auth.currentUser.sendEmailVerification(); showToast('Verification email sent — check your inbox (and spam folder).'); }
        catch(err){ console.error('resend verification failed:', err); showToast('Could not send verification email right now. Try again shortly.'); }
    };
    window.handleRefreshVerification = async function(){
        if (!auth || !auth.currentUser) return;
        try { await auth.currentUser.reload(); }
        catch(err){ console.error('reload failed:', err); }
        updateEmailVerifyBanner();
        showToast(auth.currentUser.emailVerified ? 'Email verified — thanks!' : 'Still not verified. Check your inbox, or resend the email.');
    };
    // ── Account deletion ────────────────────────────────────────────────
    // Wipes every Firestore doc that carries this user's uid (entries,
    // leaderboard, journal, classLogs, classJournal, classEnrollments),
    // then the profile doc itself, then the Firebase Auth account. Order
    // matters: Firestore data goes first so a failure partway through
    // never leaves an orphaned Auth account with no way back into the app
    // to retry — worst case is a deleted Auth user with leftover Firestore
    // docs, which is recoverable by an admin, not the reverse. Chunked
    // into batches of 450 to stay under Firestore's 500-write batch limit
    // with headroom.
    //
    // NO MORE "official" exclusion: that concept doesn't exist anymore —
    // every entry the user owns is deletable, since editing/deleting your
    // own personal test results was never locked away from you to begin
    // with (only the old gym-scoped Official Results were, and those are
    // gone). This simplifies what used to be a filtered, partial delete
    // into a full one.
    async function deleteAllUserData(uid){
        if (!initFirebase()) return { ok:false };
        try {
            const [entriesSnap, lbSnap, journalSnap, classLogsSnap, classJournalSnap, enrollSnap] = await Promise.all([
                db.collection('entries').where('userId','==',uid).get(),
                db.collection('leaderboard').where('userId','==',uid).get(),
                db.collection('journal').where('userId','==',uid).get(),
                db.collection('classLogs').where('userId','==',uid).get(),
                db.collection('classJournal').where('userId','==',uid).get(),
                db.collection('classEnrollments').where('userId','==',uid).get()
            ]);
            const allDocs = [...entriesSnap.docs, ...lbSnap.docs, ...journalSnap.docs, ...classLogsSnap.docs, ...classJournalSnap.docs, ...enrollSnap.docs];
            for (let i=0; i<allDocs.length; i+=450){
                const batch = db.batch();
                allDocs.slice(i, i+450).forEach(d=>batch.delete(d.ref));
                await batch.commit();
            }
            await db.collection('users').doc(uid).delete();
            return { ok:true };
        } catch(err){ console.error('deleteAllUserData failed:', err); showToast('Could not delete your data. Check your connection and try again.'); return { ok:false }; }
    }
    window.handleDeleteAccount = async function(){
        if (!appState.currentUserId || !auth || !auth.currentUser) return;
        const user = getCurrentUser();
        if (user && user.managesClubId){ showToast('You manage a club — hand off or delete the club first, then delete your account.'); return; }
        const typed = prompt("This permanently deletes your profile, journal, entries, class check-ins, and club journal history. This cannot be undone.\n\nType DELETE to confirm.");
        if (typed === null) return;
        if (typed.trim() !== 'DELETE'){ showToast('Account not deleted — text did not match.'); return; }
        const btn = $('#deleteAccountBtn');
        await guardedClick(btn, 'deleteAccount', RATE_LIMITS.deleteAccount, async()=>{
            const uid = appState.currentUserId;
            const result = await deleteAllUserData(uid);
            if (!result.ok) return;
            try {
                await auth.currentUser.delete();
                showToast('Account deleted.');
                closeEditProfileModal();
            } catch(err){
                console.error('auth account delete failed:', err);
                if (err.code === 'auth/requires-recent-login'){
                    await reauthAndDelete();
                } else {
                    showToast('Your data was deleted, but removing sign-in failed. Please contact support.');
                }
            }
        });
    };
    // Firebase requires a recent sign-in before it will delete an Auth
    // account. Re-auth method depends on how they originally signed in —
    // a password prompt for email/password users, a fresh Google popup
    // for Google users — since there's no password to check for the latter.
    async function reauthAndDelete(){
        const u = auth.currentUser;
        try {
            if (isGoogleUser(u)){
                const provider = new firebase.auth.GoogleAuthProvider();
                await u.reauthenticateWithPopup(provider);
            } else {
                const pw = prompt('For your security, please re-enter your password to confirm account deletion.');
                if (!pw){ showToast('Your data was deleted, but sign-in removal was cancelled. Sign in again and retry from Edit Profile.'); return; }
                const cred = firebase.auth.EmailAuthProvider.credential(u.email, pw);
                await u.reauthenticateWithCredential(cred);
            }
            await auth.currentUser.delete();
            showToast('Account deleted.');
            closeEditProfileModal();
        } catch(err){
            console.error('reauth + delete failed:', err);
            showToast('Could not verify identity. Your data was deleted, but please contact support to remove your login.');
        }
    }
    async function getUserById(id){
        if (!initFirebase()) return null;
        try {
            const snap = await db.collection('users').doc(id).get();
            if (!snap.exists) return null;
            return { id: snap.id, ...snap.data() };
        } catch(err){ console.error('getUserById failed:', err); return null; }
    }
    async function updateUserProfile(id, updates){
        if (!initFirebase()) return false;
        try { await db.collection('users').doc(id).update(updates); return true; }
        catch(err){ console.error('updateUserProfile failed:', err); showToast('Could not update profile.'); return false; }
    }
