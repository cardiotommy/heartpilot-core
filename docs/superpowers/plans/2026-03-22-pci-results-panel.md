# PCI Results Panel — Two-Axis Classification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the PCI wizard results panel with a two-axis classification system (lesion complexity + haemodynamic risk), a case features breakdown, and evidence-sorted recommendations with consistent badge styling.

**Architecture:** A new pure-function `classifier.js` module computes the two axes and case features list from a normalised case input; `index.html` is updated to load the classifier, call it alongside the existing rule engine, and render the new layout. The old deterministic `buildStrategy()` path is removed entirely.

**Tech Stack:** ES6+ JavaScript (no build step, no deps). Node.js test runner (built-in `assert`).

**Spec:** `docs/superpowers/specs/2026-03-22-pci-results-panel-design.md`

---

## File Structure

| File | Role |
|---|---|
| `pci/engine/classifier.js` | **New** — `PciClassifier.classify(caseInput)` → `ClassificationResult`. Pure function, no DOM. |
| `pci/test/engine.test.js` | **Modify** — add `require('../engine/classifier')` and all classifier test cases. |
| `pci/index.html` | **Modify** — load `classifier.js`, add new rendering functions, remove old `buildStrategy`/`buildTopBlocks`/`cardEquip` path. |

---

## Task 1: `pci/engine/classifier.js` (TDD)

**Files:**
- Modify: `pci/test/engine.test.js`
- Create: `pci/engine/classifier.js`

---

- [ ] **Step 1: Add classifier require to test file**

At the top of `pci/test/engine.test.js`, after line 7 (`const { evaluate, ... } = require('../engine/evaluator.js');`), add:

```js
const PciClassifier = require('../engine/classifier.js');
const { classify } = PciClassifier;
```

---

- [ ] **Step 2: Run tests to confirm they fail (module not found)**

```bash
cd pci && node test/engine.test.js
```

Expected: `Error: Cannot find module '../engine/classifier.js'` — confirms the test harness loads the file.

---

- [ ] **Step 3: Add lesion complexity tier tests**

Append to `pci/test/engine.test.js` before the final summary block (`// ── Summary`):

```js
// ── PciClassifier — Lesion Complexity ────────────────
console.log('\n── PciClassifier — Lesion Complexity ───────────────');

test('Standard: non-LM, no bifurcation, mild calcium, ≤20mm', () => {
  assert.strictEqual(classify({ ...BASE }).lesionComplexity.label, 'Standard');
});

test('Moderate: moderate calcium', () => {
  assert.strictEqual(classify({ ...BASE, calcification: 'moderate' }).lesionComplexity.label, 'Moderate Complexity');
});

test('Moderate: lesion >20mm', () => {
  assert.strictEqual(classify({ ...BASE, lesion_length_mm: 25 }).lesionComplexity.label, 'Moderate Complexity');
});

test('Moderate: small-SB bifurcation (sb_size lt1.5)', () => {
  const c = { ...BASE, bifurcation: { present: true, sb_size: 'lt1.5', medina_sb: 0 } };
  assert.strictEqual(classify(c).lesionComplexity.label, 'Moderate Complexity');
});

test('High: severe calcium', () => {
  assert.strictEqual(classify({ ...BASE, calcification: 'severe' }).lesionComplexity.label, 'High Complexity');
});

test('High: graft vessel', () => {
  assert.strictEqual(classify({ ...BASE, vessel: 'Graft' }).lesionComplexity.label, 'High Complexity');
});

test('High: large-SB bifurcation (non-LM)', () => {
  const c = { ...BASE, bifurcation: { present: true, sb_size: 'gt2.5', medina_sb: 1 } };
  assert.strictEqual(classify(c).lesionComplexity.label, 'High Complexity');
});

test('High: LM with bifurcation', () => {
  const c = { ...BASE, vessel: 'LM', bifurcation: { present: true, sb_size: 'gt2.5', medina_sb: 1 } };
  assert.strictEqual(classify(c).lesionComplexity.label, 'High Complexity');
});

test('High: LM without bifurcation', () => {
  assert.strictEqual(classify({ ...BASE, vessel: 'LM' }).lesionComplexity.label, 'High Complexity');
});
```

