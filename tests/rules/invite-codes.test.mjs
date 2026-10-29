import { describe, it, before, after, beforeEach } from 'node:test';
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, updateDoc } from 'firebase/firestore';
import { makeEnv, seed, user } from './helpers.mjs';

let env;
before(async () => { env = await makeEnv(); });
after(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await seed(env, {
    'users/alice': user(),
    'users/mgr1': user({ managesGymId: 'gym1' }),
    'gyms/gym1': { name: 'Gym One' },                                   // migrated: no inviteCode on the doc
    'gyms/gym2': { name: 'Gym Two', inviteCode: 'TOPSET-LEG234' },     // LEGACY: not migrated yet
    'inviteCodes/TOPSET-ABC234': { gymId: 'gym1' },
    'inviteCodes/TOPSET-XYZ234': { gymId: 'gym2' },
    'gymSecrets/gym1': { inviteCode: 'TOPSET-ABC234' },
  });
});
const alice = () => env.authenticatedContext('alice').firestore();
const join = (data) => updateDoc(doc(alice(), 'users/alice'), data);

describe('invite codes are resolvable but not enumerable', () => {
  it('a signed-in user can GET a code they were given', async () => {
    await assertSucceeds(getDoc(doc(alice(), 'inviteCodes/TOPSET-ABC234')));
  });
  it('an anonymous visitor cannot', async () => {
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'inviteCodes/TOPSET-ABC234')));
  });
  it('nobody can LIST the codes (the old leak)', async () => {
    await assertFails(getDocs(collection(alice(), 'inviteCodes')));
  });
  it('gymSecrets: a random user cannot read, the gym\'s manager can', async () => {
    await assertFails(getDoc(doc(alice(), 'gymSecrets/gym1')));
    await assertSucceeds(getDoc(doc(env.authenticatedContext('mgr1').firestore(), 'gymSecrets/gym1')));
  });
  it("a manager cannot read another gym's secret", async () => {
    await seed(env, { 'gymSecrets/gym2': { inviteCode: 'TOPSET-LEG234' } });
    await assertFails(getDoc(doc(env.authenticatedContext('mgr1').firestore(), 'gymSecrets/gym2')));
  });
  it('clients cannot create or edit codes', async () => {
    const { setDoc } = await import('firebase/firestore');
    await assertFails(setDoc(doc(alice(), 'inviteCodes/TOPSET-HACK22'), { gymId: 'gym1' }));
    await assertFails(setDoc(doc(env.authenticatedContext('mgr1').firestore(), 'inviteCodes/TOPSET-HACK22'), { gymId: 'gym1' }));
  });
});

describe('joining a gym', () => {
  it('works with a valid code from the lookup doc', async () => {
    await assertSucceeds(join({ gymId: 'gym1', claimedInviteCode: 'TOPSET-ABC234' }));
  });
  it('fails with no code, a made-up code, or another gym\'s code', async () => {
    await assertFails(join({ gymId: 'gym1' }));
    await assertFails(join({ gymId: 'gym1', claimedInviteCode: 'TOPSET-NOPE22' }));
    await assertFails(join({ gymId: 'gym1', claimedInviteCode: 'TOPSET-XYZ234' })); // that code belongs to gym2
  });
  it('rejects a code containing a path separator', async () => {
    await assertFails(join({ gymId: 'gym1', claimedInviteCode: 'X/../gyms' }));
  });
  it('LEGACY: still works for a gym whose code is still on the gym doc', async () => {
    await assertSucceeds(join({ gymId: 'gym2', claimedInviteCode: 'TOPSET-LEG234' }));
  });
});
