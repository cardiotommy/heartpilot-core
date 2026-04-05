/**
 * HeartPilot OHCA Score Engine
 * ─────────────────────────────
 * Pure deterministic score calculators for post-ROSC prognostication.
 * No DOM dependencies. Works in Node (tests) and browser (wizard).
 *
 * @version 1.0.0
 */
'use strict';

var OhcaScores = (function () {

  // ── CAHP Score ──────────────────────────────────────────────────────────────
  // Maupain et al., Eur Heart J 2016. doi:10.1093/eurheartj/ehw345
  // Predicts poor neurological outcome (CPC 3–5) at hospital discharge.
  // Tiers: <150 low · 150–200 intermediate · >200 high

  function cahp(inputs) {
    var age    = inputs.age;
    var loc    = inputs.location;          // 'public' | 'home' | 'other'
    var rhythm = inputs.initialRhythm;    // 'shockable' | 'non_shockable'
    var nf     = inputs.noFlowTime;       // minutes
    var lf     = inputs.lowFlowTime;      // minutes
    var ph     = inputs.ph;
    var epi    = inputs.epinephrineDose || 0;  // mg (default 0 if not provided)

    var score = 0;
    score += 1.1 * (age - 10);
    score += (loc !== 'public') ? 24 : 0;  // home/other = non-public arrest
    score += (rhythm === 'non_shockable') ? 27 : 0;
    score += 2.8 * nf;
    score += 0.8 * lf;
    score += 585 - (77 * ph);
    score += (epi === 0) ? 0 : (epi <= 2) ? 27 : 43;

    score = Math.round(score);

    var tier  = score < 150 ? 'low' : score <= 200 ? 'intermediate' : 'high';
    var label = tier === 'low' ? 'Low Risk' : tier === 'intermediate' ? 'Intermediate Risk' : 'High Risk';

    return {
      id: 'cahp', name: 'CAHP Score',
      score: score, tier: tier, label: label,
      interpretation: 'Predicts poor neurological outcome (CPC 3\u20135) at hospital discharge.',
      thresholds: { low: '<150 (39% poor outcome)', intermediate: '150\u2013200 (81%)', high: '>200 (100%)' },
      reference: { authors: 'Maupain et al.', journal: 'Eur Heart J', year: 2016 },
      predicts: 'neurological', horizon: 'hospital discharge',
      incomplete: false, incompleteReason: null
    };
  }

  // ── MIRACLE2 ────────────────────────────────────────────────────────────────
  // Pareek et al., Eur Heart J 2020. doi:10.1093/eurheartj/ehaa594
  // Predicts poor neurological outcome (CPC 3–5) at 6 months.
  // Tiers: ≤2 low · 3–4 intermediate · ≥5 high

  function miracle2(inputs) {
    var score = 0;

    if (!inputs.witnessed)                         score += 1;  // unwitnessed
    if (inputs.initialRhythm === 'non_shockable')  score += 1;
    if (inputs.changingRhythms)                    score += 1;
    if ((inputs.epinephrineDose || 0) > 0)         score += 2;
    if (!inputs.pupilsReactive)                    score += 1;
    if (inputs.ph < 7.20)                          score += 1;
    if (inputs.age > 80)      score += 2;
    else if (inputs.age > 60) score += 1;

    var tier  = score <= 2 ? 'low' : score <= 4 ? 'intermediate' : 'high';
    var label = tier === 'low' ? 'Low Risk' : tier === 'intermediate' ? 'Intermediate Risk' : 'High Risk';

    return {
      id: 'miracle2', name: 'MIRACLE2',
      score: score, tier: tier, label: label,
      interpretation: 'Predicts poor neurological outcome (CPC 3\u20135) at 6 months after OHCA.',
      thresholds: { low: '\u22642 (5.6% poor outcome)', intermediate: '3\u20134 (55.4%)', high: '\u22655 (92.3%)' },
      reference: { authors: 'Pareek et al.', journal: 'Eur Heart J', year: 2020 },
      predicts: 'neurological', horizon: '6 months',
      incomplete: false, incompleteReason: null
    };
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  return {
    cahp:     cahp,
    miracle2: miracle2,
  };

}());

if (typeof module !== 'undefined' && module.exports) {
  module.exports = OhcaScores;
} else if (typeof window !== 'undefined') {
  window.OhcaScores = OhcaScores;
}