---

- [ ] **Step 4: Add haemodynamic risk tier tests**

```js
// ── PciClassifier — Haemodynamic Risk ────────────────
console.log('\n── PciClassifier — Haemodynamic Risk ──────────────');

test('Stable: normal LVEF, stable haem, no special flags', () => {
  assert.strictEqual(classify({ ...BASE }).haemodynamicRisk.label, 'Stable');
});

test('Elevated: moderate LVEF', () => {
  assert.strictEqual(classify({ ...BASE, lvef: 'moderate' }).haemodynamicRisk.label, 'Elevated Risk');
});

test('Elevated: mild LVEF + multivessel', () => {
  assert.strictEqual(classify({ ...BASE, lvef: 'mild', multivessel: true }).haemodynamicRisk.label, 'Elevated Risk');
});

test('High Risk: last remaining vessel alone (no LVEF flag)', () => {
  assert.strictEqual(classify({ ...BASE, last_remaining_vessel: true }).haemodynamicRisk.label, 'High Risk \u2014 MCS to consider');
});

test('High Risk: severe LVEF + LM, last_remaining_vessel false', () => {
  const c = { ...BASE, lvef: 'severe', vessel: 'LM', last_remaining_vessel: false };
  assert.strictEqual(classify(c).haemodynamicRisk.label, 'High Risk \u2014 MCS to consider');
});

test('Elevated: severe LVEF on non-LM non-Diffuse vessel (falls through High Risk)', () => {
  // BASE uses vessel: 'LAD' — severe LVEF without LM/Diffuse morphology must NOT trigger High Risk
  const c = { ...BASE, lvef: 'severe', vessel: 'LAD', last_remaining_vessel: false };
  assert.strictEqual(classify(c).haemodynamicRisk.label, 'Elevated Risk');
});

test('Cardiogenic Shock: compromised haem', () => {
  assert.strictEqual(classify({ ...BASE, haem_status: 'compromised' }).haemodynamicRisk.label, 'Cardiogenic Shock');
});
```

---

- [ ] **Step 5: Add caseFeatures tests**

