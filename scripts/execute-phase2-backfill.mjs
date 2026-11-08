// ── scripts/execute-phase2-backfill.mjs ────────────────────────────────────
// Phase 2 Supabase Initializer & Full ETL Backfill Script
// Extracts live data from Firestore using Google Service Account credentials,
// transforms records, and loads them into Supabase PostgreSQL using service_role key.

import crypto from 'node:crypto';
import fs from 'node:fs';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mxnqgvtawckpqazrthbm.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Error: Please provide SUPABASE_SERVICE_ROLE_KEY environment variable.');
  process.exit(1);
}

const creds = JSON.parse(fs.readFileSync('./serviceAccountKey.json', 'utf8'));

// ── Google OAuth2 Access Token for Firestore ─────────────────────────────
async function getGoogleAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const claimSet = Buffer.from(JSON.stringify({
    iss: creds.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: creds.token_uri,
    exp: now + 3600,
    iat: now
  })).toString('base64url');

  const sign = crypto.createSign('RSA-SHA256');
  sign.update(`${header}.${claimSet}`);
  const signature = sign.sign(creds.private_key, 'base64url');
  const assertion = `${header}.${claimSet}.${signature}`;

  const res = await fetch(creds.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    })
  });

  if (!res.ok) {
    throw new Error(`Google OAuth failed (${res.status}): ${await res.text()}`);
  }
  const data = await res.json();
  return data.access_token;
}

// ── Firestore Document Unwrapping ────────────────────────────────────────
function unwrapValue(val) {
  if (!val) return null;
  if ('stringValue' in val) return val.stringValue;
  if ('integerValue' in val) return parseInt(val.integerValue, 10);
  if ('doubleValue' in val) return parseFloat(val.doubleValue);
  if ('booleanValue' in val) return val.booleanValue;
  if ('timestampValue' in val) return val.timestampValue;
  if ('nullValue' in val) return null;
  if ('mapValue' in val) {
    const obj = {};
    for (const [k, v] of Object.entries(val.mapValue.fields || {})) {
      obj[k] = unwrapValue(v);
    }
    return obj;
  }
  if ('arrayValue' in val) {
    return (val.arrayValue.values || []).map(unwrapValue);
  }
  return null;
}

function unwrapFirestoreDoc(doc) {
  const result = { id: doc.name.split('/').pop() };
  if (!doc.fields) return result;
  for (const [k, v] of Object.entries(doc.fields)) {
    result[k] = unwrapValue(v);
  }
  return result;
}

async function fetchFirestoreCollection(token, collectionId) {
  let documents = [];
  let pageToken = null;

  do {
    let url = `https://firestore.googleapis.com/v1/projects/${creds.project_id}/databases/(default)/documents/${collectionId}?pageSize=300`;
    if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;

    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      if (res.status === 404) return [];
      throw new Error(`Failed to fetch ${collectionId}: ${await res.text()}`);
    }
    const data = await res.json();
    if (data.documents) {
      documents.push(...data.documents.map(unwrapFirestoreDoc));
    }
    pageToken = data.nextPageToken || null;
  } while (pageToken);

  return documents;
}

