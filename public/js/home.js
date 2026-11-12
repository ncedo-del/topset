// home.js — TOPSET Athlete Performance Hub (Dashboard)
// Load LAST (after scout.js and opportunities-ui.js):
//   <script src="/js/home.js"></script>
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);

  function escapeHTML(s) {
    if (!s) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function weekStartStr() { // Monday of the current week, YYYY-MM-DD
    const d = new Date();
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return typeof dateToLocalStr === 'function' ? dateToLocalStr(d) : d.toISOString().slice(0, 10);
  }

  function displayValue(e) {
    if (!e) return '–';
    const cfg = typeof getTestConfig === 'function' ? getTestConfig(e.test) : null;
    if (cfg && cfg.unit === 'time' && typeof formatTime === 'function') return formatTime(e.value);
    return `${e.value}${cfg && cfg.unit ? ' ' + cfg.unit : ''}`;
  }

  let _cachedOpps = null;

  async function renderFeaturedOpportunities() {
    const container = $('homeOppsPreview');
    if (!container) return;
    try {
      let list = _cachedOpps;
      if (!list) {
        if (typeof window.fetchOpportunities === 'function') {
          list = await window.fetchOpportunities();
        } else if (typeof db !== 'undefined' && db) {
          const snap = await db.collection('opportunities').orderBy('createdAt', 'desc').limit(2).get();
          list = [];
          snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
        }
        _cachedOpps = list;
      }
      if (!list || !list.length) {
        container.innerHTML = '<div class="empty-state" style="padding:16px;">No active opportunities posted right now.</div>';
        return;
      }
      const featured = list.slice(0, 2);
      container.innerHTML = featured.map((op) => `
        <div class="home-opp-card" data-home-go="opps">
          <div class="home-opp-top">
            <div>
              <span class="home-opp-type">${escapeHTML(op.opportunityType || 'Opportunity')}</span>
              <h4 class="home-opp-title">${escapeHTML(op.title || 'Athletic Opportunity')}</h4>
              <div class="home-opp-org">${escapeHTML(op.organizationName || 'Organization')} · ${escapeHTML(op.sport || 'All Sports')}</div>
            </div>
          </div>
          ${op.requirements ? `<div class="home-opp-req"><strong>Requirement:</strong> ${escapeHTML(op.requirements)}</div>` : ''}
          <div class="home-opp-action">
            <span style="font-size:12px;color:var(--text-muted);">${escapeHTML(op.location || 'Remote / Regional')}</span>
            <button type="button" class="btn btn-outline btn-sm" data-home-go="opps">View &amp; Apply</button>
          </div>
        </div>
      `).join('');
    } catch (err) {
      console.error('renderFeaturedOpportunities error:', err);
      container.innerHTML = '<div class="empty-state" style="padding:16px;">Explore open trials, sponsorships, and grants.</div>';
    }
  }

  function renderHome() {
    if (!$('page-home') || typeof appState === 'undefined') return;

    const signedIn = !!appState.currentUserId;
    const user = (typeof getCurrentUser === 'function' ? getCurrentUser() : null) || appState.currentUser || null;
    const entries = appState.entries || [];
    const prs = typeof getPersonalBests === 'function' ? getPersonalBests(entries) : [];
    const prCount = prs.length;
    const start = weekStartStr();
    const weekCount = entries.filter((e) => (e.date || '') >= start).length;
    const latest = entries.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.timestamp || 0) - (a.timestamp || 0))[0];
    const hasVerified = entries.some((e) => e.isOfficial && e.officialStatus === 'verified');

    // ── 1. Hero greeting & badges ────────────────────────────────────
    const heroSub = $('homeHeroSub');
    const heroMeta = $('homeHeroMeta');
    const sportBadge = $('homeHeroSportBadge');
    const gymBadge = $('homeHeroGymBadge');
    const verifiedBadge = $('homeHeroVerifiedBadge');

    if (heroSub) {
      if (signedIn && user && user.name) {
        const firstName = user.name.trim().split(' ')[0] || 'Athlete';
        heroSub.innerHTML = `Welcome back, <strong>${escapeHTML(firstName)}</strong>. Track progress, prove your ability and pursue real opportunities.`;
      } else {
        heroSub.textContent = 'Track progress, prove your ability and connect with opportunities.';
      }
    }

    if (heroMeta) {
      if (signedIn) {
        heroMeta.classList.remove('hidden');
        if (sportBadge) {
          if (user && user.sport) {
            sportBadge.textContent = user.sport;
            sportBadge.classList.remove('hidden');
          } else {
            sportBadge.classList.add('hidden');
          }
        }
        if (gymBadge) {
          if (appState.myGym && appState.myGym.name) {
            gymBadge.textContent = `📍 ${appState.myGym.name}`;
            gymBadge.classList.remove('hidden');
          } else {
            gymBadge.classList.add('hidden');
          }
        }
        if (verifiedBadge) {
          verifiedBadge.classList.toggle('hidden', !hasVerified);
        }
      } else {
        heroMeta.classList.add('hidden');
      }
    }

    // ── 2. Athletic CV Completeness & Milestone (Strategy Deck Move 3) ────
    const cvPercent = $('homeCvPercent');
    const cvProgressFill = $('homeCvProgressFill');
    const cvBadge = $('homeCvBadge');
    const cvNext = $('homeCvNext');
    const cvMainBtn = $('homeCvMainBtn');
    const cvMainBtnText = $('homeCvMainBtnText');
    const cvViewBtn = $('homeCvViewBtn');
    const cvShareBtn = $('homeCvShareBtn');

    const comp = typeof window.computeProfileCompleteness === 'function'
      ? window.computeProfileCompleteness(user, entries, appState.athleteProfile)
      : { percent: 0, level: 'Building Profile', badgeClass: 'badge-subtle', nextStep: 'Sign up to create your Athletic CV', hasVerified: false };

    if (cvPercent) cvPercent.textContent = `${comp.percent}%`;
    if (cvProgressFill) cvProgressFill.style.width = `${comp.percent}%`;
    if (cvBadge) {
      cvBadge.textContent = comp.level.toUpperCase();
      cvBadge.className = `home-cv-badge ${comp.badgeClass}`;
    }
    if (cvNext) cvNext.textContent = comp.nextStep;

    if (cvMainBtn && cvMainBtnText) {
      if (!signedIn) {
        cvMainBtnText.textContent = 'Sign In / Join';
        cvMainBtn.setAttribute('data-home-action', 'auth');
        if (cvViewBtn) cvViewBtn.classList.add('hidden');
        if (cvShareBtn) cvShareBtn.classList.add('hidden');
      } else {
        if (comp.percent < 35) {
          cvMainBtnText.textContent = 'Complete Profile';
          cvMainBtn.setAttribute('data-home-action', 'profile');
        } else if (entries.length === 0) {
          cvMainBtnText.textContent = 'Log Baseline Result';
          cvMainBtn.setAttribute('data-home-action', 'log');
        } else if (!comp.hasVerified) {
          cvMainBtnText.textContent = 'Log Test for Verification';
          cvMainBtn.setAttribute('data-home-action', 'log');
        } else {
          cvMainBtnText.textContent = 'Explore Opportunities';
          cvMainBtn.setAttribute('data-home-action', 'opps');
        }

        if (cvViewBtn) cvViewBtn.classList.remove('hidden');
        if (cvShareBtn) cvShareBtn.classList.remove('hidden');
      }
    }

    // ── 3. Performance Summary (3 cards) ─────────────────────────────
    // Latest result card
    const latestVal = $('homeLatestValue');
    const latestTest = $('homeLatestTest');
    const latestDate = $('homeLatestDate');
    const latestBadge = $('homeLatestBadge');

    if (latestVal && latestTest && latestDate) {
      if (latest) {
        latestVal.textContent = displayValue(latest);
        latestTest.textContent = latest.test;
        latestDate.textContent = typeof formatDate === 'function' ? formatDate(latest.date) : latest.date;
        if (latestBadge) {
          if (latest.isOfficial && latest.officialStatus === 'verified') {
            latestBadge.className = 'home-badge-pill badge-green';
            latestBadge.textContent = 'VERIFIED';
            latestBadge.classList.remove('hidden');
          } else if (latest.isOfficial) {
            latestBadge.className = 'home-badge-pill badge-new';
            latestBadge.textContent = 'PENDING';
            latestBadge.classList.remove('hidden');
          } else {
            latestBadge.className = 'home-badge-pill badge-subtle';
            latestBadge.textContent = 'SELF-REPORTED';
            latestBadge.classList.remove('hidden');
          }
        }
      } else {
        latestVal.textContent = '–';
        latestTest.textContent = 'No results logged yet';
        latestDate.textContent = signedIn ? 'Log a test to set your baseline' : 'Sign in to start tracking';
        if (latestBadge) latestBadge.classList.add('hidden');
      }
    }

    // Personal Records card
    const prCountEl = $('homePrCount');
    const prFootEl = $('homePrFoot');
    if (prCountEl) prCountEl.textContent = prCount;
    if (prFootEl) {
      prFootEl.textContent = !signedIn
        ? 'Sign in to start tracking PRs'
        : prCount > 0
          ? `Top: ${prs[0].test} (${displayValue(prs[0])})`
          : 'Log a result to set your first PR';
    }

    // Activity & Streak card
    const weekCountEl = $('homeWeekCount');
    const streakFootEl = $('homeRecentFoot');
    if (weekCountEl) weekCountEl.textContent = weekCount;
    if (streakFootEl) {
      const streak = (typeof calculateStreak === 'function' && appState.journalEntries) ? calculateStreak(appState.journalEntries) : 0;
      streakFootEl.textContent = !signedIn
        ? 'Sign in to track your streak'
        : streak > 0
          ? `🔥 ${streak}-day active training streak`
          : 'Tap to record daily training journal';
    }

    // ── 4. Compact Leaderboard Preview ────────────────────────────────
    const lbScope = $('homeLbScope');
    const lbTest = $('homeLbTest');
    const lbDesc = $('homeLbDesc');
    const lbRankBadge = $('homeLbRankBadge');
    const lbRankLabel = $('homeLbRankLabel');
    const lbSubtext = $('homeLbSubtext');

    if (lbTest && lbDesc && lbRankBadge) {
      const spotlight = appState.spotlightLift || (prs.length ? prs[0].test : (appState.tests && appState.tests[0] ? appState.tests[0].name : 'Broad Jump'));
      lbTest.textContent = spotlight;

      if (signedIn) {
        if (lbScope) lbScope.textContent = appState.myGym ? `${appState.myGym.name.toUpperCase()} · LEADERBOARD` : 'TOPSET PUBLIC · LEADERBOARD';
        const userBest = prs.find((p) => p.test === spotlight);
        if (userBest) {
          lbDesc.textContent = `Your personal best: ${displayValue(userBest)} (${typeof formatDate === 'function' ? formatDate(userBest.date) : userBest.date})`;
          lbRankBadge.textContent = 'PR ✓';
          if (lbRankLabel) lbRankLabel.textContent = 'Personal Mark';
          if (lbSubtext) lbSubtext.textContent = 'Tap to see your position on the leaderboard';
        } else {
          lbDesc.textContent = `You haven't logged ${spotlight} yet. Log a benchmark to join the leaderboard rankings.`;
          lbRankBadge.textContent = '–';
          if (lbRankLabel) lbRankLabel.textContent = 'Not Ranked';
          if (lbSubtext) lbSubtext.textContent = 'Choose test on leaderboard to see full rankings';
        }
      } else {
        if (lbScope) lbScope.textContent = 'TOPSET COMPETITION';
        lbDesc.textContent = 'Benchmark yourself against verified athletes across gym facilities and global rankings.';
        lbRankBadge.textContent = '🏆';
        if (lbRankLabel) lbRankLabel.textContent = 'Rankings';
        if (lbSubtext) lbSubtext.textContent = 'Sign in to compete on the leaderboard';
      }
    }

    // ── 5. Featured Opportunities Preview ────────────────────────────
    renderFeaturedOpportunities();
  }

  window.renderHome = renderHome;

  // Refresh whenever the app refreshes its own stats row (fires on every entries update).
  const _stats = window.updateStatsRow;
  if (typeof _stats === 'function') {
    window.updateStatsRow = function () {
      const r = _stats.apply(this, arguments);
      try { renderHome(); } catch (e) { console.error(e); }
      return r;
    };
  }

  // ── Navigation wiring ──────────────────────────────────────────────
  const _nav = typeof window.navigateTo === 'function' ? window.navigateTo : null;
  const setNavActive = (page) =>
    document.querySelectorAll('[data-page]').forEach((b) => b.classList.toggle('active', b.dataset.page === page));

  window.navigateTo = function (page) {
    if (page === 'home') {
      document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
      $('page-home')?.classList.add('active');
      setNavActive('home');
      renderHome();
      window.scrollTo(0, 0);
      return;
    }
    let r;
    if (_nav) {
      r = _nav.apply(this, arguments);
    } else {
      document.querySelectorAll('.page').forEach((p) => p.classList.toggle('active', p.id === 'page-' + page));
      setNavActive(page);
    }
    $('page-home')?.classList.remove('active');
    document.querySelectorAll('[data-page="home"]').forEach((b) => b.classList.remove('active'));
    return r;
  };

  // ── Event delegation for Home actions ──────────────────────────────
  document.addEventListener('click', (e) => {
    // Check [data-home-action] first
    const actionEl = e.target.closest('[data-home-action]');
    if (actionEl) {
      const action = actionEl.getAttribute('data-home-action');
      if (action === 'auth') {
        if (window.openAuthModal) window.openAuthModal('signup');
      } else if (action === 'log') {
        window.navigateTo('log');
      } else if (action === 'profile') {
        if (window.openProfileHub) window.openProfileHub();
        else if (window.openEditProfileModal) window.openEditProfileModal();
      } else if (action === 'opps') {
        if (window.openOpportunitiesModal) window.openOpportunitiesModal();
      }
      return;
    }

    // Check [data-home-go]
    const goEl = e.target.closest('[data-home-go]');
    if (!goEl) return;
    const dest = goEl.getAttribute('data-home-go');
    if (dest === 'opps') {
      if (window.openOpportunitiesModal) window.openOpportunitiesModal();
    } else if (dest === 'streak') {
      if (window.openStreakModal) window.openStreakModal();
    } else {
      window.navigateTo(dest);
    }
  });

    window.openMyAthleticCV = function() {
      if (!appState.currentUserId) {
        if (typeof showToast === 'function') showToast('Please sign in first.');
        return;
      }
      if (typeof window.renderPublicAthletePage === 'function') {
        window.renderPublicAthletePage(appState.currentUserId);
      }
    };

    window.shareMyAthleticCV = async function() {
      if (!appState.currentUserId) {
        if (typeof showToast === 'function') showToast('Please sign in first.');
        return;
      }
      const cvUrl = `${window.location.origin}/athlete/${encodeURIComponent(appState.currentUserId)}`;
      if (navigator.share) {
        try {
          await navigator.share({
            title: `${appState.currentUser?.name || 'Athlete'} — TOPSET Athletic CV`,
            text: 'Check out my verified athletic benchmarks and performance CV on TOPSET:',
            url: cvUrl
          });
          return;
        } catch(e) {}
      }
      try {
        await navigator.clipboard.writeText(cvUrl);
        if (typeof showToast === 'function') showToast('Athletic CV link copied to clipboard!');
      } catch(err) {
        if (typeof showToast === 'function') showToast(cvUrl);
      }
    };

  document.addEventListener('DOMContentLoaded', renderHome);
  window.addEventListener('load', renderHome);
})();
