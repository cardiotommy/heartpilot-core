# PCI Results Panel — Two-Axis Classification Design

## Overview

Redesign the PCI wizard results panel to provide a clinically meaningful two-axis summary of each case, analogous to how the CVF wizard presents physiological phenotypes. A new pure-function classifier module computes the axes and case feature annotations; the results panel renders them above the existing domain recommendations.

---

## Goals

- Give the operator an immediate gestalt of case complexity and haemodynamic risk before reading individual recommendations
- Surface the inputs that drove each axis result (case features breakdown)
- Improve recommendation readability by ordering within each domain section by strength of evidence, with Class III (harm/not recommended) always last
- Add visual distinction between positive recommendations and cautions

---

## New Module — `pci/engine/classifier.js`

### Dependency on `PciEngine`

`classifier.js` internally calls `PciEngine.derive(caseInput)` to obtain derived fields. It follows the same environment-detection pattern as the other engine files:

```js
// At the top of classifier.js
var _PciEngine = (typeof module !== 'undefined' && module.exports)
  ? require('./evaluator')
  : window.PciEngine;
```

In `index.html`, `classifier.js` must be loaded **after** `evaluator.js`. Add a `<script src="engine/classifier.js"></script>` tag immediately after the existing `evaluator.js` script tag.

In `engine.test.js`, require both files before the classifier tests:

```js
var PciClassifier = require('../engine/classifier');
// PciEngine is already required at the top of the test file
```

### Optional field convention

`caseInput.bifurcation` is optional and may be `undefined`. All classifier logic that touches bifurcation sub-fields must guard with `(caseInput.bifurcation && ...)`. For the two derived fields that already encode bifurcation state — `lm_bif` and `sb_large` — use the return value of `PciEngine.derive()` directly; these are safe to read without additional guards.

Optional boolean fields `last_remaining_vessel` and `multivessel` may be `undefined`; treat `undefined` as `false` in all tier criteria.

### Exports

`PciClassifier` with a single pure function:

```
PciClassifier.classify(caseInput) → ClassificationResult
```

### `ClassificationResult` shape

```js
{
  lesionComplexity: {
    label: string,        // e.g. "LM Bifurcation"
    color: string,        // hex colour for the card header background
    bgColor: string,      // hex colour for the card body background
    summary: string       // one or two sentence clinical summary
  },
  haemodynamicRisk: {
    label: string,        // e.g. "Elevated Risk"
    color: string,
    bgColor: string,
    summary: string
  },
  caseFeatures: [         // ordered list of annotated input fields
    {
      label: string,      // display name, e.g. "Vessel"
      value: string,      // formatted display value (see Value Formatting table)
      badge: string,      // short annotation text, e.g. "⚠ Highest complexity"
      badgeStyle: string  // one of: "danger" | "warning" | "ok" | "neutral"
    }
  ]
}
```

---

### Lesion Complexity tiers

Evaluated in priority order — first matching tier wins. `derived` refers to the object returned by `PciEngine.derive(caseInput)`.

| Tier label | `color` / `bgColor` | Criteria |
|---|---|---|
| High Complexity | `#dc2626` / `#fef2f2` | `derived.lm_bif === true` OR `vessel === 'LM'` OR `vessel === 'Graft'` OR `calcification === 'severe'` OR `morphology === 'Diffuse'` OR `derived.sb_large === true` |
| Moderate Complexity | `#b45309` / `#fffbeb` | `calcification === 'moderate'` OR `lesion_length_mm > 20` OR `morphology` in `['Ostial', 'Angulated', 'Tortuous']` OR `(caseInput.bifurcation && caseInput.bifurcation.present === true && derived.sb_large === false)` |
| Standard | `#059669` / `#f0fdf4` | All other cases |

### Haemodynamic Risk tiers

Evaluated in priority order — first matching tier wins.