```js
// ── PciClassifier — caseFeatures ─────────────────────
console.log('\n── PciClassifier — caseFeatures ────────────────────');

test('Always-present features are all included', () => {
  const labels = classify({ ...BASE }).caseFeatures.map(f => f.label);
  ['Vessel', 'Calcification', 'TIMI Flow', 'Thrombus', 'Lesion length', 'LVEF', 'Haemodynamics']
    .forEach(l => assert.ok(labels.includes(l), l + ' missing'));
});

test('Bifurcation absent when not present', () => {
  const c = { ...BASE, bifurcation: { present: false } };
  assert.ok(!classify(c).caseFeatures.some(f => f.label === 'Bifurcation'));
});

test('Bifurcation absent when bifurcation field undefined', () => {
  const c = { ...BASE };
  delete c.bifurcation;
  assert.ok(!classify(c).caseFeatures.some(f => f.label === 'Bifurcation'));
});

test('Bifurcation value assembled: SB >2.5mm · ostial · acute', () => {
  const c = { ...BASE, bifurcation: { present: true, sb_size: 'gt2.5', medina_sb: 1, sb_angle: 'acute' } };
  const bif = classify(c).caseFeatures.find(f => f.label === 'Bifurcation');
  assert.ok(bif, 'Bifurcation row missing');
  assert.strictEqual(bif.value, 'SB >2.5mm \u00b7 ostial \u00b7 acute');
  assert.strictEqual(bif.badgeStyle, 'danger');
});

test('Bifurcation value: sb_angle moderate → "moderate angle"', () => {
  const c = { ...BASE, bifurcation: { present: true, sb_size: 'gt2.5', medina_sb: 1, sb_angle: 'moderate' } };
  const bif = classify(c).caseFeatures.find(f => f.label === 'Bifurcation');
  assert.ok(bif.value.includes('moderate angle'), 'Expected "moderate angle" in value, got: ' + bif.value);
});

test('Morphology absent for Discrete', () => {
  assert.ok(!classify({ ...BASE, morphology: 'Discrete' }).caseFeatures.some(f => f.label === 'Morphology'));
});

test('Morphology absent for Tubular', () => {
  assert.ok(!classify({ ...BASE, morphology: 'Tubular' }).caseFeatures.some(f => f.label === 'Morphology'));
});

test('Morphology present for Ostial with warning style', () => {
  const morph = classify({ ...BASE, morphology: 'Ostial' }).caseFeatures.find(f => f.label === 'Morphology');
  assert.ok(morph, 'Morphology missing');
  assert.strictEqual(morph.badgeStyle, 'warning');
});

test('Calcification severe → danger badge', () => {
  const calc = classify({ ...BASE, calcification: 'severe' }).caseFeatures.find(f => f.label === 'Calcification');
  assert.strictEqual(calc.badgeStyle, 'danger');
});

test('TIMI 3 → ok badge', () => {
  const timi = classify({ ...BASE, timi: 3 }).caseFeatures.find(f => f.label === 'TIMI Flow');
  assert.strictEqual(timi.badgeStyle, 'ok');
});

test('Thrombus false → ok badge', () => {
  const thr = classify({ ...BASE, thrombus: false }).caseFeatures.find(f => f.label === 'Thrombus');
  assert.strictEqual(thr.badgeStyle, 'ok');
});

test('Haemodynamics compromised → danger badge', () => {
  const haem = classify({ ...BASE, haem_status: 'compromised' }).caseFeatures.find(f => f.label === 'Haemodynamics');
  assert.strictEqual(haem.badgeStyle, 'danger');
});

test('Feature order: Vessel < Bifurcation < TIMI Flow < LVEF < Haemodynamics', () => {
  const c = { ...BASE, bifurcation: { present: true, sb_size: 'gt2.5', medina_sb: 1 } };
  const labels = classify(c).caseFeatures.map(f => f.label);
  assert.ok(labels.indexOf('Vessel') < labels.indexOf('Bifurcation'), 'Vessel before Bifurcation');
  assert.ok(labels.indexOf('TIMI Flow') < labels.indexOf('LVEF'), 'TIMI before LVEF');
  assert.ok(labels.indexOf('LVEF') < labels.indexOf('Haemodynamics'), 'LVEF before Haemodynamics');
});
```

---

- [ ] **Step 6: Add evidence sort order test**

```js
// ── PciClassifier — evidence sort ────────────────────
console.log('\n── PciClassifier — evidence sort ───────────────────');

test('evidenceSortKey: I·A < IIa·B < Consensus < III·B', () => {
  function evidenceSortKey(rule) {
    const cls = rule.evidence && rule.evidence.class;
    const lvl = rule.evidence && rule.evidence.level;
    if (cls === 'III') return 100;
    if (!cls || !lvl) return 50;
    const co = { 'I': 0, 'IIa': 10, 'IIb': 20 }[cls];
    const lo = { 'A': 0, 'B': 1, 'C': 2 }[lvl];
    if (co === undefined || lo === undefined) return 50;
    return co + lo;
  }
  const rules = [
    { id: 'r3', evidence: { class: null, level: null, source: 'Expert' } },
    { id: 'r1', evidence: { class: 'I', level: 'A', source: 'ESC', year: 2024 } },
    { id: 'r4', evidence: { class: 'III', level: 'B', source: 'EBC', year: 2024 } },
    { id: 'r2', evidence: { class: 'IIa', level: 'B', source: 'ESC', year: 2018 } },
  ];
  const sorted = rules.slice().sort((a, b) => evidenceSortKey(a) - evidenceSortKey(b));
  assert.strictEqual(sorted[0].id, 'r1', 'I·A first');
  assert.strictEqual(sorted[1].id, 'r2', 'IIa·B second');
  assert.strictEqual(sorted[2].id, 'r3', 'Consensus third');
  assert.strictEqual(sorted[3].id, 'r4', 'III·B last');
});
```

---

- [ ] **Step 7: Run tests — verify all classifier tests fail (module missing)**

```bash
cd pci && node test/engine.test.js 2>&1 | tail -5
```

