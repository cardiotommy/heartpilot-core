# CVF Wizard — Design Specification

**Date:** 2026-03-21
**Status:** Approved
**Author:** AI-assisted design session

---

## Overview

A new coronary vascular function (CVF) interpretation wizard for HeartPilot. Takes invasive physiological measurements as input and returns a deterministic physiological phenotype classification, with transparent threshold reasoning and evidence basis. Lives at `cvf/index.html` as a standalone page, styled consistently with the existing PCI wizard.

---

## Scope

- Supports the full invasive physiological suite: FFR, resting indices (iFR / Pd:Pa / RFR / DFR), CFR, and IMR
- User selects which measurements were taken upfront; only those fields are shown
- Output is a single physiological phenotype (not a revascularisation recommendation)
- Context-agnostic: suitable for cath lab, post-procedure documentation, and outpatient review
- Thresholds and classification rationale are shown in the output (educational transparency)
- Zero external dependencies; ES5-compatible JavaScript; no build step

---

## Architecture

### Approach: Page + interpreter module

Two files:

```
cvf/
├── index.html          # Wizard UI — all DOM logic inline
└── engine/
    └── interpreter.js  # Classification logic — pure functions, no DOM dependency
```

`interpreter.js` exports a `CvfInterpreter` object using the same dual-export pattern as `PciEngine`:

```js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CvfInterpreter;
} else if (typeof window !== 'undefined') {
  window.CvfInterpreter = CvfInterpreter;
}
```

### `CvfInterpreter` API

| Export | Description |
|---|---|
| `interpret(values)` | Takes a `values` object, returns a `PhenotypeResult` |
| `THRESHOLDS` | Named constants for all diagnostic cut-offs |

**`values` object:**

All keys are always present. Unselected measurements must be passed as `null` — never omitted. This is the only valid representation of "not measured"; the interpreter does not handle `undefined`.

```js
{
  ffr:          number | null,   // e.g. 0.76; null = not measured
  restingType:  string | null,   // 'ifr' | 'pdpa' | 'rfr' | 'dfr'; null = not measured
  restingValue: number | null,   // null = not measured; must be null when restingType is null
  cfr:          number | null,   // null = not measured
  imr:          number | null,   // null = not measured
}
```

If `restingType` is non-null but `restingValue` is null (or vice versa), `interpret()` logs a console warning and treats the resting index as not measured.

`interpret()` does not validate physiological plausibility (e.g. FFR > 1.0). The UI is responsible for constraining input ranges. Values outside plausible ranges are classified by the threshold logic without error.

**`PhenotypeResult` object:**
```js
{
  phenotype:    string,          // e.g. 'Structural CMD'
  subtitle:     string,          // one-line clinical description
  summary:      string,          // plain-English paragraph
  measurements: MeasurementResult[],
  evidence:     { source, year, classLabel, level, rationale },
  greyZone:     boolean,         // true if FFR in 0.75–0.80 range (inclusive)
  greyZoneNote: string | null,   // explanatory note if greyZone === true; null otherwise
}
```

Note: the field is named `classLabel` (not `class`) to avoid collision with the reserved word in some JS environments.

**`MeasurementResult` object:**
```js
{
  name:     string,   // short label, e.g. 'FFR', 'iFR', 'CFR', 'IMR'
  fullName: string,   // expanded name, e.g. 'fractional flow reserve'
  value:    number,
  normal:   boolean,
  label:    string,   // threshold label, e.g. 'Normal > 0.80' or 'Reduced < 2.0'
}
```

Resting index `name` reflects the selected type: `'iFR'`, `'Pd:Pa'`, `'RFR'`, or `'DFR'`. Full names:
- iFR → `'instantaneous wave-free ratio'`
- Pd:Pa → `'resting distal-to-aortic pressure ratio'`
- RFR → `'resting full-cycle ratio'`
- DFR → `'diastolic pressure ratio'`

### `THRESHOLDS` constants

```js
CvfInterpreter.THRESHOLDS = {
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
```

### Hub page

`index.html` at the repository root will have a CVF card added alongside the existing PCI wizard link, using a teal/cyan accent colour (`#0891b2`).

---

## Wizard Steps

### Step 1 — Measurements taken

Multi-select checklist. At least one measurement must be selected to proceed.

Options:
- FFR — fractional flow reserve
- Resting index — iFR / Pd:Pa / RFR / DFR
- CFR — coronary flow reserve
- IMR — index of microcirculatory resistance

### Step 2 — Enter values

Numeric input fields for each selected measurement only. Resting index step includes a type dropdown (iFR / Pd:Pa / RFR / DFR) which determines the threshold used. Suggested input ranges shown as placeholder text (e.g. `0.50 – 1.00` for FFR; `1 – 100` for IMR).

**Cutoff values are NOT shown on this step** — displayed only in the results.

Validation: all selected measurement fields must be filled with a valid number before proceeding.

### Step 3 — Interpretation

Results panel. Terminal state — no further navigation. A "New Case" button resets to Step 1.

---

## Phenotype Classification Logic

