# CVF Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a standalone coronary vascular function (CVF) interpretation wizard at `cvf/index.html` that classifies invasive physiological measurements into one of nine evidence-based phenotypes.

**Architecture:** A `CvfInterpreter` pure-function module (`cvf/engine/interpreter.js`) handles all classification logic; `cvf/index.html` is a self-contained wizard UI with no external dependencies. Hub page (`index.html`) gets a new CVF card.

**Tech Stack:** Vanilla JavaScript (ES5-compatible), no framework, no build step, no npm. Node.js built-ins for tests only.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `cvf/engine/interpreter.js` | Create | THRESHOLDS constants + `interpret(values)` pure function |
| `cvf/test/interpreter.test.js` | Create | All classification + boundary + grey-zone + resting index tests |
| `cvf/index.html` | Create | 3-step wizard UI — measurement selection, value entry, results |
| `index.html` | Modify | Add CVF card to hub proc-grid |
| `CLAUDE.md` | Modify | Add CVF test run command |

---

## Task 1: interpreter.js skeleton

**Files:**
- Create: `cvf/engine/interpreter.js`

- [ ] **Step 1.1: Create directory and skeleton file**

```bash
mkdir -p "cvf/engine"
```

Write `cvf/engine/interpreter.js`:

```js
/**
 * HeartPilot CVF Interpreter
 * ───────────────────────────
 * Pure deterministic engine. Takes invasive physiological measurements and
 * returns a physiological phenotype classification with evidence basis.
 *
 * No DOM dependencies. Works in Node (tests) and browser (wizard).
 *
 * @version 1.0.0
 */

'use strict';

var CvfInterpreter = (function () {

  var THRESHOLDS = {
    FFR:               0.80,
    IFR:               0.89,
    PDPA:              0.91,
    RFR:               0.89,
    DFR:               0.89,
    CFR:               2.0,
    IMR:               25,
    FFR_GREY_ZONE_LOW: 0.75,
    // Note: FFR_GREY_ZONE_HIGH equals FFR threshold (0.80) — intentional.
    // The grey zone upper bound IS the classification threshold.
    FFR_GREY_ZONE_HIGH: 0.80,
  };

  function interpret(values) {
    throw new Error('not implemented');
  }

  return {
    interpret:  interpret,
    THRESHOLDS: THRESHOLDS,
  };

}());

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CvfInterpreter;
} else if (typeof window !== 'undefined') {
  window.CvfInterpreter = CvfInterpreter;
}
```

---

## Task 2: Write failing tests

**Files:**
- Create: `cvf/test/interpreter.test.js`

- [ ] **Step 2.1: Create test directory**

```bash
mkdir -p "cvf/test"
```

- [ ] **Step 2.2: Write test file**

Write `cvf/test/interpreter.test.js`:

```js
'use strict';

var assert = require('assert');
var path   = require('path');
var CvfInterpreter = require(path.join(__dirname, '..', 'engine', 'interpreter.js'));

var T    = CvfInterpreter.THRESHOLDS;
var pass = 0;
var fail = 0;

function test(name, fn) {
  try {
    fn();
    console.log('\u2713 ' + name);
    pass++;
  } catch (e) {
    console.error('\u2717 ' + name);
    console.error('  ' + e.message);
    fail++;
  }
}

function interp(ffr, restingType, restingValue, cfr, imr) {
  return CvfInterpreter.interpret({
    ffr:          ffr,
    restingType:  restingType,
    restingValue: restingValue,
    cfr:          cfr,
    imr:          imr,
  });
}

// ─── Primary phenotypes (full data) ──────────────────────────────────────────

test('Normal physiology — all normal (FFR + CFR + IMR)', function () {
  var r = interp(0.85, null, null, 2.5, 18);
  assert.strictEqual(r.phenotype, 'Normal physiology');
  assert.strictEqual(r.greyZone, false);
  assert.strictEqual(r.greyZoneNote, null);
});

test('Epicardial disease — abnormal FFR, normal CFR, normal IMR', function () {
  var r = interp(0.72, null, null, 2.4, 20);
  assert.strictEqual(r.phenotype, 'Epicardial disease');
});

test('Structural CMD — normal FFR, reduced CFR, elevated IMR', function () {
  var r = interp(0.85, null, null, 1.6, 32);
  assert.strictEqual(r.phenotype, 'Structural CMD');
});

test('Functional CMD — normal FFR, reduced CFR, normal IMR', function () {
  var r = interp(0.85, null, null, 1.7, 18);
  assert.strictEqual(r.phenotype, 'Functional CMD');
});

test('Diffuse epicardial disease — abnormal FFR, reduced CFR, normal IMR', function () {
  var r = interp(0.74, null, null, 1.8, 20);
  assert.strictEqual(r.phenotype, 'Diffuse epicardial disease');
});

test('Mixed disease — abnormal FFR, reduced CFR, elevated IMR', function () {
  var r = interp(0.74, null, null, 1.6, 30);
  assert.strictEqual(r.phenotype, 'Mixed disease');
});

// ─── Partial data: CFR and IMR both absent ────────────────────────────────────

test('Non-obstructive — normal FFR only, no CFR/IMR', function () {
  var r = interp(0.85, null, null, null, null);
  assert.strictEqual(r.phenotype, 'Non-obstructive');
});

test('Epicardial disease — abnormal FFR only, no CFR/IMR', function () {
  var r = interp(0.74, null, null, null, null);
  assert.strictEqual(r.phenotype, 'Epicardial disease');
});

// ─── Partial data: CFR measured, IMR absent ──────────────────────────────────

test('Normal physiology — normal FFR, normal CFR, no IMR', function () {
  var r = interp(0.85, null, null, 2.2, null);
  assert.strictEqual(r.phenotype, 'Normal physiology');
});

test('Epicardial disease — abnormal FFR, normal CFR, no IMR', function () {
  var r = interp(0.74, null, null, 2.4, null);
  assert.strictEqual(r.phenotype, 'Epicardial disease');
});

test('Microvascular dysfunction — normal FFR, reduced CFR, no IMR', function () {
  var r = interp(0.85, null, null, 1.7, null);
  assert.strictEqual(r.phenotype, 'Microvascular dysfunction');
});

test('Mixed / diffuse epicardial disease — abnormal FFR, reduced CFR, no IMR', function () {
  var r = interp(0.74, null, null, 1.7, null);
  assert.strictEqual(r.phenotype, 'Mixed / diffuse epicardial disease');
});

// ─── Partial data: IMR measured, CFR absent ──────────────────────────────────

test('Non-obstructive with IMR — normal FFR, no CFR, IMR in breakdown', function () {
  var r = interp(0.85, null, null, null, 28);
  assert.strictEqual(r.phenotype, 'Non-obstructive');
  var imrRows = r.measurements.filter(function (m) { return m.name === 'IMR'; });
  assert.strictEqual(imrRows.length, 1, 'IMR should appear in measurement breakdown');
  assert.strictEqual(imrRows[0].value, 28);
});

test('Epicardial disease with IMR — abnormal FFR, no CFR', function () {
  var r = interp(0.74, null, null, null, 28);
  assert.strictEqual(r.phenotype, 'Epicardial disease');
});

// ─── Boundary values ──────────────────────────────────────────────────────────

test('Boundary: FFR 0.80 is abnormal', function () {
  var r = interp(0.80, null, null, 2.5, 18);
  assert.strictEqual(r.phenotype, 'Epicardial disease');
});

test('Boundary: FFR 0.81 is normal', function () {
  var r = interp(0.81, null, null, 2.5, 18);
  assert.strictEqual(r.phenotype, 'Normal physiology');
});

test('Boundary: CFR 2.0 is normal', function () {
  var r = interp(0.85, null, null, 2.0, 18);
  assert.strictEqual(r.phenotype, 'Normal physiology');
});

test('Boundary: CFR 1.99 is reduced', function () {
  var r = interp(0.85, null, null, 1.99, 18);
  assert.strictEqual(r.phenotype, 'Functional CMD');
});

test('Boundary: IMR 25 is elevated', function () {
  var r = interp(0.85, null, null, 1.7, 25);
  assert.strictEqual(r.phenotype, 'Structural CMD');
});

test('Boundary: IMR 24 is normal', function () {
  var r = interp(0.85, null, null, 1.7, 24);
  assert.strictEqual(r.phenotype, 'Functional CMD');
});

// ─── FFR grey zone ────────────────────────────────────────────────────────────

test('Grey zone: FFR 0.75 sets greyZone true', function () {
  var r = interp(0.75, null, null, 2.5, 18);
  assert.strictEqual(r.greyZone, true);
  assert.ok(r.greyZoneNote !== null, 'greyZoneNote should not be null');
});

test('Grey zone: FFR 0.77 sets greyZone true', function () {
  assert.strictEqual(interp(0.77, null, null, 2.5, 18).greyZone, true);
});

test('Grey zone: FFR 0.80 sets greyZone true', function () {
  assert.strictEqual(interp(0.80, null, null, 2.5, 18).greyZone, true);
});

test('Grey zone: FFR 0.74 does NOT set greyZone', function () {
  var r = interp(0.74, null, null, 2.5, 18);
  assert.strictEqual(r.greyZone, false);
  assert.strictEqual(r.greyZoneNote, null);
});

test('Grey zone: FFR 0.81 does NOT set greyZone', function () {
  assert.strictEqual(interp(0.81, null, null, 2.5, 18).greyZone, false);
});

// ─── Resting index types ──────────────────────────────────────────────────────

test('iFR 0.89 is abnormal; name is iFR', function () {
  var r = interp(null, 'ifr', 0.89, 2.5, 18);
  assert.strictEqual(r.phenotype, 'Epicardial disease');
  assert.strictEqual(r.measurements[0].name, 'iFR');
  assert.strictEqual(r.measurements[0].normal, false);
});

test('iFR 0.90 is normal', function () {
  assert.strictEqual(interp(null, 'ifr', 0.90, 2.5, 18).phenotype, 'Normal physiology');
});

test('Pd:Pa 0.91 is abnormal; name is Pd:Pa', function () {
  var r = interp(null, 'pdpa', 0.91, 2.5, 18);
  assert.strictEqual(r.phenotype, 'Epicardial disease');
  assert.strictEqual(r.measurements[0].name, 'Pd:Pa');
});

test('Pd:Pa 0.92 is normal', function () {
  assert.strictEqual(interp(null, 'pdpa', 0.92, 2.5, 18).phenotype, 'Normal physiology');
});

test('RFR 0.89 is abnormal; name is RFR', function () {
  var r = interp(null, 'rfr', 0.89, 2.5, 18);
  assert.strictEqual(r.phenotype, 'Epicardial disease');
  assert.strictEqual(r.measurements[0].name, 'RFR');
});

test('DFR 0.89 is abnormal; name is DFR', function () {
  var r = interp(null, 'dfr', 0.89, 2.5, 18);
  assert.strictEqual(r.phenotype, 'Epicardial disease');
  assert.strictEqual(r.measurements[0].name, 'DFR');
});

// ─── Mismatched resting index pair ────────────────────────────────────────────

test('restingType non-null + restingValue null → treated as not measured', function () {
  var r = CvfInterpreter.interpret({ ffr: 0.85, restingType: 'ifr', restingValue: null, cfr: null, imr: null });
  assert.strictEqual(r.phenotype, 'Non-obstructive');
});

test('restingValue non-null + restingType null → treated as not measured', function () {
  var r = CvfInterpreter.interpret({ ffr: 0.85, restingType: null, restingValue: 0.88, cfr: null, imr: null });
  assert.strictEqual(r.phenotype, 'Non-obstructive');
});

// ─── THRESHOLDS exported ──────────────────────────────────────────────────────

test('THRESHOLDS.FFR is 0.80', function () { assert.strictEqual(T.FFR, 0.80); });
test('THRESHOLDS.CFR is 2.0',  function () { assert.strictEqual(T.CFR, 2.0);  });
test('THRESHOLDS.IMR is 25',   function () { assert.strictEqual(T.IMR, 25);   });
test('THRESHOLDS.FFR_GREY_ZONE_HIGH equals THRESHOLDS.FFR', function () {
  assert.strictEqual(T.FFR_GREY_ZONE_HIGH, T.FFR);
});

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
```

- [ ] **Step 2.3: Run tests to confirm they all fail**

```bash
node cvf/test/interpreter.test.js
```

Expected: all tests fail with `Error: not implemented`. Exit code 1.

---

## Task 3: Implement interpret() — make tests pass

**Files:**
- Modify: `cvf/engine/interpreter.js`

- [ ] **Step 3.1: Replace the stub with the full implementation**

