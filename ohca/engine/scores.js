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

  // ── Public API ──────────────────────────────────────────────────────────────

  return {
    cahp: cahp,
  };

}());

if (typeof module !== 'undefined' && module.exports) {
  module.exports = OhcaScores;
} else if (typeof window !== 'undefined') {
  window.OhcaScores = OhcaScores;
}
