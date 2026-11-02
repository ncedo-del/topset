// ── scripts/migrate-firestore-to-supabase.mjs ──────────────────────────────
// Phase 1 ETL script: Transforms Firestore entries and loads them into Supabase PostgreSQL.
// Usage: node scripts/migrate-firestore-to-supabase.mjs [path/to/entries.json]

import { readFileSync, existsSync } from 'node:fs';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mxnqgvtawckpqazrthbm.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'sb_publishable_l-FZLePTEBAhF9OdQ0hLPA_zlvyPLWE';

// Default test name to ID lookup
const TEST_NAME_MAP = {
    'broad jump': 'broad_jump',
    '3km run': '3km_run',
    '2:00 push-ups': 'pushups',
    'push-ups': 'pushups',
    'pushups': 'pushups',
    '2:00 sit-ups': 'situps',
    'sit-ups': 'situps',
    'situps': 'situps',
    'sit and reach': 'sit_reach',
    'sit & reach': 'sit_reach',
    'sit_reach': 'sit_reach',
    'bodyweight': 'bodyweight'
};

function normalizeTestId(testName) {
    if (!testName) return null;
    const lower = String(testName).trim().toLowerCase();
    if (TEST_NAME_MAP[lower]) return TEST_NAME_MAP[lower];
    return lower.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

export function transformEntry(doc) {
    const data = doc.data ? doc.data : doc;
    const firestoreId = doc.id || data.id || `entry_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const testId = normalizeTestId(data.test);

    let loggedAt = new Date().toISOString();
    if (data.timestamp) {
        loggedAt = new Date(typeof data.timestamp === 'number' ? data.timestamp : Number(data.timestamp)).toISOString();
    }

    let verifiedAt = null;
    if (data.verifiedAt) {
        verifiedAt = new Date(typeof data.verifiedAt === 'number' ? data.verifiedAt : Number(data.verifiedAt)).toISOString();
    }

    return {
        firestore_id: firestoreId,
        firebase_uid: data.userId || data.firebase_uid,
        test_id: testId,
        test_name: data.test,
        value: Number(data.value),
        test_date: data.date,
        logged_at: loggedAt,
        is_official: !!data.isOfficial,
        official_status: data.officialStatus || (data.isOfficial ? 'pending' : null),
        gym_id: data.gymId || null,
        verified_by: data.verifiedBy || null,
        verified_by_name: data.verifiedByName || null,
        verified_at: verifiedAt,
        verified_gym_name: data.verifiedGymName || null
    };
}

async function uploadBatch(records) {
    const url = `${SUPABASE_URL}/rest/v1/test_entries?on_conflict=firestore_id`;
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates,return=minimal'
        },
        body: JSON.stringify(records)
    });

    if (!res.ok) {
        const error = await res.text();
        throw new Error(`Supabase upload failed (${res.status}): ${error}`);
    }
}

async function run() {
    const filePath = process.argv[2];
    if (!filePath || !existsSync(filePath)) {
        console.log('Usage: node scripts/migrate-firestore-to-supabase.mjs <exported-entries.json>');
        console.log('Set SUPABASE_SERVICE_ROLE_KEY in environment for elevated migration privileges.');
        process.exit(0);
    }

    const raw = JSON.parse(readFileSync(filePath, 'utf8'));
    const list = Array.isArray(raw) ? raw : Object.entries(raw).map(([id, d]) => ({ id, ...d }));

    console.log(`Loaded ${list.length} Firestore entries from ${filePath}`);
    const transformed = list.map(transformEntry).filter(e => e.firebase_uid && e.test_id && !isNaN(e.value));
    console.log(`Valid records for migration: ${transformed.length}`);

    const batchSize = 100;
    for (let i = 0; i < transformed.length; i += batchSize) {
        const batch = transformed.slice(i, i + batchSize);
        process.stdout.write(`Uploading batch ${Math.floor(i / batchSize) + 1} / ${Math.ceil(transformed.length / batchSize)}... `);
        await uploadBatch(batch);
        console.log('Done.');
    }

    console.log('Migration complete!');
}

if (process.argv[1] && process.argv[1].endsWith('migrate-firestore-to-supabase.mjs')) {
    run().catch(err => {
        console.error('Migration error:', err);
        process.exit(1);
    });
}