Classification is based on ESC 2024 Chronic Coronary Syndrome guidelines. The epicardial axis uses FFR ≤ 0.80 (or resting index at its type-specific threshold). The microvascular flow axis uses CFR < 2.0. The microvascular resistance axis uses IMR ≥ 25.

### Primary phenotypes (full data)

| Epicardial | CFR | IMR | Phenotype |
|---|---|---|---|
| Normal | Normal (≥ 2.0) | Normal (< 25) | **Normal physiology** |
| Abnormal | Normal (≥ 2.0) | any / absent | **Epicardial disease** |
| Normal | Reduced (< 2.0) | Elevated (≥ 25) | **Structural CMD** |
| Normal | Reduced (< 2.0) | Normal (< 25) | **Functional CMD** |
| Abnormal | Reduced (< 2.0) | Normal (< 25) | **Diffuse epicardial disease** |
| Abnormal | Reduced (< 2.0) | Elevated (≥ 25) | **Mixed disease** |

Note on the "Epicardial disease" row: IMR is not required to classify this phenotype. Whether IMR is measured or not, a normal CFR with abnormal epicardial indices yields "Epicardial disease." The IMR value (if present) is shown in the measurement breakdown but does not change the phenotype.

### Partial data fallbacks

**IMR not measured (CFR measured):**
- Normal CFR + Normal epicardial → **Normal physiology**
- Abnormal CFR + Normal epicardial → **Microvascular dysfunction** (cannot distinguish structural from functional without IMR)
- Abnormal CFR + Abnormal epicardial → **Mixed / diffuse epicardial disease** (cannot distinguish without IMR)
- Normal CFR + Abnormal epicardial → **Epicardial disease**

**IMR measured, CFR not measured:**
- CFR is required to classify on the microvascular flow axis. Without CFR, the phenotype is determined by the epicardial axis only, with a note that microvascular flow status is incomplete:
  - Abnormal epicardial → **Epicardial disease** (IMR value shown in breakdown; microvascular flow not fully assessed)
  - Normal epicardial → **Non-obstructive** (IMR value shown; microvascular flow not fully assessed)

**CFR and IMR both not measured:**
- Classification limited to epicardial axis only:
  - Abnormal epicardial → **Epicardial disease**
  - Normal epicardial → **Non-obstructive**

### Phenotype copy

All phenotypes use the following fixed `subtitle` and `summary` strings:

| Phenotype | Subtitle | Summary |
|---|---|---|
| Normal physiology | No epicardial or microvascular disease detected | All measured indices are within normal limits. There is no evidence of significant obstructive epicardial coronary artery disease or coronary microvascular dysfunction. |
| Epicardial disease | Obstructive epicardial CAD — revascularisation to consider | Pressure indices confirm haemodynamically significant epicardial stenosis. Where coronary flow reserve is measured and normal, the flow impairment is attributable to the focal epicardial lesion rather than microvascular disease. |
| Structural CMD | Coronary microvascular dysfunction — elevated resistance | Normal epicardial physiology with reduced coronary flow reserve and elevated microvascular resistance. This pattern is consistent with structural coronary microvascular dysfunction (CMD). No haemodynamically significant epicardial stenosis is present. |
| Functional CMD | Coronary microvascular dysfunction — functional or vasospastic aetiology | Normal epicardial physiology with reduced coronary flow reserve but preserved microvascular resistance. This pattern suggests functional coronary microvascular dysfunction, such as microvascular spasm or abnormal vasomotion, rather than structural microvascular disease. |
| Diffuse epicardial disease | Diffuse non-focal epicardial CAD — microvascular resistance preserved | Pressure indices are abnormal and coronary flow reserve is reduced, but microvascular resistance is normal. This pattern suggests diffuse or serial epicardial disease causing the flow impairment, rather than true microvascular dysfunction. |
| Mixed disease | Coexistent epicardial CAD and microvascular dysfunction | Both epicardial and microvascular pathology are present. Pressure indices confirm haemodynamically significant epicardial stenosis, and microvascular indices confirm coexistent coronary microvascular dysfunction. This mixed pattern has implications for management beyond revascularisation alone. |
| Microvascular dysfunction | Coronary microvascular dysfunction — subtype undetermined | Normal epicardial physiology with reduced coronary flow reserve, consistent with coronary microvascular dysfunction (CMD). IMR measurement is required to distinguish structural CMD (elevated microvascular resistance) from functional CMD (normal resistance, vasospastic aetiology). |
| Mixed / diffuse epicardial disease | Epicardial disease with possible microvascular involvement | Abnormal pressure indices and reduced coronary flow reserve are present. Without IMR measurement, it is not possible to determine whether the reduced CFR reflects diffuse epicardial disease alone or coexistent microvascular dysfunction. |
| Non-obstructive | No significant epicardial stenosis — microvascular status not fully assessed | Pressure indices do not confirm haemodynamically significant epicardial stenosis. Coronary flow reserve was not measured; a full microvascular phenotype cannot be determined from pressure data alone. |