| Tier label | `color` / `bgColor` | Criteria |
|---|---|---|
| Cardiogenic Shock | `#1e293b` / `#f8fafc` | `haem_status === 'compromised'` |
| High Risk — MCS to consider | `#dc2626` / `#fef2f2` | `last_remaining_vessel === true` OR (`lvef === 'severe'` AND (`vessel === 'LM'` OR `morphology === 'Diffuse'`)) |
| Elevated Risk | `#b45309` / `#fffbeb` | `lvef` in `['moderate', 'severe']` OR (`lvef === 'mild'` AND `multivessel === true`) |
| Stable | `#059669` / `#f0fdf4` | All other cases |

---

### Case features list

Always in this order. Omit a row entirely if the field is not present or is the default/absent optional field.

| # | Label | Shown when | Value format | Badge text | `badgeStyle` |
|---|---|---|---|---|---|
| 1 | Vessel | always | See vessel display names table | See vessel badge table | See vessel badge table |
| 2 | Bifurcation | `bifurcation.present === true` | See bifurcation value table | See bifurcation badge table | See bifurcation badge table |
| 3 | Calcification | always | `"None"` / `"Mild"` / `"Moderate"` / `"Severe"` | See calcification badge table | See calcification badge table |
| 4 | TIMI Flow | always | `"TIMI 3"` / `"TIMI 2"` / `"TIMI 1"` / `"TIMI 0"` | See TIMI badge table | See TIMI badge table |
| 5 | Thrombus | always | `"None"` / `"Present"` | See thrombus badge table | See thrombus badge table |
| 6 | Lesion length | always | `"{N} mm"` (e.g. `"24 mm"`) | See length badge table | See length badge table |
| 7 | Morphology | `morphology` not in `['Discrete', 'Tubular']` | Capitalised as-is (e.g. `"Ostial"`) | `"⚠ Complex morphology"` | `"warning"` |
| 8 | LVEF | always | See LVEF display names table | See LVEF badge table | See LVEF badge table |
| 9 | Haemodynamics | always | `"Stable"` / `"Compromised"` | See haemodynamics badge table | See haemodynamics badge table |

#### Vessel

| `vessel` value | Display value | Badge text | `badgeStyle` |
|---|---|---|---|
| `LM` | `"Left Main"` | `"⚠ High complexity"` | `"danger"` |
| `Graft` | `"Bypass Graft"` | `"⚠ High complexity"` | `"danger"` |
| `LAD` | `"LAD"` | `""` (no badge) | `"neutral"` |
| `LCx` | `"LCx"` | `""` (no badge) | `"neutral"` |
| `RCA` | `"RCA"` | `""` (no badge) | `"neutral"` |
| `Branch` | `"Branch"` | `""` (no badge) | `"neutral"` |

#### Bifurcation (only shown if present)

Assemble `value` from available sub-fields in this order, joined with ` · `:

- If `sb_size` is set, use this mapping:

  | `sb_size` raw value | Display string |
  |---|---|
  | `gt2.5` | `"SB >2.5mm"` |
  | `1.5-2.5` | `"SB 1.5–2.5mm"` |
  | `lt1.5` | `"SB <1.5mm"` |

- If `medina_sb === 1`: append `"ostial"`
- If `sb_angle` is set, use this mapping:

  | `sb_angle` raw value | Appended display string |
  |---|---|
  | `acute` | `"acute"` |
  | `moderate` | `"moderate angle"` |
  | `obtuse` | `"obtuse"` |

- If none of the above sub-fields are set: value is `"Present"`

| Condition | Badge text | `badgeStyle` |
|---|---|---|
| `derived.sb_large === true` AND `medina_sb === 1` | `"⚠ 2-stent threshold"` | `"danger"` |
| `derived.sb_large === true` | `"⚠ Large SB"` | `"danger"` |
| `sb_size === '1.5-2.5'` | `"→ Moderate SB"` | `"warning"` |
| `sb_size === 'lt1.5'` | `"→ Small SB"` | `"neutral"` |
| none of the above | `""` (no badge) | `"neutral"` |

#### Calcification

| Value | Badge text | `badgeStyle` |
|---|---|---|
| `none` | `"✓ None"` | `"ok"` |
| `mild` | `""` (no badge) | `"neutral"` |
| `moderate` | `"→ Moderate"` | `"warning"` |
| `severe` | `"⚠ Modification required"` | `"danger"` |

#### TIMI Flow