// ── Supabase REST Helper ─────────────────────────────────────────────────
async function supabaseRequest(endpoint, method = 'GET', body = null, prefer = 'return=representation') {
  const url = `${SUPABASE_URL}/rest/v1/${endpoint}`;
  const headers = {
    'apikey': SUPABASE_SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': prefer
  };

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Supabase [${res.status}] ${method} ${endpoint}: ${errorText}`);
  }

  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ── Test Name to ID Mapping ──────────────────────────────────────────────
const KNOWN_TEST_MAP = {
  'broad jump': 'broad_jump',
  'standing broad jump': 'broad_jump',
  '3km run': '3km_run',
  '5km run': '5km_run',
  '5km': '5km_run',
  '2:00 push-ups': 'pushups',
  'push-ups': 'pushups',
  'pushups': 'pushups',
  '2:00 push ups': 'pushups',
  '2:00 sit-ups': 'situps',
  'sit-ups': 'situps',
  'situps': 'situps',
  'sit and reach': 'sit_reach',
  'sit & reach': 'sit_reach',
  'sit_reach': 'sit_reach',
  'bodyweight': 'bodyweight',
  '2:00 hand release push up': 'hand_release_pushups',
  '2:00 hand release push ups': 'hand_release_pushups',
  '2:00 curl up test': 'curl_up_test',
  'official hyrox p\'f\'\'t': 'hyrox_pft',
  'official hyrox p’f’t': 'hyrox_pft',
  'official hyrox pft': 'hyrox_pft',
  'dft (deadlydozen fitness test)': 'dft_fitness_test',
  'broncho shuttle': 'broncho_test',
  'vertical jump': 'vertical_jump',
  'beep test / yo-yo': 'beep_test',
  'bench press 1rm': 'bench_press_1rm',
  '1 rep max bench press': 'bench_press_1rm',
  'squat 1rm': 'squat_1rm',
  '1 rep max back squat': 'squat_1rm',
  'deadlift 1rm': 'deadlift_1rm',
  '1 rep max deadlift': 'deadlift_1rm',
  'snatch 1rm': 'snatch_1rm',
  'clean & jerk 1rm': 'clean_jerk_1rm',
  '1 rep max strict press': 'strict_press_1rm',
  '40m sprint': 'sprint_40m'
};

function normalizeTestId(testName) {
  if (!testName) return null;
  const lower = String(testName).trim().toLowerCase();
  if (KNOWN_TEST_MAP[lower]) return KNOWN_TEST_MAP[lower];
  return lower.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function normalizeUnit(rawUnit) {
  if (!rawUnit) return 'reps';
  const u = String(rawUnit).trim().toLowerCase();
  if (['m', 'meter', 'meters'].includes(u)) return 'm';
  if (['cm', 'centimeters'].includes(u)) return 'cm';
  if (['kg', 'kgs'].includes(u)) return 'kg';
  if (['s', 'sec', 'seconds', 'time', 'min', 'mins'].includes(u)) return 'time';
  if (['rep', 'reps'].includes(u)) return 'reps';
  return 'reps';
}

// ── Main Migration Runner ────────────────────────────────────────────────
async function run() {
  console.log('====================================================');
  console.log('🚀 TOPSET Phase 2 Initializer & Database Backfill');
  console.log('====================================================');

  console.log('\n[1/5] Authenticating with Google Cloud / Firebase...');
  const gToken = await getGoogleAccessToken();
  console.log('✓ Firebase Admin authenticated successfully.');

  console.log('\n[2/5] Fetching data from Cloud Firestore...');
  const [fsEntries, fsUsers, fsTests] = await Promise.all([
    fetchFirestoreCollection(gToken, 'entries'),
    fetchFirestoreCollection(gToken, 'users'),
    fetchFirestoreCollection(gToken, 'tests')
  ]);
  console.log(`✓ Fetched: ${fsEntries.length} entries, ${fsUsers.length} users, ${fsTests.length} tests.`);

  // 1. Sync Test Catalog
  console.log('\n[3/5] Syncing Test Catalog into Supabase...');
  const catalogPayloads = [];

  for (const t of fsTests) {
    const testId = normalizeTestId(t.name) || t.id;
    catalogPayloads.push({
      id: testId,
      name: t.name || testId,
      unit: normalizeUnit(t.unit),
      higher_is_better: t.higherIsBetter !== false,
      input_type: t.inputType === 'text' || normalizeUnit(t.unit) === 'time' ? 'text' : 'number',
      placeholder: t.placeholder ? String(t.placeholder) : null,
      sport: t.sport || null,
      gym_id: t.gymId || null,
      display_order: Number.isInteger(t.order) ? t.order : 10
    });
  }

  // Also ensure any test referenced in fsEntries is covered
  for (const e of fsEntries) {
    if (!e.test) continue;
    const testId = normalizeTestId(e.test);
    if (!catalogPayloads.find(c => c.id === testId)) {
      catalogPayloads.push({
        id: testId,
        name: e.test,
        unit: 'reps',
        higher_is_better: true,
        input_type: 'number',
        placeholder: '0',
        sport: null,
        gym_id: e.gymId || null,
        display_order: 99
      });
    }
  }

  // Deduplicate test catalog by id
  const uniqueCatalogMap = new Map();
  for (const c of catalogPayloads) {
    if (!uniqueCatalogMap.has(c.id)) {
      uniqueCatalogMap.set(c.id, c);
    }
  }
  const uniqueCatalog = Array.from(uniqueCatalogMap.values());

  // Upsert test catalog
  const catalogResult = await supabaseRequest(
    'test_catalog?on_conflict=id',
    'POST',
    uniqueCatalog,
    'resolution=merge-duplicates,return=representation'
  );
  console.log(`✓ Seeded ${catalogResult ? catalogResult.length : uniqueCatalog.length} tests in Supabase test_catalog.`);

  // 2. Sync Athlete Profiles
  console.log('\n[4/5] Migrating Athlete Profiles into Supabase...');
  const profilePayloads = fsUsers.map(u => ({
    firebase_uid: u.id,
    name: u.name || 'Athlete',
    avatar: u.avatar || 'gym',
    age_group: u.ageGroup || null,
    gender: u.gender || null,
    sport: u.sport || null,
    position: u.position || null,
    location: u.location || null,
    bio: u.bio || null,
    is_public: !!u.isPublic,
    open_to_sponsorship: !!u.openToSponsorship,
    open_to_trials: !!u.openToTrials,
    open_to_opportunities: !!u.openToOpportunities,
    guardian_consent: !!u.guardianConsent,
    created_at: u.createdAt ? new Date(u.createdAt).toISOString() : new Date().toISOString()
  }));

  // Deduplicate profile payloads
  const uniqueProfileMap = new Map();
  for (const p of profilePayloads) {
    if (!uniqueProfileMap.has(p.firebase_uid)) {
      uniqueProfileMap.set(p.firebase_uid, p);
    }
  }
  const uniqueProfiles = Array.from(uniqueProfileMap.values());

  const profilesResult = await supabaseRequest(
    'athlete_profiles?on_conflict=firebase_uid',
    'POST',
    uniqueProfiles,
    'resolution=merge-duplicates,return=representation'
  );
  console.log(`✓ Migrated ${profilesResult ? profilesResult.length : uniqueProfiles.length} athlete profiles.`);

  // 3. Sync Test Entries
  console.log('\n[5/5] Migrating Performance Entries into Supabase...');
  const entryPayloads = [];

  for (const e of fsEntries) {
    if (!e.userId || isNaN(e.value)) continue;
    const testId = normalizeTestId(e.test);
    if (!testId) continue;

    let loggedAt = new Date().toISOString();
    if (e.timestamp) {
      loggedAt = new Date(typeof e.timestamp === 'number' ? e.timestamp : Number(e.timestamp)).toISOString();
    }

    let verifiedAt = null;
    if (e.verifiedAt) {
      verifiedAt = new Date(typeof e.verifiedAt === 'number' ? e.verifiedAt : Number(e.verifiedAt)).toISOString();
    }

    let testDate = e.date;
    if (!testDate || isNaN(new Date(testDate).getTime())) {
      testDate = loggedAt.split('T')[0];
    }
    // PostgreSQL test_date <= CURRENT_DATE check
    const todayStr = new Date().toISOString().split('T')[0];
    if (testDate > todayStr) {
      testDate = todayStr;
    }

    entryPayloads.push({
      firestore_id: e.id,
      firebase_uid: e.userId,
      test_id: testId,
      test_name: e.test,
      value: Number(e.value),
      test_date: testDate,
      logged_at: loggedAt,
      is_official: !!e.isOfficial,
      official_status: e.officialStatus || (e.isOfficial ? 'pending' : null),
      gym_id: e.gymId || null,
      verified_by: e.verifiedBy || null,
      verified_by_name: e.verifiedByName || null,
      verified_at: verifiedAt,
      verified_gym_name: e.verifiedGymName || null
    });
  }

  // Deduplicate entries by firestore_id
  const uniqueEntryMap = new Map();
  for (const e of entryPayloads) {
    if (!uniqueEntryMap.has(e.firestore_id)) {
      uniqueEntryMap.set(e.firestore_id, e);
    }
  }
  const uniqueEntries = Array.from(uniqueEntryMap.values());

  const entriesResult = await supabaseRequest(
    'test_entries?on_conflict=firestore_id',
    'POST',
    uniqueEntries,
    'resolution=merge-duplicates,return=representation'
  );
  console.log(`✓ Migrated ${entriesResult ? entriesResult.length : uniqueEntries.length} benchmark test entries.`);

  // 4. Parity and Views Validation
  console.log('\n====================================================');
  console.log('🔍 Running Phase 2 Parity & Analytical Views Validation');
  console.log('====================================================');

  const [prViewRows, lbViewRows, progViewRows] = await Promise.all([
    supabaseRequest('athlete_personal_records?select=*&limit=10'),
    supabaseRequest('leaderboard_rankings_view?select=*&limit=10'),
    supabaseRequest('athlete_progression_view?select=*&limit=10')
  ]);

  console.log(`✓ Personal Records View: calculated ${prViewRows.length} active PBs (showing top ${prViewRows.length})`);
  if (prViewRows.length > 0) {
    console.log('  Sample PR:', {
      test: prViewRows[0].test_name,
      pb: prViewRows[0].pb_value,
      unit: prViewRows[0].unit,
      date: prViewRows[0].pb_date,
      athlete: prViewRows[0].firebase_uid
    });
  }

  console.log(`✓ Leaderboard Rankings View: calculated ${lbViewRows.length} ranked entries`);
  if (lbViewRows.length > 0) {
    console.log('  Sample Leaderboard Row:', {
      test: lbViewRows[0].test_name,
      rank: lbViewRows[0].rank,
      percentile: lbViewRows[0].percentile + '%',
      score: lbViewRows[0].pb_value
    });
  }

  console.log(`✓ Progression & Deltas View: calculated ${progViewRows.length} historical attempt progressions`);
  if (progViewRows.length > 0) {
    console.log('  Sample Progression Step:', {
      test: progViewRows[0].test_name,
      value: progViewRows[0].value,
      delta: progViewRows[0].delta_value,
      isPB: progViewRows[0].is_all_time_pb
    });
  }

  console.log('\n🎉 Phase 2 Initialization & Backfill Complete!');
}

run().catch(err => {
  console.error('\n❌ Migration Failed:', err);
  process.exit(1);
});
