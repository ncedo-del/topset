# TOPSET — Complete System Guide: Product & Technical Architecture

---

# Part 1: Plain-Language Human Guide (Bullet Points)

## What is TOPSET?
* **Core Purpose**: TOPSET is a verified athletic identity and talent discovery platform.
* **The Problem It Solves**: In fitness and sports, self-reported numbers (like bench press or race times) are often untrusted, and talented athletes lack a central, credible profile to get discovered by teams, coaches, and sponsors.
* **The Solution**: TOPSET combines daily workout logging, gym-verified testing, a public athlete profile (Stat Card), and a private scouting portal into one unified app.

---

## The Dual Interface System
* **Two Doors into One App**:
  * When signing up or logging in, users choose between **Athlete** or **Scout / Sponsor**.
  * Picking **Athlete** launches the workout logging, personal record, and leaderboard interface.
  * Picking **Scout / Sponsor** launches the gold-accented talent discovery and scouting portal.
* **Switching Anytime**:
  * Athletes can switch to the Scout Portal via the **Profile Hub** (gear icon in the top header).
  * Scouts can switch back to the Athlete Interface directly from the sidebar navigation (`Athlete Interface` button).
* **No Confusion**: The athlete side is focused strictly on athletic tracking and competition; the scout side is focused on talent discovery, shortlisting, and outreach.

---

## How the Athlete Interface Works

### 1. Logging Results
* **Simple Form**: Athletes choose a test (e.g. 5km Run, 40m Sprint, Max Pull-ups, Bench Press), enter their time or reps/kg, and pick the date.
* **Timed vs Weighted Tests**: The input field adapts dynamically — automatically formatting times as `mm:ss` for endurance/sprints and standard numbers/decimals for weights or reps.
* **Official Results Window**: If an athlete belongs to an accredited gym and is testing on that gym's official test date, a checkbox appears: *"Mark as Official Result"*.

### 2. History & Personal Records (PRs)
* **Automatic PR Detection**: When a result is logged, TOPSET recalculates the athlete's Personal Best for that test.
* **Higher vs Lower Logic**: The system knows that lower is better for running times (lower seconds = better), while higher is better for lifts and reps.
* **Recent Badges**: PRs achieved within the last 7 days are highlighted with an active badge.
* **Edit & Delete**: Athletes can edit or delete their personal training entries at any time (verified official gym records remain protected by gym managers).

### 3. Leaderboards
* **Spotlight Dropdown**: Athletes pick any test to view live rankings.
* **Gym vs Public Scope**:
  * **My Gym**: Compare only against members of the athlete's gym.
  * **Public**: Compare against athletes across the entire platform.
* **Filters**: Filter leaderboard rankings by age group (14–17, 18–24, 25–34, 35–44, etc.) and gender.

### 4. Streak & Training Journal
* **Daily Journal**: An easy calendar view to log daily session intensity: *Rest*, *Light*, *Moderate*, or *Hard*.
* **Notes**: Athletes can write daily notes on soreness, mood, or workout details.
* **Contribution Calendar**: Displays training consistency like a GitHub activity grid.

### 5. Public Athlete Profile & Stat Card
* **Opt-In Visibility**: By default, athlete data is private. Athletes can toggle *"Make my profile public"* when they are ready to be discovered.
* **Sharable URL**: Generates a public profile link (`topset.app/athlete/{uid}`) that scouts, sponsors, and teammates can view even without logging in.
* **Stat Card**: Generates a clean digital athlete card highlighting official verified results, personal records, and sport category.
* **Availability Flags**: Athletes can declare their status with checkboxes:
  * Open to Sponsorship
  * Open to Team Trials
  * Open to Opportunities generally

---

## How the Scout & Sponsor Portal Works

When logging in or switching to the **Scout Interface**, the athlete shell is hidden and replaced by the gold-themed **Scout Portal**:

### 1. Discover (Talent Search)
* **Comprehensive Search Engine**: Search across all athletes who have enabled a public profile.
* **Live Search**: Type in names, sports, or cities to find matching athletes instantly.
* **Structured Filters**:
  * **Sport**: Filter by specific disciplines (Rugby, Hyrox, Calisthenics, Running, Boxing, etc.).
  * **Age Group**: Filter by brackets (14–17, 18–24, 25–34, etc.).
  * **Specific Test**: Filter for athletes with results in a specific test (e.g., *Best at 40m Sprint*).
