// ── auth.js ───────────────────────────────────────────
// Firebase Authentication: sign up, sign in, Google sign-in, email
// verification, password reset, account deletion.

    // ── Auth layer (Firebase Authentication) ──────────────────────────────
    // Firebase Auth handles password hashing, session tokens, and email delivery.
    // Firestore 'users' documents store profile data only — no passwords, ever.

    // Counts current members of a gym by reading the matching user docs and
    // taking the result size, rather than Firestore's aggregate .count().get().
    // .count() was silently returning 0 here even when matching users.gymId
    // docs genuinely existed (same query, same rules, as the roster fetch
    // below that DOES work) — swallowed by the catch below with no visible
    // error, so it just looked like "0 members" forever. Reading the docs
    // directly is the same query shape already proven reliable by
    // fetchGymRoster() elsewhere in this file; trading a slightly heavier
    // read (docs instead of a server-side count) for a number that's
    // actually correct, which matters far more at these member caps (50-520).
    async function getMemberCount(gymId){
        if (!initFirebase() || !gymId) return 0;
        try {
            const snap = await db.collection('users').where('gymId','==',gymId).get();
            return snap.size;
        } catch(err){ console.error('getMemberCount failed:', err); return 0; }
    }
    // Client-side capacity gate — the authoritative record is the tier cap
    // stored on the gym doc. This is enforced here (not in security rules)
    // because rules can't cheaply do "is this the Nth member" checks; same
    // trust model the rest of this app already uses for business logic.
    async function checkGymCapacity(gym){
        const cap = tierInfo(gym.tier).cap;
        const count = await getMemberCount(gym.id);
        return { count, cap, full: count >= cap };
    }
    // Joins a gym by invite code AFTER the account exists. gyms/* is readable only when
    // signed in (it carries ownerEmail etc.), and firestore.rules only let a user set
    // gymId together with the gym's real invite code (claimedInviteCode).
    async function joinGymByCode(uid, code){
        const gym = await findGymByInviteCode(code);
        if (!gym){ showToast('Account created, but that gym invite code was not recognized. You can add it later in Edit Profile.'); return false; }
        const capacity = await checkGymCapacity(gym);
        if (capacity.full){ showToast(`Account created, but ${gym.name} is at its ${capacity.cap}-member limit. Contact the gym manager.`); return false; }
        try { await db.collection('users').doc(uid).update({ gymId: gym.id, claimedInviteCode: gym.inviteCode }); return true; }
        catch(err){ console.error('joinGymByCode failed:', err); showToast('Account created, but joining the gym failed. Try again from Edit Profile.'); return false; }
    }
    async function signUp(email, password, name, avatar, ageGroup, gender, sport, gymCode, birthYear){
        if (!initFirebase()) return null;
        if (!validBirthYear(birthYear)){ showToast('Please select your year of birth. TOPSET is for ages 14 and up.'); return null; }
        let cred;
        try {
            cred = await auth.createUserWithEmailAndPassword(email, password);
            // Profile doc id = Firebase Auth UID. Always created gym-less (rules require it);
            // isAdmin / managesGymId / guardianConsent* are never settable here.
            await db.collection('users').doc(cred.user.uid).set({
                name: name || email.split('@')[0],
                email: email.trim().toLowerCase(),
                avatar: avatarKey(avatar),
                birthYear: birthYear,
                ageGroup: ageGroupFromBirthYear(birthYear), // derived — the form's age picker is gone
                gender: gender || null,
                sport: sport || null,
                gymId: null,
                createdAt: new Date().toISOString()
            });
        } catch(err){
            console.error('signUp failed:', err);
            const msg = err.code === 'auth/email-already-in-use' ? 'An account with that email already exists.'
                : err.code === 'auth/weak-password' ? 'Password must be at least 6 characters.'
                : err.code === 'auth/invalid-email' ? 'Invalid email address.'
                : 'Could not create account. Try again.';
            showToast(msg);
            return null;
        }
        cred.user.sendEmailVerification().catch(err=>console.error('sendEmailVerification failed:', err));
        if (gymCode && gymCode.trim()) await joinGymByCode(cred.user.uid, gymCode);
        return cred.user;
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
    // gymId stays null — joining a gym still happens via Edit Profile,
    // same as any user who signed up without an invite code.
    async function signInWithGoogle(){
        if (!initFirebase()) return null;
        try {
            const provider = new firebase.auth.GoogleAuthProvider();
            const result = await auth.signInWithPopup(provider);
            const user = result.user;
            const isNewUser = !!(result.additionalUserInfo && result.additionalUserInfo.isNewUser);
            if (isNewUser){
                // Google skips the signup form, so ask for year of birth here. No valid
                // year (or under 14) = no account: undo the sign-in.
                const by = await window.askBirthYear();
                if (!by){
                    try { await user.delete(); } catch(e){ console.error('google new-user cleanup failed:', e); try { await auth.signOut(); } catch(_){} }
                    showToast('TOPSET is for ages 14 and up — a year of birth is needed to create an account.');
                    return null;
                }
                await db.collection('users').doc(user.uid).set({
                    name: user.displayName || (user.email ? user.email.split('@')[0] : 'Athlete'),
                    email: (user.email || '').trim().toLowerCase(),
                    avatar: DEFAULT_AVATAR,
                    birthYear: by,
                    ageGroup: ageGroupFromBirthYear(by),
                    gender: null,
                    sport: null,
                    gymId: null,
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
        if (window.updateNotifications) updateNotifications();
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
    // leaderboard, journal), then the profile doc itself, then the Firebase
    // Auth account. Order matters: Firestore data goes first so a failure
    // partway through never leaves an orphaned Auth account with no way
    // back into the app to retry — worst case is a deleted Auth user with
    // leftover Firestore docs, which is recoverable by an admin, not the
    // reverse. Chunked into batches of 450 to stay under Firestore's
    // 500-write batch limit with headroom.
    //
    // Official entries are excluded from the delete batch entirely.
    // firestore.rules locks official entries away from the owner on
    // purpose (only a gym manager or admin can touch them, so an athlete
    // can't quietly erase an inconvenient official PR) — and a Firestore
    // batch is all-or-nothing, so even ONE denied delete in a batch would
    // silently fail every delete in that chunk, not just the blocked one.
    // Filtering them out up front means account deletion still succeeds;
    // those results just stay on the gym's record, same as if the member
    // had left without deleting their account.
    async function deleteAllUserData(uid){
        if (!initFirebase()) return { ok:false, keptOfficial:0 };
        try {
            const [entriesSnap, lbSnap, journalSnap] = await Promise.all([
                db.collection('entries').where('userId','==',uid).get(),
                db.collection('leaderboard').where('userId','==',uid).get(),
                db.collection('journal').where('userId','==',uid).get()
            ]);
            // Only VERIFIED official entries are locked to the gym's record (rules); pending and
            // rejected ones are the athlete's to delete. Official leaderboard docs are
            // manager-written, so they're left alone too (a denied delete would fail the whole batch).
            const deletableEntries = entriesSnap.docs.filter(d => !(d.data().isOfficial === true && d.data().officialStatus === 'verified'));
            const keptOfficial = entriesSnap.docs.length - deletableEntries.length;
            const deletableLb = lbSnap.docs.filter(d => d.data().scope !== 'official');
            const allDocs = [...deletableEntries, ...deletableLb, ...journalSnap.docs];
            for (let i=0; i<allDocs.length; i+=450){
                const batch = db.batch();
                allDocs.slice(i, i+450).forEach(d=>batch.delete(d.ref));
                await batch.commit();
            }
            // The public athlete profile (name, bio, location, verified-results snapshot) must go
            // with the account — leaving it live after deletion is a POPIA problem.
            try { await db.collection('athleteProfiles').doc(uid).delete(); } catch(e){ console.error('athleteProfiles delete failed:', e); }
            await db.collection('users').doc(uid).delete();
            return { ok:true, keptOfficial };
        } catch(err){ console.error('deleteAllUserData failed:', err); showToast('Could not delete your data. Check your connection and try again.'); return { ok:false, keptOfficial:0 }; }
    }
    function accountDeletedMessage(keptOfficial){
        return keptOfficial > 0
            ? `Account deleted. ${keptOfficial} official result${keptOfficial>1?'s':''} stayed on your gym's record — only your gym manager can remove those.`
            : 'Account deleted.';
    }
    window.handleDeleteAccount = async function(){
        if (!appState.currentUserId || !auth || !auth.currentUser) return;
        const user = getCurrentUser();
        if (user && user.managesGymId){ showToast('You manage a gym — hand off or delete the gym first, then delete your account.'); return; }
        const typed = prompt("This permanently deletes your profile, journal, and leaderboard history, plus any non-official entries. Official results your gym has locked in stay on the gym's record. This cannot be undone.\n\nType DELETE to confirm.");
        if (typed === null) return;
        if (typed.trim() !== 'DELETE'){ showToast('Account not deleted — text did not match.'); return; }
        const btn = $('#deleteAccountBtn');
        await guardedClick(btn, 'deleteAccount', RATE_LIMITS.deleteAccount, async()=>{
            const uid = appState.currentUserId;
            const result = await deleteAllUserData(uid);
            if (!result.ok) return;
            try {
                await auth.currentUser.delete();
                showToast(accountDeletedMessage(result.keptOfficial));
                closeEditProfileModal();
            } catch(err){
                console.error('auth account delete failed:', err);
                if (err.code === 'auth/requires-recent-login'){
                    await reauthAndDelete(result.keptOfficial);
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
    async function reauthAndDelete(keptOfficial){
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
            showToast(accountDeletedMessage(keptOfficial));
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
