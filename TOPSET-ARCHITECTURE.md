# Topset 2.0 — Product & Technical Architecture

## 1. Product Vision

Topset should evolve from a fitness-data and leaderboard web app into a **verified athlete identity and opportunity platform**.

Core concept:

> **The verified performance identity of an athlete.**

The leaderboard remains important, but it becomes one part of a larger system:

**TRAIN → TEST → VERIFY → BUILD PROFILE → GET DISCOVERED → APPLY → GET OPPORTUNITIES → KEEP IMPROVING**

Topset should serve four primary audiences:

- Athletes
- Scouts / teams
- Sponsors / brands
- Gyms / testing facilities

---

## 2. Core Product Architecture

### Athlete Layer

The athlete owns a public profile containing:

- Name
- Profile photo
- Sport(s)
- Location
- Athlete status
- Biography
- Performance metrics
- Verified results
- Competition history
- Personal records
- Progression
- Availability
- Opportunities sought
- Contact/application options

### Verification Layer

Every performance result should have a verification state.

Recommended states:

1. **Self Reported**
2. **Topset Tested**
3. **Gym Verified**
4. **Official Event**

The profile should clearly distinguish these states.

Example:

```text
5KM — 20:42
✓ TOPSET VERIFIED
Tested at Topset Verified Facility
14 September 2026
```

Never make a self-reported result look identical to an officially verified result.

---

## 3. Main User Roles

### Athlete

Primary workflow:

```text
Create profile
↓
Record performance
↓
Get results verified
↓
Build athlete profile
↓
Discover opportunities
↓
Apply
```

### Scout / Team

Primary workflow:

```text
Discover athletes
↓
Search/filter
↓
Open athlete profile
↓
Review verified performance
↓
Shortlist
↓
Contact / invite to trial
```

### Sponsor / Brand

Primary workflow:

```text
Create organization profile
↓
Create opportunity
↓
Define requirements
↓
Discover suitable athletes
↓
Review profiles
↓
Receive applications
```

### Gym / Testing Facility

Primary workflow:

```text
Register facility
↓
Become Topset Verified Facility
↓
Test athletes
↓
Verify results
↓
Host events
↓
Publish official results
```

### Admin

Responsible for:

- Users
- Roles
- Gyms
- Tests
- Events
- Verification
- Platform moderation
- Opportunities
- Security

---

## 4. Main Application Navigation

Recommended top-level navigation:

```text
HOME
TEST
LEADERBOARD
DISCOVER
OPPORTUNITIES
PROFILE
```

Secondary features can live under a More/settings area:

- History
- Personal records
- Notifications
- Streaks
- Settings
- Account
- Help

---

## 5. Athlete Profile Architecture

The athlete profile is the centre of the platform.

### Public Profile

Example:

```text
NCEDO SIKHAKHANE
Boxing · Hyrox · Calisthenics
Johannesburg, South Africa

[Performance Summary]

[Verified Results]

[Competition History]

[Personal Records]

[Performance Progression]

[Availability]

[Opportunities]

[Contact / Apply]
```

### Athlete Status

Allow athletes to indicate:

- Open to sponsorship
- Open to team trials
- Open to competitions
- Open to brand partnerships
- Available for opportunities

---

## 6. Sport-Specific Performance

Do not force every sport into one universal score.

Instead, performance dimensions should be sport-specific.

Example:

### Boxing

- Speed
- Reaction
- Power
- Conditioning
- Endurance

### Running

- 5K
- 10K
- Sprint
- Endurance
- Other standardized tests

### Hyrox

- Running
- Sled work
- Burpees
- Row
- Wall balls
- Overall time

The platform should display raw verified results wherever possible.

Avoid making a single universal "Topset Score" the main measure.

---

## 7. Results Data Model

Recommended result structure:

```text
results/
  resultId
    athleteId
    testId
    value
    unit
    date
    verificationStatus
    verifiedBy
    gymId
    eventId
    timestamp
```

Possible verification values:

```text
self_reported
topset_tested
gym_verified
official_event
```

---

## 8. Verification Architecture

Recommended progression:

```text
Self Reported
      ↓
Topset Tested
      ↓
Gym Verified
      ↓
Official Event
```

Each verification should record who/what verified it.

The goal is to allow scouts to answer:

> "Can I trust this performance?"

rather than simply:

> "What does the athlete claim?"

---

