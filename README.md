# TOPSET — Athlete & Scout Performance Platform

A verified athletic identity, talent discovery, and fitness tracking platform connecting athletes with scouts, sponsors, and opportunities. Members log benchmark performance test results (broad jump, 3km run, push-ups, etc.) against verified leaderboards, track daily training streaks, showcase a shareable athletic portfolio, and unlock sponsorships and trials.

Built as an offline-first PWA hosted on Firebase (Auth + Firestore + Hosting) with a progressive migration path to Supabase for high-performance relational analytics and talent scouting queries.

---

## Key Features

### 1. Athlete Performance Hub
- **Personal Athlete Dashboard**: Immediate performance overview ("How am I performing?", "What should I work on next?", "What opportunities can I pursue?").
- **Dynamic Decision Tree**: Action card directing athletes whether they need to sign in, log their baseline test, complete their athlete profile, or apply for matching scout opportunities.
- **Progression & Benchmark History**: Interactive timeline with chronological progression deltas (respecting test metric directions like sprint times vs jump distances), all-time Personal Record (PR) badges, interactive test filters, and responsive SVG trend curves.
- **Personal Records (PRs)**: Canvas-rendered shareable PR badge cards and FIFA-style percentile stat cards.
- **Daily Streak & Journal**: Rest/intensity logging with GitHub-contribution-style calendar heatmaps.

### 2. Scout & Sponsor Discovery
- **Talent Discovery**: Filter athletes by sport, position, age group, location, and verified performance thresholds.
- **Verified Credentials**: Verification badges distinguishing gym-tested official benchmarks from unverified submissions.
- **Shortlists & Private Notes**: Scouts can shortlist athletes with private scouting evaluations.
- **Direct Introductions**: Secure opportunity applications where contact details are shared only upon mutual agreement.
- **Side-by-Side Athlete Comparison**: Compare up to 4 athletes across standardized benchmark tests.

### 3. Gyms & Verified Results
- **Multi-Tenancy**: Gyms join members via invite codes. Codes resolve through a get-only lookup (`inviteCodes/{code}`) and are shown only to the gym's manager and admins (`gymSecrets/{gymId}`).
- **Official Test Days**: A manager opens a test date; athletes submit *pending* official results; the manager verifies them (never their own). Only verified results reach official leaderboards and public profiles.
- **Manager Roster**: Managers review the roster, record guardian consent for minors, and verify results.
- *Not shipped:* class scheduling, attendance check-ins and a club journal. The code is parked in [`legacy/`](legacy/README.md).

### 4. Admin & Events
- **Catalog Management**: Global standardized athletic test catalog with admin customization.
- **Public Events**: Standalone public event leaderboards for fitness days, combines, and tournaments.

---

## Architecture & Tech Stack

- **Frontend**: Vanilla JS (ES6+) with theme-aware CSS custom properties (Dark/Light mode). No bloated frameworks or complex build steps.
- **Authentication**: Firebase Authentication (Email/Password, Google Sign-In, Email Verification) plus technical consent gating for athletes under 19 (see `minors.js` and `firestore.rules`). This is a technical control, not a legal sign-off: a privacy notice, consent records and a deletion/retention process are still required for POPIA compliance.
- **Data Layer (Live)**: Cloud Firestore. `firestore.rules` is the only server-side enforcement (there are no Cloud Functions), so it is covered by an emulator test suite in `tests/rules/` that runs in CI.
- **Relational Data & Discovery Layer (Planned, not wired in)**: `supabase/schema.sql` is a target schema for scout matching and analytics. No client code references Supabase yet.
- **PWA & Offline**: Service Worker caches the app shell only (bump `CACHE_NAME` in `sw.js` when shell assets change); Firestore offline persistence is enabled.
- **Hosting**: Firebase Hosting (`firebase.json` configured with `public: "public"`).

---

## Project Structure

```
├── .firebaserc                # Firebase project configuration
├── firebase.json              # Firebase Hosting & Firestore configuration
├── firestore.rules            # Firestore security rules boundary
├── firestore.indexes.json     # Firestore composite query indexes
├── deploy.ps1                 # Deployment automation script
├── index.html                 # Root entrypoint with auto-redirection to public shell
├── TOPSET-ARCHITECTURE.md     # In-depth architectural documentation
├── TOPSET-PRODUCT-STRATEGY.md # Product strategy and vision
├── TOPSET-SYSTEM-GUIDE.md     # Complete developer system guide
├── supabase/
│   └── schema.sql             # Planned PostgreSQL schema (not wired in)
├── tests/rules/               # Firestore rules tests (emulator)
├── scripts/                   # check-syntax, invite-code migration
├── legacy/                    # Parked, unloaded modules (see legacy/README.md)
├── .github/workflows/ci.yml   # Runs syntax check + rules tests
└── public/
    ├── index.html             # Single-page application shell
    ├── home.css               # Athlete dashboard & progress styles
    ├── styles.css             # Global design tokens and UI components
    ├── shortlist.css          # Scout shortlist and talent drawer styles
    ├── manifest.json          # PWA manifest
    ├── sw.js                  # PWA service worker shell caching
    ├── logo-dark.png          # TOPSET brand logo (dark theme)
    ├── logo-light.png         # TOPSET brand logo (light theme)
    └── js/
        ├── core.js            # Firebase init, rate limiting, app state
        ├── auth.js            # Auth state, login/signup, POPIA protection
        ├── home.js            # Athlete performance hub & action planner
        ├── results-ui.js      # Progress history, deltas, PRs, SVG charts
        ├── athlete-profile.js # Athlete profile state & data access
        ├── athlete-profile-ui.js # Profile editor & public profile view
        ├── discover-ui.js     # Talent discovery & search filters
        ├── scout.js           # Scout verification & shortlists
        ├── opportunities-ui.js# Team trials, sponsorships & applications
        ├── leaderboard-ui.js  # Global & scoped leaderboards, radar cards
        ├── entries-journal.js # Test-entry logging & streak tracking
        ├── gyms.js            # Gym lookup, invite codes, manager assignment
        ├── minors.js          # POPIA compliance & parental consent
        ├── notifications-ui.js# User notifications & alerts
        ├── profile-hub.js     # User role router & settings
        ├── events-ui.js       # Public event leaderboards
        ├── admin-ui.js        # Admin moderation & test catalog editor
        └── app-init.js        # Bootstrapper & lifecycle coordinator
```

---

## Setup & Deployment

1. **Prerequisites**: Node.js 20+, Java (for the Firestore emulator) and the Firebase CLI (installed locally by `npm install`).
2. **Install dev tooling**: `npm install` (the app itself has no build step; `package.json` only carries tests and scripts).
3. **Configuration**: The Firebase web config in `public/js/core.js` is public by design. Protect the project instead: restrict the API key to your domains in Google Cloud Console and enable **Firebase App Check** for Firestore and Auth.
4. **Test**:
   ```powershell
   npm test              # syntax check + Firestore rules tests (starts the emulator)
   npm run emulators     # emulator only, for manual poking
   npx serve public      # serve the app locally
   ```
5. **Deploy**:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\deploy.ps1
   ```

### Rolling out the invite-code change
Existing gyms still carry `inviteCode` on the gym doc. The rules and client accept both shapes during rollout:

1. `npm run migrate:invite-codes` (backfill; needs `GOOGLE_APPLICATION_CREDENTIALS`, see the script header)
2. Deploy rules + hosting.
3. `npm run migrate:invite-codes -- --strip` (removes the old field)
4. Delete the `LEGACY` branch in `firestore.rules` and the legacy query in `public/js/gyms.js`, deploy again.