Expected: `Error: Cannot find module '../engine/classifier.js'`

---

- [ ] **Step 8: Create `pci/engine/classifier.js`**

Create the file with this exact content:

```js
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
  normal:   { display: 'Normal (>55%)',              badge: '\u2713 Preserved',        style: 'ok'     },
  mild:     { display: 'Mildly reduced (45\u201355%)', badge: '\u2192 Mild reduction',   style: 'warning' },
  moderate: { display: 'Moderately reduced (30\u201344%)', badge: '\u26a0 Elevated risk', style: 'danger' },
  severe:   { display: 'Severely reduced (<30%)',    badge: '\u26a0 Severely impaired', style: 'danger' },
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
  const vm = VESSEL_MAP[c.vessel] ?? { display: c.vessel ?? '—', badge: '', style: 'neutral' };
  features.push({ label: 'Vessel', value: vm.display, badge: vm.badge, badgeStyle: vm.style });

  // 2. Bifurcation (only if present)
  const bifFeat = bifurcationFeature(c.bifurcation, derived);
  if (bifFeat) features.push(bifFeat);

  // 3. Calcification
  const cm = CALC_BADGE[c.calcification] ?? { badge: '', style: 'neutral' };
  features.push({ label: 'Calcification', value: CALC_DISPLAY[c.calcification] ?? c.calcification, badge: cm.badge, badgeStyle: cm.style });

  // 4. TIMI Flow
  const tm = TIMI_BADGE[c.timi] ?? { badge: '', style: 'neutral' };
  features.push({ label: 'TIMI Flow', value: 'TIMI ' + c.timi, badge: tm.badge, badgeStyle: tm.style });

  // 5. Thrombus
  features.push({ label: 'Thrombus', value: c.thrombus ? 'Present' : 'None',
    badge: c.thrombus ? '\u26a0 Present' : '\u2713 Absent', badgeStyle: c.thrombus ? 'danger' : 'ok' });

  // 6. Lesion length
  let lenBadge = '', lenStyle = 'neutral';
  if (c.lesion_length_mm > 30)      { lenBadge = '\u26a0 Very long (>30mm)'; lenStyle = 'danger'; }
  else if (c.lesion_length_mm > 20) { lenBadge = '\u2192 Long (>20mm)';      lenStyle = 'warning'; }
  features.push({ label: 'Lesion length', value: c.lesion_length_mm + ' mm', badge: lenBadge, badgeStyle: lenStyle });

  // 7. Morphology (only if not Discrete or Tubular)
  if (c.morphology && !['Discrete', 'Tubular'].includes(c.morphology)) {
    features.push({ label: 'Morphology', value: c.morphology, badge: '\u26a0 Complex morphology', badgeStyle: 'warning' });
  }

  // 8. LVEF
  const lm = LVEF_MAP[c.lvef] ?? { display: c.lvef, badge: '', style: 'neutral' };
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
  const derived = _Engine.derive(caseInput);
  return {
    lesionComplexity: classifyLesion(caseInput, derived),
    haemodynamicRisk: classifyHaem(caseInput),
    caseFeatures: buildCaseFeatures(caseInput, derived),
  };
}

const PciClassifier = { classify };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PciClassifier;
} else if (typeof window !== 'undefined') {
  window.PciClassifier = PciClassifier;
}
```

---

- [ ] **Step 9: Run tests — verify all pass**

```bash
cd pci && node test/engine.test.js
```

Expected: all existing tests still pass, all new classifier tests pass, zero failures.

---

- [ ] **Step 10: Commit**

```bash
git add pci/engine/classifier.js pci/test/engine.test.js
git commit -m "feat(classifier): add PciClassifier two-axis case classification module"
```

---

## Task 2: Update `pci/index.html` — new results rendering

**Files:**
- Modify: `pci/index.html`

This task replaces the old `buildTopBlocks` / `cardEquip` / `buildStrategy` rendering path with the new classifier-driven layout. All steps are edits to the inline `<script>` block in `pci/index.html`.

---

- [ ] **Step 1: Add classifier script tag**

Find (line 690):
```html
<script src="engine/loader.js"></script>
```

