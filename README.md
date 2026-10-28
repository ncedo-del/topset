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

### 3. Training Clubs & Gym Management
- **Multi-Tenancy**: Club lookup and membership joined via invite codes.
- **Class Scheduling & Attendance**: Structured class schedules, attendance check-ins, and weekly training journals.
- **Manager Roster**: Club managers review attendance, rosters, and test verifications.

### 4. Admin & Events
- **Catalog Management**: Global standardized athletic test catalog with admin customization.
- **Public Events**: Standalone public event leaderboards for fitness days, combines, and tournaments.

---

## Architecture & Tech Stack

- **Frontend**: Vanilla JS (ES6+) with theme-aware CSS custom properties (Dark/Light mode). No bloated frameworks or complex build steps.
- **Authentication**: Firebase Authentication (Email/Password, Google Sign-In, Email Verification) with strict POPIA compliance for minor athletes under 19.
- **Data Layer (Live)**: Cloud Firestore with security rules covering all collections.
- **Relational Data & Discovery Layer**: Supabase PostgreSQL schema (`supabase/schema.sql`) for advanced scout matching, multi-attribute indexing, and window-function performance deltas.
- **PWA & Offline**: Service Worker app-shell caching with dynamic cache busting.
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
│   └── schema.sql             # Target PostgreSQL relational DDL
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
        ├── clubs.js           # Training club multi-tenancy layer
        ├── classes.js         # Class/schedule/enrollment data models
        ├── classes-ui.js      # Club manager panel
        ├── classes-member-ui.js # Member-facing club tab
        ├── gyms.js            # Gym verification layer
        ├── minors.js          # POPIA compliance & parental consent
        ├── notifications-ui.js# User notifications & alerts
        ├── profile-hub.js     # User role router & settings
        ├── events-ui.js       # Public event leaderboards
        ├── admin-ui.js        # Admin moderation & test catalog editor
        └── app-init.js        # Bootstrapper & lifecycle coordinator
```

---

## Setup & Deployment

1. **Prerequisites**: Ensure Node.js and Firebase CLI (`npm install -g firebase-tools`) are installed.
2. **Configuration**: Set Firebase credentials in `public/js/core.js` and Supabase keys in your environment.
3. **Local Testing**:
   ```powershell
   npx serve public
   # or
   firebase emulators:start --only hosting,firestore
   ```
4. **Deploy**:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\deploy.ps1
   ```