* **Filter Chips**:
  * **Verified results only**: Shows only athletes who have tested at an accredited gym.
  * **Open to sponsorship**: Athletes actively looking for brand partnerships.
  * **Open to trials**: Athletes looking to try out for teams or clubs.
  * **Open to opportunities**: Athletes open to contracts or development programs.
* **Profile Inspection**: Clicking an athlete card opens their full verified scorecard, athletic biography, and competition history.

### 2. Shortlists & Private Scouting Notes
* **One-Click Bookmarking**: Every athlete card has a bookmark icon to add or remove them from the scout's private shortlist.
* **Scouting Notes**: Scouts can write confidential notes on any shortlisted athlete (e.g., *"Showed explosive pace in provincial semi-final; invite to December trial"*).
* **Live Cloud Sync**: Shortlists and notes are saved directly to Firestore under the scout's account.

### 3. Side-by-Side Athlete Comparison
* **Comparison Checkbox**: Check the box on any two or more shortlisted athletes.
* **Comparison Modal**: Renders a head-to-head table comparing their sports, locations, and personal bests across matching tests.

### 4. Privacy-First Intro Requests
* **No Cold Spam**: Athletes' private phone numbers and email addresses are never shown publicly to scouts.
* **Request Intro**: A scout submits an intro request including who they are, their club/brand, and a personal message.
* **Athlete In Control**: The athlete receives the request in their Profile Hub. If they click **Accept**, they choose what contact detail (email or phone) to release to the scout.

### 5. Organisation Profile
* Scouts can configure their Organisation Name (e.g. *Soweto Rugby Academy*) and Organisation Type (*Team / Club*, *Independent Scout*, *Sponsor / Brand*, *Gym / Academy*).

---

## How Verification Works

* **1. Email Verification (Account Security)**:
  * When signing up with email and password, Firebase sends a verification link to your email.
  * Clicking the link verifies your email address.
  * Unverified emails do **not** lock you out of either interface; a soft reminder banner appears until confirmed.
* **2. Result Verification (Athlete Performance)**:
  * Self-reported results are logged by athletes at home or at regular gym sessions.
  * Official results must be logged on a gym's designated test date and verified by the gym manager.
* **3. Scout Organisation Verification (Verified Org)**:
  * Anyone can sign up as a scout to search and shortlist athletes.
  * A TOPSET platform administrator verifies the organisation in Firestore to grant them an official verified badge.

---

# Part 2: Technical Architecture & Implementation

## System Architecture Diagram

```
+-------------------------------------------------------------------------+
|                               Web Browser                               |
|                                                                         |
|   +-----------------------+                 +-----------------------+   |
|   |   Athlete Interface   |                 |    Scout Interface    |   |
|   |     (Default DOM)     |                 |  (#scoutApp Container)|   |
|   |                       |                 |                       |   |
|   | • Log Test Form       |                 | • Discover & Filters  |   |
|   | • History & PR Tables |                 | • Shortlist & Notes   |   |
|   | • Leaderboards        |                 | • Comparison Matrix   |   |
|   | • Streak Calendar     |                 | • Intro Requests      |   |
|   | • Profile Hub (Gear)  |                 | • Org Profile View    |   |
|   +-----------------------+                 +-----------------------+   |
|               ▲                                         ▲               |
|               │                                         │               |
|               +--------------------+--------------------+               |
|                                    │                                    |
|                        body.scout-mode (CSS Toggle)                     |
|                                    ▲                                    |
|                                    │                                    |
|   +--------------------------------+--------------------------------+   |
|   |                        Core JS Modules                          |   |
|   | • core.js: State, rate limits, avatar SVG icons, test catalogs  |   |
|   | • auth.js: Firebase Auth, Google sign-in, account lifecycle     |   |
|   | • scout.js: Dual-shell routing, scoutAccounts, shortlists       |   |
|   | • profile-hub.js: Gear hub, theme switcher, portal switch       |   |
|   | • athlete-profile.js: Public profile store & snapshot generator|   |
|   | • minors.js: POPIA compliance, birthYear enforcement            |   |
|   +--------------------------------+--------------------------------+   |
+------------------------------------┼------------------------------------+
                                     │ HTTPS / WSS
                                     ▼
+-------------------------------------------------------------------------+
|                         Firebase Backend Services                       |
|                                                                         |
|  +-------------------------+            +----------------------------+  |
|  |   Firebase Auth         |            |     Cloud Firestore        |  |
|  |   • Email & Password    |            |     (Rules-Secured)        |  |
|  |   • Google OAuth Popup  |            +----------------------------+  |
|  +-------------------------+            | • users/{uid}              |  |
|                                         | • scoutAccounts/{uid}      |  |
|                                         | • entries/{id}             |  |
|                                         | • leaderboard/{docId}      |  |
|                                         | • athleteProfiles/{uid}    |  |
|                                         | • scoutShortlists/{id}     |  |
|                                         | • introRequests/{id}       |  |
|                                         | • gyms/{gymId}             |  |
|                                         | • sports/{id}              |  |
|                                         | • events/{id}              |  |
|                                         +----------------------------+  |
+-------------------------------------------------------------------------+
```

