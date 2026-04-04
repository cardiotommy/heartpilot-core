# OHCA Post-ROSC Prognostication Wizard — Design Spec

**Date:** 2026-04-04
**Status:** Approved
**Tool:** HeartPilot — OHCA Post-ROSC Risk Scores

---

## Overview

A standalone decision-support wizard for patients presenting post-ROSC following out-of-hospital cardiac arrest (OHCA). The wizard collects clinically relevant variables and calculates five established prognostication scores. Output is scores with interpretation only — no decision recommendations.

**Clinical context:** Used at the bedside in the emergency department, immediately post-ROSC. Point-of-care pH and lactate are assumed available. Creatinine may or may not be available.

**Scope boundary:** Independent of the PCI wizard. No link between tools. No synthesised recommendation across scores.

---

## Architecture

```
ohca/
├── index.html          # Wizard UI — self-contained single-page app
├── engine/
│   └── scores.js       # Pure score calculation functions
└── test/
    └── scores.test.js  # Test suite with published reference cases
```

Mirrors the CVF wizard structure (`cvf/index.html`, `cvf/engine/interpreter.js`, `cvf/test/interpreter.test.js`).

`scores.js` uses the same dual-export pattern as existing engine files:
```js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = OhcaScores;
} else if (typeof window !== 'undefined') {
  window.OhcaScores = OhcaScores;
}
```

**Branding:** HeartPilot red (`#c0392b`) — consistent with the PCI wizard.

---

## Wizard Steps (4 steps)

### Step 1 — Arrest

| Variable | Type | Values | Notes |
|---|---|---|---|
| `age` | integer | 18–100 | Years |
| `initialRhythm` | string | `shockable` / `non_shockable` | VF/pVT vs PEA/Asystole |
| `refractoryVF` | boolean | true / false | Conditional — shown only if `initialRhythm = shockable`; ≥3 shocks required |
| `witnessed` | boolean | true / false | Collapse witnessed by bystander or EMS |
| `location` | string | `public` / `home` / `other` | Location of arrest |
| `bystanderCPR` | boolean | true / false | Bystander CPR initiated before EMS |

### Step 2 — Resuscitation

| Variable | Type | Values | Notes |
|---|---|---|---|
| `noFlowTime` | integer | 0–30 min | Collapse to first CPR (0 if witnessed + immediate CPR) |
| `lowFlowTime` | integer | 0–90 min | CPR start to ROSC |
| `epinephrineDose` | number | 0–20 mg | Total epinephrine administered |

### Step 3 — On Arrival

| Variable | Type | Values | Notes |
|---|---|---|---|
| `haemStatus` | string | `stable` / `shock` | Cardiogenic shock on ED arrival |
| `gcs` | integer | 3–15 | Glasgow Coma Scale on arrival |
| `stemiEcg` | string | `stemi` / `lbbb` / `none` | First post-ROSC ECG finding |
| `lvef` | string | `gt30` / `lte30` / `unknown` | Bedside echo if available; optional |

### Step 4 — Labs

| Variable | Type | Values | Notes |
|---|---|---|---|
| `ph` | number | 6.80–7.60 | Arterial pH (POC blood gas) |
| `lactate` | number | 0–25 mmol/L | Arterial lactate (POC blood gas) |
| `glucose` | number | 2–30 mmol/L | Blood glucose |
| `creatinine` | number | optional | µmol/L; if absent TTM score marked incomplete |

---

## Score Engine (`ohca/engine/scores.js`)

### Public API

```js
OhcaScores.cahp(inputs)         // → ScoreResult
OhcaScores.miracle2(inputs)     // → ScoreResult
OhcaScores.ttm(inputs)          // → ScoreResult
OhcaScores.ohca(inputs)         // → ScoreResult
OhcaScores.caspri(inputs)       // → ScoreResult
OhcaScores.calculateAll(inputs) // → ScoreResult[]
```

### ScoreResult object

