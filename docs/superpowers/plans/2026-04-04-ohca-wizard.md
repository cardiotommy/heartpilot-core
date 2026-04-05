# OHCA Post-ROSC Prognostication Wizard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `ohca/index.html` — a standalone 4-step wizard that collects post-ROSC OHCA variables and calculates five prognostication scores (CAHP, MIRACLE2, CASPRI, TTM, OHCA).

**Architecture:** Mirror CVF wizard exactly: `ohca/index.html` (UI), `ohca/engine/scores.js` (pure functions), `ohca/test/scores.test.js` (Node.js test suite). Dual CommonJS/browser export pattern. No dependencies.

**Tech Stack:** Vanilla JavaScript (ES5-compatible via `var`/IIFE), HTML5, inline CSS. No build step.

---

## Spec Additions (discovered during formula research)

Formula lookup revealed variables missing from the original spec. These are added here:

| New variable | Step | Needed for |
|---|---|---|
| `initialRhythmSubtype` — PEA vs Asystole (conditional on non-shockable) | 1 | CASPRI |
| `prearrestCPC` — baseline function (CPC 1 / 2 / 3-4) | 1 | CASPRI |
| `comorbidities` — multi-select (renal/hepatic failure, malignancy, sepsis, hypotension) | 1 | CASPRI |
| `changingRhythms` — rhythm changed during resus (boolean) | 2 | MIRACLE2 |
| `pupilsReactive` — bilateral pupil reactivity at ROSC (boolean) | 3 | MIRACLE2, TTM |
| `gcsMotor` — GCS motor score M1–M6 (replaces total GCS 3-15) | 3 | TTM |
| `paco2` — arterial PaCO2 in kPa (optional) | 4 | TTM |

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `ohca/engine/scores.js` | Create | All 5 score functions + `calculateAll()` |
| `ohca/test/scores.test.js` | Create | Unit tests for every score function |
| `ohca/index.html` | Create | Wizard UI — 4 steps + results panel |

---

## Task 1: Score engine — module skeleton + CAHP

**Files:**
- Create: `ohca/engine/scores.js`
- Create: `ohca/test/scores.test.js`

Formula (confirmed from Maupain et al., Eur Heart J 2016 via MDCalc):
- Age component: `1.1 × (age − 10)`
- Setting: Home or Other = 24 pts, Public = 0
- Rhythm: Non-shockable = 27, Shockable = 0
- No-flow time: `2.8 × minutes`
- Low-flow time: `0.8 × minutes`
- pH: `585 − (77 × pH)`
- Epinephrine: 0 mg = 0, 1–2 mg = 27, ≥3 mg = 43

Tiers: <150 low · 150–200 intermediate · >200 high

- [ ] **Step 1: Write failing CAHP tests**

Create `ohca/test/scores.test.js`:

```js
'use strict';

var assert = require('assert');
var path   = require('path');
var OhcaScores = require(path.join(__dirname, '..', 'engine', 'scores.js'));

var pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log('  ✓ ' + name); pass++; }
  catch(e) { console.error('  ✗ ' + name + '\n    ' + e.message); fail++; }
}

// ── CAHP ──────────────────────────────────────────────────────────────────────
console.log('\nCAHP Score');

// Reference case: 65yo, home, non-shockable, no-flow 5min, low-flow 20min,
// pH 7.20, epi 3mg → expected high risk (score > 200)
test('CAHP: high-risk reference case', function() {
  var r = OhcaScores.cahp({
    age: 65, location: 'home', initialRhythm: 'non_shockable',
    noFlowTime: 5, lowFlowTime: 20, ph: 7.20, epinephrineDose: 3
  });
  assert.strictEqual(r.tier, 'high');
  assert.ok(r.score > 200, 'score should be >200, got ' + r.score);
});

// Low-risk case: 45yo, public, shockable, no-flow 0min, low-flow 5min,
// pH 7.38, epi 0mg
test('CAHP: low-risk case', function() {
  var r = OhcaScores.cahp({
    age: 45, location: 'public', initialRhythm: 'shockable',
    noFlowTime: 0, lowFlowTime: 5, ph: 7.38, epinephrineDose: 0
  });
  assert.strictEqual(r.tier, 'low');
  assert.ok(r.score < 150, 'score should be <150, got ' + r.score);
});

test('CAHP: epi 1mg = 27 pts, epi 2mg = 27 pts, epi 3mg = 43 pts', function() {
  var base = { age: 50, location: 'public', initialRhythm: 'shockable',
               noFlowTime: 0, lowFlowTime: 0, ph: 7.40 };
  var s0 = OhcaScores.cahp(Object.assign({}, base, { epinephrineDose: 0 })).score;
  var s1 = OhcaScores.cahp(Object.assign({}, base, { epinephrineDose: 1 })).score;
  var s2 = OhcaScores.cahp(Object.assign({}, base, { epinephrineDose: 2 })).score;
  var s3 = OhcaScores.cahp(Object.assign({}, base, { epinephrineDose: 3 })).score;
  assert.strictEqual(s1 - s0, 27);
  assert.strictEqual(s2 - s0, 27);
  assert.strictEqual(s3 - s0, 43);
});

test('CAHP: result has required fields', function() {
  var r = OhcaScores.cahp({
    age: 60, location: 'home', initialRhythm: 'shockable',
    noFlowTime: 5, lowFlowTime: 15, ph: 7.30, epinephrineDose: 1
  });
  assert.ok(typeof r.score === 'number');
  assert.ok(['low','intermediate','high'].indexOf(r.tier) >= 0);
  assert.ok(typeof r.label === 'string');
  assert.ok(typeof r.interpretation === 'string');
  assert.strictEqual(r.incomplete, false);
  assert.strictEqual(r.id, 'cahp');
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
```

- [ ] **Step 2: Run tests — confirm failure**

```bash
cd "/Users/tom/Library/CloudStorage/OneDrive-Personal/Academic Projects/heartpilot/heartpilot-core"
node ohca/test/scores.test.js
```

Expected: `Error: Cannot find module '.../scores.js'`

- [ ] **Step 3: Create scores.js with CAHP**

Create `ohca/engine/scores.js`:

```js
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
    var epi    = inputs.epinephrineDose;  // mg

    var score = 0;
    score += 1.1 * (age - 10);
    score += (loc !== 'public') ? 24 : 0;
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
    cahp:         cahp,
  };

}());

if (typeof module !== 'undefined' && module.exports) {
  module.exports = OhcaScores;
} else if (typeof window !== 'undefined') {
  window.OhcaScores = OhcaScores;
}
```

- [ ] **Step 4: Run tests — confirm pass**

```bash
node ohca/test/scores.test.js
```

Expected output: `4 passed, 0 failed`

- [ ] **Step 5: Commit**

```bash
git add ohca/engine/scores.js ohca/test/scores.test.js
git commit -m "feat(ohca): score engine skeleton + CAHP implementation"
```

---

## Task 2: Score engine — MIRACLE2

**Files:**
- Modify: `ohca/engine/scores.js`
- Modify: `ohca/test/scores.test.js`

Formula (Pareek et al., Eur Heart J 2020. doi:10.1093/eurheartj/ehaa594):
- Unwitnessed arrest: +1
- Non-shockable initial rhythm: +1
- Changing rhythms (≥2 of VF/PEA/asystole): +1
- Any epinephrine given: +2
- No bilateral pupil reactivity at ROSC: +1
- pH < 7.20: +1
- Age ≤60: 0 · 61–80: +1 · >80: +2

Tiers: ≤2 low (5.6% poor outcome) · 3–4 intermediate (55.4%) · ≥5 high (92.3%)

**Important:** Verify the exact maximum (9 or 10 points) against the original Pareek et al. paper before shipping — secondary sources differ slightly. The tier thresholds do not change.

- [ ] **Step 1: Add MIRACLE2 tests** (append to scores.test.js before the summary block)

```js
// ── MIRACLE2 ──────────────────────────────────────────────────────────────────
console.log('\nMIRACLE2 Score');

// High-risk: all adverse features
test('MIRACLE2: high-risk reference case', function() {
  var r = OhcaScores.miracle2({
    witnessed: false, initialRhythm: 'non_shockable', changingRhythms: true,
    epinephrineDose: 2, pupilsReactive: false, ph: 7.15, age: 75
  });
  assert.strictEqual(r.tier, 'high');
  assert.ok(r.score >= 5, 'expected score >=5, got ' + r.score);
});

// Low-risk: favourable features, young
test('MIRACLE2: low-risk case', function() {
  var r = OhcaScores.miracle2({
    witnessed: true, initialRhythm: 'shockable', changingRhythms: false,
    epinephrineDose: 0, pupilsReactive: true, ph: 7.38, age: 50
  });
  assert.strictEqual(r.tier, 'low');
  assert.ok(r.score <= 2, 'expected score <=2, got ' + r.score);
});

// Age bracket scoring
test('MIRACLE2: age >80 adds 2 pts, 61-80 adds 1 pt, <=60 adds 0', function() {
  var base = { witnessed: true, initialRhythm: 'shockable', changingRhythms: false,
               epinephrineDose: 0, pupilsReactive: true, ph: 7.40 };
  var s50 = OhcaScores.miracle2(Object.assign({}, base, { age: 50 })).score;
  var s70 = OhcaScores.miracle2(Object.assign({}, base, { age: 70 })).score;
  var s85 = OhcaScores.miracle2(Object.assign({}, base, { age: 85 })).score;
  assert.strictEqual(s70 - s50, 1);
  assert.strictEqual(s85 - s50, 2);
});

// Epinephrine 0mg = no points; any dose = +2
test('MIRACLE2: epi 0mg = 0 pts, any epi = +2 pts', function() {
  var base = { witnessed: true, initialRhythm: 'shockable', changingRhythms: false,
               pupilsReactive: true, ph: 7.40, age: 50 };
  var s0 = OhcaScores.miracle2(Object.assign({}, base, { epinephrineDose: 0 })).score;
  var s1 = OhcaScores.miracle2(Object.assign({}, base, { epinephrineDose: 1 })).score;
  assert.strictEqual(s1 - s0, 2);
});
```

- [ ] **Step 2: Run tests — confirm MIRACLE2 tests fail**

```bash
node ohca/test/scores.test.js
```

Expected: `TypeError: OhcaScores.miracle2 is not a function`

