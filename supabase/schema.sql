-- ==============================================================================
-- TOPSET Supabase Schema (PostgreSQL)
-- Architecture: Progressive Migration with Firebase Auth Preservation
-- Users are identified by their Firebase UID (`firebase_uid TEXT`)
-- ==============================================================================

-- 1. Athlete Profiles
CREATE TABLE IF NOT EXISTS public.athlete_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firebase_uid TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    avatar TEXT DEFAULT 'gym',
    age_group TEXT,
    gender TEXT,
    sport TEXT,
    position TEXT,
    location TEXT,
    bio TEXT,
    is_public BOOLEAN DEFAULT false,
    open_to_sponsorship BOOLEAN DEFAULT false,
    open_to_trials BOOLEAN DEFAULT false,
    open_to_opportunities BOOLEAN DEFAULT false,
    guardian_consent BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_athlete_profiles_sport ON public.athlete_profiles(sport);
CREATE INDEX IF NOT EXISTS idx_athlete_profiles_location ON public.athlete_profiles(location);
CREATE INDEX IF NOT EXISTS idx_athlete_profiles_public ON public.athlete_profiles(is_public) WHERE is_public = true;

-- 2. Test Catalog
CREATE TABLE IF NOT EXISTS public.test_catalog (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    unit TEXT NOT NULL, -- 'm', 'reps', 'kg', 'cm', 'time'
    higher_is_better BOOLEAN DEFAULT true,
    input_type TEXT DEFAULT 'number',
    placeholder TEXT,
    sport TEXT, -- NULL for General tests, or specific sport
    display_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default standard tests
INSERT INTO public.test_catalog (id, name, unit, higher_is_better, input_type, placeholder, display_order)
VALUES 
    ('broad_jump', 'Broad Jump', 'm', true, 'number', '2.50', 0),
    ('3km_run', '3km Run', 'time', false, 'text', '12:30', 1),
    ('pushups', '2:00 Push-ups', 'reps', true, 'number', '50', 2),
    ('situps', '2:00 Sit-ups', 'reps', true, 'number', '45', 3),
    ('sit_reach', 'Sit and Reach', 'cm', true, 'number', '30', 4),
    ('bodyweight', 'Bodyweight', 'kg', true, 'number', '80', 5)
ON CONFLICT (id) DO NOTHING;

-- 3. Benchmark Test Entries
CREATE TABLE IF NOT EXISTS public.test_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firebase_uid TEXT NOT NULL,
    test_id TEXT NOT NULL REFERENCES public.test_catalog(id) ON UPDATE CASCADE,
    test_name TEXT NOT NULL,
    value NUMERIC(10, 2) NOT NULL,
    test_date DATE NOT NULL,
    is_official BOOLEAN DEFAULT false,
    official_status TEXT DEFAULT 'pending', -- 'pending', 'verified', 'rejected'
    gym_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_test_entries_user_test ON public.test_entries(firebase_uid, test_name, test_date DESC);
CREATE INDEX IF NOT EXISTS idx_test_entries_official ON public.test_entries(is_official, official_status) WHERE is_official = true;

-- 4. Analytical Progression View (Demonstrating Postgres Window Functions)
CREATE OR REPLACE VIEW public.athlete_progression_view AS
SELECT 
    e.id,
    e.firebase_uid,
    e.test_name,
    e.value,
    e.test_date,
    e.is_official,
    e.official_status,
    t.unit,
    t.higher_is_better,
    LAG(e.value) OVER (
        PARTITION BY e.firebase_uid, e.test_name 
        ORDER BY e.test_date ASC, e.created_at ASC
    ) AS prev_value,
    (e.value - LAG(e.value) OVER (
        PARTITION BY e.firebase_uid, e.test_name 
        ORDER BY e.test_date ASC, e.created_at ASC
    )) AS delta_value,
    CASE 
        WHEN t.higher_is_better THEN (e.value = MAX(e.value) OVER (PARTITION BY e.firebase_uid, e.test_name))
        ELSE (e.value = MIN(e.value) OVER (PARTITION BY e.firebase_uid, e.test_name))
    END AS is_all_time_pb
FROM public.test_entries e
JOIN public.test_catalog t ON e.test_id = t.id;

-- 5. Opportunities & Trials
CREATE TABLE IF NOT EXISTS public.opportunities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    organization_name TEXT NOT NULL,
    sport TEXT NOT NULL,
    opportunity_type TEXT NOT NULL, -- 'Team Trial', 'Sponsorship', 'Development Grant', etc.
    location TEXT,
    requirements TEXT,
    description TEXT,
    deadline DATE,
    created_by TEXT, -- Firebase UID of scout or admin
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_opportunities_sport ON public.opportunities(sport);
CREATE INDEX IF NOT EXISTS idx_opportunities_type ON public.opportunities(opportunity_type);

-- 6. Opportunity Applications
CREATE TABLE IF NOT EXISTS public.opportunity_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    opportunity_id UUID NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
    athlete_firebase_uid TEXT NOT NULL,
    athlete_name TEXT NOT NULL,
    status TEXT DEFAULT 'submitted', -- 'submitted', 'under_review', 'accepted', 'declined'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (opportunity_id, athlete_firebase_uid)
);

CREATE INDEX IF NOT EXISTS idx_applications_athlete ON public.opportunity_applications(athlete_firebase_uid);
