// ── supabase-client.js ───────────────────────────────────────────────
// Phase 1 & 2 Supabase PostgreSQL Client for TOPSET
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

    // Fetch active test catalog
    async getTestCatalog() {
        return await this.query('test_catalog?select=*&order=display_order.asc', { auth: false });
    },

    // Fetch all-time personal records for an athlete
    async getAthletePRs(firebaseUid) {
        if (!firebaseUid) return [];
        return await this.query(`athlete_personal_records?firebase_uid=eq.${encodeURIComponent(firebaseUid)}&select=*`);
    },

    // Fetch chronological progression history for a test
    async getAthleteProgression(firebaseUid, testId) {
        if (!firebaseUid || !testId) return [];
        return await this.query(
            `athlete_progression_view?firebase_uid=eq.${encodeURIComponent(firebaseUid)}&test_id=eq.${encodeURIComponent(testId)}&order=test_date.asc,logged_at.asc`
        );
    },

    // Fetch rankings and percentile for a test
    async getLeaderboardRankings(testId, scope = 'regular', gymId = null) {
        if (!testId) return [];
        const gymFilter = gymId ? `&gym_id=eq.${encodeURIComponent(gymId)}` : '&gym_id=is.null';
        return await this.query(
            `leaderboard_rankings_view?test_id=eq.${encodeURIComponent(testId)}&effective_scope=eq.${encodeURIComponent(scope)}${gymFilter}&order=rank.asc`
        );
    }
};

window.supabaseClient = supabaseClient;