| Value | Badge text | `badgeStyle` |
|---|---|---|
| `3` | `"✓ Normal"` | `"ok"` |
| `2` | `"→ TIMI 2"` | `"warning"` |
| `1` | `"⚠ Impaired"` | `"danger"` |
| `0` | `"⚠ No flow"` | `"danger"` |

#### Thrombus

| Value | Badge text | `badgeStyle` |
|---|---|---|
| `false` | `"✓ Absent"` | `"ok"` |
| `true` | `"⚠ Present"` | `"danger"` |

#### Lesion length

| Condition | Badge text | `badgeStyle` |
|---|---|---|
| `≤ 20` | `""` (no badge) | `"neutral"` |
| `> 20` and `≤ 30` | `"→ Long (>20mm)"` | `"warning"` |
| `> 30` | `"⚠ Very long (>30mm)"` | `"danger"` |

#### LVEF

| Value | Display value | Badge text | `badgeStyle` |
|---|---|---|---|
| `normal` | `"Normal (>55%)"` | `"✓ Preserved"` | `"ok"` |
| `mild` | `"Mildly reduced (45–55%)"` | `"→ Mild reduction"` | `"warning"` |
| `moderate` | `"Moderately reduced (30–44%)"` | `"⚠ Elevated risk"` | `"danger"` |
| `severe` | `"Severely reduced (<30%)"` | `"⚠ Severely impaired"` | `"danger"` |

#### Haemodynamics

| Value | Badge text | `badgeStyle` |
|---|---|---|
| `stable` | `"✓ Stable"` | `"ok"` |
| `compromised` | `"⚠ Compromised"` | `"danger"` |

---

### Export pattern

Same dual-export as all engine files:

```js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PciClassifier;
} else if (typeof window !== 'undefined') {
  window.PciClassifier = PciClassifier;
}
```

---

## Results Panel Rendering (`pci/index.html`)

### Layout (top to bottom)

1. **Two axis cards** — side-by-side grid (`1fr 1fr`)
   - Each card: coloured header (`color`) with axis name (small caps, 9px) and tier label (18px bold); body (`bgColor`) with one-sentence summary
   - No tier number or tier label subtitle (not a clinically established grading system)

2. **Case Features** — bordered card with a row per feature
   - Feature name left-aligned, value + badge right-aligned
   - Thin divider between rows
   - Badge colour by `badgeStyle`:
     - `danger`: background `rgba(127,29,29,.1)`, text `#7f1d1d`
     - `warning`: background `rgba(180,83,9,.12)`, text `#b45309`
     - `ok`: background `rgba(21,128,61,.12)`, text `#15803d`
     - `neutral`: no badge rendered

3. **Recommendations** — existing domain sections (Access, Wire, Lesion Preparation, Imaging, Stent, Bifurcation, Haemodynamics), with evidence badges and sort order applied

### Evidence badge spec

Each recommendation row shows a compact badge + quiet source line:

| Evidence fields | Badge | Source line |
|---|---|---|
| `class` is not null AND not `'III'`, `level` not null | Blue badge (`#dbeafe` / `#1e40af`): `"{class} · {level}"` | Grey text below: `"{source} {year}"` |
| `class` is null OR `level` is null (and not Class III) | Grey badge (`#f1f5f9` / `#475569`): `"Consensus"` | Grey text below: `"{source} {year}"` if source set |
| `class === 'III'` | Red badge (`#fee2e2` / `#991b1b`): `"III · {level}"` | Grey text below: `"{source} {year}"` |

Caution field: rendered as a separate tinted block directly below its parent rule row:
- Background `#fff8f0`, border `1px solid #fed7aa`, border-radius `8px`
- Red "⚠ Caution" badge (no source line)
- Caution text

Rules with `caution: null` render no caution block.

### Recommendation sort order within each domain section

1. Class I · A
2. Class I · B
3. Class I · C
4. Class IIa · A
5. Class IIa · B
6. Class IIa · C
7. Class IIb · A
8. Class IIb · B
9. Class IIb · C
10. Consensus (class null or level null, and class is not `'III'`)
11. Class III (any level) — always last

Within each position, secondary sort: rule `priority` descending, then rule `id` ascending (stable, deterministic).