- [ ] **Step 3: Add miracle2() to scores.js** (inside the IIFE, before the return statement)

```js
  // ── MIRACLE2 ────────────────────────────────────────────────────────────────
  // Pareek et al., Eur Heart J 2020. doi:10.1093/eurheartj/ehaa594
  // Predicts poor neurological outcome (CPC 3–5) at 6 months.
  // Tiers: ≤2 low · 3–4 intermediate · ≥5 high

  function miracle2(inputs) {
    var score = 0;

    if (!inputs.witnessed)                    score += 1;  // unwitnessed
    if (inputs.initialRhythm === 'non_shockable') score += 1;
    if (inputs.changingRhythms)               score += 1;
    if (inputs.epinephrineDose > 0)           score += 2;
    if (!inputs.pupilsReactive)               score += 1;
    if (inputs.ph < 7.20)                     score += 1;
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
```

Also update the `return` block:

```js
  return {
    cahp:     cahp,
    miracle2: miracle2,
  };
```

- [ ] **Step 4: Run tests — confirm all pass**

```bash
node ohca/test/scores.test.js
```

Expected: `8 passed, 0 failed`

- [ ] **Step 5: Commit**

```bash
git add ohca/engine/scores.js ohca/test/scores.test.js
git commit -m "feat(ohca): add MIRACLE2 score"
```

---

## Task 3: Score engine — CASPRI

**Files:**
- Modify: `ohca/engine/scores.js`
- Modify: `ohca/test/scores.test.js`

Formula (Chan et al., JACC 2014; confirmed from PMC validation study):

| Variable | Values → Points |
|---|---|
| Age | <60→0, 60–69→1, 70–79→2, ≥80→4 |
| Initial rhythm | Witnessed VF/pVT→0, Unwitnessed VF/pVT→3, PEA→6, Asystole→7 |
| Pre-arrest CPC | CPC1→0, CPC2→2, CPC3–4→9 |
| Time to ROSC | 0–4min→0, 5–9→3, 10–14→5, 15–29→6, ≥30→8 |
| Monitored | OHCA patients: always "No" → +3 (fixed; CASPRI was derived from IHCA) |
| Comorbidities | None→0, Renal failure→2, Mech-vent/Sepsis/Hypotension→3, Hepatic failure/Malignancy→4 |

Max: 52. Survival: ≤9→high survival, 10–19→intermediate, ≥20→low survival.

**Note on rhythm input:** CASPRI distinguishes Witnessed VF, Unwitnessed VF, PEA, and Asystole. The wizard collects `initialRhythm` (shockable/non_shockable) + `witnessed` + `initialRhythmSubtype` (pea/asystole, shown only when non-shockable). Map as: shockable+witnessed→0, shockable+unwitnessed→3, non_shockable+pea→6, non_shockable+asystole→7.

**Note on comorbidities:** Only the highest-scoring category is counted (not cumulative). If patient has both hepatic failure and renal failure, score 4 (not 4+2).

- [ ] **Step 1: Add CASPRI tests**

```js
// ── CASPRI ────────────────────────────────────────────────────────────────────
console.log('\nCASPRI Score');

test('CASPRI: high-risk case (asystole, elderly, long downtime, comorbidities)', function() {
  var r = OhcaScores.caspri({
    age: 80, witnessed: false, initialRhythm: 'non_shockable',
    initialRhythmSubtype: 'asystole', prearrestCPC: 'cpc2',
    lowFlowTime: 30, comorbidities: ['renal_failure']
  });
  assert.strictEqual(r.tier, 'high');
  // age>=80=4, unwitnessed asystole=7, cpc2=2, lowFlow>=30=8, monitored=3, renal=2 → 26
  assert.strictEqual(r.score, 26);
});

test('CASPRI: low-risk case (witnessed VF, young, short downtime)', function() {
  var r = OhcaScores.caspri({
    age: 50, witnessed: true, initialRhythm: 'shockable',
    initialRhythmSubtype: null, prearrestCPC: 'cpc1',
    lowFlowTime: 3, comorbidities: []
  });
  assert.strictEqual(r.tier, 'low');
  // age<60=0, witnessed VF=0, cpc1=0, lowFlow<5=0, monitored=3 → 3
  assert.strictEqual(r.score, 3);
});

test('CASPRI: comorbidity scoring uses highest category only', function() {
  var base = { age: 60, witnessed: true, initialRhythm: 'shockable',
               initialRhythmSubtype: null, prearrestCPC: 'cpc1',
               lowFlowTime: 3 };
  var r1 = OhcaScores.caspri(Object.assign({}, base, { comorbidities: ['renal_failure'] }));
  var r2 = OhcaScores.caspri(Object.assign({}, base, { comorbidities: ['hepatic_failure'] }));
  var r3 = OhcaScores.caspri(Object.assign({}, base, { comorbidities: ['renal_failure', 'hepatic_failure'] }));
  assert.strictEqual(r1.score - r2.score, -2); // renal=2, hepatic=4
  assert.strictEqual(r3.score, r2.score);       // both present → use highest (4)
});

test('CASPRI: result has caveat field', function() {
  var r = OhcaScores.caspri({
    age: 60, witnessed: true, initialRhythm: 'shockable',
    initialRhythmSubtype: null, prearrestCPC: 'cpc1',
    lowFlowTime: 5, comorbidities: []
  });
  assert.ok(typeof r.caveat === 'string' && r.caveat.length > 0);
});
```

- [ ] **Step 2: Run tests — confirm CASPRI tests fail**

```bash
node ohca/test/scores.test.js
```

Expected: `TypeError: OhcaScores.caspri is not a function`

- [ ] **Step 3: Add caspri() to scores.js**

```js
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
```

Update `return` block:

```js
  return {
    cahp:     cahp,
    miracle2: miracle2,
    caspri:   caspri,
  };
```

- [ ] **Step 4: Run tests — confirm all pass**

```bash
node ohca/test/scores.test.js
```

Expected: `12 passed, 0 failed`

- [ ] **Step 5: Commit**

```bash
git add ohca/engine/scores.js ohca/test/scores.test.js
git commit -m "feat(ohca): add CASPRI score"
```

---

## Task 4: Score engine — TTM + OHCA (paper lookup + implement)

**Files:**
- Modify: `ohca/engine/scores.js`
- Modify: `ohca/test/scores.test.js`

Both scores require sourcing exact formulas from original papers before coding.

### TTM Risk Score — Martinell et al., Critical Care 2017

- [ ] **Step 1: Access the paper and extract scoring table**

Open: Martinell et al., *Critical Care* 2017. doi:10.1186/s13054-017-1677-2

Download Supplementary Table S1 — "TTM risk score point allocation table." It contains exact integer points for:
- Age (brackets: exact boundaries and points)
- Place of arrest: home = X pts
- First monitored rhythm: non-VF/pVT = X pts
- No-flow time (minute brackets)
- Low-flow time (minute brackets)
- Adrenaline treatment: yes = X pts
- Pupillary OR corneal reflex absent: yes = X pts
- pH (brackets)
- GCS motor score M1 (no motor response): yes = X pts
- PaCO2 < 4.5 kPa: yes = X pts

Score range: −2 to 35. Tiers: <10 low · 10–16 intermediate · >16 high.

Record all point values before proceeding.

- [ ] **Step 2: Add TTM tests using a known reference case from the paper**

```js
// ── TTM Risk Score ─────────────────────────────────────────────────────────────
console.log('\nTTM Risk Score');

// Use a reference case from Martinell et al. Table 1 or supplementary data
// Fill in inputs and expected score/tier once you have the formula:
test('TTM: result structure is correct', function() {
  var r = OhcaScores.ttm({
    age: 65, location: 'home', initialRhythm: 'non_shockable',
    noFlowTime: 5, lowFlowTime: 20, epinephrineDose: 3,
    pupilsReactive: false, ph: 7.20, gcsMotor: 1, paco2: 4.0
  });
  assert.ok(['low','intermediate','high','incomplete'].indexOf(r.tier) >= 0);
  assert.strictEqual(r.id, 'ttm');
  assert.ok(typeof r.score === 'number' || r.score === null);
});

// Add reference case once formula is confirmed:
// test('TTM: reference case from Martinell Table 1', function() { ... });

test('TTM: incomplete when paco2 absent but still calculates other variables', function() {
  var r = OhcaScores.ttm({
    age: 65, location: 'home', initialRhythm: 'non_shockable',
    noFlowTime: 5, lowFlowTime: 20, epinephrineDose: 3,
    pupilsReactive: false, ph: 7.20, gcsMotor: 1, paco2: null
  });
  // PaCO2 is optional — if null, TTM should still calculate but flag incomplete
  assert.strictEqual(r.incomplete, true);
  assert.ok(r.incompleteReason.indexOf('PaCO2') >= 0);
});
```

- [ ] **Step 3: Implement ttm() using exact points from the paper**

Inside the IIFE in `scores.js`, after `caspri`:

