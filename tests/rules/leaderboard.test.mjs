// Run with:  npm run test:rules   (needs Java; spins up the Firestore emulator)
// NOTE: written without access to an emulator. If a test fails, first decide whether the
// TEST or the RULE is wrong; each "attack" test has a positive control right beside it.
import { describe, it, before, after, beforeEach } from 'node:test';
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { makeEnv, seed, user, selfRow, ADULT_BAND } from './helpers.mjs';

let env;
before(async () => { env = await makeEnv(); });
after(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await seed(env, {
    'users/alice': user({ name: 'Test User' }),
    'users/mgr1': user({ name: 'Manager', managesGymId: 'gym1' }),
    'users/bob': user({ name: 'Bob', gymId: 'gym2' }),
    'users/carol': user({ name: 'Carol', gymId: 'gym1' }),
    'gyms/gym1': { name: 'Gym One' },
    'gyms/gym2': { name: 'Gym Two' },
    'tests/broad_jump': { name: 'Broad Jump', unit: 'm', higherIsBetter: true },
    'tests/pushups': { name: '2:00 Push-ups', unit: 'reps', higherIsBetter: true },
  });
});
const alice = () => env.authenticatedContext('alice').firestore();

describe('leaderboard: self-reported rows', () => {
  it('control: a correctly-shaped row under the canonical id is allowed', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'leaderboard/alice__broad_jump__regular'), selfRow()));
  });

  it('rejects a junk doc id (one athlete could otherwise flood a board with unlimited rows)', async () => {
    await assertFails(setDoc(doc(alice(), 'leaderboard/alice__zzz1__regular'), selfRow()));
    await assertFails(setDoc(doc(alice(), 'leaderboard/alice__broad_jump__regular__regular'), selfRow()));
  });

  it("rejects a row whose doc id is bound to a test with a different name", async () => {
    await assertFails(setDoc(doc(alice(), 'leaderboard/alice__pushups__regular'), selfRow({ test: 'Broad Jump' })));
  });

  it('rejects a row for a test that does not exist', async () => {
    await assertFails(setDoc(doc(alice(), 'leaderboard/alice__nope__regular'), selfRow({ test: 'Nope' })));
  });

  it('rejects a forged verification stamp on a regular row', async () => {
    await assertFails(setDoc(doc(alice(), 'leaderboard/alice__broad_jump__regular'),
      selfRow({ verifiedBy: 'mgr1', verifiedAt: 1, entryId: 'e1' })));
  });

  it('rejects a wrong age band (adult posting to the 14-17 board)', async () => {
    await assertFails(setDoc(doc(alice(), 'leaderboard/alice__broad_jump__regular'), selfRow({ ageGroup: '14-17' })));
  });

  it("rejects someone else's gender label", async () => {
    await assertFails(setDoc(doc(alice(), 'leaderboard/alice__broad_jump__regular'), selfRow({ gender: 'male' })));
  });

  it('rejects the __public suffix when the row carries a gymId', async () => {
    await env.clearFirestore();
    await seed(env, {
      'users/alice': user({ gymId: 'gym1' }),
      'gyms/gym1': { name: 'Gym One' },
      'tests/broad_jump': { name: 'Broad Jump', unit: 'm', higherIsBetter: true },
    });
    await assertFails(setDoc(doc(alice(), 'leaderboard/alice__broad_jump__regular__public'), selfRow({ gymId: 'gym1' })));
    // control: gym member's public-pool row (gymId null + __public) is allowed
    await assertSucceeds(setDoc(doc(alice(), 'leaderboard/alice__broad_jump__regular__public'), selfRow({ gymId: null })));
  });

  it('rejects writing a row as another user', async () => {
    await assertFails(setDoc(doc(alice(), 'leaderboard/bob__broad_jump__regular'), selfRow({ userId: 'bob' })));
  });

  it('update: value may change, but age band cannot be changed to a wrong one', async () => {
    await seed(env, { 'leaderboard/alice__broad_jump__regular': selfRow() });
    await assertSucceeds(updateDoc(doc(alice(), 'leaderboard/alice__broad_jump__regular'), { value: 3.1, updatedAt: 2 }));
    await assertFails(updateDoc(doc(alice(), 'leaderboard/alice__broad_jump__regular'), { ageGroup: '14-17' }));
  });

  it('update: cannot bolt a verification stamp onto an existing regular row', async () => {
    await seed(env, { 'leaderboard/alice__broad_jump__regular': selfRow() });
    await assertFails(updateDoc(doc(alice(), 'leaderboard/alice__broad_jump__regular'), { verifiedBy: 'mgr1', entryId: 'e1' }));
  });

  it('update: an old row for a since-deleted test can still be updated (profile sync must not break)', async () => {
    await seed(env, { 'leaderboard/alice__gone__regular': selfRow({ test: 'Gone' }) });
    await assertSucceeds(updateDoc(doc(alice(), 'leaderboard/alice__gone__regular'), { name: 'New Name', updatedAt: 3 }));
  });
});

describe('leaderboard: official rows', () => {
  const mgr = () => env.authenticatedContext('mgr1').firestore();
  const officialRow = (o = {}) => ({
    userId: 'carol', name: 'Carol', avatar: 'gym', ageGroup: ADULT_BAND, gender: 'female', gymId: 'gym1',
    test: 'Broad Jump', scope: 'official', value: 5, date: '2026-10-01',
    entryId: 'e1', verifiedBy: 'mgr1', verifiedAt: 1, updatedAt: 1, ...o,
  });

  beforeEach(async () => {
    await seed(env, {
      'entries/e1': { userId: 'carol', gymId: 'gym1', isOfficial: true, officialStatus: 'verified', value: 5, test: 'Broad Jump' },
      'entries/e2': { userId: 'bob', gymId: 'gym2', isOfficial: true, officialStatus: 'verified', value: 5, test: 'Broad Jump' },
      'leaderboard/bob__broad_jump__official': officialRow({ userId: 'bob', name: 'Bob', gymId: 'gym2', entryId: 'e2' }),
    });
  });

  it('control: a manager can publish a verified entry of their own gym', async () => {
    await assertSucceeds(setDoc(doc(mgr(), 'leaderboard/carol__broad_jump__official'), officialRow()));
  });

  it("a manager cannot move another gym's official row into their own gym", async () => {
    // Bob's row lives in gym2. mgr1 manages gym1 and holds a matching verified entry there.
    await seed(env, { 'entries/e3': { userId: 'bob', gymId: 'gym1', isOfficial: true, officialStatus: 'verified', value: 5 } });
    await assertFails(setDoc(doc(mgr(), 'leaderboard/bob__broad_jump__official'),
      officialRow({ userId: 'bob', name: 'Bob', gymId: 'gym1', entryId: 'e3' })));
  });

  it('an athlete cannot write an official row for themselves', async () => {
    await assertFails(setDoc(doc(env.authenticatedContext('carol').firestore(), 'leaderboard/carol__broad_jump__official'), officialRow()));
  });

  it('rejects unknown fields on an official row', async () => {
    await assertFails(setDoc(doc(mgr(), 'leaderboard/carol__broad_jump__official'), officialRow({ sponsored: true })));
  });
});
