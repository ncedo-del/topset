# TOPSET

A fitness tracking and Training Club platform. Members log personal test results (broad jump, 3km run, push-ups, etc.) against a single public leaderboard, track a daily "showed up" streak, and — new this rebuild — join a **Training Club**: structured classes with schedules, attendance check-ins, and a private weekly club journal.

Built as a static PWA on Firebase (Auth + Firestore + Hosting). No backend server — all business logic lives client-side, backed by Firestore Security Rules as the real enforcement boundary.

---

## Status

This repo just went through a full rebuild replacing the old gym/leaderboard-tier system (gym-scoped "Official Results," per-gym test catalogs, a gym-vs-public leaderboard split) with the Training Club model described below. **It has not yet been deployed or tested end-to-end as a running app.** See `firestore.rules` especially closely before deploying — it was authored fresh this rebuild and is the actual security boundary.

## Features

- **Personal test logging** — log a result for any test in the shared catalog (broad jump, 3km run, sit-and-reach, custom admin-added tests, etc.), tracked against your own History and Personal Records.
- **Public leaderboard** — one global ranking per test, filterable by age group and gender. A FIFA-style Stat Card renders your percentile across every test you've logged as a radar chart, shareable as an image.
- **Streak & Journal** — a daily "showed up" streak, fed by either a personal journal entry (Rest/Light/Moderate/Hard intensity + notes) or a Training Club class check-in — whichever happened that day. Calendar and week-strip views, GitHub-contribution-style.
- **Training Clubs** — join a club via invite code. Inside the Streak & Journal modal's **Club** tab: browse your club's classes, join/leave, check in when you show up, and write a private weekly journal entry only you and your club's manager can see.
- **Club management** (club managers) — create classes, set exercises and a display-only recurring schedule, view roster + attendance history per class, and review members' weekly journal entries.
- **Admin tools** — manage the shared test catalog, create/edit clubs and assign managers.
- **Public Events** — a separate, always-public leaderboard for one-off events (e.g. a community fitness day), independent of club membership.
- Installable PWA with offline app-shell caching, email verification, Google sign-in, and account deletion.

## Tech stack

- Vanilla JS (no framework, no build step) — one `<script>` tag per file, sharing a global scope
- Firebase Authentication (email/password + Google)
- Cloud Firestore (all app data)
- Firebase Hosting
- Canvas API for shareable PR/Stat Card images

## Project structure

```
firebase.json          Hosting + Firestore config
firestore.rules         Security rules — the real enforcement boundary, read before deploying
deploy.ps1              One-shot deploy script (hosting + rules together, so they never ship out of sync)
public/
  index.html            All markup + modals
  styles.css            Everything, theme-aware via CSS custom properties (dark/light)
  manifest.json          PWA manifest
  sw.js                 Service worker — caches the app shell only, never Firestore/auth data
  js/
    core.js              Firebase init, shared app state, subscriptions, rate limiting, streak union
    auth.js              Sign up / sign in / Google / email verification / account deletion
    clubs.js             Club CRUD, invite codes, manager assignment
    classes.js           Class/exercise/schedule/enrollment data layer + manager fetchers
    classes-ui.js        Club manager panel (classes, roster, attendance, journal review)
    entries-journal.js    Personal test-entry CRUD, streak calc, Streak & Journal modal shell
    classes-member-ui.js Member-facing Club tab (class list, check-in, weekly journal)
    results-ui.js         Stats row, History/PR tables, PR share cards, radar-chart SVG helpers
    leaderboard-ui.js     Percentile cache, Stat Card, leaderboard rendering, entry edit/delete
    admin-ui.js           Navigation, all modals (auth/profile/manage tests/manage clubs/my club), escaping
    events-ui.js           Public one-off event leaderboard (independent of clubs)
    app-init.js            Auth-state listener, top-level UI sync, service worker registration — loads last
```

Load order matters for exactly one reason: `app-init.js` calls functions defined in every other file and must load last. Everything else can load in any order relative to each other — none of them call across files at top-level, only from inside functions invoked after the whole page has loaded.

## Data model

Firestore collections:

| Collection | Shape | Notes |
|---|---|---|
| `users` | profile, `clubId`, `managesClubId`, `isAdmin` | `clubId` join requires a matching invite code, enforced server-side |
| `entries` | personal test results | owner-only, feeds `leaderboard` |
| `leaderboard` | one doc per `(user, test)` | single public bucket, no scoping |
| `journal` | daily personal streak entries | one per user per day (upsert) |
| `tests` | shared global test catalog | admin-managed, same list for everyone |
| `clubs` | name, invite code, tier, subscription status | manager can only edit `name`; everything else is admin-only |
| `classes` | `clubId`, name, description | |
| `classExercises` | `classId`, name, order | |
| `classSchedules` | `classId`, days, time | display only — not enforced |
| `classEnrollments` | `classId`, `clubId`, `userId` | doc id `${classId}_${uid}` |
| `classLogs` | `userId`, `classId`, `clubId`, date | a class check-in — feeds the streak |
| `classJournal` | `userId`, `clubId`, `weekStart`, text | private: owner + club manager only |
| `events` / `eventTests` / `eventLeaderboard` | public event system | fully public read, independent of clubs |

**Forward-only philosophy:** deleting a class cascades to its exercises/schedules/enrollments, but never touches `classLogs`/`classJournal` — a member's attendance history and journal entries outlive the class itself.

## Setup

1. Create a Firebase project with Authentication (Email/Password + Google providers) and Firestore enabled.
2. Drop your config into `public/js/core.js`'s `firebaseConfig` object.
3. `firebase deploy --only hosting,firestore:rules` (or run `deploy.ps1` from an Administrator PowerShell) — deploys hosting and rules together on purpose, so a rules change never ships out of sync with the client code that depends on it.
4. First sign-up seeds the default test catalog automatically if `tests` is empty.

## Known open items

- No automated tests — verification so far is `node --check` syntax validation plus manual cross-file reference checks, not a running end-to-end test.
- `classes-ui.js`'s `handleRemoveEnrollment` writes directly to Firestore instead of through a `classes.js` wrapper function, breaking the otherwise-consistent "data layer owns all Firestore calls" convention in this codebase.
