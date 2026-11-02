-- ==============================================================================
-- TOPSET MIGRATION: PHASE 1 & 2
-- Athletic Test Results, Progression History, Benchmarks & Leaderboards
-- Target Database: Supabase PostgreSQL
-- Identity Provider: Firebase Authentication (via auth.jwt()->>'sub' / auth.firebase_uid())
-- ==============================================================================

-- 0. Authentication Helper Functions
CREATE OR REPLACE FUNCTION auth.firebase_uid() RETURNS TEXT AS $$
    SELECT NULLIF(
        COALESCE(
            current_setting('request.jwt.claims', true)::json->>'sub',
            current_setting('request.jwt.claim.sub', true)
        ),
        ''
    )::text;
$$ LANGUAGE SQL STABLE;

-- 1. Test Catalog (Standard Global & Gym-Scoped Custom Tests)
CREATE TABLE IF NOT EXISTS public.test_catalog (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    unit TEXT NOT NULL CHECK (unit IN ('m', 'reps', 'kg', 'cm', 'time')),
    higher_is_better BOOLEAN DEFAULT true,
    input_type TEXT DEFAULT 'number' CHECK (input_type IN ('number', 'text')),
    placeholder TEXT,
    sport TEXT, -- NULL = General / All sports
    gym_id TEXT, -- NULL = Standard Global; non-null = Gym-scoped custom test
    display_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique constraint ensuring no duplicates within the same scope, while permitting gym shadowing
CREATE UNIQUE INDEX IF NOT EXISTS idx_test_catalog_scope_name 
    ON public.test_catalog (COALESCE(gym_id, '__global__'), name);
CREATE INDEX IF NOT EXISTS idx_test_catalog_sport ON public.test_catalog(sport);
CREATE INDEX IF NOT EXISTS idx_test_catalog_gym ON public.test_catalog(gym_id);

-- Seed default standardized tests
INSERT INTO public.test_catalog (id, name, unit, higher_is_better, input_type, placeholder, sport, gym_id, display_order)
VALUES 
    ('broad_jump', 'Broad Jump', 'm', true, 'number', '2.50', NULL, NULL, 0),
    ('3km_run', '3km Run', 'time', false, 'text', '12:30', NULL, NULL, 1),
    ('pushups', '2:00 Push-ups', 'reps', true, 'number', '50', NULL, NULL, 2),
    ('situps', '2:00 Sit-ups', 'reps', true, 'number', '45', NULL, NULL, 3),
    ('sit_reach', 'Sit and Reach', 'cm', true, 'number', '30', NULL, NULL, 4),
    ('bodyweight', 'Bodyweight', 'kg', true, 'number', '80', NULL, NULL, 5)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    unit = EXCLUDED.unit,
    higher_is_better = EXCLUDED.higher_is_better,
    input_type = EXCLUDED.input_type,
    placeholder = EXCLUDED.placeholder;

-- 2. Test Entries (Performance History & Benchmark Submissions)
CREATE TABLE IF NOT EXISTS public.test_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firestore_id TEXT UNIQUE, -- Preserves original Firestore doc ID for 1:1 reconciliation
    firebase_uid TEXT NOT NULL, -- Direct foreign key to Firebase Auth UID
    test_id TEXT NOT NULL REFERENCES public.test_catalog(id) ON UPDATE CASCADE,
    test_name TEXT NOT NULL,
    value NUMERIC(10, 2) NOT NULL CHECK (value >= 0 AND value <= 100000),
    test_date DATE NOT NULL CHECK (test_date <= CURRENT_DATE),
    logged_at TIMESTAMPTZ DEFAULT NOW(),
    is_official BOOLEAN DEFAULT false,
    official_status TEXT CHECK (official_status IN ('pending', 'verified', 'rejected')),
    gym_id TEXT, -- NULL = Public pool; non-null = Gym member pool
    verified_by TEXT, -- Manager Firebase UID
    verified_by_name TEXT,
    verified_at TIMESTAMPTZ,
    verified_gym_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_test_entries_user_test ON public.test_entries(firebase_uid, test_id, test_date DESC);
CREATE INDEX IF NOT EXISTS idx_test_entries_pool ON public.test_entries(gym_id, is_official, official_status);
CREATE INDEX IF NOT EXISTS idx_test_entries_firestore_id ON public.test_entries(firestore_id);
CREATE INDEX IF NOT EXISTS idx_test_entries_date ON public.test_entries(test_date DESC);

-- 3. Athlete Personal Records View (Phase 2 SQL Core)
-- Computes the single best personal record per athlete, test, pool and scope using DISTINCT ON
CREATE OR REPLACE VIEW public.athlete_personal_records AS
WITH scored_entries AS (
    SELECT 
        e.*,
        t.unit,
        t.higher_is_better,
        CASE 
            WHEN e.is_official = true AND e.official_status = 'verified' THEN 'official'
            ELSE 'regular'
        END AS effective_scope,
        CASE 
            WHEN e.gym_id IS NOT NULL THEN 'gym'
            ELSE 'public'
        END AS pool_type
    FROM public.test_entries e
    JOIN public.test_catalog t ON e.test_id = t.id
    WHERE (e.is_official = false) OR (e.is_official = true AND e.official_status = 'verified')
)
SELECT DISTINCT ON (firebase_uid, test_id, gym_id, effective_scope)
    id AS entry_id,
    firestore_id,
    firebase_uid,
    test_id,
    test_name,
    unit,
    higher_is_better,
    effective_scope,
    pool_type,
    gym_id,
    value AS pb_value,
    test_date AS pb_date,
    logged_at
FROM scored_entries
ORDER BY 
    firebase_uid, 
    test_id, 
    gym_id, 
    effective_scope,
    CASE WHEN higher_is_better THEN value END DESC NULLS LAST,
    CASE WHEN NOT higher_is_better THEN value END ASC NULLS LAST,
    test_date DESC,
    logged_at DESC;

-- 4. Analytical Progression & Delta Timeline View
CREATE OR REPLACE VIEW public.athlete_progression_view AS
SELECT 
    e.id,
    e.firestore_id,
    e.firebase_uid,
    e.test_id,
    e.test_name,
    e.value,
    e.test_date,
    e.logged_at,
    e.gym_id,
    e.is_official,
    e.official_status,
    t.unit,
    t.higher_is_better,
    LAG(e.value) OVER w AS prev_value,
    (e.value - LAG(e.value) OVER w) AS delta_value,
    ROUND(
        CASE 
            WHEN LAG(e.value) OVER w IS NOT NULL AND LAG(e.value) OVER w != 0 
            THEN ABS((e.value - LAG(e.value) OVER w) / LAG(e.value) OVER w * 100)::numeric
            ELSE NULL 
        END, 1
    ) AS delta_percentage,
    CASE 
        WHEN t.higher_is_better THEN (e.value = MAX(e.value) OVER w_all)
        ELSE (e.value = MIN(e.value) OVER w_all)
    END AS is_all_time_pb
FROM public.test_entries e
JOIN public.test_catalog t ON e.test_id = t.id
WINDOW 
    w AS (
        PARTITION BY e.firebase_uid, e.test_id, e.gym_id, e.is_official 
        ORDER BY e.test_date ASC, e.logged_at ASC
    ),
    w_all AS (
        PARTITION BY e.firebase_uid, e.test_id, e.gym_id, e.is_official
    );

-- 5. Native Leaderboard Rankings & Percentile View (Phase 2 Calculation Replacement)
CREATE OR REPLACE VIEW public.leaderboard_rankings_view AS
SELECT 
    pr.entry_id,
    pr.firestore_id,
    pr.firebase_uid,
    pr.test_id,
    pr.test_name,
    pr.effective_scope,
    pr.pool_type,
    pr.gym_id,
    pr.pb_value,
    pr.pb_date,
    pr.unit,
    pr.higher_is_better,
    DENSE_RANK() OVER (
        PARTITION BY pr.test_id, pr.gym_id, pr.effective_scope
        ORDER BY 
            CASE WHEN pr.higher_is_better THEN pr.pb_value END DESC NULLS LAST,
            CASE WHEN NOT pr.higher_is_better THEN pr.pb_value END ASC NULLS LAST
    ) AS rank,
    ROUND(
        (PERCENT_RANK() OVER (
            PARTITION BY pr.test_id, pr.gym_id, pr.effective_scope
            ORDER BY 
                CASE WHEN pr.higher_is_better THEN pr.pb_value END ASC NULLS LAST,
                CASE WHEN NOT pr.higher_is_better THEN pr.pb_value END DESC NULLS LAST
        ) * 100)::numeric, 
        0
    ) AS percentile
FROM public.athlete_personal_records pr;

-- 6. Public Verified Results View (Safe Read-Only View for Scout Discovery)
CREATE OR REPLACE VIEW public.public_verified_results_view AS
SELECT 
    e.firebase_uid,
    e.test_id,
    e.test_name,
    e.value,
    e.test_date,
    e.gym_id,
    e.verified_gym_name,
    e.verified_at,
    t.unit
FROM public.test_entries e
JOIN public.test_catalog t ON e.test_id = t.id
JOIN public.athlete_profiles p ON p.firebase_uid = e.firebase_uid AND p.is_public = true
WHERE e.is_official = true AND e.official_status = 'verified';

-- 7. Row Level Security Policies
ALTER TABLE public.test_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_entries ENABLE ROW LEVEL SECURITY;

-- Catalog: Everyone can view
DROP POLICY IF EXISTS "Public read test catalog" ON public.test_catalog;
CREATE POLICY "Public read test catalog" 
ON public.test_catalog FOR SELECT 
USING (true);

-- Test Entries: Strictly scoped to athlete ownership and manager verification
DROP POLICY IF EXISTS "Public read test entries" ON public.test_entries;
DROP POLICY IF EXISTS "Athletes can view own entries" ON public.test_entries;
DROP POLICY IF EXISTS "Athletes can insert own entries" ON public.test_entries;
DROP POLICY IF EXISTS "Athletes can update own entries" ON public.test_entries;
DROP POLICY IF EXISTS "Athletes can delete own entries" ON public.test_entries;
DROP POLICY IF EXISTS "Managers can view official gym entries" ON public.test_entries;
DROP POLICY IF EXISTS "Managers can verify official gym entries" ON public.test_entries;

CREATE POLICY "Athletes can view own entries" 
ON public.test_entries FOR SELECT 
USING (firebase_uid = auth.firebase_uid());

CREATE POLICY "Athletes can insert own entries" 
ON public.test_entries FOR INSERT 
WITH CHECK (
    firebase_uid = auth.firebase_uid()
    AND value >= 0 AND value <= 100000
    AND test_date <= CURRENT_DATE
);

CREATE POLICY "Athletes can update own entries" 
ON public.test_entries FOR UPDATE 
USING (
    firebase_uid = auth.firebase_uid()
    AND (is_official = false OR official_status = 'pending')
)
WITH CHECK (
    firebase_uid = auth.firebase_uid()
    AND (is_official = false OR official_status = 'pending')
);

CREATE POLICY "Athletes can delete own entries" 
ON public.test_entries FOR DELETE 
USING (
    firebase_uid = auth.firebase_uid()
    AND (is_official = false OR official_status = 'pending')
);

CREATE POLICY "Managers can view official gym entries" 
ON public.test_entries FOR SELECT 
USING (
    is_official = true 
    AND gym_id = (current_setting('request.jwt.claims', true)::json->'user_metadata'->>'manages_gym_id')
);

CREATE POLICY "Managers can verify official gym entries" 
ON public.test_entries FOR UPDATE 
USING (
    is_official = true 
    AND gym_id = (current_setting('request.jwt.claims', true)::json->'user_metadata'->>'manages_gym_id')
    AND firebase_uid != auth.firebase_uid()
);