Replace the entire contents of `cvf/engine/interpreter.js` with:

```js
/**
 * HeartPilot CVF Interpreter
 * ───────────────────────────
 * Pure deterministic engine. Takes invasive physiological measurements and
 * returns a physiological phenotype classification with evidence basis.
 *
 * No DOM dependencies. Works in Node (tests) and browser (wizard).
 *
 * @version 1.0.0
 */

'use strict';

var CvfInterpreter = (function () {

  // ── Thresholds ──────────────────────────────────────────────────────────────

  var THRESHOLDS = {
    FFR:               0.80,
    IFR:               0.89,
    PDPA:              0.91,
    RFR:               0.89,
    DFR:               0.89,
    CFR:               2.0,
    IMR:               25,
    FFR_GREY_ZONE_LOW: 0.75,
    // Note: FFR_GREY_ZONE_HIGH equals FFR threshold (0.80) — intentional.
    // The grey zone upper bound IS the classification threshold.
    FFR_GREY_ZONE_HIGH: 0.80,
  };

  // ── Static content ──────────────────────────────────────────────────────────

  var EVIDENCE = {
    source:     'ESC',
    year:       2024,
    classLabel: 'IIa',
    level:      'B',
    rationale:  'CFR cut-off of 2.0 and IMR cut-off of 25 per ESC 2024 Chronic Coronary Syndrome guidelines. FFR cut-off of 0.80 per ESC 2024.',
  };

  var GREY_ZONE_NOTE = 'FFR values between 0.75 and 0.80 fall within the historical grey zone from the original DEFER and FAME trials. While \u2264\u00a00.80 is the current guideline threshold, deferral of revascularisation may still be reasonable in this range, informed by clinical context and shared decision-making with the patient.';

  var PHENOTYPES = {
    'Normal physiology': {
      subtitle: 'No epicardial or microvascular disease detected',
      summary:  'All measured indices are within normal limits. There is no evidence of significant obstructive epicardial coronary artery disease or coronary microvascular dysfunction.',
      color:    '#059669',
    },
    'Epicardial disease': {
      subtitle: 'Obstructive epicardial CAD \u2014 revascularisation to consider',
      summary:  'Pressure indices confirm haemodynamically significant epicardial stenosis. Where coronary flow reserve is measured and normal, the flow impairment is attributable to the focal epicardial lesion rather than microvascular disease.',
      color:    '#dc2626',
    },
    'Structural CMD': {
      subtitle: 'Coronary microvascular dysfunction \u2014 elevated resistance',
      summary:  'Normal epicardial physiology with reduced coronary flow reserve and elevated microvascular resistance. This pattern is consistent with structural coronary microvascular dysfunction (CMD). No haemodynamically significant epicardial stenosis is present.',
      color:    '#92400e',
    },
    'Functional CMD': {
      subtitle: 'Coronary microvascular dysfunction \u2014 functional or vasospastic aetiology',
      summary:  'Normal epicardial physiology with reduced coronary flow reserve but preserved microvascular resistance. This pattern suggests functional coronary microvascular dysfunction, such as microvascular spasm or abnormal vasomotion, rather than structural microvascular disease.',
      color:    '#92400e',
    },
    'Diffuse epicardial disease': {
      subtitle: 'Diffuse non-focal epicardial CAD \u2014 microvascular resistance preserved',
      summary:  'Pressure indices are abnormal and coronary flow reserve is reduced, but microvascular resistance is normal. This pattern suggests diffuse or serial epicardial disease causing the flow impairment, rather than true microvascular dysfunction.',
      color:    '#4c1d95',
    },
    'Mixed disease': {
      subtitle: 'Coexistent epicardial CAD and microvascular dysfunction',
      summary:  'Both epicardial and microvascular pathology are present. Pressure indices confirm haemodynamically significant epicardial stenosis, and microvascular indices confirm coexistent coronary microvascular dysfunction. This mixed pattern has implications for management beyond revascularisation alone.',
      color:    '#831843',
    },
    'Microvascular dysfunction': {
      subtitle: 'Coronary microvascular dysfunction \u2014 subtype undetermined',
      summary:  'Normal epicardial physiology with reduced coronary flow reserve, consistent with coronary microvascular dysfunction (CMD). IMR measurement is required to distinguish structural CMD (elevated microvascular resistance) from functional CMD (normal resistance, vasospastic aetiology).',
      color:    '#92400e',
    },
    'Mixed / diffuse epicardial disease': {
      subtitle: 'Epicardial disease with possible microvascular involvement',
      summary:  'Abnormal pressure indices and reduced coronary flow reserve are present. Without IMR measurement, it is not possible to determine whether the reduced CFR reflects diffuse epicardial disease alone or coexistent microvascular dysfunction.',
      color:    '#4c1d95',
    },
    'Non-obstructive': {
      subtitle: 'No significant epicardial stenosis \u2014 microvascular status not fully assessed',
      summary:  'Pressure indices do not confirm haemodynamically significant epicardial stenosis. Coronary flow reserve was not measured; a full microvascular phenotype cannot be determined from pressure data alone.',
      color:    '#334155',
    },
  };

  var RESTING_INFO = {
    ifr:  { name: 'iFR',   fullName: 'instantaneous wave-free ratio',           threshold: THRESHOLDS.IFR  },
    pdpa: { name: 'Pd:Pa', fullName: 'resting distal-to-aortic pressure ratio', threshold: THRESHOLDS.PDPA },
    rfr:  { name: 'RFR',   fullName: 'resting full-cycle ratio',                threshold: THRESHOLDS.RFR  },
    dfr:  { name: 'DFR',   fullName: 'diastolic pressure ratio',                threshold: THRESHOLDS.DFR  },
  };

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function isEpicardialAbnormal(v) {
    var ffrAbnormal     = v.ffr !== null && v.ffr <= THRESHOLDS.FFR;
    var restingAbnormal = false;
    if (v.restingType !== null && v.restingValue !== null) {
      var info = RESTING_INFO[v.restingType];
      if (info) restingAbnormal = v.restingValue <= info.threshold;
    }
    return ffrAbnormal || restingAbnormal;
  }

  function buildMeasurements(v) {
    var results = [];

    if (v.ffr !== null) {
      var fNormal = v.ffr > THRESHOLDS.FFR;
      results.push({
        name:     'FFR',
        fullName: 'fractional flow reserve',
        value:    v.ffr,
        normal:   fNormal,
        label:    fNormal ? 'Normal > 0.80' : 'Abnormal \u2264 0.80',
      });
    }

    if (v.restingType !== null && v.restingValue !== null) {
      var info = RESTING_INFO[v.restingType] || RESTING_INFO['ifr'];
      var rNormal = v.restingValue > info.threshold;
      results.push({
        name:     info.name,
        fullName: info.fullName,
        value:    v.restingValue,
        normal:   rNormal,
        label:    rNormal
          ? 'Normal > ' + info.threshold
          : 'Abnormal \u2264 ' + info.threshold,
      });
    }

    if (v.cfr !== null) {
      var cNormal = v.cfr >= THRESHOLDS.CFR;
      results.push({
        name:     'CFR',
        fullName: 'coronary flow reserve',
        value:    v.cfr,
        normal:   cNormal,
        label:    cNormal ? 'Normal \u2265 2.0' : 'Reduced < 2.0',
      });
    }

    if (v.imr !== null) {
      var iNormal = v.imr < THRESHOLDS.IMR;
      results.push({
        name:     'IMR',
        fullName: 'index of microcirculatory resistance',
        value:    v.imr,
        normal:   iNormal,
        label:    iNormal ? 'Normal < 25' : 'Elevated \u2265 25',
      });
    }

    return results;
  }

  function classify(v) {
    var epicardial = isEpicardialAbnormal(v);
    var hasCfr     = v.cfr !== null;
    var hasImr     = v.imr !== null;

    if (hasCfr) {
      var cfrLow = v.cfr < THRESHOLDS.CFR;

      if (hasImr) {
        var imrHigh = v.imr >= THRESHOLDS.IMR;
        if (!epicardial && !cfrLow)           return 'Normal physiology';
        if (epicardial  && !cfrLow)           return 'Epicardial disease';
        if (!epicardial && cfrLow && imrHigh) return 'Structural CMD';
        if (!epicardial && cfrLow && !imrHigh)return 'Functional CMD';
        if (epicardial  && cfrLow && !imrHigh)return 'Diffuse epicardial disease';
        /* epicardial && cfrLow && imrHigh */  return 'Mixed disease';
      }

      // CFR measured, IMR absent
      if (!epicardial && !cfrLow) return 'Normal physiology';
      if (epicardial  && !cfrLow) return 'Epicardial disease';
      if (!epicardial && cfrLow)  return 'Microvascular dysfunction';
      /* epicardial && cfrLow */   return 'Mixed / diffuse epicardial disease';
    }

    // CFR absent (IMR may or may not be present — epicardial axis only)
    return epicardial ? 'Epicardial disease' : 'Non-obstructive';
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  /**
   * Interpret invasive physiological measurements.
   *
   * All keys must be present; null means "not measured" — never omit a key.
   * The interpreter does not handle undefined.
   *
   * @param {Object}        values
   * @param {number|null}   values.ffr           fractional flow reserve
   * @param {string|null}   values.restingType   'ifr'|'pdpa'|'rfr'|'dfr'
   * @param {number|null}   values.restingValue
   * @param {number|null}   values.cfr           coronary flow reserve
   * @param {number|null}   values.imr           index of microcirculatory resistance
   * @returns {Object} PhenotypeResult
   */
  function interpret(values) {
    var v = {
      ffr:          values.ffr          != null ? values.ffr          : null,
      restingType:  values.restingType  != null ? values.restingType  : null,
      restingValue: values.restingValue != null ? values.restingValue : null,
      cfr:          values.cfr          != null ? values.cfr          : null,
      imr:          values.imr          != null ? values.imr          : null,
    };

    // Validate resting index pair
    if (v.restingType !== null && v.restingValue === null) {
      console.warn('CvfInterpreter: restingType provided but restingValue is null — treating resting index as not measured');
      v.restingType = null;
    }
    if (v.restingValue !== null && v.restingType === null) {
      console.warn('CvfInterpreter: restingValue provided but restingType is null — treating resting index as not measured');
      v.restingValue = null;
    }

    var phenotypeName = classify(v);
    var phenotypeData = PHENOTYPES[phenotypeName];

    var greyZone = v.ffr !== null &&
                   v.ffr >= THRESHOLDS.FFR_GREY_ZONE_LOW &&
                   v.ffr <= THRESHOLDS.FFR_GREY_ZONE_HIGH;

    return {
      phenotype:    phenotypeName,
      subtitle:     phenotypeData.subtitle,
      summary:      phenotypeData.summary,
      color:        phenotypeData.color,
      measurements: buildMeasurements(v),
      evidence:     EVIDENCE,
      greyZone:     greyZone,
      greyZoneNote: greyZone ? GREY_ZONE_NOTE : null,
    };
  }

  return {
    interpret:  interpret,
    THRESHOLDS: THRESHOLDS,
  };

}());

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CvfInterpreter;
} else if (typeof window !== 'undefined') {
  window.CvfInterpreter = CvfInterpreter;
}
```

