// ── benchmark-protocols.js ───────────────────────────────────────────────
// TOPSET Standardized Benchmark Protocols & Valid Rep Criteria (Move 2)
// Provides authoritative protocol specifications, valid rep conditions,
// disqualification rules, camera evidence standards, and modal UI for
// establishing trusted performance data for athletes and scouts.

(function (window) {
    'use strict';

    const BENCHMARK_PROTOCOLS = {
        'Broad Jump': {
            id: 'broad_jump',
            code: 'TOPSET-STD-01',
            title: 'Standing Broad Jump',
            subtitle: 'Horizontal Explosive Power Test',
            category: 'Explosive Power',
            unit: 'm',
            targetMetric: 'Peak lower-body horizontal rate of force development (RFD)',
            equipment: [
                'Non-slip athletic measuring tape or marked combine jump mat calibrated in metric units (meters/cm)',
                'Flat, non-slip, firm surface (rubberized track, indoor court, or turf)',
                'Standard athletic footwear (cleats prohibited on hard surfaces)'
            ],
            setup: 'Place both feet shoulder-width apart directly behind the takeoff line. Toes must not touch or overhang the line. The athlete begins from a stationary standing position.',
            validRepCriteria: [
                'Countermovement arm swing and knee flexion are permitted prior to takeoff',
                'Takeoff must be simultaneous from both feet (no stutter-step, run-up, or rocking off heels)',
                'Athlete must stick the landing on two feet in an upright position',
                'Must maintain balance without taking steps, hopping, or falling backward or forward',
                'Position must be held until the witness marks the trailing heel point'
            ],
            disqualifications: [
                'Stepping on or crossing the takeoff line prior to departure',
                'Single-leg takeoff or any preparatory steps',
                'Falling backward upon landing or touching hands, knees, or body to the surface behind the heels',
                'Stumbling forward or taking corrective steps before the mark is recorded'
            ],
            measurementRule: 'Measured from the front perpendicular edge of the takeoff line to the nearest point of contact by the trailing heel.',
            cameraAngle: 'Perpendicular lateral profile (90° side view) at knee height, 3.0m away, with both the takeoff line and landing zone fully visible in the frame.',
            attempts: '3 official trials. The maximum valid distance is recorded to the nearest 0.01m.',
            verificationStandards: {
                selfReported: 'Personal training entry; logged on honor policy for personal trend tracking.',
                gymVerified: 'Witnessed and approved in an accredited TOPSET gym by a verified coach or manager.',
                officialCombine: 'Sanctioned combine or combine showcase event with calibrated turf and video audit trail.'
            }
        },

        '3km Run': {
            id: '3km_run',
            code: 'TOPSET-STD-02',
            title: '3km Endurance Run',
            subtitle: 'Aerobic Capacity & Pacing Test',
            category: 'Aerobic Capacity',
            unit: 'time',
            targetMetric: 'Aerobic work capacity, VO2 max estimate, and sustained pacing threshold',
            equipment: [
                'Standard 400m athletics track (Lane 1, exactly 7.5 laps) OR calibrated GPS smartwatch (Garmin, Strava, Apple Watch, Coros)',
                'Stopwatch or automated electronic timing system',
                'Course elevation loss under 15m if running on a certified road or trail'
            ],
            setup: 'Athlete begins from a standing start behind the designated starting mark. Timer begins on the starting command or initial forward foot movement.',
            validRepCriteria: [
                'Continuous foot-propulsion running effort throughout the entire 3,000m distance',
                'Timer runs continuously; moving time must equal total elapsed time',
                'Track attempts must stay inside Lane 1; road attempts must cover verified 3.00km GPS track',
                'Athlete crosses finish line with full elapsed duration recorded in minutes and seconds (mm:ss)'
            ],
            disqualifications: [
                'Any motorized, vehicular, or bicycle pacing assistance',
                'Net elevation decline greater than 15 meters on road courses',
                'Pausing the tracking timer mid-effort or splicing activities',
                'Incomplete distance (short of 3,000 meters)'
            ],
            measurementRule: 'Total elapsed time from start signal to crossing 3,000m mark, recorded in mm:ss.',
            cameraAngle: 'Finish line crossing video or public GPS activity track link (Strava / Garmin) with heart rate / cadence telemetry.',
            attempts: '1 continuous effort.',
            verificationStandards: {
                selfReported: 'Personal GPS or track session logged by the athlete.',
                gymVerified: 'Witnessed by an accredited coach with official stopwatch or verified club GPS track.',
                officialCombine: 'Chip-timed event or dual-stopwatch sanctioned trial on an accredited track.'
            }
        },

        '2:00 Push-ups': {
            id: 'pushups',
            code: 'TOPSET-STD-03',
            title: '2:00 Push-up Test',
            subtitle: 'Upper Body Muscular Endurance Standard',
            category: 'Muscular Endurance',
            unit: 'reps',
            targetMetric: 'Anterior chain upper body muscular endurance (pectoralis, anterior deltoids, triceps, core)',
            equipment: [
                'Firm exercise mat or clean flat gym floor',
                'Standard 10cm (4-inch) foam block or official chest-touch contact sensor placed under sternum',
                'Continuous digital stopwatch or countdown timer visible on video frame'
            ],
            setup: 'Front-leaning rest position: hands roughly shoulder-width apart, fingers pointed forward. Feet together or spaced up to 30cm (12 in) apart. Body in a rigid plank from shoulders to heels.',
            validRepCriteria: [
                'Descend until the chest/sternum firmly touches the 10cm foam block or floor sensor',
                'Upper arms must reach at least parallel (90° elbow flexion) to the floor at the bottom of each rep',
                'Ascend to complete elbow lockout at the top of each repetition',
                'Spine and hips must maintain a rigid straight line (neutral pelvic alignment) through every rep',
                'Resting is permitted ONLY in the top locked-elbow plank position'
            ],
            disqualifications: [
                'Failing to touch the 10cm block / chest contact point (short-stroking depth)',
                'Failing to achieve full elbow extension/lockout at the top',
                'Sagging hips, piking hips upward into a pike/downward dog, or flexing knees',
                'Resting on knees, stomach, or lifting hands or feet off the floor (terminates test immediately)',
                'Repetitions completed after the 120-second expiration mark'
            ],
            measurementRule: 'Total number of strict, valid repetitions completed within exactly 120 seconds.',
            cameraAngle: '45-degree front-diagonal angle at waist level, 2.5m away, capturing head-to-heel plank alignment, bottom depth contact, and top lockout.',
            attempts: '1 official 2-minute trial.',
            verificationStandards: {
                selfReported: 'Personal countdown session logged by athlete.',
                gymVerified: 'Coach directly supervising depth with 10cm block and calling rep count.',
                officialCombine: 'Dual judge or electronic contact mat with synchronized video recording.'
            }
        },

        '2:00 Sit-ups': {
            id: 'situps',
            code: 'TOPSET-STD-04',
            title: '2:00 Sit-up Test',
            subtitle: 'Trunk & Core Endurance Standard',
            category: 'Core Endurance',
            unit: 'reps',
            targetMetric: 'Abdominal muscular endurance, hip flexor stamina, and lumbar spine stability',
            equipment: [
                'Standard exercise mat or flat gym surface',
                'Training partner or secure foot strap anchoring ankles firmly to the floor',
                'Continuous countdown timer'
            ],
            setup: 'Supine on mat with knees flexed at 90 degrees. Feet flat on the floor, anchored by partner or strap. Hands interlaced behind the head or crossed with palms flat against opposite shoulders.',
            validRepCriteria: [
                'Repetition begins from the supine position with shoulder blades touching the floor',
                'Athlete raises torso upward until elbows make clear contact with knees or upper thighs',
                'Athlete lowers under control until shoulder blades contact the mat before initiating next rep',
                'Feet must remain grounded throughout the repetition',
                'Resting is permitted only in the upright/seated position'
            ],
            disqualifications: [
                'Hands coming unclasped from behind head or releasing opposite shoulders',
                'Buttocks lifting off the mat during the upward phase (kipping/bouncing)',
                'Elbows failing to make contact with knees at the top',
                'Shoulder blades failing to contact the mat at the bottom',
                'Resting in the down (supine) position for longer than 3 consecutive seconds'
            ],
            measurementRule: 'Total valid repetitions completed within exactly 120 seconds.',
            cameraAngle: 'Lateral profile (90° side view) at floor level, 2.5m away, capturing shoulder blade touch and knee contact.',
            attempts: '1 official 2-minute trial.',
            verificationStandards: {
                selfReported: 'Athlete personal training session.',
                gymVerified: 'Coach or partner holding feet and judging elbow-knee and shoulder-mat contact.',
                officialCombine: 'Standard combine protocol with verified partner anchor and judge.'
            }
        },

        'Sit and Reach': {
            id: 'sit_reach',
            code: 'TOPSET-STD-05',
            title: 'Sit and Reach Test',
            subtitle: 'Posterior Chain Flexibility Benchmark',
            category: 'Flexibility',
            unit: 'cm',
            targetMetric: 'Hamstring and lower back flexibility and hip range of motion',
            equipment: [
                'Standard Sit-and-Reach testing box with millimeter/centimeter scale (standard 26cm baseline at footplate)',
                'Flat, stable surface'
            ],
            setup: 'Shoes removed. Sits on floor with legs fully extended forward and bare feet flat against the vertical footplate of the box. Knees fully extended and flat against the floor.',
            validRepCriteria: [
                'Hands placed one on top of the other, palms down, with tips of middle fingers aligned evenly',
                'Athlete reaches forward smoothly along the measuring scale in a single continuous movement',
                'Must hold the maximum reach position for at least 2 full seconds for measurement',
                'Knees must remain locked straight against the floor during the reach'
            ],
            disqualifications: [
                'Bending or buckling knees during the reach (assistant may hold knees flat)',
                'Jerking, bouncing, or ballistic lunging forward',
                'One hand leading the other (must remain overlapping and aligned)',
                'Failing to hold the reach stationary for 2 seconds'
            ],
            measurementRule: 'Distance reached past (positive) or before (negative) the 26cm footplate line in centimeters to the nearest 0.5 cm. Best of 3 attempts.',
            cameraAngle: '45-degree lateral view showing locked knees and hand position on the centimeter ruler.',
            attempts: '3 attempts, best valid attempt recorded.',
            verificationStandards: {
                selfReported: 'Athlete logged score.',
                gymVerified: 'Coach holds knees flat and reads standard box scale.',
                officialCombine: 'Accredited testing box with calibrated scale and photo verification.'
            }
        },

        'Bodyweight': {
            id: 'bodyweight',
            code: 'TOPSET-STD-06',
            title: 'Bodyweight Baseline',
            subtitle: 'Anthropometric Mass Measurement',
            category: 'Anthropometrics',
            unit: 'kg',
            targetMetric: 'Total body mass for power-to-weight ratio and weight-class normalization',
            equipment: [
                'Calibrated digital or balance-beam scale accurate to 0.1 kg',
                'Hard, level surface (concrete, tile, or wood; never carpet)'
            ],
            setup: 'Scale calibrated to zero (tared). Shoes and heavy outerwear removed; lightweight athletic clothing (shorts, t-shirt/sports bra).',
            validRepCriteria: [
                'Athlete steps onto the center of the scale with weight distributed evenly on both feet',
                'Stands motionless with arms hanging relaxed at sides until digital reading stabilizes'
            ],
            disqualifications: [
                'Wearing shoes, heavy accessories, or training gear',
                'Touching or leaning against walls, rails, or assistants',
                'Scale placed on soft, carpeted, or uneven surface'
            ],
            measurementRule: 'Stabilized reading recorded to the nearest 0.1 kg.',
            cameraAngle: 'Direct overhead or front photo of scale digital readout alongside athlete in frame.',
            attempts: '1 reading taken at start of testing session.',
            verificationStandards: {
                selfReported: 'Athlete home or gym scale check-in.',
                gymVerified: 'Weigh-in conducted on facility calibrated scale before testing session.',
                officialCombine: 'Official combine weigh-in by event clerk.'
            }
        }
    };

    // Helper to generate a standardized protocol template for custom tests
    function createGenericProtocol(testName, cfg) {
        const unit = cfg?.unit || 'reps';
        const isTime = unit === 'time';
        return {
            id: testName.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
            code: 'TOPSET-STD-GEN',
            title: testName,
            subtitle: `Standardized ${cfg?.sport ? cfg.sport + ' ' : ''}Benchmark`,
            category: cfg?.sport ? `${cfg.sport} Specific` : 'Athletic Performance',
            unit: unit,
            targetMetric: `Verified performance standard for ${testName}`,
            equipment: [
                'Standard calibrated athletic equipment appropriate for this benchmark',
                'Flat, safe surface with proper footing'
            ],
            setup: 'Athlete begins in standard resting athletic posture. Ensure all safety equipment and witness checkpoints are in place.',
            validRepCriteria: [
                'Full range of motion demonstrated throughout each repetition or attempt',
                'Standard start and finish signals respected with zero momentum cheating',
                'Effort performed under direct observation according to sport standards',
                isTime ? 'Timing recorded accurately using continuous elapsed stopwatch' : `Measurement recorded accurately in ${unit}`
            ],
            disqualifications: [
                'Failing to complete required range of motion',
                'Early start or jumping the command cue',
                'Assistance or uncalibrated equipment'
            ],
            measurementRule: isTime ? 'Total elapsed time in mm:ss.' : `Total valid score recorded in ${unit}.`,
            cameraAngle: 'Unobstructed lateral side profile capturing full range of motion.',
            attempts: 'Standard 1 to 3 attempts as designated by gym manager.',
            verificationStandards: {
                selfReported: 'Personal training entry.',
                gymVerified: 'Witnessed and approved by accredited coach.',
                officialCombine: 'Sanctioned combine or tournament trial.'
            }
        };
    }

    function getBenchmarkProtocol(testName) {
        if (!testName) return null;
        if (BENCHMARK_PROTOCOLS[testName]) {
            return BENCHMARK_PROTOCOLS[testName];
        }
        // Normalize name lookup
        const lower = testName.trim().toLowerCase();
        for (const [key, proto] of Object.entries(BENCHMARK_PROTOCOLS)) {
            if (key.toLowerCase() === lower || proto.id === lower) {
                return proto;
            }
        }
        // Fallback for custom tests
        const cfg = typeof window.getTestConfig === 'function' ? window.getTestConfig(testName) : null;
        return createGenericProtocol(testName, cfg);
    }

    // ── Protocol UI Renderers ────────────────────────────────────────────────

    function renderProtocolSummaryCardHTML(testName) {
        const proto = getBenchmarkProtocol(testName);
        if (!proto) return '';

        const criteriaList = proto.validRepCriteria.slice(0, 3).map(c => `
            <li class="proto-criteria-item">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" class="proto-check-icon"><polyline points="20 6 9 17 4 12"/></svg>
                <span>${c}</span>
            </li>
        `).join('');

        return `
            <div class="protocol-preview-card" data-protocol-code="${proto.code}">
                <div class="protocol-preview-header">
                    <div class="protocol-badge-group">
                        <span class="protocol-code-pill">${proto.code}</span>
                        <span class="protocol-category-pill">${proto.category}</span>
                    </div>
                    <button type="button" class="protocol-guide-btn" onclick="window.openBenchmarkProtocol('${encodeURIComponent(testName)}')">
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                        Official Protocol Specs
                    </button>
                </div>
                <div class="protocol-preview-title">${proto.title} Standard</div>
                <div class="protocol-preview-metric"><strong>Goal:</strong> ${proto.targetMetric}</div>
                <div class="protocol-preview-checklist">
                    <div class="protocol-checklist-title">Valid Rep Criteria:</div>
                    <ul class="proto-criteria-list">${criteriaList}</ul>
                </div>
                <div class="protocol-preview-footer">
                    <div class="proto-camera-hint">
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2"/></svg>
                        <span><strong>Camera Angle:</strong> ${proto.cameraAngle}</span>
                    </div>
                </div>
            </div>
        `;
    }

    function openBenchmarkProtocol(testName) {
        const decoded = decodeURIComponent(testName);
        const proto = getBenchmarkProtocol(decoded);
        if (!proto) return;

        let modal = document.getElementById('protocolModal');
        if (!modal) {
            console.warn('protocolModal element missing in DOM');
            return;
        }

        const titleEl = document.getElementById('protoModalTitle');
        const codeEl = document.getElementById('protoModalCode');
        const catEl = document.getElementById('protoModalCategory');
        const contentEl = document.getElementById('protoModalContent');

        if (titleEl) titleEl.textContent = proto.title;
        if (codeEl) codeEl.textContent = proto.code;
        if (catEl) catEl.textContent = proto.category;

        if (contentEl) {
            contentEl.innerHTML = `
                <div class="protocol-modal-body">
                    <!-- 1. Objective & Target -->
                    <div class="proto-modal-section">
                        <h4 class="proto-section-title">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="m4.93 4.93 4.24 4.24"/><path d="m14.83 9.17 4.24-4.24"/><path d="m14.83 14.83 4.24 4.24"/><path d="m9.17 14.83-4.24 4.24"/></svg>
                            Standard Objective
                        </h4>
                        <p class="proto-desc">${proto.targetMetric}. Measured in <strong>${proto.unit === 'time' ? 'elapsed time (mm:ss)' : proto.unit}</strong>.</p>
                    </div>

                    <!-- 2. Equipment & Setup -->
                    <div class="proto-modal-section">
                        <h4 class="proto-section-title">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94Z"/></svg>
                            Equipment &amp; Setup Configuration
                        </h4>
                        <ul class="proto-equipment-list">
                            ${proto.equipment.map(eq => `<li><strong>•</strong> ${eq}</li>`).join('')}
                        </ul>
                        <div class="proto-setup-note"><strong>Starting Posture:</strong> ${proto.setup}</div>
                    </div>

                    <!-- 3. Valid Rep Criteria (Green) -->
                    <div class="proto-modal-section proto-valid-section">
                        <h4 class="proto-section-title proto-green-title">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                            Valid Repetition &amp; Attempt Rules
                        </h4>
                        <ul class="proto-rule-list">
                            ${proto.validRepCriteria.map(v => `<li><span class="proto-check-bullet">✓</span> <span>${v}</span></li>`).join('')}
                        </ul>
                    </div>

                    <!-- 4. Disqualifications & Fouls (Red) -->
                    <div class="proto-modal-section proto-foul-section">
                        <h4 class="proto-section-title proto-red-title">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                            Fouls &amp; Disqualification Criteria
                        </h4>
                        <ul class="proto-rule-list">
                            ${proto.disqualifications.map(dq => `<li><span class="proto-cross-bullet">✕</span> <span>${dq}</span></li>`).join('')}
                        </ul>
                    </div>

                    <!-- 5. Verification Tiers & Video Placement -->
                    <div class="proto-modal-section proto-trust-section">
                        <h4 class="proto-section-title">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                            Verification Standards &amp; Evidence Trail
                        </h4>
                        <div class="proto-tiers-grid">
                            <div class="proto-tier-card">
                                <div class="proto-tier-badge tier-self">Self-Reported</div>
                                <div class="proto-tier-desc">${proto.verificationStandards.selfReported}</div>
                            </div>
                            <div class="proto-tier-card">
                                <div class="proto-tier-badge tier-gym">Gym Verified</div>
                                <div class="proto-tier-desc">${proto.verificationStandards.gymVerified}</div>
                            </div>
                            <div class="proto-tier-card">
                                <div class="proto-tier-badge tier-combine">Official Combine</div>
                                <div class="proto-tier-desc">${proto.verificationStandards.officialCombine}</div>
                            </div>
                        </div>
                        <div class="proto-camera-spec">
                            <strong>Recommended Camera Position for Video Audit:</strong>
                            <p>${proto.cameraAngle}</p>
                        </div>
                    </div>
                </div>
            `;
        }

        modal.classList.remove('hidden');
    }

    function closeBenchmarkProtocol() {
        const modal = document.getElementById('protocolModal');
        if (modal) modal.classList.add('hidden');
    }

    // Expose on global window object
    window.BENCHMARK_PROTOCOLS = BENCHMARK_PROTOCOLS;
    window.getBenchmarkProtocol = getBenchmarkProtocol;
    window.renderProtocolSummaryCardHTML = renderProtocolSummaryCardHTML;
    window.openBenchmarkProtocol = openBenchmarkProtocol;
    window.closeBenchmarkProtocol = closeBenchmarkProtocol;

})(window);