Replace with:
```html
<script src="engine/loader.js"></script>
<script src="engine/classifier.js"></script>
```

---

- [ ] **Step 2: Add evidence sort helpers**

Find the comment `// ── Render results ─────────────────────────────────` (line ~1015). Insert these helper functions **before** that comment:

```js
// ── Evidence sort helpers ──────────────────────────
function evidenceSortKey(rule) {
  const cls = rule.evidence && rule.evidence.class;
  const lvl = rule.evidence && rule.evidence.level;
  if (cls === 'III') return 100;
  if (!cls || !lvl) return 50;
  const co = { 'I': 0, 'IIa': 10, 'IIb': 20 }[cls];
  const lo = { 'A': 0, 'B': 1, 'C': 2 }[lvl];
  if (co === undefined || lo === undefined) return 50;
  return co + lo;
}

function sortRulesByEvidence(rules) {
  return rules.slice().sort((a, b) => {
    const ka = evidenceSortKey(a), kb = evidenceSortKey(b);
    if (ka !== kb) return ka - kb;
    const pd = (b.priority || 1) - (a.priority || 1);
    if (pd !== 0) return pd;
    return (a.id || '').localeCompare(b.id || '');
  });
}
```

---

- [ ] **Step 3: Add axis card and classification HTML builder**

Insert after the sort helpers from Step 2:

```js
// ── Classification rendering ───────────────────────
function axisCard(title, tier) {
  return '<div style="border-radius:12px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,.08);">'
    + '<div style="background:' + tier.color + ';color:#fff;padding:13px 16px;">'
    + '<div style="font-size:9px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;opacity:.8;margin-bottom:3px;">' + h(title) + '</div>'
    + '<div style="font-size:18px;font-weight:700;line-height:1.2;">' + h(tier.label) + '</div>'
    + '</div>'
    + '<div style="background:' + tier.bgColor + ';padding:10px 16px;font-size:12px;color:#374151;line-height:1.6;">' + h(tier.summary) + '</div>'
    + '</div>';
}

function buildClassificationHtml(cl) {
  const BADGE_STYLES = {
    danger:  'background:rgba(127,29,29,.1);color:#7f1d1d;',
    warning: 'background:rgba(180,83,9,.12);color:#b45309;',
    ok:      'background:rgba(21,128,61,.12);color:#15803d;',
  };

  const axisHtml = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;">'
    + axisCard('Lesion Complexity', cl.lesionComplexity)
    + axisCard('Haemodynamic Risk', cl.haemodynamicRisk)
    + '</div>';

  const featureRows = cl.caseFeatures.map((f, i) => {
    const isLast = i === cl.caseFeatures.length - 1;
    const badgeHtml = (f.badge && f.badgeStyle !== 'neutral')
      ? '<span style="' + (BADGE_STYLES[f.badgeStyle] || '') + 'font-size:10px;font-weight:700;padding:2px 8px;border-radius:8px;">' + h(f.badge) + '</span>'
      : '';
    return '<div style="display:flex;align-items:center;justify-content:space-between;">'
      + '<div style="font-weight:600;">' + h(f.label) + '</div>'
      + '<div style="display:flex;align-items:center;gap:8px;">'
      + '<span style="font-family:monospace;font-weight:600;">' + h(f.value) + '</span>'
      + badgeHtml
      + '</div></div>'
      + (isLast ? '' : '<div style="height:1px;background:#f0ece7;"></div>');
  }).join('');

  const featHtml = '<div style="border:1px solid #e2ddd8;border-radius:12px;overflow:hidden;margin-bottom:14px;">'
    + '<div style="background:#f0ece7;padding:9px 16px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#706b66;border-bottom:1px solid #e2ddd8;">Case Features</div>'
    + '<div style="padding:12px 16px;display:flex;flex-direction:column;gap:9px;">' + featureRows + '</div>'
    + '</div>';

  return axisHtml + featHtml;
}
```

---

- [ ] **Step 4: Add recommendations HTML builder**

Insert after the classification HTML builder from Step 3:

```js
// ── Recommendations rendering ──────────────────────
const DOMAIN_SECTIONS = [
  { key: 'access',        label: 'Access' },
  { key: 'wire',          label: 'Wire' },
  { key: 'lesion_prep',   label: 'Lesion Preparation' },
  { key: 'imaging',       label: 'Imaging' },
  { key: 'stent',         label: 'Stent' },
  { key: 'bifurcation',   label: 'Bifurcation' },
  { key: 'haemodynamics', label: 'Haemodynamics' },
];

function buildEvidenceBadge(rule) {
  const cls = rule.evidence && rule.evidence.class;
  const lvl = rule.evidence && rule.evidence.level;
  const src = rule.evidence && rule.evidence.source;
  const yr  = rule.evidence && rule.evidence.year;
  const srcLine = (src || yr)
    ? '<span style="font-size:9px;color:#a8a49f;letter-spacing:.04em;">' + h((src || '') + (yr ? ' ' + yr : '')) + '</span>'
    : '';

  let badge;
  if (cls === 'III') {
    badge = '<span style="background:#fee2e2;color:#991b1b;font-size:9px;font-weight:700;padding:2px 6px;border-radius:5px;white-space:nowrap;">III' + (lvl ? ' \u00b7 ' + h(lvl) : '') + '</span>';
  } else if (cls && lvl) {
    badge = '<span style="background:#dbeafe;color:#1e40af;font-size:9px;font-weight:700;padding:2px 6px;border-radius:5px;white-space:nowrap;">' + h(cls) + ' \u00b7 ' + h(lvl) + '</span>';
  } else {
    badge = '<span style="background:#f1f5f9;color:#475569;font-size:9px;font-weight:700;padding:2px 6px;border-radius:5px;white-space:nowrap;">Consensus</span>';
  }

  return '<div style="display:flex;flex-direction:column;align-items:center;gap:2px;flex-shrink:0;margin-top:1px;">' + badge + srcLine + '</div>';
}

function buildRecommendationsHtml(ruleGroups) {
  let sectionsHtml = '';

  for (const section of DOMAIN_SECTIONS) {
    const rules = ruleGroups[section.key];
    if (!rules || !rules.length) continue;

    const rowsHtml = sortRulesByEvidence(rules).map(rule => {
      let html = '<div style="display:flex;gap:10px;align-items:flex-start;">'
        + buildEvidenceBadge(rule)
        + '<span style="color:#374151;line-height:1.5;">' + h(rule.action) + '</span>'
        + '</div>';
      if (rule.caution) {
        html += '<div style="background:#fff8f0;border:1px solid #fed7aa;border-radius:8px;padding:9px 12px;display:flex;gap:10px;align-items:flex-start;">'
          + '<div style="display:flex;flex-direction:column;align-items:center;gap:2px;flex-shrink:0;margin-top:1px;">'
          + '<span style="background:#fee2e2;color:#991b1b;font-size:9px;font-weight:700;padding:2px 6px;border-radius:5px;white-space:nowrap;">\u26a0 Caution</span>'
          + '</div>'
          + '<span style="color:#374151;line-height:1.5;">' + h(rule.caution) + '</span>'
          + '</div>';
      }
      return html;
    }).join('');

    const isLast = section === DOMAIN_SECTIONS[DOMAIN_SECTIONS.length - 1] ||
      !DOMAIN_SECTIONS.slice(DOMAIN_SECTIONS.indexOf(section) + 1).some(s => ruleGroups[s.key] && ruleGroups[s.key].length);

    sectionsHtml += '<div' + (isLast ? '' : ' style="border-bottom:1px solid #f0ece7;"') + '>'
      + '<div style="padding:9px 16px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#a8a49f;background:#fafaf9;">' + h(section.label) + '</div>'
      + '<div style="padding:10px 16px;display:flex;flex-direction:column;gap:10px;">' + rowsHtml + '</div>'
      + '</div>';
  }

  if (!sectionsHtml) return '';
  return '<div style="border:1px solid #e2ddd8;border-radius:12px;overflow:hidden;">'
    + '<div style="background:#f0ece7;padding:9px 16px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#706b66;border-bottom:1px solid #e2ddd8;">Recommendations</div>'
    + sectionsHtml
    + '</div>';
}
```