Caution blocks are not independently sorted — each follows its parent rule row immediately.

---

## Files Changed

| File | Change |
|---|---|
| `pci/engine/classifier.js` | **New file** — `PciClassifier` pure classifier |
| `pci/index.html` | (1) Add `<script src="engine/classifier.js"></script>` after existing `evaluator.js` script tag; (2) replace results rendering with new two-axis layout; (3) add evidence sort logic |
| `pci/test/engine.test.js` | Add classifier unit tests (see Tests section) |

No changes to rule files, `evaluator.js`, `loader.js`, or the schema.

---

## Tests

Add to `pci/test/engine.test.js`. Require `classifier.js` at the top of the test file alongside the existing `require('../engine/evaluator')`.

### Classifier — Lesion Complexity tier

- Standard: non-LM vessel, no bifurcation, mild calcium, lesion ≤20mm → `label: 'Standard'`
- Moderate (calcium): non-LM, moderate calcium → `label: 'Moderate Complexity'`
- Moderate (length): non-LM, lesion 25mm, no bifurcation → `label: 'Moderate Complexity'`
- Moderate (small-SB bifurcation): non-LM, bifurcation present, `sb_size: 'lt1.5'` → `label: 'Moderate Complexity'`
- High (severe calcium): non-LM, severe calcium → `label: 'High Complexity'`
- High (graft): `vessel: 'Graft'` → `label: 'High Complexity'`
- High (large-SB bifurcation, non-LM): non-LM, bifurcation present, `sb_size: 'gt2.5'` → `label: 'High Complexity'`
- High (LM with bifurcation): `vessel: 'LM'`, bifurcation present → `label: 'High Complexity'`
- High (LM without bifurcation): `vessel: 'LM'`, no bifurcation → `label: 'High Complexity'`

### Classifier — Haemodynamic Risk tier

- Stable: normal LVEF, stable haemodynamics, no special flags → `label: 'Stable'`
- Elevated (reduced LVEF): `lvef: 'moderate'`, stable → `label: 'Elevated Risk'`
- Elevated (mild LVEF + multivessel): `lvef: 'mild'`, `multivessel: true` → `label: 'Elevated Risk'`
- High Risk (last remaining vessel alone): `last_remaining_vessel: true`, normal LVEF → `label: 'High Risk — MCS to consider'`
- High Risk (severe LVEF + LM, no last-remaining flag): `lvef: 'severe'`, `vessel: 'LM'`, `last_remaining_vessel: false` → `label: 'High Risk — MCS to consider'`
- Cardiogenic Shock: `haem_status: 'compromised'` → `label: 'Cardiogenic Shock'`

### Classifier — caseFeatures

- Feature list order is correct for a full case with all optional fields present
- Bifurcation row is absent when `bifurcation.present` is false or `bifurcation` is undefined
- Morphology row is absent when `morphology` is `'Discrete'`
- `badgeStyle: 'danger'` for `calcification: 'severe'`
- `badgeStyle: 'ok'` for `timi: 3`
- `badgeStyle: 'ok'` for `thrombus: false`
- `badgeStyle: 'danger'` for `haem_status: 'compromised'`
- Bifurcation value string is assembled correctly: vessel with `sb_size: 'gt2.5'`, `medina_sb: 1`, `sb_angle: 'acute'` → `"SB >2.5mm · ostial · acute"`

### Evidence sort order

- Build a mock rule list containing one rule of each type: `I·A`, `IIa·B`, `Consensus` (class null), `III·B`
- Verify the sorted output order is: `I·A` → `IIa·B` → `Consensus` → `III·B`
- A single `III·C` rule combined with `I·A` and `Consensus` rules must always sort `III·C` last

Note: `IIb·A` and `IIb·B` positions are specified in the sort table for completeness (forward-compatibility) but do not exist in the current rule files. Tests using mock rules for these positions are optional.

---

## Out of Scope

- No changes to rule content or rule file schemas
- No new wizard steps or input fields (all needed inputs already exist)
- No server-side logic
- No thrombus axis (thrombus remains in lesion prep domain as agreed)
- No tier numbering or tier labels beyond the display name
