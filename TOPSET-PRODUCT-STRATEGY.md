# Topset 2.0 — Product Strategy & Feature Summary

## The Big Idea

Topset should not be positioned simply as a better fitness leaderboard.

The larger product is:

> **A verified performance identity platform for athletes.**

The leaderboard becomes the **proof layer** of the athlete profile.

Topset should help solve two problems:

### Athlete problem

"I have ability, but how do I prove it and get opportunities?"

### Scout / sponsor problem

"I need athletes. How do I find credible candidates quickly?"

Topset connects the two.

---

# The Topset Ecosystem

```text
ATHLETE
   │
   ├── Train
   │
   ├── Test
   │
   ├── Verify
   │
   └── Build Profile
           │
           ↓
      TOPSET PROFILE
           │
      ┌────┴─────┐
      ↓          ↓
   SCOUTS     SPONSORS
      │          │
      └────┬─────┘
           ↓
      OPPORTUNITIES
           ↓
      TRIALS / DEALS
           ↓
        ATHLETE
```

The product should create a loop where better verified performance creates better discovery opportunities.

---

# 1. The Athlete Profile Is the Product

The profile should become more than an account page.

It should function like a combination of:

- Athletic CV
- Performance record
- Competition history
- Verification record
- Recruitment profile
- Sponsorship profile

A scout should be able to open a profile and understand the athlete in roughly 60 seconds.

---

# 2. Verified Performance Is the Differentiator

The strongest concept is not simply:

> "Athletes have statistics."

It is:

> **"Topset can show where those statistics came from and how they were verified."**

Use clear verification levels:

### Self Reported

Athlete entered the result.

### Topset Tested

Result was produced through a Topset test.

### Gym Verified

Approved facility verified the performance.

### Official Event

Performance came from an official event.

This creates trust.

---

# 3. The Scout Experience

A scout should be able to:

1. Open Discover.
2. Select a sport.
3. Select a location.
4. Apply performance filters.
5. See athlete cards.
6. Open profiles.
7. Review verified results.
8. Save athletes.
9. Shortlist athletes.
10. Contact/invite them to a trial.

The experience should be fast.

The scout should not need to understand the entire Topset application.

---

# 4. The Sponsor Experience

Sponsors need a slightly different workflow.

They should be able to:

1. Create an organization profile.
2. Create an opportunity.
3. Define requirements.
4. Search athletes.
5. Review verified profiles.
6. Receive applications.
7. Shortlist candidates.
8. Contact selected athletes.

Example opportunity:

```text
BRAND AMBASSADOR

Sport:
Running

Location:
South Africa

Requirements:
- Competitive experience
- Verified performance
- Active athlete

[APPLY WITH TOPSET PROFILE]
```

---

# 5. "Apply With Topset Profile"

This should become one of the signature features.

Instead of athletes repeatedly creating:

- CVs
- Performance summaries
- Competition histories
- Statistics

Topset packages their existing verified information.

The athlete clicks:

> **Apply With Topset Profile**

The organization receives:

- Athlete identity
- Sport
- Verified performance
- Competition history
- Achievements
- Personal records
- Availability
- Contact information

This makes the profile useful outside the leaderboard.

---

# 6. Discover Athletes

The Discover page should be a major product surface.

Filters:

- Sport
- Location
- Age category
- Verification
- Performance
- Competition experience
- Open to sponsorship
- Open to trials

Example:

```text
BOXING
JOHANNESBURG
18–25
VERIFIED ONLY
OPEN TO TRIALS
```

Then show athlete cards.

---

# 7. Athlete Cards

Cards should provide enough information for quick scanning.

Example:

```text
NCEDO S.
Boxing
Johannesburg

Speed        ████████░░
Power        ███████░░░
Endurance    █████████░

5KM     20:42 ✓
Pushups 72    ✓
Sprint  11.4s ✓

OPEN TO OPPORTUNITIES

[VIEW PROFILE]
```

Do not overload the card.

Its job is to make the scout want to open the profile.

---

# 8. Don't Depend on One Universal Score

Avoid making something like:

> TOPSET SCORE: 94/100

the primary measure across all sports.

A boxer and an endurance athlete have different performance requirements.

Instead, show sport-specific metrics and raw verified results.

A score can potentially exist later as a supporting feature, but the underlying data should remain transparent.

---

# 9. Performance Progression

A scout may care about development, not only current ability.

Show trends:

```text
5KM

June       21:42
July       21:01
August     20:55
September  20:42
```

This communicates development.

---

# 10. Topset Verified Facilities

The existing gym system can become part of Topset's real-world verification network.

A Topset Verified Facility could:

- Run standardized tests
- Verify results
- Host testing days
- Host events
- Publish official results
- Help athletes build credible profiles

This could eventually become a business/network opportunity for Topset.

---

# 11. Events Become Talent Showcases

Don't treat events only as calendar items.

An event can become:

> **TOPSET ATHLETE SHOWCASE**

Example:

```text
Johannesburg Performance Day

120 athletes
8 tests

Top Performances
Personal Records
Rising Athletes

[DISCOVER ATHLETES]
```