---

- [ ] **Step 5: Replace `renderResults` function**

Find and replace the entire `renderResults` function (lines ~1016–1032):

```js
// Old:
function renderResults(d) {
  const el = document.getElementById('results');
  el.innerHTML = '';

  const topHtml = buildTopBlocks(d);
  const topEl = document.createElement('div');
  topEl.innerHTML = topHtml;
  el.appendChild(topEl);

  [cardEquip(d)].filter(Boolean).forEach((html,i) => {
    const w = document.createElement('div');
    w.innerHTML = html;
    const card = w.firstElementChild;
    card.style.animationDelay = (i*0.08)+'s';
    el.appendChild(card);
  });
}
```

Replace with:

```js
function renderResults(caseInput) {
  if (!ALL_RULES.length) {
    document.getElementById('results').innerHTML = '<div style="padding:20px;color:#a8a49f;font-size:13px;">Rules failed to load — check browser console.</div>';
    return;
  }
  const classification = PciClassifier.classify(caseInput);
  const result = PciEngine.evaluate(caseInput, ALL_RULES);
  const ruleGroups = PciEngine.groupByDomain(result);
  document.getElementById('results').innerHTML =
    buildClassificationHtml(classification) + buildRecommendationsHtml(ruleGroups);
}
```

---

- [ ] **Step 6: Update `runAnalysis` to pass caseInput**

Find inside `runAnalysis()` (lines ~991–999) — the entire block from `const data = buildStrategy()` through `renderResults(data)`, including the `if (!S.bifurcation)` block between them:

```js
    const data = buildStrategy();

    if (!S.bifurcation) {
      data.medinaClass = null; data.medinaDescription = null;
      data.sideBranchMm = null; data.bifurcationStrategy = null;
    }

    renderResults(data);
```

Replace the entire block above (all 7 lines) with:

```js
    const caseInput = PciLoader.caseFromWizardState(S);

    renderResults(caseInput);
```

The `if (!S.bifurcation)` block is deleted — `caseFromWizardState` handles normalisation internally.

---

- [ ] **Step 7: Remove dead functions**

Delete the following functions in their entirety (they are no longer called):

1. `buildTopBlocks(d)` — the entire function (~line 1035–1107)
2. `cardEquip(d)` — the entire function (~line 1113–1186)
3. `buildStrategy()` — the entire function (~line 1189–1274)
4. `getMatchedRules()` — the 5-line function (~line 928–933)
5. `matchedForDomain(domain)` — the 4-line function (~line 935–938)

To locate each precisely, search for `function buildTopBlocks`, `function cardEquip`, `function buildStrategy`, `function getMatchedRules`, `function matchedForDomain` and delete the full function body including its opening comment line if present.

---

- [ ] **Step 8: Run tests to confirm engine tests still pass**

```bash
cd pci && node test/engine.test.js
```

Expected: all tests pass, zero failures.

---

- [ ] **Step 9: Smoke test in browser**

Serve the `pci/` directory over HTTP (required — `fetch()` is blocked on `file://` URLs in modern browsers):

```bash
cd pci && npx serve . --listen 8080
# then open http://localhost:8080
``` Complete a case with:
- Vessel: Left Main
- Bifurcation: present, SB >2.5mm, ostial, acute
- Calcium: Severe
- TIMI: 3
- Thrombus: No
- Length: 24mm
- Morphology: Discrete
- LVEF: Mildly reduced
- Haemodynamics: Stable

Expected results panel:
- Two axis cards: "High Complexity" (red `#dc2626`) + "Elevated Risk" (amber)
- Case features list with 8 rows (no Morphology row — Discrete is suppressed)
- Recommendations sections with evidence badges; Class III rules at end of their sections; cautions tinted amber

Also test a standard case (LAD, mild calcium, normal LVEF) — should show green "Standard" + green "Stable".

---

- [ ] **Step 10: Commit**

```bash
git add pci/index.html
git commit -m "feat(ui): replace PCI results panel with two-axis classification and evidence-sorted recommendations"
```
