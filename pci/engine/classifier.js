/**
 * HeartPilot PCI Case Classifier
 * ─────────────────────────────────────────────────────────────────────────────
 * Computes two-axis case phenotype (lesion complexity + haemodynamic risk)
 * and an annotated case features list from a normalised case input.
 *
 * Depends on PciEngine.derive() for derived field computation.
 * No DOM dependencies. Works in Node (tests) and browser (wizard).
 *
 * @version 1.0.0
 */
'use strict';

// Resolve PciEngine from environment
const _Engine = (typeof module !== 'undefined' && module.exports)
  ? require('./evaluator')
  : (typeof window !== 'undefined' ? window.PciEngine : {});

// ── Lesion Complexity ─────────────────────────────────────────────────────────

const LESION_TIERS = [
  {
    label: 'High Complexity',
    color: '#dc2626',
    bgColor: '#fef2f2',
    match: (c, d) => d.lm_bif || c.vessel === 'LM' || c.vessel === 'Graft' ||
      c.calcification === 'severe' || c.morphology === 'Diffuse' || d.sb_large,
  },
  {
    label: 'Moderate Complexity',
    color: '#b45309',
    bgColor: '#fffbeb',
    match: (c, d) => c.calcification === 'moderate' || c.lesion_length_mm > 20 ||
      ['Ostial', 'Angulated', 'Tortuous'].includes(c.morphology) ||
      (c.bifurcation && c.bifurcation.present === true && !d.sb_large),
  },
  {
    label: 'Standard',
    color: '#059669',
    bgColor: '#f0fdf4',
    match: () => true,
  },
];

function lesionSummary(c, d) {
  if (d.lm_bif) return 'Left main with bifurcation. Two-stent strategy likely required given side-branch anatomy.';
  if (c.vessel === 'LM') return 'Left main PCI. High procedural complexity — imaging-guided sizing mandatory.';
  if (c.vessel === 'Graft') return 'Bypass graft PCI. Distal embolic protection and careful sizing required.';
  if (c.calcification === 'severe') return 'Severe calcification. Calcium modification required before stent deployment.';
  if (d.sb_large) return 'Large side-branch bifurcation. Provisional or upfront 2-stent strategy per anatomy.';
  if (c.morphology === 'Diffuse') return 'Diffuse disease. Stent sequencing and imaging-guided optimisation essential.';
  if (c.calcification === 'moderate') return 'Moderate complexity. Standard preparation with imaging guidance for optimal result.';
  if (c.lesion_length_mm > 20) return 'Long lesion requiring stent sequencing. Distal-to-proximal deployment recommended.';
  if (c.bifurcation && c.bifurcation.present) return 'Bifurcation with small side branch. Provisional single-stent strategy is the default.';
  return 'Standard lesion complexity. New-generation DES with imaging-guided optimisation.';
}

function classifyLesion(caseInput, derived) {
  for (const tier of LESION_TIERS) {
    if (tier.match(caseInput, derived)) {
      return { label: tier.label, color: tier.color, bgColor: tier.bgColor, summary: lesionSummary(caseInput, derived) };
    }
  }
}

// ── Haemodynamic Risk ─────────────────────────────────────────────────────────

const HAEM_TIERS = [
  {
    label: 'Cardiogenic Shock',
    color: '#1e293b',
    bgColor: '#f8fafc',
    match: c => c.haem_status === 'compromised',
    summary: () => 'Haemodynamic compromise. Culprit-only PCI, MCS, and staged non-culprit revascularisation — see haemodynamics section.',
  },
  {
    label: 'High Risk \u2014 MCS to consider',
    color: '#dc2626',
    bgColor: '#fef2f2',
    match: c => !!c.last_remaining_vessel ||
      (c.lvef === 'severe' && (c.vessel === 'LM' || c.morphology === 'Diffuse')),
    summary: c => c.last_remaining_vessel
      ? 'Last remaining vessel. Haemodynamic reserve critically limited — MCS should be strongly considered before wiring.'
      : 'Severely impaired LVEF with high-jeopardy territory. MCS threshold should be low.',
  },
  {
    label: 'Elevated Risk',
    color: '#b45309',
    bgColor: '#fffbeb',
    match: c => c.lvef === 'moderate' || c.lvef === 'severe' || (c.lvef === 'mild' && !!c.multivessel),
    summary: c => (c.lvef === 'moderate' || c.lvef === 'severe')
      ? 'Reduced LVEF. Maintain low threshold for haemodynamic support — monitor for deterioration.'
      : 'Mild LVEF reduction with multivessel disease. Staged complete revascularisation recommended.',
  },
  {
    label: 'Stable',
    color: '#059669',
    bgColor: '#f0fdf4',
    match: () => true,
    summary: () => 'Normal LVEF. Haemodynamically stable. Standard haemodynamic reserve for a complex procedure.',
  },
];

