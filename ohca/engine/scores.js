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

  // ── CASPRI ──────────────────────────────────────────────────────────────────
  // Chan et al., JACC 2014. Originally derived from in-hospital cardiac arrest.
  // Predicts in-hospital survival. OHCA applicability is limited.
  // Tiers (by survival): ≤9 high survival · 10–19 intermediate · ≥20 low survival

  function caspri(inputs) {
    var score = 0;

    // Age
    if      (inputs.age >= 80) score += 4;
    else if (inputs.age >= 70) score += 2;
    else if (inputs.age >= 60) score += 1;

    // Rhythm (CASPRI distinguishes witnessed/unwitnessed VF and PEA vs asystole)
    if (inputs.initialRhythm === 'non_shockable') {
      score += (inputs.initialRhythmSubtype === 'asystole') ? 7 : 6; // asystole vs PEA
    } else {
      score += inputs.witnessed ? 0 : 3; // witnessed VF=0, unwitnessed VF=3
    }

    // Pre-arrest CPC
    if      (inputs.prearrestCPC === 'cpc3_4') score += 9;
    else if (inputs.prearrestCPC === 'cpc2')   score += 2;

    // Time to ROSC (low-flow time)
    var lf = inputs.lowFlowTime;
    if      (lf >= 30) score += 8;
    else if (lf >= 15) score += 6;
    else if (lf >= 10) score += 5;
    else if (lf >= 5)  score += 3;

    // Monitored: OHCA patients are always "unmonitored" (+3)
    score += 3;

    // Comorbidities: highest category only
    var c = inputs.comorbidities || [];
    var hasHigh = c.indexOf('hepatic_failure') >= 0 || c.indexOf('malignancy') >= 0;
    var hasMid  = c.indexOf('sepsis') >= 0 || c.indexOf('hypotension') >= 0;
    var hasLow  = c.indexOf('renal_failure') >= 0;
    if      (hasHigh) score += 4;
    else if (hasMid)  score += 3;
    else if (hasLow)  score += 2;

    var tier  = score <= 9 ? 'low' : score <= 19 ? 'intermediate' : 'high';
    var label = tier === 'low' ? 'Low Risk' : tier === 'intermediate' ? 'Intermediate Risk' : 'High Risk';

    return {
      id: 'caspri', name: 'CASPRI',
      score: score, tier: tier, label: label,
      interpretation: 'Predicts in-hospital survival after resuscitation.',
      thresholds: { low: '\u22649 (>66% survival)', intermediate: '10\u201319 (23\u201342%)', high: '\u226520 (<12%)' },
      reference: { authors: 'Chan et al.', journal: 'JACC', year: 2014 },
      predicts: 'survival', horizon: 'hospital discharge',
      incomplete: false, incompleteReason: null,
      caveat: 'Derived from an in-hospital cardiac arrest registry (Get With The Guidelines). Applicability to OHCA patients is uncertain \u2014 interpret with caution.'
    };
  }

  // ── TTM Risk Score ──────────────────────────────────────────────────────────
  // Martinell et al., Critical Care 2017. doi:10.1186/s13054-017-1677-2
  // Predicts poor neurological outcome (CPC 3–5) at hospital discharge.
  // Point values sourced from Table 5 / Supplementary Table S1 of the
  // original paper (PMC5391587).
  // Tiers: ≤9 low · 10–16 intermediate · ≥17 high
  // Score range: −2 to 35.
  // paco2 (kPa) is required; returns incomplete if absent.

  function ttm(inputs) {
    var paco2 = inputs.paco2;  // kPa — required
    if (paco2 === null || paco2 === undefined) {
      return {
        id: 'ttm', name: 'TTM Risk Score',
        score: null, tier: 'incomplete', label: 'Incomplete',
        interpretation: 'Predicts poor neurological outcome (CPC 3\u20135) after OHCA.',
        thresholds: { low: '\u22649 (low risk)', intermediate: '10\u201316 (intermediate risk)', high: '\u226517 (high risk)' },
        reference: { authors: 'Martinell et al.', journal: 'Critical Care', year: 2017 },
        predicts: 'neurological', horizon: 'hospital discharge',
        incomplete: true, incompleteReason: 'PaCO2 required for TTM score (enter in Labs step)'
      };
    }

    var score = 0;

    // Age — 5-year brackets, <40 = −1
    var age = inputs.age;
    if      (age <  40) score -= 1;
    else if (age <= 44) score += 0;
    else if (age <= 49) score += 1;
    else if (age <= 54) score += 2;
    else if (age <= 59) score += 3;
    else if (age <= 64) score += 4;
    else if (age <= 69) score += 5;
    else if (age <= 74) score += 6;
    else if (age <= 79) score += 7;
    else if (age <= 84) score += 8;
    else                score += 9;  // ≥85

    // Place of arrest: home = +2
    if (inputs.location === 'home') score += 2;

    // First monitored rhythm: non-VF/pVT = +4
    if (inputs.initialRhythm === 'non_shockable') score += 4;

    // No-flow time (minutes)
    var nf = inputs.noFlowTime || 0;
    if      (nf <= 4)  score += 0;
    else if (nf <= 9)  score += 1;
    else if (nf <= 14) score += 2;
    else               score += 3;  // ≥15

    // Low-flow time (minutes)
    var lf = inputs.lowFlowTime || 0;
    if      (lf <= 5)  score += 0;
    else if (lf <= 15) score += 1;
    else if (lf <= 30) score += 2;
    else if (lf <= 60) score += 3;
    else               score += 4;  // >60

    // Adrenaline treatment: yes = +2
    if ((inputs.epinephrineDose || 0) > 0) score += 2;

    // Bilateral absence of pupillary OR corneal reflex: absent = +3
    if (!inputs.pupilsReactive) score += 3;

    // pH brackets (arterial)
    var ph = inputs.ph;
    if      (ph >= 7.35)                      score -= 1;
    else if (ph >= 7.20 && ph <= 7.34)        score += 0;
    else if (ph >= 7.05 && ph <= 7.19)        score += 1;
    else if (ph >= 6.90 && ph <= 7.04)        score += 2;
    else                                       score += 3;  // <6.90

    // GCS motor score = 1 (no motor response): yes = +2
    if (inputs.gcsMotor === 1) score += 2;

    // PaCO2 < 4.5 kPa: yes = +3
    if (paco2 < 4.5) score += 3;

    var tier  = score <= 9 ? 'low' : score <= 16 ? 'intermediate' : 'high';
    var label = tier === 'low' ? 'Low Risk' : tier === 'intermediate' ? 'Intermediate Risk' : 'High Risk';

    return {
      id: 'ttm', name: 'TTM Risk Score',
      score: score, tier: tier, label: label,
      interpretation: 'Predicts poor neurological outcome (CPC 3\u20135) after OHCA.',
      thresholds: { low: '\u22649 (low risk)', intermediate: '10\u201316 (intermediate risk)', high: '\u226517 (high risk)' },
      reference: { authors: 'Martinell et al.', journal: 'Critical Care', year: 2017 },
      predicts: 'neurological', horizon: 'hospital discharge',
      incomplete: false, incompleteReason: null
    };
  }

  // ── OHCA Score ───────────────────────────────────────────────────────────────
  // Adrie et al., Eur Heart J 2006. doi:10.1093/eurheartj/ehl336 (PMID 17082207)
  // Predicts survival with good neurological outcome (CPC 1–2) at ICU admission.
  //
  // Formula (sourced from Hokkaido University OHCA calculator page,
  // which reproduced the formula from the original Adrie et al. 2006 paper):
  //   score = -13*(shockable=1) + 6*ln(noFlowTime) + 9*ln(lowFlowTime)
  //           - 1434/creatinine_µmol + 10*ln(lactate_mmol)
  //
  // Probability of poor prognosis (%) = 104.2578 / (1 + 3.363926 * exp(-0.067359 * score))
  //   [This conversion was back-calculated from the Hokkaido University calculator
  //    which notes the formula was derived by back-calculating graphs from Adrie 2006]
  //
  // Probability of favourable outcome = 1 − p_poor
  // Tiers by p_favourable: ≥50% high · 25–<50% intermediate · <25% low
  //
  // NOTE: creatinine is required (cannot be zero or absent).

  function ohca(inputs) {
    var creatinine = inputs.creatinine;  // µmol/L — required
    if (creatinine === null || creatinine === undefined) {
      return {
        id: 'ohca', name: 'OHCA Score',
        score: null, probability: null, tier: 'incomplete', label: 'Incomplete',
        interpretation: 'Predicts survival with good neurological outcome (CPC 1\u20132) at ICU admission.',
        thresholds: { high: '\u226550% (favourable outcome)', intermediate: '25\u201349%', low: '<25%' },
        reference: { authors: 'Adrie et al.', journal: 'Eur Heart J', year: 2006 },
        predicts: 'neurological', horizon: 'ICU admission',
        incomplete: true, incompleteReason: 'Creatinine required for OHCA score (enter in Labs step)'
      };
    }

    var shockable = (inputs.initialRhythm === 'shockable') ? 1 : 0;
    var nf        = inputs.noFlowTime  || 0;
    var lf        = inputs.lowFlowTime || 0;
    var lactate   = inputs.lactate;   // mmol/L
    var creat     = creatinine;       // µmol/L

    // Guard against log(0): use a minimum of 0.1 for time values
    var nfSafe  = Math.max(nf,  0.1);
    var lfSafe  = Math.max(lf,  0.1);
    var lacSafe = Math.max(lactate, 0.01);

    var score = (-13 * shockable)
              + (6  * Math.log(nfSafe))
              + (9  * Math.log(lfSafe))
              - (1434 / creat)
              + (10 * Math.log(lacSafe));

    score = Math.round(score * 10) / 10;

    // Convert to probability of poor prognosis (%)
    var pPoorPct = 104.2578 / (1 + 3.363926 * Math.exp(-0.067359 * score));
    // Clamp to [0, 100]
    pPoorPct = Math.max(0, Math.min(100, pPoorPct));

    var pFavourable = Math.round((1 - pPoorPct / 100) * 100);  // % favourable outcome

    var tier;
    if (pFavourable >= 50)      tier = 'high';
    else if (pFavourable >= 25) tier = 'intermediate';
    else                        tier = 'low';

    var label = tier === 'high' ? 'Favourable' : tier === 'intermediate' ? 'Intermediate' : 'Unfavourable';

    return {
      id: 'ohca', name: 'OHCA Score',
      score: score, probability: pFavourable, tier: tier, label: label,
      interpretation: 'Predicts survival with good neurological outcome (CPC 1\u20132) at ICU admission.',
      thresholds: { high: '\u226550% favourable outcome', intermediate: '25\u201349%', low: '<25%' },
      reference: { authors: 'Adrie et al.', journal: 'Eur Heart J', year: 2006 },
      predicts: 'neurological', horizon: 'ICU admission',
      incomplete: false, incompleteReason: null
    };
  }

  // ── calculateAll ─────────────────────────────────────────────────────────────

  function calculateAll(inputs) {
    return [
      cahp(inputs),
      miracle2(inputs),
      ttm(inputs),
      ohca(inputs),
      caspri(inputs),
    ];
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  return {
    cahp:         cahp,
    miracle2:     miracle2,
    caspri:       caspri,
    ttm:          ttm,
    ohca:         ohca,
    calculateAll: calculateAll,
  };

}());

if (typeof module !== 'undefined' && module.exports) {
  module.exports = OhcaScores;
} else if (typeof window !== 'undefined') {
  window.OhcaScores = OhcaScores;
}