---

## Technical Details

### 1. Dual-Shell Architecture
* **CSS Containment**: The dual interface uses zero page reloads.
  * In Athlete mode: standard desktop navigation (`.header`), bottom bar (`.bottom-nav`), and `.main-container` are visible. `#scoutApp` is set to `display: none`.
  * In Scout mode: `body.classList.add('scout-mode')` takes over. The athlete shell is hidden (`display: none !important`), and the desktop CSS grid `#scoutApp` (232px sidebar + responsive fluid main area) renders.
* **Persistent Preference**: The chosen view is stored in `localStorage` under `topset_active_interface` (`'athlete'` or `'scout'`).
* **Pre-Render Hint**: To prevent interface flickering on page load, `topset_scout_hint` or `topset_active_interface` is checked before the DOM finishes painting, ensuring the correct shell renders immediately.

### 2. Icon System (Zero Emojis)
* **Standardized Inline SVG**: All icons are rendered as scalable SVG vectors using `currentColor` and 2px stroke.
* **Avatar Icon System**: User avatars are stored as 3-4 character keys (`gym`, `bolt`, `fire`, `cup`, `star`, `love`, `mtn`, `shld`, `aim`, `crwn`, `timr`, `bike`).
* **Dynamic Generation**: `avatarIconSVG(key, size)` and `avatarCircleHTML(key, diameterPx)` dynamically construct icon markup, maintaining uniform aesthetics across both light and dark themes.

### 3. Database Schema & Security (`firestore.rules`)
* **`users/{uid}`**:
  * Stores user identity: `name`, `email`, `avatar`, `birthYear`, `ageGroup`, `gender`, `sport`, `gymId`, `createdAt`.
  * Rules prevent users from elevating their own permissions (`isAdmin`, `managesGymId`, or `guardianConsentAt` are strictly read-only for standard users).
* **`scoutAccounts/{uid}`**:
  * Stores scout organisation info: `orgName`, `orgType`, `orgVerified`, `createdAt`.
  * Gated by rule: `userIsAdult(myProfile())` requiring `request.time.year() - birthYear >= 19`.
* **`entries/{id}`**:
  * Stores individual test logs: `userId`, `test`, `value`, `date`, `isOfficial`, `officialStatus`.
  * Once marked `officialStatus == 'verified'`, the athlete cannot edit or delete it; only the verified gym manager or admin can modify official records.
* **`athleteProfiles/{uid}`**:
  * Publicly readable snapshot document containing name, sport, location, bio, availability, and verified PRs.
  * Requires `isPublic == true`.
* **`scoutShortlists/{scoutId__athleteId}`**:
  * Deterministic document ID.
  * Strictly private: readable and writable only by the scout who owns the shortlist.
* **`introRequests/{scoutId__athleteId}`**:
  * Contact request pipeline.
  * Scout can only create with `status: 'pending'`.
  * Only the athlete can update to `accepted` or `declined`.
  * Athlete contact details (`athleteContact: { email, phone }`) can only exist on an accepted request.

### 4. Real-Time Data Pipeline & Caching
* **Reactive Subscriptions (`onSnapshot`)**: Real-time Firestore listeners automatically update UI components when remote changes occur.
* **Offline Persistence**: Firestore offline cache is enabled via `db.enablePersistence({ synchronizeTabs: true })`, allowing cached reads when network signals drop.
* **Selective Subscription Teardown**: When signing out or switching modes, live listeners (`leaderboardUnsub`, `entriesUnsub`, `testsUnsub`, `journalUnsub`, `ownProfileUnsub`) are cleanly terminated to prevent memory leaks and redundant read operations.