function classifyHaem(caseInput) {
  for (const tier of HAEM_TIERS) {
    if (tier.match(caseInput)) {
      return { label: tier.label, color: tier.color, bgColor: tier.bgColor, summary: tier.summary(caseInput) };
    }
  }
}

// ── Case features list ────────────────────────────────────────────────────────

const VESSEL_MAP = {
  LM:     { display: 'Left Main',    badge: '\u26a0 High complexity', style: 'danger' },
  Graft:  { display: 'Bypass Graft', badge: '\u26a0 High complexity', style: 'danger' },
  LAD:    { display: 'LAD',          badge: '',                       style: 'neutral' },
  LCx:    { display: 'LCx',          badge: '',                       style: 'neutral' },
  RCA:    { display: 'RCA',          badge: '',                       style: 'neutral' },
  Branch: { display: 'Branch',       badge: '',                       style: 'neutral' },
};

const CALC_DISPLAY = { none: 'None', mild: 'Mild', moderate: 'Moderate', severe: 'Severe' };
const CALC_BADGE = {
  none:     { badge: '\u2713 None',                  style: 'ok'      },
  mild:     { badge: '',                             style: 'neutral'  },
  moderate: { badge: '\u2192 Moderate',              style: 'warning'  },
  severe:   { badge: '\u26a0 Modification required', style: 'danger'  },
};

const TIMI_BADGE = {
  3: { badge: '\u2713 Normal',    style: 'ok'      },
  2: { badge: '\u2192 TIMI 2',   style: 'warning'  },
  1: { badge: '\u26a0 Impaired', style: 'danger'  },
  0: { badge: '\u26a0 No flow',  style: 'danger'  },
};

const LVEF_MAP = {
  normal:   { display: 'Normal (>55%)',                  badge: '\u2713 Preserved',        style: 'ok'      },
  mild:     { display: 'Mildly reduced (45\u201355%)',   badge: '\u2192 Mild reduction',   style: 'warning' },
  moderate: { display: 'Moderately reduced (30\u201344%)', badge: '\u26a0 Elevated risk', style: 'danger'  },
  severe:   { display: 'Severely reduced (<30%)',        badge: '\u26a0 Severely impaired', style: 'danger' },
};

const SB_SIZE_DISPLAY = { 'gt2.5': 'SB >2.5mm', '1.5-2.5': 'SB 1.5\u20132.5mm', 'lt1.5': 'SB <1.5mm' };
const SB_ANGLE_DISPLAY = { acute: 'acute', moderate: 'moderate angle', obtuse: 'obtuse' };

function bifurcationFeature(bif, derived) {
  if (!bif || !bif.present) return null;

  const parts = [];
  if (bif.sb_size && SB_SIZE_DISPLAY[bif.sb_size]) parts.push(SB_SIZE_DISPLAY[bif.sb_size]);
  if (bif.medina_sb === 1) parts.push('ostial');
  if (bif.sb_angle && SB_ANGLE_DISPLAY[bif.sb_angle]) parts.push(SB_ANGLE_DISPLAY[bif.sb_angle]);
  const value = parts.length ? parts.join(' \u00b7 ') : 'Present';

  let badge, style;
  if (derived.sb_large && bif.medina_sb === 1) { badge = '\u26a0 2-stent threshold'; style = 'danger'; }
  else if (derived.sb_large)                   { badge = '\u26a0 Large SB';           style = 'danger'; }
  else if (bif.sb_size === '1.5-2.5')          { badge = '\u2192 Moderate SB';        style = 'warning'; }
  else if (bif.sb_size === 'lt1.5')            { badge = '\u2192 Small SB';           style = 'neutral'; }
  else                                         { badge = '';                           style = 'neutral'; }

  return { label: 'Bifurcation', value, badge, badgeStyle: style };
}