- [ ] **Step 3.2: Run tests — all must pass**

```bash
node cvf/test/interpreter.test.js
```

Expected: all tests print `✓`, exit code 0.

- [ ] **Step 3.3: Commit**

```bash
git add cvf/engine/interpreter.js cvf/test/interpreter.test.js
git commit -m "feat(cvf): add CvfInterpreter engine + full test suite"
```

---

## Task 4: Build wizard UI

**Files:**
- Create: `cvf/index.html`

- [ ] **Step 4.1: Write cvf/index.html**

Write `cvf/index.html` with the complete contents below. The file is self-contained — CSS, wizard logic, and results rendering are all inline. It loads `engine/interpreter.js` via a `<script>` tag.

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="color-scheme" content="light">
<title>HeartPilot — Coronary Vascular Function</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
html{color-scheme:light;background:#f7f5f2;}
@media(prefers-color-scheme:dark){html,body{color-scheme:light;background:#f7f5f2!important;color:#1a1714!important;filter:none!important;}}
:root{
  --bg:#f7f5f2;--s1:#ffffff;--s2:#f0ece7;--s3:#e8e3dd;
  --border:#e2ddd8;--border2:#ccc7c0;
  --teal:#0891b2;--tealg:rgba(8,145,178,.10);
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
body::before{content:'';position:fixed;inset:0;background-image:radial-gradient(circle at 20% 0%,rgba(8,145,178,.025) 0%,transparent 50%),radial-gradient(circle at 80% 100%,rgba(8,145,178,.02) 0%,transparent 50%);pointer-events:none;z-index:0;}
body::after{content:'';position:fixed;inset:0;background-image:radial-gradient(circle,rgba(112,107,102,.16) 1px,transparent 1px);background-size:28px 28px;opacity:.4;pointer-events:none;z-index:0;}
.app{position:relative;z-index:1;display:flex;flex-direction:column;height:100vh;min-height:500px;overflow:hidden;}
header{display:flex;align-items:center;justify-content:space-between;padding:0 24px;height:50px;background:rgba(255,255,255,.92);border-bottom:1px solid var(--border);flex-shrink:0;backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);position:sticky;top:0;z-index:100;}
.brand{display:flex;align-items:center;gap:10px;text-decoration:none;color:var(--text);}
.brand-icon{width:32px;height:32px;border:1.5px solid var(--teal);border-radius:6px;display:grid;place-items:center;color:var(--teal);background:var(--tealg);box-shadow:0 0 0 3px rgba(8,145,178,.07);}
.brand-name{font-family:var(--serif);font-size:16px;font-weight:400;letter-spacing:.01em;}
.brand-sub{font-family:var(--mono);font-size:9px;color:var(--muted);letter-spacing:.14em;text-transform:uppercase;margin-top:1px;}
.hub-link{font-family:var(--mono);font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);text-decoration:none;display:flex;align-items:center;gap:5px;padding:4px 8px;border:1px solid var(--border);border-radius:5px;background:var(--s1);transition:color .15s,border-color .15s;}
.hub-link:hover{color:var(--teal);border-color:var(--teal);}
.disclaimer{font-family:var(--mono);font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);padding:3px 9px;border:1px solid var(--border2);border-radius:100px;background:var(--s1);}
/* Progress */
.progress-bar{display:flex;align-items:center;padding:0 24px;height:36px;background:var(--s1);border-bottom:1px solid var(--border);overflow-x:auto;flex-shrink:0;}
.progress-bar::-webkit-scrollbar{display:none;}
.snode{display:flex;align-items:center;gap:6px;font-family:var(--mono);font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);padding:0 10px;height:100%;border-bottom:2px solid transparent;white-space:nowrap;transition:color .2s,border-color .2s;}
.snode.active{color:var(--text);border-bottom-color:var(--teal);font-weight:600;}
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
.btn-next{font-family:var(--mono);font-size:10px;text-transform:uppercase;letter-spacing:.1em;padding:9px 22px;border-radius:6px;border:none;background:var(--teal);color:#fff;cursor:pointer;transition:opacity .15s;display:flex;align-items:center;gap:7px;}
.btn-next:disabled{opacity:.35;cursor:not-allowed;}
.btn-next:not(:disabled):hover{opacity:.85;}
.btn-back{font-family:var(--mono);font-size:10px;text-transform:uppercase;letter-spacing:.1em;padding:9px 16px;border-radius:6px;border:1px solid var(--border2);background:var(--s1);color:var(--dim);cursor:pointer;transition:opacity .15s;}
.btn-back:hover{opacity:.75;}
/* Checklist */
.check-list{display:flex;flex-direction:column;gap:8px;}
.chk-item{display:flex;align-items:center;gap:12px;padding:12px 16px;border:1.5px solid var(--border);border-radius:8px;cursor:pointer;transition:border-color .15s,background .15s;user-select:none;}
.chk-item:hover{border-color:var(--teal);background:var(--tealg);}
.chk-item.selected{border-color:var(--teal);background:var(--tealg);}
.chk-box{width:18px;height:18px;border-radius:4px;border:1.5px solid var(--border2);background:var(--s1);display:grid;place-items:center;flex-shrink:0;transition:background .15s,border-color .15s;}
.chk-item.selected .chk-box{background:var(--teal);border-color:var(--teal);}
.chk-check{display:none;color:#fff;}
.chk-item.selected .chk-check{display:block;}
.chk-label{font-size:14px;font-weight:500;color:var(--text);}
.chk-sub{font-size:12px;color:var(--dim);margin-top:1px;}
/* Input groups */
.inp-group{display:flex;flex-direction:column;gap:6px;}
.inp-label{font-family:var(--mono);font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:var(--dim);}
.inp-label span{font-weight:600;color:var(--text);}
.inp-row{display:flex;align-items:center;gap:10px;}
.inp-field{border:1.5px solid var(--border);border-radius:7px;padding:9px 13px;font-family:var(--mono);font-size:15px;font-weight:500;background:var(--s1);color:var(--text);width:110px;transition:border-color .15s;outline:none;}
.inp-field:focus{border-color:var(--teal);}
.inp-field.invalid{border-color:var(--red);}
.inp-hint{font-size:12px;color:var(--muted);}
.inp-select{border:1.5px solid var(--border);border-radius:7px;padding:9px 13px;font-family:var(--mono);font-size:12px;background:var(--s1);color:var(--text);cursor:pointer;outline:none;transition:border-color .15s;}
.inp-select:focus{border-color:var(--teal);}
.inp-divider{height:1px;background:var(--border);margin:4px 0;}
/* Results */
.results-panel{display:none;padding:20px 24px 36px;flex-direction:column;gap:14px;max-width:640px;margin:0 auto;width:100%;}
.main.results-done .results-panel{display:flex;}
.main.results-done .wizard-panel{display:none;}
/* Verdict card */
.verdict-card{border-radius:12px;overflow:hidden;box-shadow:var(--shadow-md);}
.verdict-header{padding:16px 20px;color:#fff;}
.verdict-eyebrow{font-family:var(--mono);font-size:10px;text-transform:uppercase;letter-spacing:.12em;opacity:.8;margin-bottom:5px;}
.verdict-name{font-family:var(--serif);font-size:22px;font-weight:400;line-height:1.2;}
.verdict-subtitle{font-size:13px;opacity:.85;margin-top:4px;}
.verdict-body{padding:14px 20px;font-size:13px;color:var(--dim);line-height:1.7;}
.grey-zone-note{margin-top:10px;padding:10px 12px;background:rgba(180,83,9,.10);border:1px solid rgba(180,83,9,.25);border-radius:7px;color:#92400e;font-size:12px;line-height:1.6;}
/* Breakdown card */
.card{border:1px solid var(--border);border-radius:12px;overflow:hidden;}
.card-head{background:var(--s2);padding:10px 16px;font-family:var(--mono);font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.1em;color:var(--dim);border-bottom:1px solid var(--border);}
.card-body{padding:14px 16px;display:flex;flex-direction:column;gap:10px;}
.mrow{display:flex;align-items:center;justify-content:space-between;}
.mrow-left{display:flex;flex-direction:column;}
.mrow-name{font-weight:600;font-size:14px;}
.mrow-full{font-size:12px;color:var(--muted);margin-top:1px;}
.mrow-right{display:flex;align-items:center;gap:10px;}
.mrow-value{font-family:var(--mono);font-size:15px;font-weight:600;}
.badge{font-family:var(--mono);font-size:10px;font-weight:700;padding:3px 8px;border-radius:10px;}
.badge-ok{background:rgba(21,128,61,.12);color:#15803d;}
.badge-bad{background:rgba(192,57,43,.12);color:#c0392b;}
.mdivider{height:1px;background:var(--s2);}
/* Evidence card */
.ev-body{padding:14px 16px;font-size:13px;color:var(--dim);line-height:1.6;}
.ev-badges{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:10px;}
.ev-badge{font-family:var(--mono);font-size:11px;font-weight:600;padding:3px 9px;border-radius:8px;}
.ev-source{background:var(--blueg);color:var(--blue);}
.ev-class{background:var(--s2);color:var(--dim);}
/* New case button */
.new-case-wrap{text-align:center;padding-top:4px;}
.btn-new{font-family:var(--mono);font-size:10px;text-transform:uppercase;letter-spacing:.1em;padding:10px 24px;border-radius:6px;border:1.5px solid var(--border2);background:var(--s1);color:var(--dim);cursor:pointer;transition:color .15s,border-color .15s;}
.btn-new:hover{color:var(--teal);border-color:var(--teal);}
@media(max-width:640px){
  header{padding:0 16px;height:46px;}
  .wizard-scroll{padding:18px 18px;}
  .results-panel{padding:16px 16px 32px;}
}
</style>
</head>
<body>
<div class="app" id="app">

<header>
  <a class="brand" href="../">
    <div class="brand-icon">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
        <path d="M12 21C12 21 4 15.5 4 9.5C4 7 5.8 5 8 5C10 5 11.4 6.2 12 7.5C12.6 6.2 14 5 16 5C18.2 5 20 7 20 9.5C20 15.5 12 21 12 21Z" stroke-linejoin="round"/>
        <line x1="12" y1="9" x2="12" y2="14" stroke-linecap="round"/>
        <line x1="9.5" y1="11.5" x2="14.5" y2="11.5" stroke-linecap="round"/>
      </svg>
    </div>
    <div>
      <div class="brand-name">HeartPilot</div>
      <div class="brand-sub">Coronary Vascular Function</div>
    </div>
  </a>
  <div style="display:flex;align-items:center;gap:10px;">
    <a class="hub-link" href="../">
      <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 6H2M6 2L2 6l4 4"/></svg>
      Hub
    </a>
    <span class="disclaimer">Research &amp; Education Only</span>
  </div>
</header>

<div class="progress-bar">
  <div class="snode active" id="snode-0"><div class="snode-num">1</div>Measurements</div>
  <div class="ssep"></div>
  <div class="snode" id="snode-1"><div class="snode-num">2</div>Values</div>
  <div class="ssep"></div>
  <div class="snode" id="snode-2"><div class="snode-num">3</div>Interpretation</div>
</div>

<div class="main" id="main">
  <div class="wizard-panel">
    <div class="wizard-scroll">

      <!-- Step 0: Measurements -->
      <div class="step active" id="step-0">
        <div class="step-title">Which measurements were taken?</div>
        <p class="step-sub">Select all that apply. At least one measurement is required.</p>
        <div class="check-list">
          <div class="chk-item" id="chk-ffr" onclick="toggleMeasurement('ffr')">
            <div class="chk-box"><svg class="chk-check" width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6l3 3 5-5"/></svg></div>
            <div>
              <div class="chk-label">FFR</div>
              <div class="chk-sub">Fractional flow reserve — hyperaemia-based pressure wire</div>
            </div>
          </div>
          <div class="chk-item" id="chk-resting" onclick="toggleMeasurement('resting')">
            <div class="chk-box"><svg class="chk-check" width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6l3 3 5-5"/></svg></div>
            <div>
              <div class="chk-label">Resting index</div>
              <div class="chk-sub">iFR / Pd:Pa / RFR / DFR — non-hyperaemic pressure ratio</div>
            </div>
          </div>
          <div class="chk-item" id="chk-cfr" onclick="toggleMeasurement('cfr')">
            <div class="chk-box"><svg class="chk-check" width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6l3 3 5-5"/></svg></div>
            <div>
              <div class="chk-label">CFR</div>
              <div class="chk-sub">Coronary flow reserve — thermodilution or Doppler</div>
            </div>
          </div>
          <div class="chk-item" id="chk-imr" onclick="toggleMeasurement('imr')">
            <div class="chk-box"><svg class="chk-check" width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6l3 3 5-5"/></svg></div>
            <div>
              <div class="chk-label">IMR</div>
              <div class="chk-sub">Index of microcirculatory resistance — thermodilution-derived</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Step 1: Values -->
      <div class="step" id="step-1">
        <div class="step-title">Enter the measured values</div>
        <p class="step-sub">Enter each result as recorded. Acceptable ranges are shown as a guide.</p>

        <!-- FFR group -->
        <div class="inp-group" id="grp-ffr" style="display:none;">
          <div class="inp-label"><span>FFR</span> — fractional flow reserve</div>
          <div class="inp-row">
            <input class="inp-field" id="val-ffr" type="number" step="0.01" min="0.1" max="1.0" placeholder="0.50–1.00" oninput="onValueInput()">
          </div>
        </div>

        <!-- Resting index group -->
        <div class="inp-group" id="grp-resting" style="display:none;">
          <div class="inp-label"><span>Resting index</span> — select type</div>
          <div class="inp-row" style="flex-wrap:wrap;gap:8px;">
            <select class="inp-select" id="val-resting-type" onchange="onValueInput()">
              <option value="ifr">iFR — instantaneous wave-free ratio</option>
              <option value="pdpa">Pd:Pa — resting pressure ratio</option>
              <option value="rfr">RFR — resting full-cycle ratio</option>
              <option value="dfr">DFR — diastolic pressure ratio</option>
            </select>
          </div>
          <div class="inp-row">
            <input class="inp-field" id="val-resting" type="number" step="0.01" min="0.1" max="1.0" placeholder="0.50–1.00" oninput="onValueInput()">
          </div>
        </div>

        <!-- CFR group -->
        <div class="inp-group" id="grp-cfr" style="display:none;">
          <div class="inp-label"><span>CFR</span> — coronary flow reserve</div>
          <div class="inp-row">
            <input class="inp-field" id="val-cfr" type="number" step="0.1" min="0.5" max="10" placeholder="0.5–10" oninput="onValueInput()">
          </div>
        </div>

        <!-- IMR group -->
        <div class="inp-group" id="grp-imr" style="display:none;">
          <div class="inp-label"><span>IMR</span> — index of microcirculatory resistance</div>
          <div class="inp-row">
            <input class="inp-field" id="val-imr" type="number" step="1" min="1" max="200" placeholder="1–100" oninput="onValueInput()">
          </div>
        </div>

      </div>

      <!-- Step 2: Results (rendered by JS) -->
      <div class="step" id="step-2"></div>

    </div><!-- /wizard-scroll -->

    <div class="wizard-foot" id="wizard-foot">
      <button class="btn-back" id="btn-back" onclick="goBack()" style="display:none;">← Back</button>
      <button class="btn-next" id="btn-next" onclick="goNext()" disabled>
        Next
        <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6h8M6 2l4 4-4 4"/></svg>
      </button>
    </div>

  </div><!-- /wizard-panel -->

  <!-- Results panel (shown after analysis) -->
  <div class="results-panel" id="results-panel"></div>

</div><!-- /main -->
</div><!-- /app -->

<script src="engine/interpreter.js"></script>
<script>
'use strict';

// ── Wizard state ──────────────────────────────────────────────────────────────

var S = {
  hasFfr:       false,
  hasResting:   false,
  hasCfr:       false,
  hasImr:       false,
  ffr:          null,
  restingType:  null,
  restingValue: null,
  cfr:          null,
  imr:          null,
};

var currentStep = 0;

// ── Step navigation ───────────────────────────────────────────────────────────

function showStep(n) {
  for (var i = 0; i < 3; i++) {
    var step  = document.getElementById('step-' + i);
    var snode = document.getElementById('snode-' + i);
    step.classList.remove('active');
    snode.classList.remove('active', 'done');
    if (i < n)  snode.classList.add('done');
    if (i === n) { step.classList.add('active'); snode.classList.add('active'); }
  }
  document.getElementById('btn-back').style.display = n > 0 ? '' : 'none';
  currentStep = n;
  updNextBtn();
}

function goNext() {
  if (!valid(currentStep)) return;
  var leaving = currentStep;
  if (leaving === 1) {
    collectValues();
    runAnalysis();
    return;
  }
  showStep(leaving + 1);
  if (leaving === 0) buildValuesStep();
}

function goBack() {
  if (currentStep > 0) showStep(currentStep - 1);
}

// Called when entering step 1 to show/hide relevant input groups
function buildValuesStep() {
  document.getElementById('grp-ffr').style.display     = S.hasFfr     ? '' : 'none';
  document.getElementById('grp-resting').style.display = S.hasResting  ? '' : 'none';
  document.getElementById('grp-cfr').style.display     = S.hasCfr      ? '' : 'none';
  document.getElementById('grp-imr').style.display     = S.hasImr      ? '' : 'none';
  // Clear previous values
  ['val-ffr','val-resting','val-cfr','val-imr'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.value = '';
  });
}

// ── Validation ────────────────────────────────────────────────────────────────

function valid(n) {
  if (n === 0) {
    return S.hasFfr || S.hasResting || S.hasCfr || S.hasImr;
  }
  if (n === 1) {
    if (S.hasFfr && !validNum('val-ffr', 0.1, 1.0)) return false;
    if (S.hasResting && !validNum('val-resting', 0.1, 1.0)) return false;
    if (S.hasCfr && !validNum('val-cfr', 0.1, 20)) return false;
    if (S.hasImr && !validNum('val-imr', 1, 500)) return false;
    return true;
  }
  return true;
}

function validNum(id, min, max) {
  var el = document.getElementById(id);
  if (!el) return true;
  var v = parseFloat(el.value);
  return !isNaN(v) && v >= min && v <= max;
}

function updNextBtn() {
  var btn = document.getElementById('btn-next');
  btn.disabled = !valid(currentStep);
}

// ── Inputs ────────────────────────────────────────────────────────────────────

function toggleMeasurement(key) {
  var map = { ffr: 'hasFfr', resting: 'hasResting', cfr: 'hasCfr', imr: 'hasImr' };
  S[map[key]] = !S[map[key]];
  var el = document.getElementById('chk-' + key);
  el.classList.toggle('selected', S[map[key]]);
  updNextBtn();
}

function onValueInput() {
  updNextBtn();
}

function collectValues() {
  S.ffr          = S.hasFfr     ? parseFloat(document.getElementById('val-ffr').value)     : null;
  S.restingType  = S.hasResting ? document.getElementById('val-resting-type').value         : null;
  S.restingValue = S.hasResting ? parseFloat(document.getElementById('val-resting').value)  : null;
  S.cfr          = S.hasCfr     ? parseFloat(document.getElementById('val-cfr').value)      : null;
  S.imr          = S.hasImr     ? parseFloat(document.getElementById('val-imr').value)      : null;
}

// ── Analysis + rendering ──────────────────────────────────────────────────────

function runAnalysis() {
  var result = CvfInterpreter.interpret({
    ffr:          S.ffr,
    restingType:  S.restingType,
    restingValue: S.restingValue,
    cfr:          S.cfr,
    imr:          S.imr,
  });
  renderResults(result);

  // Switch layout
  document.getElementById('main').classList.add('results-done');
  document.body.classList.add('results-done');
  // Mark step 3 done in progress bar
  document.getElementById('snode-1').classList.remove('active');
  document.getElementById('snode-1').classList.add('done');
  document.getElementById('snode-2').classList.add('active');
}

function renderResults(r) {
  var panel = document.getElementById('results-panel');

  // Grey zone note HTML
  var greyZoneHtml = '';
  if (r.greyZone && r.greyZoneNote) {
    greyZoneHtml = '<div class="grey-zone-note">'
      + '<strong>Grey zone:</strong> ' + escHtml(r.greyZoneNote)
      + '</div>';
  }

  // Measurement breakdown rows
  var mrows = r.measurements.map(function (m) {
    var badgeCls = m.normal ? 'badge-ok' : 'badge-bad';
    return '<div class="mrow">'
      + '<div class="mrow-left">'
      + '<div class="mrow-name">' + escHtml(m.name) + '</div>'
      + '<div class="mrow-full">' + escHtml(m.fullName) + '</div>'
      + '</div>'
      + '<div class="mrow-right">'
      + '<span class="mrow-value">' + m.value + '</span>'
      + '<span class="badge ' + badgeCls + '">' + escHtml(m.label) + '</span>'
      + '</div>'
      + '</div>';
  }).join('<div class="mdivider"></div>');

  panel.innerHTML = ''

    // Verdict card
    + '<div class="verdict-card">'
    + '<div class="verdict-header" style="background:' + escHtml(r.color) + ';">'
    + '<div class="verdict-eyebrow">Physiological Phenotype</div>'
    + '<div class="verdict-name">' + escHtml(r.phenotype) + '</div>'
    + '<div class="verdict-subtitle">' + escHtml(r.subtitle) + '</div>'
    + '</div>'
    + '<div class="verdict-body">'
    + escHtml(r.summary)
    + greyZoneHtml
    + '</div>'
    + '</div>'

    // Measurement breakdown
    + '<div class="card">'
    + '<div class="card-head">Measurement Breakdown</div>'
    + '<div class="card-body">' + mrows + '</div>'
    + '</div>'

    // Evidence basis
    + '<div class="card">'
    + '<div class="card-head">Evidence Basis</div>'
    + '<div class="ev-body">'
    + '<div class="ev-badges">'
    + '<span class="ev-badge ev-source">' + escHtml(r.evidence.source) + ' ' + r.evidence.year + '</span>'
    + '<span class="ev-badge ev-class">Class ' + escHtml(r.evidence.classLabel) + '</span>'
    + '<span class="ev-badge ev-class">Level ' + escHtml(r.evidence.level) + '</span>'
    + '</div>'
    + escHtml(r.evidence.rationale)
    + '</div>'
    + '</div>'

    // New case
    + '<div class="new-case-wrap">'
    + '<button class="btn-new" onclick="resetCase()">&#8592; New Case</button>'
    + '</div>';
}

function resetCase() {
  S = { hasFfr: false, hasResting: false, hasCfr: false, hasImr: false,
        ffr: null, restingType: null, restingValue: null, cfr: null, imr: null };
  // Unselect all checkboxes
  ['ffr','resting','cfr','imr'].forEach(function (k) {
    document.getElementById('chk-' + k).classList.remove('selected');
  });
  document.getElementById('main').classList.remove('results-done');
  document.body.classList.remove('results-done');
  // Reset progress bar
  ['snode-0','snode-1','snode-2'].forEach(function (id) {
    var el = document.getElementById(id);
    el.classList.remove('active','done');
  });
  document.getElementById('results-panel').innerHTML = '';
  showStep(0);
  // Restore footer
  document.getElementById('wizard-foot').style.display = '';
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Init ──────────────────────────────────────────────────────────────────────

showStep(0);
</script>
</body>
</html>
```

- [ ] **Step 4.2: Verify in browser**

Open `cvf/index.html` in a browser (or via a local server). Verify:
- Step 1: checkboxes toggle selection; Next button disabled until at least one is checked
- Step 2: only selected measurement input groups are visible; Next disabled until all fields have valid numbers
- Step 3: results render with correct phenotype, measurement breakdown (values + normal/abnormal badges with cutoffs), evidence card, and grey zone note when applicable
- "New Case" button resets to Step 1

- [ ] **Step 4.3: Commit**

```bash
git add cvf/index.html
git commit -m "feat(cvf): add CVF wizard UI"
```

---

## Task 5: Hub card + CLAUDE.md

**Files:**
- Modify: `index.html`
- Modify: `CLAUDE.md`

- [ ] **Step 5.1: Add CVF card to hub proc-grid**

In `index.html`, find the closing `</a>` of the PCI card (the first `<a class="proc-card card-pci"...>` element). Insert the following new card immediately after it:

```html
    <a class="proc-card card-cvf" href="cvf/">
      <div class="card-top">
        <div class="card-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7">
            <path d="M3 12C3 12 5 6 9 6C13 6 11 18 15 18C19 18 21 12 21 12" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <span class="card-status status-live">Live</span>
      </div>
      <div class="card-abbr">CVF</div>
      <div class="card-name">Coronary Vascular Function</div>
      <div class="card-desc">Invasive physiological phenotyping — FFR, resting indices, CFR &amp; IMR interpretation with evidence-based classification</div>
      <div class="card-cta">
        <span>Open</span>
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 6h8M6 2l4 4-4 4" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </div>
    </a>
```

Also add the accent colour CSS for the new card class. Find the existing card accent colour block (`.card-pci`, `.card-tavr`, etc.) and add:

```css
.card-cvf   {--card-accent:#0891b2;}
```

- [ ] **Step 5.2: Update CLAUDE.md**

In `CLAUDE.md`, find the "Running Tests" section and add the CVF test command after the PCI test command:

```bash
node cvf/test/interpreter.test.js
```

Also update the "All 35 tests must pass before committing" line to: "Both test suites must pass before committing: `node pci/test/engine.test.js` and `node cvf/test/interpreter.test.js`."

- [ ] **Step 5.3: Verify hub in browser**

Open `index.html` in a browser. Confirm the CVF card appears with teal accent, correct abbreviation, name, description, and links to `cvf/`.

- [ ] **Step 5.4: Commit**

```bash
git add index.html CLAUDE.md
git commit -m "feat: add CVF card to hub; update CLAUDE.md with test command"
```

---

## Verification Checklist

Before marking complete, confirm all of the following:

- [ ] `node cvf/test/interpreter.test.js` exits 0 with all tests passing
- [ ] `node pci/test/engine.test.js` still exits 0 (no regressions)
- [ ] CVF wizard opens in browser and completes a full case without errors
- [ ] FFR grey zone note appears when FFR is entered in the 0.75–0.80 range
- [ ] "New Case" resets the wizard to Step 1 cleanly
- [ ] Hub page shows CVF card with correct teal accent colour and live status