## 9. Discovery Architecture

Create a dedicated **Discover Athletes** experience.

Filters should eventually include:

- Sport
- Location
- Age category
- Performance
- Verification level
- Open to sponsorship
- Open to trials
- Gender
- Competition experience

Example:

```text
Boxing
Johannesburg
18–25
Verified only
Open to trials
```

---

## 10. Athlete Discovery Cards

Do not force scouts to open every profile.

Example:

```text
NCEDO S.

Boxing
Johannesburg

Speed        ████████░░
Power        ███████░░░
Endurance    █████████░

Verified:
5KM — 20:42 ✓
Push-ups — 72 ✓
Sprint — 11.4s ✓

Status:
OPEN TO OPPORTUNITIES

[VIEW PROFILE]
```

The card should be a fast screening tool.

---

## 11. Scout Profile View

The full scout view should answer three questions quickly:

### Who is the athlete?

Identity, sport, location, background.

### How good are they?

Verified performance, competition history, PRs.

### Are they available?

Opportunity preferences, trials, sponsorship and contact options.

Target:

> A scout should understand an athlete within approximately 60 seconds.

---

## 12. Shortlisting

Scouts should eventually be able to:

- Save athlete
- Add athlete to shortlist
- Organize shortlists
- Compare athletes
- Contact athletes
- Invite athletes to trials

Example:

```text
My Shortlists

Boxing — 12 athletes
Hyrox — 8 athletes
Running — 17 athletes
```

---

## 13. Athlete Comparison

Comparison should present transparent information rather than producing a winner.

Example:

| Metric | Athlete A | Athlete B | Athlete C |
|---|---:|---:|---:|
| 5K | 19:42 | 20:11 | 18:59 |
| Push-ups | 70 | 82 | 74 |
| Sprint | 11.2s | 11.6s | 11.0s |
| Tests | 14 | 9 | 22 |
| Verified | Yes | Yes | Yes |
| Competitions | 8 | 4 | 11 |

---

## 14. Opportunities Architecture

Create an `opportunities` collection.

Opportunity examples:

- Team trials
- Sponsorship
- Brand ambassador
- Competitions
- Coaching opportunities
- Athlete development programmes

Suggested structure:

```text
opportunities/
  opportunityId
    organizationId
    title
    description
    sport
    location
    ageRequirements
    performanceRequirements
    opportunityType
    deadline
    status
    createdAt
```

---

## 15. Applications Architecture

Create an `applications` collection.

```text
applications/
  applicationId
    opportunityId
    athleteId
    organizationId
    status
    submittedAt
    message
```

Possible statuses:

```text
submitted
reviewing
shortlisted
invited
accepted
rejected
withdrawn
```

The key feature:

> **Apply with Topset Profile**

The athlete should not have to rebuild their CV every time.

---

## 16. Organization Architecture

Create an organization model that can represent:

- Sports teams
- Scouts
- Sponsors
- Brands
- Event organizers

Example:

```text
organizations/
  organizationId
    name
    type
    logo
    description
    location
    website
    verified
    contact
```

---

## 17. Gym / Verification Network

Existing gym functionality can become a major part of Topset.

A **Topset Verified Facility** can:

- Run standardized tests
- Verify results
- Host testing days
- Host events
- Publish official results
- Help athletes build verified profiles

This creates a physical verification network around the software.

---

## 18. Events Architecture

Events should become talent-discovery opportunities, not just calendar entries.

Example:

```text
TOPSET ATHLETE SHOWCASE

Johannesburg Performance Day

120 athletes
8 tests

[View Results]
[Discover Athletes]
```

After an event, Topset can surface:

- Top performances
- Personal records
- Rising athletes
- Verified profiles

Events therefore feed the discovery system.

---

## 19. Athlete CV / Athlete Card

Every athlete should eventually be able to generate a professional Topset athlete document/card containing:

- Name
- Sport
- Location
- Short bio
- Verified results
- Competition history
- Achievements
- Personal records
- Contact information
- QR code
- Topset profile URL

The existing Stat Card concept should evolve toward this broader **Topset Athlete Card**.

---

## 20. Performance Progression

Show trends, not only current results.

Example:

```text
5KM PERFORMANCE

June       21:42
July       21:01
August     20:55
September  20:42
```

This allows scouts to see development over time.

---

## 21. Recommended Firestore Architecture

A future structure could look like:

```text
users/
athleteProfiles/
results/
verifications/
tests/
gyms/
events/
organizations/
opportunities/
applications/
shortlists/
messages/
notifications/
```

Existing concepts such as users, fitness entries, gyms, events, leaderboards and official results should be evolved rather than unnecessarily rebuilt.

---

## 22. Security Architecture

Security becomes more important as Topset moves from personal fitness tracking to recruitment.

Rules should ensure:

### Athletes

Can:

- Edit their own profile
- Submit their own results
- Apply for opportunities

Cannot:

- Modify another athlete's verified results
- Forge official verification
- Modify organization data

### Gym Managers

Can:

- Manage their own gym
- Verify permitted results
- Manage events/results belonging to their facility

Cannot:

- Modify another gym's data

### Organizations

Can:

- Create opportunities
- View public athlete profiles
- Manage their own opportunities/applications

### Admin

Can:

- Manage platform-level resources
- Verify/moderate organizations and facilities
- Manage tests/events
- Handle disputes

All important authorization must be enforced server-side through Firestore Security Rules, not only through UI visibility.

---

## 23. MVP Development Order

Do NOT build the entire ecosystem immediately.

### Phase 1 — Athlete Identity

1. Public athlete profile
2. Verified results
3. Athlete card
4. Shareable profile URL
5. Athlete CV/PDF

### Phase 2 — Discovery

6. Discover athletes
7. Search
8. Filters
9. Athlete cards
10. Scout profile view
11. Shortlists

### Phase 3 — Opportunities

12. Create opportunity
13. Athlete applications
14. Organization profiles
15. Contact/application workflow

### Phase 4 — Ecosystem

16. Verified gyms
17. Official testing
18. Events
19. Talent showcases
20. Sponsorship marketplace

---

## 24. Features to Avoid Building Too Early

Do not let feature creep destroy the MVP.

Delay:

- Full messaging system
- Payments
- AI scouting
- Social feed
- Followers
- Large analytics dashboards
- Too many sports
- Complex sponsorship marketplace

First prove that:

**Athletes want verified profiles and organizations want to use them.**

---

## 25. Product Loop

The complete Topset loop should become:

```text
TRAIN
  ↓
TEST
  ↓
VERIFY
  ↓
BUILD PROFILE
  ↓
GET DISCOVERED
  ↓
APPLY
  ↓
GET OPPORTUNITY
  ↓
KEEP TRAINING
  ↓
NEW RESULTS
  ↓
PROFILE GETS STRONGER
```

This is the central product architecture.

---

## 26. Current Codebase Direction

The current app already has useful foundations including:

- Authentication
- User profiles
- Fitness entries
- Leaderboards
- Gyms
- Events
- Official results
- Tests
- Notifications
- Streaks
- Stat cards
- Role-aware UI

The goal is to **extend these foundations**, not rewrite everything.

The application currently initializes Firebase, listens to authentication state, subscribes to the user's profile and role information, loads tests and manages gym/admin UI state. Keep this foundation while introducing the new domain models and public-profile experiences.

---

## 27. Vibe-Coding Rule

When asking an AI coding assistant to modify Topset:

### Always specify:

1. What feature is being changed.
2. What existing functionality must remain.
3. What data model is being introduced/changed.
4. Who is allowed to read/write the data.
5. What UI screens/components are affected.
6. What files should be modified.
7. What files must NOT be modified.
8. How the feature should be tested.

### Example prompt

```text
We are extending Topset into a verified athlete identity platform.

TASK:
Add a public athlete profile page.

KEEP:
- Existing authentication
- Existing leaderboard
- Existing fitness logging
- Existing gym permissions
- Existing official results

ADD:
- Public athlete profile route
- Verified result display
- Athlete availability
- Shareable profile URL

DATA:
Create/use athleteProfiles/{athleteId}.

SECURITY:
Public users can read only fields intended for public profiles.
Only the athlete can edit their public profile.
Verified result status cannot be edited by the athlete.

UI:
Add "View Public Profile" to the user's profile area.

DO NOT:
- Rewrite authentication
- Replace Firebase
- Remove leaderboard functionality
- Change unrelated files.

TEST:
Verify signed-out users can view a public profile.
Verify users cannot edit another athlete's profile.
Verify self-reported and verified results are visually distinct.
```

This structure should make AI-assisted development much safer and more consistent.