### Evidence object per phenotype

A single evidence object is used per result. For phenotypes with multi-axial evidence (Mixed disease, Diffuse epicardial disease), the most recent comprehensive guideline is cited.

| Phenotype(s) | source | year | classLabel | level | rationale |
|---|---|---|---|---|---|
| All | ESC | 2024 | IIa | B | CFR cut-off of 2.0 and IMR cut-off of 25 per ESC 2024 Chronic Coronary Syndrome guidelines. FFR cut-off of 0.80 per ESC 2024. |

All phenotypes share the same evidence object. Rationale text in the results panel is fixed.

### FFR grey zone flag

When FFR is measured AND falls in the range 0.75 ≤ FFR ≤ 0.80 (inclusive at both ends):
- Classification logic is unchanged (FFR ≤ 0.80 = abnormal → contributes to Epicardial disease, Mixed disease, or Diffuse epicardial disease depending on CFR/IMR)
- `greyZone: true` is set on the result
- `greyZoneNote` is set to:

> *"FFR values between 0.75 and 0.80 fall within the historical grey zone from the original DEFER and FAME trials. While ≤ 0.80 is the current guideline threshold, deferral of revascularisation may still be reasonable in this range, informed by clinical context and shared decision-making with the patient."*

The grey zone flag is not set when the phenotype result is "Normal physiology," "Non-obstructive," or any microvascular-only phenotype (FFR must be abnormal to trigger it, but these phenotypes require normal FFR). In practice the flag only ever appears on Epicardial disease, Mixed disease, and Diffuse epicardial disease results.

---

## Results Panel

Three sections displayed after interpretation:

### 1. Phenotype verdict card
- Coloured header (colour varies by phenotype — see palette below)
- Phenotype name (large, prominent)
- One-line subtitle (clinical description)
- Plain-English summary paragraph
- Amber grey-zone caution note (shown only when `greyZone === true`)

**Header colour palette:**

| Phenotype | Colour |
|---|---|
| Normal physiology | Green (`#059669`) |
| Epicardial disease | Red (`#dc2626`) |
| Structural CMD | Amber (`#92400e`) |
| Functional CMD | Amber (`#92400e`) |
| Microvascular dysfunction | Amber (`#92400e`) |
| Diffuse epicardial disease | Purple (`#4c1d95`) |
| Mixed / diffuse epicardial disease | Purple (`#4c1d95`) |
| Mixed disease | Pink/rose (`#831843`) |
| Non-obstructive | Slate (`#334155`) |

### 2. Measurement breakdown
- One row per measured value (in order: FFR, resting index, CFR, IMR)
- Shows: measurement short name, full name, numeric value, normal/abnormal badge with cutoff
- Green badge = normal; red badge = abnormal

### 3. Evidence basis
- ESC 2024 source badge, class badge, level badge
- Fixed rationale sentence

---

## Testing

File: `cvf/test/interpreter.test.js`

Run: `node cvf/test/interpreter.test.js`

Pattern: Node.js built-ins only (`assert`, no framework). Prints `✓` per passing test. Exits 0 on pass, 1 on failure.

**Test coverage:**

1. All 6 primary phenotypes with canonical full-data value sets
2. `Non-obstructive` — normal FFR only (no resting index, no CFR, no IMR)
3. `Epicardial disease` — abnormal FFR only (no CFR, no IMR)
4. `Microvascular dysfunction` — normal FFR, reduced CFR, no IMR
5. `Mixed / diffuse epicardial disease` — abnormal FFR, reduced CFR, no IMR
6. `Non-obstructive` with IMR measured but CFR absent — phenotype from epicardial axis only; IMR in breakdown
7. Boundary values: FFR = 0.80 → abnormal; FFR = 0.81 → normal; CFR = 2.0 → normal; CFR = 1.99 → reduced; IMR = 25 → elevated; IMR = 24 → normal
8. Grey zone flag: FFR 0.75 → `greyZone: true`; FFR 0.77 → `greyZone: true`; FFR 0.80 → `greyZone: true`; FFR 0.74 → `greyZone: false`; FFR 0.81 → `greyZone: false`
9. Resting index types: iFR ≤ 0.89 → abnormal; Pd:Pa ≤ 0.91 → abnormal; RFR ≤ 0.89 → abnormal; DFR ≤ 0.89 → abnormal
10. `restingType` non-null but `restingValue` null → treated as not measured (console.warn); `restingType` null, `restingValue` non-null → treated as not measured (console.warn)
11. `THRESHOLDS` constants exported and values match classification boundaries used in tests

---

## CLAUDE.md update required

Add the following to the "Running Tests" section of `CLAUDE.md`:

```bash
cd cvf
node test/interpreter.test.js
```

---

## Out of Scope

- Revascularisation recommendations (phenotype only)
- Non-invasive physiology (CT-FFR, stress echo, etc.)
- Vasospasm / acetylcholine provocation testing
- Angina syndrome classification (ANOCA / INOCA labels)
- Patient demographics or clinical history inputs
- PDF export or report generation