function buildCaseFeatures(caseInput, derived) {
  const c = caseInput;
  const features = [];

  // 1. Vessel
  const vm = VESSEL_MAP[c.vessel] || { display: c.vessel || '\u2014', badge: '', style: 'neutral' };
  features.push({ label: 'Vessel', value: vm.display, badge: vm.badge, badgeStyle: vm.style });

  // 2. Bifurcation (only if present)
  const bifFeat = bifurcationFeature(c.bifurcation, derived);
  if (bifFeat) features.push(bifFeat);

  // 3. Calcification
  const cm = CALC_BADGE[c.calcification] || { badge: '', style: 'neutral' };
  features.push({ label: 'Calcification', value: CALC_DISPLAY[c.calcification] || c.calcification, badge: cm.badge, badgeStyle: cm.style });

  // 4. TIMI Flow
  const tm = TIMI_BADGE[c.timi] || { badge: '', style: 'neutral' };
  features.push({ label: 'TIMI Flow', value: 'TIMI ' + c.timi, badge: tm.badge, badgeStyle: tm.style });

  // 5. Thrombus
  features.push({ label: 'Thrombus', value: c.thrombus ? 'Present' : 'None',
    badge: c.thrombus ? '\u26a0 Present' : '\u2713 Absent', badgeStyle: c.thrombus ? 'danger' : 'ok' });

  // 6. Lesion length
  var lenBadge = '', lenStyle = 'neutral';
  if (c.lesion_length_mm > 30)      { lenBadge = '\u26a0 Very long (>30mm)'; lenStyle = 'danger'; }
  else if (c.lesion_length_mm > 20) { lenBadge = '\u2192 Long (>20mm)';      lenStyle = 'warning'; }
  features.push({ label: 'Lesion length', value: c.lesion_length_mm + ' mm', badge: lenBadge, badgeStyle: lenStyle });

  // 7. Morphology (only if not Discrete or Tubular)
  if (c.morphology && ['Discrete', 'Tubular'].indexOf(c.morphology) === -1) {
    features.push({ label: 'Morphology', value: c.morphology, badge: '\u26a0 Complex morphology', badgeStyle: 'warning' });
  }

  // 8. LVEF
  const lm = LVEF_MAP[c.lvef] || { display: c.lvef, badge: '', style: 'neutral' };
  features.push({ label: 'LVEF', value: lm.display, badge: lm.badge, badgeStyle: lm.style });

  // 9. Haemodynamics
  const isComp = c.haem_status === 'compromised';
  features.push({ label: 'Haemodynamics', value: isComp ? 'Compromised' : 'Stable',
    badge: isComp ? '\u26a0 Compromised' : '\u2713 Stable', badgeStyle: isComp ? 'danger' : 'ok' });

  return features;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Classify a PCI case into lesion complexity and haemodynamic risk tiers,
 * and produce an annotated case features list.
 *
 * @param {object} caseInput - Normalised case (matches case-input.schema.json)
 * @returns {ClassificationResult}
 */
function classify(caseInput) {
  var derived = _Engine.derive(caseInput);
  return {
    lesionComplexity: classifyLesion(caseInput, derived),
    haemodynamicRisk: classifyHaem(caseInput),
    caseFeatures: buildCaseFeatures(caseInput, derived),
  };
}

var PciClassifier = { classify: classify };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PciClassifier;
} else if (typeof window !== 'undefined') {
  window.PciClassifier = PciClassifier;
}
