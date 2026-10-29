import { readFileSync } from 'node:fs';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';

export const YEAR = new Date().getUTCFullYear();       // rules use request.time.year() (UTC)
export const ADULT_BIRTH_YEAR = YEAR - 30;              // -> age band '25-34'
export const ADULT_BAND = '25-34';

export async function makeEnv() {
  return initializeTestEnvironment({
    projectId: 'demo-topset',
    firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8') },
  });
}

/** Seed documents with rules disabled. `docs` = { 'collection/id': {...} } */
export async function seed(env, docs) {
  const { doc, setDoc } = await import('firebase/firestore');
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const [path, data] of Object.entries(docs)) await setDoc(doc(db, path), data);
  });
}

export const user = (o = {}) => ({
  name: 'Test User', email: 't@example.com', avatar: 'gym', gender: 'female',
  birthYear: ADULT_BIRTH_YEAR, createdAt: '2026-01-01T00:00:00.000Z', ...o,
});

/** A self-reported leaderboard row as core.js recomputeBestForUser writes it. */
export const selfRow = (o = {}) => ({
  userId: 'alice', name: 'Test User', avatar: 'gym', ageGroup: ADULT_BAND, gender: 'female',
  gymId: null, test: 'Broad Jump', scope: 'regular', value: 2.5, date: '2026-10-01', updatedAt: 1, ...o,
});