Events generate verified data.

Verified data improves profiles.

Better profiles improve discovery.

---

# 12. The Athlete CV

Eventually every athlete should be able to generate a professional athlete CV.

Include:

- Name
- Sport
- Location
- Biography
- Verified results
- Competition history
- Achievements
- Personal records
- Contact
- Topset profile URL
- QR code

This makes Topset useful even when the athlete is applying somewhere outside the platform.

---

# 13. The Topset Athlete Card

The existing stat-card concept can evolve into a shareable identity card.

Possible uses:

- Instagram
- TikTok
- WhatsApp
- CV
- Competition profile
- Sponsorship pitch
- QR code

The card should link back to the athlete's public Topset profile.

---

# 14. Shortlisting

Scouts should be able to save athletes.

Example:

```text
MY SHORTLISTS

Boxing — 12
Hyrox — 8
Running — 17
```

Later they can compare or contact shortlisted athletes.

---

# 15. Comparison

Comparison should present information transparently.

It should not decide who is "best."

Example:

| Metric | Athlete A | Athlete B | Athlete C |
|---|---:|---:|---:|
| 5K | 19:42 | 20:11 | 18:59 |
| Push-ups | 70 | 82 | 74 |
| Sprint | 11.2s | 11.6s | 11.0s |
| Tests | 14 | 9 | 22 |
| Verified | Yes | Yes | Yes |

The organization makes the decision.

---

# 16. Navigation Direction

Recommended:

```text
HOME
TEST
LEADERBOARD
DISCOVER
OPPORTUNITIES
PROFILE
```

The leaderboard should remain important, but it should no longer be the entire identity of the product.

---

# 17. Four Core Products

Everything should ultimately fit into these four pillars:

## 1. Athlete Profile

Who are you?

## 2. Verified Performance

What can you prove?

## 3. Discovery

Who can find you?

## 4. Opportunities

What can you get?

If a feature doesn't meaningfully support one of these, question whether it belongs in the MVP.

---

# 18. Development Roadmap

## Phase 1 — Athlete Identity

Build:

- Public athlete profile
- Verified result display
- Athlete card
- Shareable profile URL
- Athlete CV/PDF

Goal:

> Make an athlete's Topset profile worth sending to a scout.

---

## Phase 2 — Discovery

Build:

- Discover page
- Search
- Filters
- Athlete cards
- Scout view
- Shortlists

Goal:

> Make it possible for organizations to find athletes.

---

## Phase 3 — Opportunities

Build:

- Organization profiles
- Opportunity creation
- Applications
- "Apply With Topset Profile"
- Contact workflow

Goal:

> Connect athletes to real opportunities.

---

## Phase 4 — Ecosystem

Build:

- Verified gyms
- Official testing
- Events
- Athlete showcases
- Sponsorship marketplace

Goal:

> Build the Topset network.

---

# 19. What NOT to Build Yet

Avoid feature creep.

Do not prioritize:

- Social media feed
- Followers
- Payments
- AI scouting
- Full messaging
- Huge analytics dashboards
- Dozens of sports
- Complex sponsorship marketplace

First validate the fundamental loop.

---

# 20. The MVP Test

The first serious version of Topset should answer:

### Athlete

> "Can I prove my performance and present myself professionally?"

### Scout

> "Can I find credible athletes quickly?"

### Sponsor

> "Can I discover athletes who fit my opportunity?"

If the answer is yes, Topset has moved beyond being a leaderboard.

---

# 21. The Product Loop

The ultimate loop is:

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

That is the product.

---

# 22. One-Sentence Product Definition

A strong internal definition for the project:

> **Topset is a verified athlete performance platform that helps athletes prove their ability and helps scouts, teams and sponsors discover credible talent.**

---

# 23. Vibe-Coding Principle

Because the project is being built with AI/vibe coding, do not give the coding assistant vague requests like:

> "Make the profile better."

Instead give it:

```text
FEATURE:
Public Athlete Profile

PURPOSE:
Allow scouts and sponsors to evaluate an athlete.

KEEP:
Existing authentication
Existing leaderboard
Existing fitness logging
Existing gym permissions
Existing official results

ADD:
Public profile
Verified results
Availability
Shareable URL

DATA:
athleteProfiles/{athleteId}

SECURITY:
Only athlete can edit their profile.
Public can read public fields.
Athlete cannot modify verification status.

UI:
Add View Public Profile.

DO NOT:
Rewrite authentication.
Replace Firebase.
Remove leaderboard functionality.
Modify unrelated components.

TEST:
Test signed-out viewing.
Test authorization.
Test verified-result display.
Test mobile layout.
```

This reduces the chance of AI breaking working parts of the application.

---

# Final Direction

Topset should evolve from:

> **Fitness logging + leaderboard**

into:

> **Verified athlete identity + discovery + opportunity platform**

The leaderboard is still important.

But it becomes evidence.

The profile becomes the athlete's identity.

Verification creates trust.

Discovery creates visibility.

Opportunities create value.

That is the larger Topset vision.
