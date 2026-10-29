import { describe, it, before, after, beforeEach } from 'node:test';
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, deleteField } from 'firebase/firestore';
import { makeEnv, seed, user } from './helpers.mjs';

let env;
before(async () => { env = await makeEnv(); });
after(async () => { await env.cleanup(); });

const scout = () => env.authenticatedContext('scout1').firestore();
const admin = () => env.authenticatedContext('admin1').firestore();
const acct = (o = {}) => ({ orgName: 'Acme FC', orgType: 'team', orgVerified: false, createdAt: 1, ...o });

beforeEach(async () => {
  await env.clearFirestore();
  await seed(env, {
    'users/scout1': user({ accountType: 'scout', name: 'Sam Scout' }),
    'users/admin1': user({ isAdmin: true }),
    'athleteProfiles/ath1': { uid: 'ath1', isPublic: true, name: 'Athlete One' },
    'athleteProfiles/ath2': { uid: 'ath2', isPublic: false, name: 'Private Two' },
  });
});

describe('scoutAccounts: verification can only be granted by an admin', () => {
  beforeEach(async () => { await seed(env, { 'scoutAccounts/scout1': acct() }); });

  it('a scout cannot verify themselves', async () => {
    await assertFails(updateDoc(doc(scout(), 'scoutAccounts/scout1'), { orgVerified: true }));
  });
  it('control: an admin can verify and revoke', async () => {
    await assertSucceeds(updateDoc(doc(admin(), 'scoutAccounts/scout1'), { orgVerified: true }));
    await assertSucceeds(updateDoc(doc(admin(), 'scoutAccounts/scout1'), { orgVerified: false }));
  });
  it('an unverified scout can edit org details (verification stays false)', async () => {
    await assertSucceeds(updateDoc(doc(scout(), 'scoutAccounts/scout1'), { orgName: 'Acme United', orgType: 'team', orgVerified: false }));
  });
  it('a VERIFIED scout cannot rename and keep the badge', async () => {
    await seed(env, { 'scoutAccounts/scout1': acct({ orgVerified: true }) });
    await assertFails(updateDoc(doc(scout(), 'scoutAccounts/scout1'), { orgName: 'Orlando Pirates' }));                       // orgVerified untouched = still true
    await assertFails(updateDoc(doc(scout(), 'scoutAccounts/scout1'), { orgName: 'Orlando Pirates', orgVerified: true }));
  });
  it('control: a verified scout CAN rename if the edit resets verification', async () => {
    await seed(env, { 'scoutAccounts/scout1': acct({ orgVerified: true }) });
    await assertSucceeds(updateDoc(doc(scout(), 'scoutAccounts/scout1'), { orgName: 'Orlando Pirates', orgVerified: false }));
  });
});

describe('introRequests: only verified scouts may contact athletes', () => {
  const intro = (o = {}) => ({
    scoutId: 'scout1', scoutName: 'Sam Scout', scoutOrg: 'Acme FC', scoutOrgType: 'team', scoutOrgVerified: true,
    athleteId: 'ath1', athleteName: 'Athlete One', message: 'We run trials in March and liked your results.',
    status: 'pending', createdAt: 1, ...o,
  });

  it('an UNVERIFIED scout cannot send an intro', async () => {
    await seed(env, { 'scoutAccounts/scout1': acct({ orgVerified: false }) });
    await assertFails(setDoc(doc(scout(), 'introRequests/scout1__ath1'), intro({ scoutOrgVerified: false })));
  });
  it('an unverified scout cannot dodge the check by claiming scoutOrgVerified: true', async () => {
    await seed(env, { 'scoutAccounts/scout1': acct({ orgVerified: false }) });
    await assertFails(setDoc(doc(scout(), 'introRequests/scout1__ath1'), intro({ scoutOrgVerified: true })));
  });
  it('control: a VERIFIED scout can send to a public athlete', async () => {
    await seed(env, { 'scoutAccounts/scout1': acct({ orgVerified: true }) });
    await assertSucceeds(setDoc(doc(scout(), 'introRequests/scout1__ath1'), intro()));
  });
  it('a verified scout still cannot contact a private athlete', async () => {
    await seed(env, { 'scoutAccounts/scout1': acct({ orgVerified: true }) });
    await assertFails(setDoc(doc(scout(), 'introRequests/scout1__ath2'), intro({ athleteId: 'ath2', athleteName: 'Private Two' })));
  });
});

describe('scoutShortlists: no copy of the athlete is stored', () => {
  beforeEach(async () => { await seed(env, { 'scoutAccounts/scout1': acct() }); });
  const row = (o = {}) => ({ scoutId: 'scout1', athleteId: 'ath1', note: '', addedAt: 1, ...o });

  it('control: id + note + addedAt is allowed', async () => {
    await assertSucceeds(setDoc(doc(scout(), 'scoutShortlists/scout1__ath1'), row()));
  });
  it('rejects a copy of name / avatar / sport / location', async () => {
    for (const extra of [{ name: 'Athlete One' }, { avatar: 'gym' }, { sport: 'Rugby' }, { location: 'Soweto' }]) {
      await assertFails(setDoc(doc(scout(), 'scoutShortlists/scout1__ath1'), row(extra)));
    }
  });
  it('a legacy doc with copies can be cleaned up in place', async () => {
    await seed(env, { 'scoutShortlists/scout1__ath1': row({ name: 'Athlete One', avatar: 'gym', sport: 'Rugby', location: 'Soweto' }) });
    await assertSucceeds(updateDoc(doc(scout(), 'scoutShortlists/scout1__ath1'),
      { name: deleteField(), avatar: deleteField(), sport: deleteField(), location: deleteField() }));
  });
  it('the note can still be edited, but identity fields cannot move', async () => {
    await seed(env, { 'scoutShortlists/scout1__ath1': row() });
    await assertSucceeds(updateDoc(doc(scout(), 'scoutShortlists/scout1__ath1'), { note: 'saw at trials' }));
    await assertFails(updateDoc(doc(scout(), 'scoutShortlists/scout1__ath1'), { athleteId: 'ath2' }));
    await assertFails(updateDoc(doc(scout(), 'scoutShortlists/scout1__ath1'), { addedAt: 999 }));
  });
  it("one scout cannot read or edit another's shortlist", async () => {
    await seed(env, { 'users/scout2': user({ accountType: 'scout' }), 'scoutShortlists/scout1__ath1': row() });
    const other = env.authenticatedContext('scout2').firestore();
    await assertFails(updateDoc(doc(other, 'scoutShortlists/scout1__ath1'), { note: 'hax' }));
  });
});