```js
  // ── TTM Risk Score ───────────────────────────────────────────────────────────
  // Martinell et al., Critical Care 2017. doi:10.1186/s13054-017-1677-2
  // Predicts poor neurological outcome at 180 days after OHCA.
  // Tiers: <10 low · 10–16 intermediate · >16 high (score range −2 to 35)
  // IMPORTANT: Replace the TODO values below with exact points from Table S1.

  function ttm(inputs) {
    if (inputs.paco2 === null || inputs.paco2 === undefined) {
      return {
        id: 'ttm', name: 'TTM Risk Score', score: null,
        tier: 'incomplete', label: 'Incomplete',
        interpretation: 'Predicts poor neurological outcome at 180 days.',
        thresholds: { low: '<10', intermediate: '10\u201316', high: '>16' },
        reference: { authors: 'Martinell et al.', journal: 'Critical Care', year: 2017 },
        predicts: 'mortality', horizon: '180 days',
        incomplete: true,
        incompleteReason: 'PaCO2 required for TTM score (enter in Labs step)'
      };
    }

    var score = 0;

    // Age — replace TODO_XX with exact points from Table S1
    // e.g.: if (inputs.age >= 80) score += TODO_XX;
    // else if (inputs.age >= 70) score += TODO_XX; ... etc.
    // TODO: implement age points from Table S1

    // Place of arrest: home
    // score += (inputs.location !== 'public') ? TODO_XX : 0;

    // First monitored rhythm: non-VF/pVT
    // score += (inputs.initialRhythm === 'non_shockable') ? TODO_XX : 0;

    // No-flow time — brackets from Table S1
    // TODO: implement no-flow time brackets

    // Low-flow time — brackets from Table S1
    // TODO: implement low-flow time brackets

    // Adrenaline
    // score += (inputs.epinephrineDose > 0) ? TODO_XX : 0;

    // Pupillary or corneal reflex absent
    // score += (!inputs.pupilsReactive) ? TODO_XX : 0;

    // pH — brackets from Table S1
    // TODO: implement pH brackets

    // GCS motor M1 (no motor response = 1)
    // score += (inputs.gcsMotor === 1) ? TODO_XX : 0;

    // PaCO2 < 4.5 kPa
    // score += (inputs.paco2 < 4.5) ? TODO_XX : 0;

    var tier  = score < 10 ? 'low' : score <= 16 ? 'intermediate' : 'high';
    var label = tier === 'low' ? 'Low Risk' : tier === 'intermediate' ? 'Intermediate Risk' : 'High Risk';

    return {
      id: 'ttm', name: 'TTM Risk Score',
      score: score, tier: tier, label: label,
      interpretation: 'Predicts poor neurological outcome at 180 days after OHCA.',
      thresholds: { low: '<10', intermediate: '10\u201316', high: '>16' },
      reference: { authors: 'Martinell et al.', journal: 'Critical Care', year: 2017 },
      predicts: 'mortality', horizon: '180 days',
      incomplete: false, incompleteReason: null
    };
  }
```

### OHCA Score — Adrie et al., Eur Heart J 2006

- [ ] **Step 4: Access the paper and extract regression coefficients**

Open: Adrie C et al., *Eur Heart J* 2006. doi:10.1093/eurheartj/ehl336 (PMID 17082207)

Find the logistic regression model table (Table 3 or equivalent). Extract:
- Intercept (constant term)
- Coefficient β for shockable initial rhythm (binary 0/1)
- Coefficient β for no-flow time (minutes, continuous)
- Coefficient β for low-flow time (minutes, continuous)
- Coefficient β for lactate (mmol/L, continuous)
- Coefficient β for creatinine (µmol/L, continuous)

The score is a predicted probability: `p = 1 / (1 + exp(−(intercept + β1·shockable + β2·noFlow + β3·lowFlow + β4·lactate + β5·creatinine)))`

Tiers by predicted probability of *favourable* outcome: determine from the paper's Appendix or validation cohort ROC analysis.

- [ ] **Step 5: Add OHCA score tests**

```js
// ── OHCA Score ────────────────────────────────────────────────────────────────
console.log('\nOHCA Score');

test('OHCA: incomplete when creatinine absent', function() {
  var r = OhcaScores.ohca({
    initialRhythm: 'shockable', noFlowTime: 0, lowFlowTime: 5,
    lactate: 2.1, creatinine: null
  });
  assert.strictEqual(r.incomplete, true);
  assert.ok(r.incompleteReason.indexOf('creatinine') >= 0 || r.incompleteReason.indexOf('Creatinine') >= 0);
});

test('OHCA: result structure correct', function() {
  var r = OhcaScores.ohca({
    initialRhythm: 'shockable', noFlowTime: 0, lowFlowTime: 5,
    lactate: 2.1, creatinine: 90
  });
  assert.strictEqual(r.id, 'ohca');
  assert.ok(['low','intermediate','high','incomplete'].indexOf(r.tier) >= 0);
});

// Add reference case once formula is confirmed:
// test('OHCA: reference case from Adrie Table 3', function() { ... });
```

- [ ] **Step 6: Implement ohca() using regression coefficients from the paper**

```js
  // ── OHCA Score ───────────────────────────────────────────────────────────────
  // Adrie et al., Eur Heart J 2006. doi:10.1093/eurheartj/ehl336
  // Predicts survival with good neurological outcome (CPC 1–2) at hospital discharge.
  // Uses logistic regression: p = 1 / (1 + exp(−logOdds))
  // IMPORTANT: Replace TODO coefficients with values from the paper's regression table.

  function ohca(inputs) {
    if (inputs.creatinine === null || inputs.creatinine === undefined) {
      return {
        id: 'ohca', name: 'OHCA Score', score: null,
        tier: 'incomplete', label: 'Incomplete',
        interpretation: 'Predicts survival with good neurological outcome (CPC 1\u20132).',
        thresholds: {},
        reference: { authors: 'Adrie et al.', journal: 'Eur Heart J', year: 2006 },
        predicts: 'neurological', horizon: 'hospital discharge',
        incomplete: true,
        incompleteReason: 'Creatinine required for OHCA score (enter in Labs step)'
      };
    }

    var shockable  = (inputs.initialRhythm === 'shockable') ? 1 : 0;
    var noFlow     = inputs.noFlowTime;
    var lowFlow    = inputs.lowFlowTime;
    var lactate    = inputs.lactate;
    var creatinine = inputs.creatinine;

    // TODO: replace with exact values from Adrie et al. regression table
    var INTERCEPT = 0;   // replace
    var B_SHOCK   = 0;   // replace — positive coefficient (shockable favourable)
    var B_NOFLOW  = 0;   // replace — negative coefficient (longer = worse)
    var B_LOWFLOW = 0;   // replace — negative coefficient
    var B_LACT    = 0;   // replace — negative coefficient
    var B_CREAT   = 0;   // replace — negative coefficient

    var logOdds = INTERCEPT
      + B_SHOCK   * shockable
      + B_NOFLOW  * noFlow
      + B_LOWFLOW * lowFlow
      + B_LACT    * lactate
      + B_CREAT   * creatinine;

    var prob  = 1 / (1 + Math.exp(-logOdds));
    var pct   = Math.round(prob * 100);

    // TODO: set tier boundaries from paper's validation ROC or Appendix
    var tier  = prob >= 0.5 ? 'low' : prob >= 0.2 ? 'intermediate' : 'high';
    var label = tier === 'low' ? 'Low Risk' : tier === 'intermediate' ? 'Intermediate Risk' : 'High Risk';

    return {
      id: 'ohca', name: 'OHCA Score',
      score: pct,  // display as % probability of favourable outcome
      tier: tier, label: label,
      interpretation: 'Predicted probability of survival with good neurological outcome (CPC 1\u20132): ' + pct + '%.',
      thresholds: {},  // TODO: add from paper
      reference: { authors: 'Adrie et al.', journal: 'Eur Heart J', year: 2006 },
      predicts: 'neurological', horizon: 'hospital discharge',
      incomplete: false, incompleteReason: null
    };
  }
```

- [ ] **Step 7: Add calculateAll() and update exports**

```js
  // ── calculateAll ────────────────────────────────────────────────────────────

  function calculateAll(inputs) {
    return [
      cahp(inputs),
      miracle2(inputs),
      ttm(inputs),
      ohca(inputs),
      caspri(inputs),
    ];
  }
```

Update `return` block:

```js
  return {
    cahp:         cahp,
    miracle2:     miracle2,
    caspri:       caspri,
    ttm:          ttm,
    ohca:         ohca,
    calculateAll: calculateAll,
  };
```

- [ ] **Step 8: Add calculateAll test**

```js
// ── calculateAll ──────────────────────────────────────────────────────────────
console.log('\ncalculateAll');

test('calculateAll: returns array of 5 results', function() {
  var results = OhcaScores.calculateAll({
    age: 65, location: 'home', initialRhythm: 'non_shockable',
    initialRhythmSubtype: 'pea', witnessed: false, bystanderCPR: false,
    refractoryVF: false, changingRhythms: true, prearrestCPC: 'cpc1',
    comorbidities: [], noFlowTime: 5, lowFlowTime: 20, epinephrineDose: 2,
    pupilsReactive: false, gcsMotor: 1, stemiEcg: 'none', lvef: 'unknown',
    haemStatus: 'stable', ph: 7.25, lactate: 5.0, glucose: 8.0,
    creatinine: 110, paco2: 4.2
  });
  assert.strictEqual(results.length, 5);
  var ids = results.map(function(r) { return r.id; });
  assert.ok(ids.indexOf('cahp') >= 0);
  assert.ok(ids.indexOf('miracle2') >= 0);
  assert.ok(ids.indexOf('caspri') >= 0);
  assert.ok(ids.indexOf('ttm') >= 0);
  assert.ok(ids.indexOf('ohca') >= 0);
});
```

- [ ] **Step 9: Run full test suite**

```bash
node ohca/test/scores.test.js
```

Expected: all tests pass except any TTM/OHCA reference-case tests you've left as TODO until formulas are confirmed from papers.

- [ ] **Step 10: Commit**

```bash
git add ohca/engine/scores.js ohca/test/scores.test.js
git commit -m "feat(ohca): add TTM + OHCA stubs, calculateAll; complete score engine"
```

---

## Task 5: Wizard HTML — skeleton, header, step 1 (Arrest)

**Files:**
- Create: `ohca/index.html`

Base this on `cvf/index.html`. Key differences: red accent (`#c0392b`) instead of teal, 4 steps instead of CVF's steps, OHCA title, load `engine/scores.js` instead of `engine/interpreter.js`.

- [ ] **Step 1: Create ohca/index.html with head, CSS, header, progress bar**

