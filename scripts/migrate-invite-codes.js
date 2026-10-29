#!/usr/bin/env node
/**
 * One-off migration: move gym invite codes off the world-readable gym docs.
 *
 *   Before:  gyms/{gymId}            { name, inviteCode, ... }       <- any signed-in user could list this
 *   After:   gyms/{gymId}            { name, ... }                   <- no code
 *            inviteCodes/{CODE}      { gymId }                       <- get-only, never listable
 *            gymSecrets/{gymId}      { inviteCode }                  <- manager + admin only
 *
 * Run ORDER matters (existing members/gyms keep working at every step):
 *   1. node scripts/migrate-invite-codes.js            # backfill (safe, idempotent, keeps the old field)
 *   2. deploy firestore.rules + public/ (this branch)  # new client + rules accept BOTH shapes
 *   3. node scripts/migrate-invite-codes.js --strip    # delete gyms/*.inviteCode (closes the leak)
 *   4. remove the LEGACY branch in firestore.rules + the legacy query in gyms.js, deploy again
 *
 * Auth: uses firebase-admin with Application Default Credentials. Download a service-account
 * key from Firebase console > Project settings > Service accounts and:
 *   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json
 * NEVER commit that key. Add --dry-run to print what would change without writing.
 */
const admin = require('firebase-admin');

const STRIP = process.argv.includes('--strip');
const DRY = process.argv.includes('--dry-run');

admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'topset-leaderboard' });
const db = admin.firestore();

(async () => {
  const gyms = await db.collection('gyms').get();
  console.log(`${gyms.size} gym(s) found. mode=${STRIP ? 'STRIP' : 'BACKFILL'}${DRY ? ' (dry run)' : ''}`);
  let touched = 0, skipped = 0;

  for (const g of gyms.docs) {
    const code = g.get('inviteCode');
    if (!code) { skipped++; console.log(`  - ${g.id} (${g.get('name')}): no inviteCode field, skipping`); continue; }

    if (!STRIP) {
      const idx = db.collection('inviteCodes').doc(code);
      const existing = await idx.get();
      if (existing.exists && existing.get('gymId') !== g.id) {
        console.error(`  ! CONFLICT: code ${code} already points at gym ${existing.get('gymId')}, not ${g.id}. Fix by hand.`);
        process.exitCode = 1; continue;
      }
      console.log(`  + ${g.id} (${g.get('name')}): ${code}`);
      if (!DRY) {
        const batch = db.batch();
        batch.set(idx, { gymId: g.id });
        batch.set(db.collection('gymSecrets').doc(g.id), { inviteCode: code });
        await batch.commit();
      }
      touched++;
    } else {
      // Refuse to strip until the replacement docs verifiably exist.
      const [idx, sec] = await Promise.all([db.collection('inviteCodes').doc(code).get(), db.collection('gymSecrets').doc(g.id).get()]);
      if (!idx.exists || !sec.exists || idx.get('gymId') !== g.id) {
        console.error(`  ! ${g.id}: replacement docs missing/mismatched — run the backfill first. Not stripping.`);
        process.exitCode = 1; continue;
      }
      console.log(`  x ${g.id} (${g.get('name')}): removing inviteCode field`);
      if (!DRY) await g.ref.update({ inviteCode: admin.firestore.FieldValue.delete() });
      touched++;
    }
  }
  console.log(`done. ${touched} updated, ${skipped} skipped.`);
})().catch(e => { console.error(e); process.exit(1); });
