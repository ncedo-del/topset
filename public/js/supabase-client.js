// ── supabase-client.js ───────────────────────────────────────────────
// Phase 1 & 2 Supabase PostgreSQL Client & Shadow Validation for TOPSET
// Connects to Supabase REST API using browser fetch() with anon key + Firebase JWT
// Loads after core.js and auth.js.

const SUPABASE_CONFIG = {
    url: 'https://mxnqgvtawckpqazrthbm.supabase.co',
    anonKey: 'sb_publishable_l-FZLePTEBAhF9OdQ0hLPA_zlvyPLWE'
};

const supabaseClient = {
    isConfigured() {
        return !!(SUPABASE_CONFIG.url && SUPABASE_CONFIG.anonKey);
    },

    resolveTestId(testName) {
        if (!testName) return null;
        const normalized = String(testName).trim().toLowerCase();
        const map = {
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
        if (map[normalized]) return map[normalized];
        return normalized.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    },

    async getHeaders(includeAuth = true) {
        const headers = {
            'apikey': SUPABASE_CONFIG.anonKey,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        };

        if (includeAuth && typeof auth !== 'undefined' && auth?.currentUser) {
            try {
                const token = await auth.currentUser.getIdToken();
                if (token) {
                    headers['Authorization'] = `Bearer ${token}`;
                } else {
                    headers['Authorization'] = `Bearer ${SUPABASE_CONFIG.anonKey}`;
                }
            } catch (err) {
                headers['Authorization'] = `Bearer ${SUPABASE_CONFIG.anonKey}`;
            }
        } else {
            headers['Authorization'] = `Bearer ${SUPABASE_CONFIG.anonKey}`;
        }

        return headers;
    },

    async query(endpoint, options = {}) {
        if (!this.isConfigured()) return null;
        const includeAuth = options.auth !== false;
        const headers = await this.getHeaders(includeAuth);
        const url = `${SUPABASE_CONFIG.url}/rest/v1/${endpoint}`;

        try {
            const res = await fetch(url, {
                method: options.method || 'GET',
                headers,
                body: options.body ? JSON.stringify(options.body) : undefined
            });

            if (!res.ok) {
                const errorText = await res.text();
                console.warn(`Supabase REST error [${res.status}] ${endpoint}:`, errorText);
                return null;
            }

            return await res.json();
        } catch (err) {
            console.error(`Supabase network error on ${endpoint}:`, err);
            return null;
        }
    },

    // ── Reads ────────────────────────────────────────────────────────
    async getTestCatalog() {
        return await this.query('test_catalog?select=*&order=display_order.asc', { auth: false });
    },

    async getAthletePRs(firebaseUid) {
        if (!firebaseUid) return [];
        return await this.query(`athlete_personal_records?firebase_uid=eq.${encodeURIComponent(firebaseUid)}&select=*`);
    },

    async getAthleteProgression(firebaseUid, testId) {
        if (!firebaseUid || !testId) return [];
        return await this.query(
            `athlete_progression_view?firebase_uid=eq.${encodeURIComponent(firebaseUid)}&test_id=eq.${encodeURIComponent(testId)}&order=test_date.asc,logged_at.asc`
        );
    },

    async getLeaderboardRankings(testId, scope = 'regular', gymId = null) {
        if (!testId) return [];
        const gymFilter = gymId ? `&gym_id=eq.${encodeURIComponent(gymId)}` : '&gym_id=is.null';
        return await this.query(
            `leaderboard_rankings_view?test_id=eq.${encodeURIComponent(testId)}&effective_scope=eq.${encodeURIComponent(scope)}${gymFilter}&order=rank.asc`
        );
    },

    // ── Controlled Shadow Write Sync ─────────────────────────────────
    async syncEntry(entry) {
        if (!entry || !entry.userId) return null;
        const testId = this.resolveTestId(entry.test);
        if (!testId) return null;

        const payload = {
            firestore_id: entry.id || null,
            firebase_uid: entry.userId,
            test_id: testId,
            test_name: entry.test,
            value: Number(entry.value),
            test_date: entry.date,
            logged_at: entry.timestamp ? new Date(entry.timestamp).toISOString() : new Date().toISOString(),
            is_official: !!entry.isOfficial,
            official_status: entry.officialStatus || (entry.isOfficial ? 'pending' : null),
            gym_id: entry.gymId || null,
            verified_by: entry.verifiedBy || null,
            verified_by_name: entry.verifiedByName || null,
            verified_at: entry.verifiedAt ? new Date(entry.verifiedAt).toISOString() : null,
            verified_gym_name: entry.verifiedGymName || null
        };

        const res = await this.query('test_entries?on_conflict=firestore_id', {
            method: 'POST',
            body: payload
        });

        if (res) {
            console.info('%c[TOPSET Shadow Sync] Entry mirrored to PostgreSQL:', 'color:#4ade80;', entry.test, entry.value);
        }
        return res;
    },

    // ── Shadow Read Reconciliation ───────────────────────────────────
    async runShadowReconciliation(firestoreEntries, currentUserId) {
        if (!currentUserId || !firestoreEntries) return null;
        try {
            const supabasePRs = await this.getAthletePRs(currentUserId);
            if (!supabasePRs) return null;

            const fsPRs = (typeof getPersonalBests === 'function') ? getPersonalBests(firestoreEntries) : [];
            const comparison = {
                athleteId: currentUserId,
                firestorePRCount: fsPRs.length,
                supabasePRCount: supabasePRs.length,
                matches: true,
                discrepancies: []
            };

            fsPRs.forEach(fs => {
                const testId = this.resolveTestId(fs.test);
                const sp = supabasePRs.find(p => p.test_id === testId);
                if (!sp) {
                    comparison.matches = false;
                    comparison.discrepancies.push({ test: fs.test, reason: 'Pending migration in Supabase' });
                } else if (Math.abs(Number(sp.pb_value) - Number(fs.value)) > 0.001) {
                    comparison.matches = false;
                    comparison.discrepancies.push({
                        test: fs.test,
                        reason: 'Value mismatch',
                        firestore: fs.value,
                        supabase: sp.pb_value
                    });
                }
            });

            console.info(
                `%c[TOPSET Shadow Reconciliation] ${comparison.matches ? 'PARITY VERIFIED' : 'DISCREPANCIES DETECTED'}`,
                comparison.matches ? 'color: #4ade80; font-weight: bold;' : 'color: #facc15; font-weight: bold;',
                comparison
            );

            return comparison;
        } catch (err) {
            console.warn('[TOPSET Shadow Reconciliation] Error during check:', err);
            return null;
        }
    }
};

window.supabaseClient = supabaseClient;
