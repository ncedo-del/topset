# TOPSET — Athlete & Scout Platform

TOPSET is a verified athletic identity, talent discovery, and fitness tracking platform.

## Architecture & Interfaces

### 1. Athlete Interface (Live)
- **Workout & Test Logging**: Log personal bests and track progression across standard athletic benchmarks.
- **Gym Verification**: Official testing windows with gym manager cryptographic verification stamps.
- **Journal & Streaks**: Daily training journal with streak tracking and rest/intensity levels.
- **Leaderboards**: Scoped leaderboards (gym vs. public) with real-time percentile calculations.
- **Public Athlete Profile (`/athlete/:uid`)**: Opt-in public performance identity for scout discovery. Protected under POPIA (minors under 19 require guardian consent).
- **Opportunities**: View team trials, sponsorships, and grants, and apply directly using your verified TOPSET profile.

### 2. Scout & Sponsor Interface (Live)
- **Talent Discovery**: Filter athletes by sport, age group, location, and verified performance.
- **Firestore Shortlists**: Cloud-synchronized shortlists with private scout notes.
- **Introduction Requests**: Secure scout outreach where athlete contact info is shared only upon explicit athlete acceptance.
- **Athlete Comparison**: Compare up to 4 athletes side-by-side on verified benchmarks.

### 3. Manager & Admin Tools (Live)
- **Gym Manager Panel**: Roster management, official test date scheduling, custom test catalog.
- **Admin Dashboard**: System catalogs, sport definitions, gym provisioning, and public events.
- **Opportunity Posters**: Create listings and view applicant rosters.

## Security & Privacy (POPIA)
- Hardened Firestore Security Rules covering all 16 collections.
- Strict age validation based on birth year.
- Role isolation between Athletes, Gym Managers, Scouts, and Admins.

## Deployment

Deploy hosting, security rules, and indexes simultaneously:

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy.ps1
```