```js
{
  id:             string,   // 'cahp' | 'miracle2' | 'ttm' | 'ohca' | 'caspri'
  name:           string,   // Display name e.g. 'CAHP Score'
  score:          number,   // Calculated numeric value (null if incomplete)
  tier:           string,   // 'low' | 'intermediate' | 'high' | 'incomplete'
  label:          string,   // Human-readable tier e.g. 'High Risk'
  interpretation: string,   // Outcome context e.g. 'Predicts poor neurological outcome...'
  thresholds:     object,   // Published tier boundaries for display
  reference:      object,   // { authors, journal, year }
  predicts:       string,   // 'neurological' | 'survival' | 'mortality'
  horizon:        string,   // Time horizon e.g. 'hospital discharge' | '180 days'
  incomplete:     boolean,
  incompleteReason: string|null,
}
```

### Tier colour mapping

| Tier | Colour |
|---|---|
| `low` | Green (`#15803d`) |
| `intermediate` | Amber (`#b45309`) |
| `high` | Red (`#c0392b`) |
| `incomplete` | Muted (`#a8a49f`) |

### Score formulas and thresholds

Exact coefficients and published tier thresholds must be sourced from the original papers during implementation and validated against published reference cases in the test suite. Do not use approximate or recalled values — look up each paper.

| Score | Source paper | What it predicts | Horizon |
|---|---|---|---|
| CAHP | Dumas et al., Resuscitation 2016; Bougouin et al. updates | Poor neurological outcome (CPC 3–5) | Hospital discharge |
| MIRACLE2 | Pareek et al., Heart 2020 | Poor neurological outcome (CPC 3–5) | Hospital discharge |
| TTM | Olsen et al. (TTM trial cohort) | All-cause mortality | 180 days |
| OHCA | Bougouin et al. / verify exact derivation paper | In-hospital survival | Hospital discharge |
| CASPRI | Chan et al., JACC 2014 | In-hospital survival | Hospital discharge |

**Note on CASPRI:** Originally derived from an in-hospital cardiac arrest cohort. Applicability to OHCA is limited; the output card should include a note to this effect.

**Note on CAHP variants:** The CAHP score has pH and lactate variants. Implement both and display the lactate variant as primary (lactate available via POC); show pH variant as secondary value on the detail card.

---

## Results Panel

### Score summary grid

A 2-column grid showing all 5 scores at a glance, with the 5th score (CASPRI) spanning full width to avoid an orphaned single cell. Each cell contains:
- Score name (monospace, small caps)
- Numeric value (large, bold, tier-coloured)
- Tier badge (e.g. "HIGH RISK", "INTERMEDIATE", "LOW RISK", "INCOMPLETE")

### Detail cards

Below the grid, one card per score (in order: CAHP, MIRACLE2, TTM, OHCA, CASPRI). Each card:
- Header: score name, numeric value, tier badge — coloured by tier
- Body:
  - What it predicts and over what time horizon
  - Published tier thresholds (e.g. "Score <150 low risk · 150–200 intermediate · >200 high risk")
  - Source reference (authors, journal, year)
  - If CASPRI: caveat note about IHCA derivation
  - If incomplete: grey card, "Incomplete — requires [variable name]"

### No synthesis

Scores are displayed independently. No aggregate risk summary. No recommendation.

---

## Testing (`ohca/test/scores.test.js`)

Uses Node.js built-ins only (`assert`, `fs`). Same pattern as `pci/test/engine.test.js` and `cvf/test/interpreter.test.js`.

**Required test coverage:**

1. **Reference case tests** — for each score, at least one published reference case (from the derivation paper or a validation cohort paper) with known inputs and expected output. Verifies the formula implementation is correct.
2. **Tier boundary tests** — verify tier assignment at and around published thresholds.
3. **Incomplete handling** — verify scores return `incomplete: true` correctly when optional variables are absent (e.g. TTM without creatinine).
4. **Conditional field** — verify `refractoryVF` is ignored when `initialRhythm = non_shockable`.
5. **Edge cases** — zero no-flow time (witnessed + immediate CPR), minimum/maximum age, extreme pH values.

Run with: `node ohca/test/scores.test.js`

---

## Navigation

The wizard lives at `ohca/index.html`. The header links back to a HeartPilot hub page (consistent with CVF wizard pattern — `hub-link` component). No cross-links to the PCI wizard.

---

## What is out of scope

- Decision recommendations (which patients should proceed to angio)
- Integration with the PCI wizard
- Targeted temperature management protocol guidance
- Comorbidity scoring beyond what individual score formulas require
- Any backend or server-side component
