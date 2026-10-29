# legacy/

These modules are **not loaded** by `public/index.html` and are not deployed (Firebase Hosting serves `public/` only).
They are kept for reference because they hold ideas you may want back:

| File(s) | What it was | Why it is parked |
|---|---|---|
| `clubs.js`, `classes.js`, `classes-ui.js`, `classes-member-ui.js` | Training clubs, class schedules, enrollments, attendance, weekly club journal | Uses an older data model (`clubId` / `managesClubId`, `clubs/*`, `classes*` collections) that the live app replaced with `gymId` / `managesGymId` / `gyms/*`. `firestore.rules` has **no rules** for `clubs`, `classes`, `classSchedules`, `classEnrollments`, `classExercises`, `classLogs`, `classJournal`, so they would be denied by default if re-enabled. |
| `profile-ui.js` | Older profile editor | Superseded by `athlete-profile-ui.js` / `admin-ui.js` |
| `shortlist-store.js`, `shortlist-ui.js` | Standalone shortlist module | Shortlist logic now lives in `scout.js` |
| `sports.js` | Sports catalog admin | Duplicates definitions that exist in `admin-ui.js` (e.g. `handleAddSportSubmit`) |

To revive one: move it back to `public/js/`, add a `<script>` tag in `public/index.html`, write and **test** the
matching Firestore rules first, and add the new collections to `tests/rules/`.