The complete file is large. Build it in stages within this step. Start with the HTML skeleton:

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="color-scheme" content="light">
<title>HeartPilot — OHCA Risk Scores</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
html{color-scheme:light;background:#f7f5f2;}
@media(prefers-color-scheme:dark){html,body{color-scheme:light;background:#f7f5f2!important;color:#1a1714!important;filter:none!important;}}
:root{
  --bg:#f7f5f2;--s1:#ffffff;--s2:#f0ece7;--s3:#e8e3dd;
  --border:#e2ddd8;--border2:#ccc7c0;
  --red:#c0392b;--redg:rgba(192,57,43,.10);
  --amber:#b45309;--amberg:rgba(180,83,9,.10);
  --green:#15803d;--greeng:rgba(21,128,61,.10);
  --blue:#1d5fa8;--blueg:rgba(29,95,168,.10);
  --text:#1a1714;--dim:#706b66;--muted:#a8a49f;
  --shadow-sm:0 1px 3px rgba(26,23,20,.06),0 1px 2px rgba(26,23,20,.04);
  --shadow-md:0 4px 16px rgba(26,23,20,.08),0 2px 6px rgba(26,23,20,.05);
  --mono:'JetBrains Mono',monospace;--sans:'DM Sans',system-ui,sans-serif;--serif:'DM Serif Display',Georgia,serif;
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--text);font-family:var(--sans);font-size:15px;min-height:100vh;overflow:hidden;-webkit-font-smoothing:antialiased;}
body::before{content:'';position:fixed;inset:0;background-image:radial-gradient(circle at 20% 0%,rgba(192,57,43,.025) 0%,transparent 50%),radial-gradient(circle at 80% 100%,rgba(192,57,43,.02) 0%,transparent 50%);pointer-events:none;z-index:0;}
body::after{content:'';position:fixed;inset:0;background-image:radial-gradient(circle,rgba(112,107,102,.16) 1px,transparent 1px);background-size:28px 28px;opacity:.4;pointer-events:none;z-index:0;}
.app{position:relative;z-index:1;display:flex;flex-direction:column;height:100vh;min-height:500px;overflow:hidden;}
header{display:flex;align-items:center;justify-content:space-between;padding:0 24px;height:50px;background:rgba(255,255,255,.92);border-bottom:1px solid var(--border);flex-shrink:0;backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);position:sticky;top:0;z-index:100;}
.brand{display:flex;align-items:center;gap:10px;text-decoration:none;color:var(--text);}
.brand-icon{width:32px;height:32px;border:1.5px solid var(--red);border-radius:6px;display:grid;place-items:center;color:var(--red);background:var(--redg);box-shadow:0 0 0 3px rgba(192,57,43,.07);}
.brand-name{font-family:var(--serif);font-size:16px;font-weight:400;letter-spacing:.01em;}
.brand-sub{font-family:var(--mono);font-size:9px;color:var(--muted);letter-spacing:.14em;text-transform:uppercase;margin-top:1px;}
.hub-link{font-family:var(--mono);font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);text-decoration:none;display:flex;align-items:center;gap:5px;padding:4px 8px;border:1px solid var(--border);border-radius:5px;background:var(--s1);transition:color .15s,border-color .15s;}
.hub-link:hover{color:var(--red);border-color:var(--red);}
.disclaimer{font-family:var(--mono);font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);padding:3px 9px;border:1px solid var(--border2);border-radius:100px;background:var(--s1);}
/* Progress */
.progress-bar{display:flex;align-items:center;padding:0 24px;height:36px;background:var(--s1);border-bottom:1px solid var(--border);overflow-x:auto;flex-shrink:0;}
.progress-bar::-webkit-scrollbar{display:none;}
.snode{display:flex;align-items:center;gap:6px;font-family:var(--mono);font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);padding:0 10px;height:100%;border-bottom:2px solid transparent;white-space:nowrap;transition:color .2s,border-color .2s;}
.snode.active{color:var(--text);border-bottom-color:var(--red);font-weight:600;}
.snode.done{color:var(--green);border-bottom-color:var(--green);}
.snode-num{width:16px;height:16px;border-radius:50%;border:1px solid currentColor;display:grid;place-items:center;font-size:8px;font-weight:600;flex-shrink:0;}
.snode.done .snode-num{background:var(--green);border-color:var(--green);color:#fff;font-size:7px;}
.ssep{width:14px;height:1px;background:var(--border2);flex-shrink:0;}
/* Main */
.main{display:flex;flex-direction:column;flex:1;overflow:hidden;min-height:0;}
.main.results-done{flex:none;height:auto;overflow:visible;}
body.results-done{overflow:auto;height:auto;}
/* Wizard panel */
.wizard-panel{display:flex;flex-direction:column;flex:1;overflow:hidden;}
.wizard-scroll{flex:1;overflow-y:auto;padding:24px 28px;min-height:200px;}
.wizard-scroll::-webkit-scrollbar{width:3px;}
.wizard-scroll::-webkit-scrollbar-thumb{background:var(--border2);border-radius:2px;}
.step{display:none;flex-direction:column;gap:16px;}
.step.active{display:flex;animation:fadeUp .15s ease both;}
@keyframes fadeUp{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:translateY(0);}}
.step-title{font-family:var(--serif);font-size:20px;font-weight:400;color:var(--text);line-height:1.25;}
.step-sub{font-size:13px;color:var(--dim);line-height:1.6;margin-top:-8px;}
/* Wizard footer */
.wizard-foot{display:flex;align-items:center;justify-content:flex-end;padding:12px 24px;border-top:1px solid var(--border);background:var(--s1);flex-shrink:0;gap:12px;}
.btn-next{font-family:var(--mono);font-size:10px;text-transform:uppercase;letter-spacing:.1em;padding:9px 22px;border-radius:6px;border:none;background:var(--red);color:#fff;cursor:pointer;transition:opacity .15s;display:flex;align-items:center;gap:7px;}
.btn-next:disabled{opacity:.35;cursor:not-allowed;}
.btn-next:not(:disabled):hover{opacity:.85;}
.btn-back{font-family:var(--mono);font-size:10px;text-transform:uppercase;letter-spacing:.1em;padding:9px 16px;border-radius:6px;border:1px solid var(--border2);background:var(--s1);color:var(--dim);cursor:pointer;transition:opacity .15s;}
.btn-back:hover{opacity:.75;}
/* Input groups */
.inp-group{display:flex;flex-direction:column;gap:6px;}
.inp-label{font-family:var(--mono);font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:var(--dim);}
.inp-label span{font-weight:600;color:var(--text);}
.inp-row{display:flex;align-items:center;gap:10px;}
.inp-field{border:1.5px solid var(--border);border-radius:7px;padding:9px 13px;font-family:var(--mono);font-size:15px;font-weight:500;background:var(--s1);color:var(--text);width:130px;transition:border-color .15s;outline:none;}
.inp-field:focus{border-color:var(--red);}
.inp-hint{font-size:12px;color:var(--muted);}
/* Option cards */
.ocard{display:flex;align-items:center;gap:10px;padding:10px 14px;border:1.5px solid var(--border);border-radius:8px;cursor:pointer;user-select:none;transition:border-color .12s,background .12s;font-size:14px;}
.ocard:hover{border-color:var(--border2);background:var(--s3);}
.ocard.sel{border-color:rgba(192,57,43,.45);background:var(--redg);}
.ocard-row{display:flex;flex-wrap:wrap;gap:8px;}
/* Toggle buttons */
.tog{font-family:var(--mono);font-size:11px;padding:8px 16px;border-radius:6px;border:1.5px solid var(--border);background:var(--s1);cursor:pointer;transition:background .12s,border-color .12s,color .12s;}
.tog:hover{background:var(--s3);}
.tog.sy{background:var(--greeng);border-color:var(--green);color:var(--green);font-weight:600;}
.tog.sn{background:var(--redg);border-color:var(--red);color:var(--red);font-weight:600;}
.tog-row{display:flex;gap:8px;}
/* Check list (multi-select comorbidities) */
.chk-list{display:flex;flex-direction:column;gap:8px;}
.chk-item{display:flex;align-items:center;gap:12px;padding:10px 14px;border:1.5px solid var(--border);border-radius:8px;cursor:pointer;transition:border-color .15s,background .15s;user-select:none;}
.chk-item:hover{border-color:var(--red);background:var(--redg);}
.chk-item.selected{border-color:var(--red);background:var(--redg);}
.chk-box{width:18px;height:18px;border-radius:4px;border:1.5px solid var(--border2);background:var(--s1);display:grid;place-items:center;flex-shrink:0;transition:background .15s,border-color .15s;}
.chk-item.selected .chk-box{background:var(--red);border-color:var(--red);}
.chk-check{display:none;color:#fff;}
.chk-item.selected .chk-check{display:block;}
.chk-label{font-size:14px;font-weight:500;}
.chk-sub{font-size:12px;color:var(--dim);margin-top:1px;}
/* Divider */
.inp-divider{height:1px;background:var(--border);margin:4px 0;}
/* Slider */
.slider-row{display:flex;align-items:center;gap:12px;}
.slider-wrap{flex:1;position:relative;padding-top:4px;}
.inp-slider{-webkit-appearance:none;appearance:none;width:100%;height:4px;border-radius:2px;outline:none;cursor:pointer;border:none;padding:0;display:block;}
.inp-slider::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;border-radius:50%;background:var(--text);border:2.5px solid var(--s1);box-shadow:0 0 0 1.5px var(--border2);cursor:pointer;margin-top:-7px;}
.inp-slider::-webkit-slider-runnable-track{height:4px;border-radius:2px;}
.inp-slider::-moz-range-thumb{width:18px;height:18px;border-radius:50%;background:var(--text);border:none;box-shadow:0 0 0 1.5px var(--border2);cursor:pointer;}
.inp-slider::-moz-range-track{height:4px;border-radius:2px;background:transparent;}
.inp-val{border:1.5px solid var(--border);border-radius:7px;padding:9px 10px;font-family:var(--mono);font-size:15px;font-weight:500;background:var(--s1);color:var(--text);width:88px;text-align:center;transition:border-color .15s;outline:none;flex-shrink:0;}
.inp-val:focus{border-color:var(--red);}
.slider-hint{display:flex;justify-content:space-between;font-family:var(--mono);font-size:9px;letter-spacing:.06em;text-transform:uppercase;margin-top:6px;}
/* Results */
.results-panel{display:none;padding:20px 24px 36px;flex-direction:column;gap:14px;max-width:680px;margin:0 auto;width:100%;}
.main.results-done .results-panel{display:flex;}
.main.results-done .wizard-panel{display:none;}
/* Score grid */
.score-grid{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--border);border:1px solid var(--border);border-radius:12px;overflow:hidden;}
.score-cell{background:var(--s1);padding:14px 16px;display:flex;flex-direction:column;gap:4px;}
.score-cell.full-width{grid-column:1/-1;}
.score-name{font-family:var(--mono);font-size:9px;text-transform:uppercase;letter-spacing:.12em;color:var(--muted);}
.score-value{font-size:22px;font-weight:700;line-height:1;}
.score-badge{font-family:var(--mono);font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:2px 8px;border-radius:10px;align-self:flex-start;margin-top:2px;}
.score-badge.low{background:var(--greeng);color:var(--green);}
.score-badge.intermediate{background:var(--amberg);color:var(--amber);}
.score-badge.high{background:var(--redg);color:var(--red);}
.score-badge.incomplete{background:var(--s3);color:var(--muted);}
/* Detail cards */
.detail-card{border:1px solid var(--border);border-radius:12px;overflow:hidden;}
.detail-head{padding:12px 16px;color:#fff;display:flex;justify-content:space-between;align-items:flex-start;}
.detail-head.low{background:var(--green);}
.detail-head.intermediate{background:var(--amber);}
.detail-head.high{background:var(--red);}
.detail-head.incomplete{background:var(--muted);}
.detail-score-name{font-family:var(--mono);font-size:9px;text-transform:uppercase;letter-spacing:.12em;opacity:.85;margin-bottom:4px;}
.detail-score-val{font-family:var(--serif);font-size:22px;}
.detail-body{padding:14px 16px;font-size:13px;color:var(--dim);line-height:1.7;display:flex;flex-direction:column;gap:8px;}
.detail-row{display:flex;gap:8px;}
.detail-lbl{font-family:var(--mono);font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);flex-shrink:0;width:90px;padding-top:1px;}
.caveat-box{background:var(--amberg);border:1px solid rgba(180,83,9,.25);border-radius:7px;padding:9px 12px;font-size:12px;color:#92400e;line-height:1.6;}
/* New case */
.new-case-wrap{text-align:center;padding-top:4px;}
.btn-new{font-family:var(--mono);font-size:10px;text-transform:uppercase;letter-spacing:.1em;padding:10px 24px;border-radius:6px;border:1.5px solid var(--border2);background:var(--s1);color:var(--dim);cursor:pointer;transition:color .15s,border-color .15s;}
.btn-new:hover{color:var(--red);border-color:var(--red);}
/* Conditional visibility */
.cond{display:none;}
.cond.show{display:flex;}
@media(max-width:640px){
  header{padding:0 16px;height:46px;}
  .wizard-scroll{padding:18px 18px;}
  .results-panel{padding:16px 16px 32px;}
  .score-grid{grid-template-columns:1fr;}
  .score-cell.full-width{grid-column:1;}
}
</style>
</head>
<body>
<div class="app" id="app">

<header>
  <a class="brand" href="../index.html">
    <div class="brand-icon">
      <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
    </div>
    <div>
      <div class="brand-name">HeartPilot</div>
      <div class="brand-sub">OHCA · Post-ROSC</div>
    </div>
  </a>
  <div class="disclaimer">Research use only — not for clinical decisions</div>
</header>

<div class="progress-bar" id="pbar"></div>

<div class="main" id="main">
  <div class="wizard-panel">
    <div class="wizard-scroll">

      <!-- Step 0: Arrest -->
      <div class="step active" id="step-0">
        <div class="step-title">Arrest Characteristics</div>
        <div class="step-sub">Initial rhythm, location, and pre-arrest status</div>

        <div class="inp-group">
          <div class="inp-label">Age <span id="age-val">—</span> years</div>
          <div class="slider-row">
            <div class="slider-wrap">
              <input class="inp-slider" type="range" min="18" max="100" value="60"
                oninput="setAge(+this.value)"
                style="background:linear-gradient(to right,var(--text) 0%,var(--text) calc((60-18)/(100-18)*100%),var(--border) calc((60-18)/(100-18)*100%),var(--border) 100%)">
            </div>
            <input class="inp-val" type="number" min="18" max="100" value="60"
              oninput="setAge(+this.value)" id="age-input">
          </div>
          <div class="slider-hint"><span>18</span><span>100</span></div>
        </div>

        <div class="inp-divider"></div>

        <div class="inp-group">
          <div class="inp-label">Initial Rhythm</div>
          <div class="ocard-row">
            <button class="ocard" id="rhy-shock" onclick="setRhythm('shockable')">
              <span>⚡</span><span>Shockable (VF / pVT)</span>
            </button>
            <button class="ocard" id="rhy-nonshock" onclick="setRhythm('non_shockable')">
              <span>—</span><span>Non-shockable (PEA / Asystole)</span>
            </button>
          </div>
        </div>

        <!-- Conditional: Shockable subtype -->
        <div class="inp-group cond" id="cond-refractory">
          <div class="inp-label">Refractory VF?</div>
          <div class="inp-hint" style="font-size:12px;margin-top:-4px;">Three or more shocks required</div>
          <div class="tog-row">
            <button class="tog" id="ref-y" onclick="setRefractoryVF(true)">Yes</button>
            <button class="tog" id="ref-n" onclick="setRefractoryVF(false)">No</button>
          </div>
        </div>

        <!-- Conditional: Non-shockable subtype -->
        <div class="inp-group cond" id="cond-nonshock-sub">
          <div class="inp-label">Non-shockable Subtype</div>
          <div class="ocard-row">
            <button class="ocard" id="sub-pea" onclick="setRhythmSubtype('pea')">PEA</button>
            <button class="ocard" id="sub-asystole" onclick="setRhythmSubtype('asystole')">Asystole</button>
          </div>
        </div>

        <div class="inp-group">
          <div class="inp-label">Witnessed Collapse</div>
          <div class="tog-row">
            <button class="tog" id="wit-y" onclick="setWitnessed(true)">Yes</button>
            <button class="tog" id="wit-n" onclick="setWitnessed(false)">No</button>
          </div>
        </div>

        <div class="inp-group">
          <div class="inp-label">Location of Arrest</div>
          <div class="ocard-row">
            <button class="ocard" id="loc-public" onclick="setLocation('public')">Public place</button>
            <button class="ocard" id="loc-home" onclick="setLocation('home')">Home</button>
            <button class="ocard" id="loc-other" onclick="setLocation('other')">Other</button>
          </div>
        </div>

        <div class="inp-group">
          <div class="inp-label">Bystander CPR</div>
          <div class="tog-row">
            <button class="tog" id="byst-y" onclick="setBystanderCPR(true)">Yes</button>
            <button class="tog" id="byst-n" onclick="setBystanderCPR(false)">No</button>
          </div>
        </div>

        <div class="inp-divider"></div>

        <div class="inp-group">
          <div class="inp-label">Pre-arrest Function (CPC)</div>
          <div class="inp-hint" style="font-size:12px;margin-top:-4px;">Baseline cerebral performance before this arrest</div>
          <div class="ocard-row">
            <button class="ocard" id="cpc-1" onclick="setPrearrestCPC('cpc1')">CPC 1 — Normal / mild disability</button>
            <button class="ocard" id="cpc-2" onclick="setPrearrestCPC('cpc2')">CPC 2 — Moderate disability</button>
            <button class="ocard" id="cpc-34" onclick="setPrearrestCPC('cpc3_4')">CPC 3–4 — Severe disability</button>
          </div>
        </div>

        <div class="inp-group">
          <div class="inp-label">Pre-existing Comorbidities</div>
          <div class="inp-hint" style="font-size:12px;margin-top:-4px;">Select all that apply (for CASPRI score)</div>
          <div class="chk-list">
            <div class="chk-item" id="chk-none" onclick="toggleComorbidity('none')">
              <div class="chk-box"><svg class="chk-check" width="10" height="10" viewBox="0 0 10 10"><polyline points="1.5,5 4,7.5 8.5,2.5" stroke="white" stroke-width="1.5" fill="none"/></svg></div>
              <div><div class="chk-label">None</div></div>
            </div>
            <div class="chk-item" id="chk-renal" onclick="toggleComorbidity('renal_failure')">
              <div class="chk-box"><svg class="chk-check" width="10" height="10" viewBox="0 0 10 10"><polyline points="1.5,5 4,7.5 8.5,2.5" stroke="white" stroke-width="1.5" fill="none"/></svg></div>
              <div><div class="chk-label">Renal failure</div></div>
            </div>
            <div class="chk-item" id="chk-sepsis" onclick="toggleComorbidity('sepsis')">
              <div class="chk-box"><svg class="chk-check" width="10" height="10" viewBox="0 0 10 10"><polyline points="1.5,5 4,7.5 8.5,2.5" stroke="white" stroke-width="1.5" fill="none"/></svg></div>
              <div><div class="chk-label">Sepsis / hypotension</div></div>
            </div>
            <div class="chk-item" id="chk-hepatic" onclick="toggleComorbidity('hepatic_failure')">
              <div class="chk-box"><svg class="chk-check" width="10" height="10" viewBox="0 0 10 10"><polyline points="1.5,5 4,7.5 8.5,2.5" stroke="white" stroke-width="1.5" fill="none"/></svg></div>
              <div><div class="chk-label">Hepatic failure</div></div>
            </div>
            <div class="chk-item" id="chk-malignancy" onclick="toggleComorbidity('malignancy')">
              <div class="chk-box"><svg class="chk-check" width="10" height="10" viewBox="0 0 10 10"><polyline points="1.5,5 4,7.5 8.5,2.5" stroke="white" stroke-width="1.5" fill="none"/></svg></div>
              <div><div class="chk-label">Active malignancy</div></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Step 1: Resuscitation -->
      <div class="step" id="step-1">
        <div class="step-title">Resuscitation</div>
        <div class="step-sub">Time intervals, epinephrine, and rhythm behaviour</div>

        <div class="inp-group">
          <div class="inp-label">No-flow Time — <span id="nf-val">0</span> min</div>
          <div class="inp-hint" style="font-size:12px;margin-top:-4px;">Collapse to first CPR (0 if witnessed + immediate)</div>
          <div class="slider-row">
            <div class="slider-wrap">
              <input class="inp-slider" type="range" min="0" max="30" value="0"
                oninput="setNoFlow(+this.value)"
                style="background:linear-gradient(to right,var(--text) 0%,var(--text) 0%,var(--border) 0%,var(--border) 100%)">
            </div>
            <input class="inp-val" type="number" min="0" max="30" value="0"
              oninput="setNoFlow(+this.value)" id="nf-input">
          </div>
          <div class="slider-hint"><span>0 min</span><span>30 min</span></div>
        </div>

        <div class="inp-group">
          <div class="inp-label">Low-flow Time — <span id="lf-val">0</span> min</div>
          <div class="inp-hint" style="font-size:12px;margin-top:-4px;">CPR start to ROSC</div>
          <div class="slider-row">
            <div class="slider-wrap">
              <input class="inp-slider" type="range" min="0" max="90" value="0"
                oninput="setLowFlow(+this.value)"
                style="background:linear-gradient(to right,var(--text) 0%,var(--text) 0%,var(--border) 0%,var(--border) 100%)">
            </div>
            <input class="inp-val" type="number" min="0" max="90" value="0"
              oninput="setLowFlow(+this.value)" id="lf-input">
          </div>
          <div class="slider-hint"><span>0 min</span><span>90 min</span></div>
        </div>

        <div class="inp-group">
          <div class="inp-label">Total Epinephrine — <span id="epi-val">0</span> mg</div>
          <div class="slider-row">
            <div class="slider-wrap">
              <input class="inp-slider" type="range" min="0" max="20" step="1" value="0"
                oninput="setEpi(+this.value)"
                style="background:linear-gradient(to right,var(--text) 0%,var(--text) 0%,var(--border) 0%,var(--border) 100%)">
            </div>
            <input class="inp-val" type="number" min="0" max="20" value="0"
              oninput="setEpi(+this.value)" id="epi-input">
          </div>
          <div class="slider-hint"><span>0 mg</span><span>20 mg</span></div>
        </div>

        <div class="inp-group">
          <div class="inp-label">Changing Rhythms During Resuscitation</div>
          <div class="inp-hint" style="font-size:12px;margin-top:-4px;">Two or more of VF / PEA / asystole observed</div>
          <div class="tog-row">
            <button class="tog" id="chgr-y" onclick="setChangingRhythms(true)">Yes</button>
            <button class="tog" id="chgr-n" onclick="setChangingRhythms(false)">No</button>
          </div>
        </div>
      </div>

      <!-- Step 2: On Arrival -->
      <div class="step" id="step-2">
        <div class="step-title">On Arrival</div>
        <div class="step-sub">Haemodynamics, neurology, and initial ECG</div>

        <div class="inp-group">
          <div class="inp-label">Haemodynamic Status</div>
          <div class="ocard-row">
            <button class="ocard" id="haem-stable" onclick="setHaem('stable')">Stable</button>
            <button class="ocard" id="haem-shock" onclick="setHaem('shock')">Cardiogenic shock</button>
          </div>
        </div>

        <div class="inp-group">
          <div class="inp-label">GCS Motor Score at Arrival</div>
          <div class="inp-hint" style="font-size:12px;margin-top:-4px;">M1=no response · M2=extension · M3=flexion · M4=withdrawal · M5=localises · M6=obeys</div>
          <div class="ocard-row">
            <button class="ocard" id="gcs-1" onclick="setGCSMotor(1)">M1</button>
            <button class="ocard" id="gcs-2" onclick="setGCSMotor(2)">M2</button>
            <button class="ocard" id="gcs-3" onclick="setGCSMotor(3)">M3</button>
            <button class="ocard" id="gcs-4" onclick="setGCSMotor(4)">M4</button>
            <button class="ocard" id="gcs-5" onclick="setGCSMotor(5)">M5</button>
            <button class="ocard" id="gcs-6" onclick="setGCSMotor(6)">M6</button>
          </div>
        </div>

        <div class="inp-group">
          <div class="inp-label">Pupil Reactivity at ROSC</div>
          <div class="ocard-row">
            <button class="ocard" id="pup-react" onclick="setPupils(true)">Reactive (bilateral)</button>
            <button class="ocard" id="pup-fixed" onclick="setPupils(false)">Fixed / unreactive</button>
          </div>
        </div>

        <div class="inp-group">
          <div class="inp-label">First Post-ROSC ECG</div>
          <div class="ocard-row">
            <button class="ocard" id="ecg-stemi" onclick="setECG('stemi')">STEMI</button>
            <button class="ocard" id="ecg-lbbb" onclick="setECG('lbbb')">New LBBB</button>
            <button class="ocard" id="ecg-none" onclick="setECG('none')">No ST changes</button>
          </div>
        </div>

        <div class="inp-group">
          <div class="inp-label">LVEF (if bedside echo available)</div>
          <div class="ocard-row">
            <button class="ocard" id="ef-gt30" onclick="setLVEF('gt30'">&gt;30%</button>
            <button class="ocard" id="ef-lte30" onclick="setLVEF('lte30')">&le;30%</button>
            <button class="ocard sel" id="ef-unk" onclick="setLVEF('unknown')">Not assessed</button>
          </div>
        </div>
      </div>

      <!-- Step 3: Labs -->
      <div class="step" id="step-3">
        <div class="step-title">Laboratory Values</div>
        <div class="step-sub">Arterial blood gas and biochemistry</div>

        <div class="inp-group">
          <div class="inp-label">Arterial pH</div>
          <div class="inp-row">
            <input class="inp-field" id="ph-input" type="number" min="6.8" max="7.6" step="0.01"
              placeholder="7.35" oninput="setPH(+this.value)">
            <div class="inp-hint">Normal: 7.35–7.45</div>
          </div>
        </div>

        <div class="inp-group">
          <div class="inp-label">Lactate (mmol/L)</div>
          <div class="inp-row">
            <input class="inp-field" id="lac-input" type="number" min="0" max="25" step="0.1"
              placeholder="2.0" oninput="setLactate(+this.value)">
            <div class="inp-hint">Normal: &lt;2.0</div>
          </div>
        </div>

        <div class="inp-group">
          <div class="inp-label">Glucose (mmol/L)</div>
          <div class="inp-row">
            <input class="inp-field" id="gluc-input" type="number" min="2" max="30" step="0.1"
              placeholder="6.0" oninput="setGlucose(+this.value)">
          </div>
        </div>

        <div class="inp-group">
          <div class="inp-label">Creatinine (µmol/L) <span style="color:var(--muted);font-weight:400;">optional</span></div>
          <div class="inp-row">
            <input class="inp-field" id="creat-input" type="number" min="0" max="2000" step="1"
              placeholder="—" oninput="setCreatinine(+this.value || null)">
            <div class="inp-hint">Needed for OHCA score</div>
          </div>
        </div>

        <div class="inp-group">
          <div class="inp-label">PaCO₂ (kPa) <span style="color:var(--muted);font-weight:400;">optional</span></div>
          <div class="inp-row">
            <input class="inp-field" id="paco2-input" type="number" min="1" max="15" step="0.1"
              placeholder="—" oninput="setPaCO2(+this.value || null)">
            <div class="inp-hint">Needed for TTM score</div>
          </div>
        </div>
      </div>

    </div><!-- wizard-scroll -->

    <div class="wizard-foot">
      <button class="btn-back" id="back-btn" style="display:none" onclick="prevStep()">← Back</button>
      <button class="btn-next" id="next-btn" disabled onclick="nextStep()">
        Next <span id="next-arrow">→</span>
      </button>
    </div>
  </div><!-- wizard-panel -->

  <div class="results-panel" id="results-panel">
    <div id="score-grid-wrap"></div>
    <div id="detail-cards-wrap"></div>
    <div class="new-case-wrap">
      <button class="btn-new" onclick="newCase()">New Case</button>
    </div>
  </div>

</div><!-- main -->
</div><!-- app -->

<script src="engine/scores.js"></script>
<script>
'use strict';
```

- [ ] **Step 2: Verify the file renders without errors in browser**

Open `ohca/index.html` directly in a browser (file:// URL). Expected: header visible with HeartPilot brand in red, progress bar area visible, step 1 content visible, Next button disabled. Console: no errors.

- [ ] **Step 3: Commit**

```bash
git add ohca/index.html
git commit -m "feat(ohca): wizard HTML skeleton — header, styles, 4 steps, results panel"
```

---

## Task 6: Wizard JavaScript — state, navigation, step validation

**Files:**
- Modify: `ohca/index.html` (append to `<script>` block)

- [ ] **Step 1: Add state object and step definitions**

Append inside the `<script>` block (after `'use strict';`):

```js
// ── State ──────────────────────────────────────────────────────────────────
var S = {
  age: 60,
  initialRhythm: null,
  initialRhythmSubtype: null,
  refractoryVF: false,
  witnessed: null,
  location: null,
  bystanderCPR: null,
  prearrestCPC: null,
  comorbidities: [],
  noFlowTime: 0,
  lowFlowTime: 0,
  epinephrineDose: 0,
  changingRhythms: null,
  haemStatus: null,
  gcsMotor: null,
  pupilsReactive: null,
  stemiEcg: null,
  lvef: 'unknown',
  ph: null,
  lactate: null,
  glucose: null,
  creatinine: null,
  paco2: null,
};

var STEPS = [
  { label: 'Arrest',   required: function() {
    return S.initialRhythm !== null && S.witnessed !== null &&
           S.location !== null && S.bystanderCPR !== null &&
           S.prearrestCPC !== null &&
           (S.initialRhythm === 'shockable' || S.initialRhythmSubtype !== null);
  }},
  { label: 'Resus',    required: function() {
    return S.changingRhythms !== null;
  }},
  { label: 'Arrival',  required: function() {
    return S.haemStatus !== null && S.gcsMotor !== null &&
           S.pupilsReactive !== null && S.stemiEcg !== null;
  }},
  { label: 'Labs',     required: function() {
    return S.ph !== null && S.lactate !== null && S.glucose !== null;
  }},
];

var currentStep = 0;

// ── Progress bar ───────────────────────────────────────────────────────────
function buildPbar() {
  var pbar = document.getElementById('pbar');
  pbar.innerHTML = '';
  STEPS.forEach(function(step, i) {
    if (i > 0) {
      var sep = document.createElement('div');
      sep.className = 'ssep';
      pbar.appendChild(sep);
    }
    var node = document.createElement('div');
    node.className = 'snode' + (i === currentStep ? ' active' : i < currentStep ? ' done' : '');
    node.id = 'snode-' + i;
    node.innerHTML = '<div class="snode-num">' + (i < currentStep ? '✓' : (i+1)) + '</div>' + step.label;
    pbar.appendChild(node);
  });
}

// ── Navigation ─────────────────────────────────────────────────────────────
function showStep(n) {
  document.querySelectorAll('.step').forEach(function(el) { el.classList.remove('active'); });
  document.getElementById('step-' + n).classList.add('active');
  currentStep = n;
  buildPbar();
  updNextBtn();
  document.getElementById('back-btn').style.display = n > 0 ? '' : 'none';
  var nextBtn = document.getElementById('next-btn');
  if (n === STEPS.length - 1) {
    nextBtn.innerHTML = 'Calculate Scores';
    document.getElementById('next-arrow') && (document.getElementById('next-arrow').style.display = 'none');
  } else {
    nextBtn.innerHTML = 'Next <span id="next-arrow">→</span>';
  }
}

function updNextBtn() {
  document.getElementById('next-btn').disabled = !STEPS[currentStep].required();
}

function nextStep() {
  if (currentStep < STEPS.length - 1) {
    showStep(currentStep + 1);
  } else {
    runAnalysis();
  }
}

function prevStep() {
  if (currentStep > 0) showStep(currentStep - 1);
}

// ── Input setters — Step 0 ─────────────────────────────────────────────────
function setAge(v) {
  S.age = v;
  document.getElementById('age-val').textContent = v;
  document.getElementById('age-input').value = v;
  var pct = ((v - 18) / (100 - 18) * 100).toFixed(1);
  document.querySelector('#step-0 .inp-slider').style.background =
    'linear-gradient(to right,var(--text) 0%,var(--text) ' + pct + '%,var(--border) ' + pct + '%,var(--border) 100%)';
}

function setRhythm(v) {
  S.initialRhythm = v;
  S.initialRhythmSubtype = null;
  ['shock','nonshock'].forEach(function(k) {
    document.getElementById('rhy-' + k).className = 'ocard' + (k === (v === 'shockable' ? 'shock' : 'nonshock') ? ' sel' : '');
  });
  // Show/hide conditional fields
  document.getElementById('cond-refractory').className = 'inp-group cond' + (v === 'shockable' ? ' show' : '');
  document.getElementById('cond-nonshock-sub').className = 'inp-group cond' + (v === 'non_shockable' ? ' show' : '');
  // Reset subtype buttons
  ['pea','asystole'].forEach(function(k) { document.getElementById('sub-' + k).className = 'ocard'; });
  updNextBtn();
}

function setRhythmSubtype(v) {
  S.initialRhythmSubtype = v;
  ['pea','asystole'].forEach(function(k) {
    document.getElementById('sub-' + k).className = 'ocard' + (k === v ? ' sel' : '');
  });
  updNextBtn();
}

function setRefractoryVF(v) {
  S.refractoryVF = v;
  document.getElementById('ref-y').className = 'tog' + (v ? ' sy' : '');
  document.getElementById('ref-n').className = 'tog' + (!v ? ' sn' : '');
  updNextBtn();
}

function setWitnessed(v) {
  S.witnessed = v;
  document.getElementById('wit-y').className = 'tog' + (v ? ' sy' : '');
  document.getElementById('wit-n').className = 'tog' + (!v ? ' sn' : '');
  updNextBtn();
}

function setLocation(v) {
  S.location = v;
  ['public','home','other'].forEach(function(k) {
    document.getElementById('loc-' + k).className = 'ocard' + (k === v ? ' sel' : '');
  });
  updNextBtn();
}

function setBystanderCPR(v) {
  S.bystanderCPR = v;
  document.getElementById('byst-y').className = 'tog' + (v ? ' sy' : '');
  document.getElementById('byst-n').className = 'tog' + (!v ? ' sn' : '');
  updNextBtn();
}

function setPrearrestCPC(v) {
  S.prearrestCPC = v;
  ['1','2','34'].forEach(function(k) {
    var id = 'cpc-' + k;
    var val = k === '34' ? 'cpc3_4' : 'cpc' + k;
    document.getElementById(id).className = 'ocard' + (val === v ? ' sel' : '');
  });
  updNextBtn();
}

function toggleComorbidity(key) {
  if (key === 'none') {
    S.comorbidities = [];
    ['renal','sepsis','hepatic','malignancy'].forEach(function(k) {
      document.getElementById('chk-' + k).className = 'chk-item';
    });
    document.getElementById('chk-none').className = 'chk-item selected';
    return;
  }
  // Deselect "none"
  document.getElementById('chk-none').className = 'chk-item';
  var idx = S.comorbidities.indexOf(key);
  if (idx >= 0) {
    S.comorbidities.splice(idx, 1);
    document.getElementById('chk-' + key.replace('_failure','').replace('_','-')).className = 'chk-item';
  } else {
    S.comorbidities.push(key);
    document.getElementById('chk-' + key.replace('_failure','').replace('_','-')).className = 'chk-item selected';
  }
}

// ── Input setters — Step 1 ─────────────────────────────────────────────────
function updSlider(inputId, displayId, v, max) {
  document.getElementById(displayId).textContent = v;
  document.getElementById(inputId).value = v;
  var pct = (v / max * 100).toFixed(1);
  var slider = document.querySelector('#' + inputId.replace('-input', '') + ' .inp-slider') ||
               document.getElementById(inputId).previousElementSibling && document.getElementById(inputId).previousElementSibling.querySelector('.inp-slider');
  // Update via the input's parent slider
  var allSliders = document.querySelectorAll('.inp-slider');
  allSliders.forEach(function(s) {
    if (s.oninput && s.oninput.toString().indexOf(inputId.split('-')[0]) >= 0) {
      s.style.background = 'linear-gradient(to right,var(--text) 0%,var(--text) ' + pct + '%,var(--border) ' + pct + '%,var(--border) 100%)';
    }
  });
}

function setNoFlow(v) {
  S.noFlowTime = v;
  document.getElementById('nf-val').textContent = v;
  document.getElementById('nf-input').value = v;
  var pct = (v / 30 * 100).toFixed(1);
  document.querySelector('#step-1 .inp-slider').style.background =
    'linear-gradient(to right,var(--text) 0%,var(--text) ' + pct + '%,var(--border) ' + pct + '%,var(--border) 100%)';
}

function setLowFlow(v) {
  S.lowFlowTime = v;
  document.getElementById('lf-val').textContent = v;
  document.getElementById('lf-input').value = v;
  var pct = (v / 90 * 100).toFixed(1);
  var sliders = document.querySelectorAll('#step-1 .inp-slider');
  if (sliders[1]) sliders[1].style.background =
    'linear-gradient(to right,var(--text) 0%,var(--text) ' + pct + '%,var(--border) ' + pct + '%,var(--border) 100%)';
}

function setEpi(v) {
  S.epinephrineDose = v;
  document.getElementById('epi-val').textContent = v;
  document.getElementById('epi-input').value = v;
  var pct = (v / 20 * 100).toFixed(1);
  var sliders = document.querySelectorAll('#step-1 .inp-slider');
  if (sliders[2]) sliders[2].style.background =
    'linear-gradient(to right,var(--text) 0%,var(--text) ' + pct + '%,var(--border) ' + pct + '%,var(--border) 100%)';
}

function setChangingRhythms(v) {
  S.changingRhythms = v;
  document.getElementById('chgr-y').className = 'tog' + (v ? ' sy' : '');
  document.getElementById('chgr-n').className = 'tog' + (!v ? ' sn' : '');
  updNextBtn();
}

// ── Input setters — Step 2 ─────────────────────────────────────────────────
function setHaem(v) {
  S.haemStatus = v;
  ['stable','shock'].forEach(function(k) {
    document.getElementById('haem-' + k).className = 'ocard' + (k === v ? ' sel' : '');
  });
  updNextBtn();
}

function setGCSMotor(v) {
  S.gcsMotor = v;
  [1,2,3,4,5,6].forEach(function(k) {
    document.getElementById('gcs-' + k).className = 'ocard' + (k === v ? ' sel' : '');
  });
  updNextBtn();
}

function setPupils(v) {
  S.pupilsReactive = v;
  document.getElementById('pup-react').className = 'ocard' + (v ? ' sel' : '');
  document.getElementById('pup-fixed').className = 'ocard' + (!v ? ' sel' : '');
  updNextBtn();
}

function setECG(v) {
  S.stemiEcg = v;
  ['stemi','lbbb','none'].forEach(function(k) {
    document.getElementById('ecg-' + k).className = 'ocard' + (k === v ? ' sel' : '');
  });
  updNextBtn();
}

function setLVEF(v) {
  S.lvef = v;
  ['gt30','lte30','unk'].forEach(function(k) {
    var val = k === 'unk' ? 'unknown' : k;
    document.getElementById('ef-' + k).className = 'ocard' + (val === v ? ' sel' : '');
  });
}

// ── Input setters — Step 3 ─────────────────────────────────────────────────
function setPH(v) {
  S.ph = (v >= 6.8 && v <= 7.6) ? v : null;
  updNextBtn();
}
function setLactate(v) {
  S.lactate = (v >= 0 && v <= 25) ? v : null;
  updNextBtn();
}
function setGlucose(v) {
  S.glucose = (v >= 2 && v <= 30) ? v : null;
  updNextBtn();
}
function setCreatinine(v) {
  S.creatinine = (v > 0) ? v : null;
}
function setPaCO2(v) {
  S.paco2 = (v > 0) ? v : null;
}

// ── Boot ───────────────────────────────────────────────────────────────────
buildPbar();
showStep(0);
setAge(60);
```

- [ ] **Step 2: Test navigation in browser**

Open `ohca/index.html`. Verify:
- Progress bar shows 4 steps: Arrest / Resus / Arrival / Labs
- Next button disabled on step 0 until required fields filled
- Conditional fields (Refractory VF / rhythm subtype) appear correctly
- Back button appears from step 1 onwards

- [ ] **Step 3: Commit**

```bash
git add ohca/index.html
git commit -m "feat(ohca): wizard state, navigation, all input setters"
```

---

## Task 7: Wizard — results rendering

**Files:**
- Modify: `ohca/index.html` (append to `<script>` block)

- [ ] **Step 1: Add results rendering functions**

Append inside the `<script>` block:

```js
// ── Utils ──────────────────────────────────────────────────────────────────
var h = function(s) {
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
};

// ── Analysis ───────────────────────────────────────────────────────────────
function runAnalysis() {
  var results = OhcaScores.calculateAll(S);
  renderScoreGrid(results);
  renderDetailCards(results);

  document.querySelector('.main').classList.add('results-done');
  document.body.classList.add('results-done');
  document.getElementById('next-btn').style.display = 'none';
  document.getElementById('back-btn').style.display = 'none';
  if (window.innerWidth <= 768) {
    setTimeout(function() { window.scrollTo({ top: 0, behavior: 'smooth' }); }, 150);
  }
}

// ── Score grid ─────────────────────────────────────────────────────────────
function renderScoreGrid(results) {
  var cells = results.map(function(r, i) {
    var isLast = i === results.length - 1;
    var scoreDisplay = r.incomplete ? '—' : r.score;
    return '<div class="score-cell' + (isLast ? ' full-width' : '') + '">'
      + '<div class="score-name">' + h(r.name) + '</div>'
      + '<div class="score-value" style="color:' + tierColour(r.tier) + '">' + h(scoreDisplay) + '</div>'
      + '<div class="score-badge ' + h(r.tier) + '">' + h(r.label) + '</div>'
      + '</div>';
  }).join('');

  document.getElementById('score-grid-wrap').innerHTML =
    '<div class="score-grid">' + cells + '</div>';
}

function tierColour(tier) {
  return { low: '#15803d', intermediate: '#b45309', high: '#c0392b', incomplete: '#a8a49f' }[tier] || '#a8a49f';
}

// ── Detail cards ───────────────────────────────────────────────────────────
function renderDetailCards(results) {
  var cards = results.map(function(r) {
    var scoreDisplay = r.incomplete ? 'Incomplete' : r.score;
    var headContent = '<div class="detail-score-name">' + h(r.name) + '</div>'
      + '<div class="detail-score-val">' + h(scoreDisplay) + '</div>';

    var bodyContent = '';

    if (r.incomplete) {
      bodyContent += '<div style="color:var(--muted);font-style:italic;">' + h(r.incompleteReason) + '</div>';
    } else {
      bodyContent += '<div class="detail-row">'
        + '<div class="detail-lbl">Predicts</div>'
        + '<div>' + h(r.interpretation) + '</div></div>';

      // Thresholds
      var thrKeys = Object.keys(r.thresholds || {});
      if (thrKeys.length) {
        var thrText = thrKeys.map(function(k) { return k + ': ' + r.thresholds[k]; }).join(' · ');
        bodyContent += '<div class="detail-row">'
          + '<div class="detail-lbl">Thresholds</div>'
          + '<div>' + h(thrText) + '</div></div>';
      }

      bodyContent += '<div class="detail-row">'
        + '<div class="detail-lbl">Source</div>'
        + '<div>' + h(r.reference.authors + ', ' + r.reference.journal + ' ' + r.reference.year) + '</div></div>';

      if (r.caveat) {
        bodyContent += '<div class="caveat-box">' + h(r.caveat) + '</div>';
      }
    }

    return '<div class="detail-card">'
      + '<div class="detail-head ' + h(r.tier) + '">' + headContent + '</div>'
      + '<div class="detail-body">' + bodyContent + '</div>'
      + '</div>';
  }).join('');

  document.getElementById('detail-cards-wrap').innerHTML = cards;
}

// ── New case ────────────────────────────────────────────────────────────────
function newCase() {
  document.querySelector('.main').classList.remove('results-done');
  document.body.classList.remove('results-done');
  document.getElementById('next-btn').style.display = '';
  document.getElementById('score-grid-wrap').innerHTML = '';
  document.getElementById('detail-cards-wrap').innerHTML = '';
  Object.assign(S, {
    initialRhythm: null, initialRhythmSubtype: null, refractoryVF: false,
    witnessed: null, location: null, bystanderCPR: null, prearrestCPC: null,
    comorbidities: [], noFlowTime: 0, lowFlowTime: 0, epinephrineDose: 0,
    changingRhythms: null, haemStatus: null, gcsMotor: null, pupilsReactive: null,
    stemiEcg: null, lvef: 'unknown', ph: null, lactate: null, glucose: null,
    creatinine: null, paco2: null
  });
  // Reset all UI elements to default state
  document.querySelectorAll('.ocard').forEach(function(el) { el.className = 'ocard'; });
  document.querySelectorAll('.tog').forEach(function(el) { el.className = 'tog'; });
  document.querySelectorAll('.chk-item').forEach(function(el) { el.className = 'chk-item'; });
  document.querySelectorAll('.inp-field').forEach(function(el) { el.value = ''; });
  document.getElementById('ef-unk').className = 'ocard sel'; // default LVEF
  showStep(0);
  setAge(60);
}
```

Close the `</script>` tag, then close `</body>` and `</html>`.

- [ ] **Step 2: End-to-end test in browser**

Open `ohca/index.html`. Complete all 4 steps with valid inputs. Click "Calculate Scores". Verify:
- Score grid appears with 5 cells (CASPRI spanning full width)
- Each cell shows a score value and tier badge
- Detail cards render below, one per score
- CASPRI card shows a caveat box
- Any incomplete score (TTM/OHCA if formulas pending) shows grey "Incomplete" card

- [ ] **Step 3: Commit**

```bash
git add ohca/index.html
git commit -m "feat(ohca): results rendering — score grid and detail cards"
```

---

## Task 8: Final test run and cleanup

**Files:**
- Modify: `ohca/test/scores.test.js` (add edge cases)
- Verify: `ohca/index.html` (checklist)

- [ ] **Step 1: Add edge-case tests**

Append to `scores.test.js` before the summary block:

```js
// ── Edge cases ────────────────────────────────────────────────────────────
console.log('\nEdge cases');

test('CAHP: zero no-flow and low-flow (immediate witnessed ROSC)', function() {
  var r = OhcaScores.cahp({
    age: 40, location: 'public', initialRhythm: 'shockable',
    noFlowTime: 0, lowFlowTime: 0, ph: 7.40, epinephrineDose: 0
  });
  assert.ok(r.score < 100);
  assert.strictEqual(r.tier, 'low');
});

test('CAHP: extreme low pH', function() {
  var r = OhcaScores.cahp({
    age: 60, location: 'home', initialRhythm: 'non_shockable',
    noFlowTime: 10, lowFlowTime: 30, ph: 6.90, epinephrineDose: 5
  });
  assert.ok(r.score > 200);
  assert.strictEqual(r.tier, 'high');
});

test('MIRACLE2: refractory VF (shockable + all-favourable) = low', function() {
  var r = OhcaScores.miracle2({
    witnessed: true, initialRhythm: 'shockable', changingRhythms: false,
    epinephrineDose: 0, pupilsReactive: true, ph: 7.35, age: 45
  });
  assert.strictEqual(r.score, 0);
  assert.strictEqual(r.tier, 'low');
});

test('CASPRI: CPC3-4 adds 9 points', function() {
  var base = { age: 50, witnessed: true, initialRhythm: 'shockable',
               initialRhythmSubtype: null, lowFlowTime: 3, comorbidities: [] };
  var r1 = OhcaScores.caspri(Object.assign({}, base, { prearrestCPC: 'cpc1' }));
  var r2 = OhcaScores.caspri(Object.assign({}, base, { prearrestCPC: 'cpc3_4' }));
  assert.strictEqual(r2.score - r1.score, 9);
});

test('OHCA: incomplete when creatinine null', function() {
  var r = OhcaScores.ohca({
    initialRhythm: 'shockable', noFlowTime: 0, lowFlowTime: 5,
    lactate: 2.0, creatinine: null
  });
  assert.strictEqual(r.incomplete, true);
});

test('calculateAll: returns ScoreResult for each score id', function() {
  var results = OhcaScores.calculateAll({
    age: 55, location: 'public', initialRhythm: 'shockable',
    initialRhythmSubtype: null, witnessed: true, bystanderCPR: true,
    refractoryVF: false, changingRhythms: false, prearrestCPC: 'cpc1',
    comorbidities: [], noFlowTime: 0, lowFlowTime: 8, epinephrineDose: 0,
    pupilsReactive: true, gcsMotor: 5, stemiEcg: 'stemi', lvef: 'gt30',
    haemStatus: 'stable', ph: 7.38, lactate: 2.2, glucose: 7.0,
    creatinine: 85, paco2: 5.0
  });
  var ids = results.map(function(r) { return r.id; }).sort();
  assert.deepStrictEqual(ids, ['cahp','caspri','miracle2','ohca','ttm']);
});
```

- [ ] **Step 2: Run full test suite**

```bash
node ohca/test/scores.test.js
```

Expected: all tests pass (TTM and OHCA reference-case tests may be pending until formulas confirmed from papers).

- [ ] **Step 3: UI checklist**

Open `ohca/index.html` in a browser and verify:

- [ ] Header: HeartPilot brand, red icon, "OHCA · Post-ROSC" subtitle, disclaimer pill
- [ ] Step 1: conditional Refractory VF shows on shockable, rhythm subtype shows on non-shockable
- [ ] Step 1: comorbidity "none" deselects others; selecting a specific deselects "none"
- [ ] Step 2: all 3 sliders sync with number inputs
- [ ] Step 3: LVEF defaults to "Not assessed" (pre-selected)
- [ ] Step 4: creatinine and PaCO2 fields are optional (step advances without them)
- [ ] Results: 5 cells in grid, CASPRI full-width
- [ ] Results: incomplete scores show grey card with reason
- [ ] "New Case" resets all state and returns to step 0
- [ ] No JavaScript errors in browser console

- [ ] **Step 4: Run both existing test suites to confirm nothing broken**

```bash
node pci/test/engine.test.js && node cvf/test/interpreter.test.js && node ohca/test/scores.test.js
```

Expected: all three suites pass.

- [ ] **Step 5: Final commit**

```bash
git add ohca/engine/scores.js ohca/test/scores.test.js ohca/index.html
git commit -m "feat(ohca): complete OHCA wizard — scores engine, 4-step UI, results panel"
```

---

## Notes for TTM and OHCA formula completion

After sourcing the formulas from the papers:

1. **TTM** — replace all `TODO_XX` comments in `ttm()` with exact points from Martinell et al. Table S1. Add a reference test case. Remove the stub comments.

2. **OHCA** — replace the zero `INTERCEPT` and `B_*` constants in `ohca()` with exact regression coefficients from Adrie et al. Set correct tier probability boundaries. Add a reference test case.

3. Commit each separately: `"fix(ohca): implement TTM score from Martinell 2017 Table S1"` and `"fix(ohca): implement OHCA score from Adrie 2006"`.
