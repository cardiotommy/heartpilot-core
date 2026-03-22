# CLAUDE.md — HeartPilot Core

This file documents the codebase structure, conventions, and development workflows for AI assistants working on this repository.

---

## Project Overview

HeartPilot Core is a **deterministic clinical decision-support engine** for Percutaneous Coronary Intervention (PCI). It evaluates structured patient case data against a library of evidence-based rules and returns a ranked, domain-organised set of procedural recommendations.

- **Domain:** Interventional cardiology (PCI strategy)
- **Architecture:** Pure rule engine + embedded single-page web UI
- **Language:** JavaScript (ES5-compatible; runs in Node.js and browsers without transpilation)
- **Dependencies:** Zero external dependencies
- **License:** MIT (Copyright 2026 Dr Thomas A Meredith MD PhD)

---

## Repository Layout

```
heartpilot-core/
├── CLAUDE.md                        # This file
├── LICENSE
├── .gitignore
├── .gitattributes
└── pci/
    ├── index.html                   # Full single-page web UI (self-contained)
    ├── engine/
    │   ├── evaluator.js             # Core rule evaluation logic (pure functions)
    │   └── loader.js                # Rule file loading + wizard state normalisation
    ├── schema/
    │   └── case-input.schema.json   # JSON Schema v7 for validated case inputs
    ├── rules/                       # Domain rule files (7 domains, 62 rules total)
    │   ├── access.json
    │   ├── wire.json
    │   ├── lesion_prep.json
    │   ├── imaging.json
    │   ├── stent.json
    │   ├── bifurcation.json
    │   └── haemodynamics.json
    └── test/
        └── engine.test.js           # Full test suite (Node.js, no framework)
```

---

## Running Tests

```bash
cd pci
node test/engine.test.js
```

```bash
node cvf/test/interpreter.test.js
```

No test framework, no install step. The suite uses only Node.js built-ins (`assert`, `fs`, `path`). A passing run prints each test with `✓` and exits 0. Any failure exits 1.

**What is tested:**
- Derived field computation
- All 12 condition operators
- AND/OR rule logic modes
- 21 clinical scenario cases (LM, severe calcium, graft, thrombus, bifurcation, haemodynamics)
- Data integrity checks across all 62 rules (required fields, no deprecated fields, no duplicate IDs, valid operators)

---

## Engine Architecture

### `pci/engine/evaluator.js` — Rule Evaluator

Exports `PciEngine` with four pure functions:

| Function | Signature | Description |
|---|---|---|
| `derive` | `(caseInput) → derived` | Computes 10 boolean derived fields at evaluation time |
| `evalCondition` | `(caseInput, derived, condition) → {result, field, op, expected, actual}` | Evaluates a single condition |
| `evaluate` | `(caseInput, rules, options?) → MatchResult` | Main entry point; returns matched rules with trace |
| `groupByDomain` | `(matchResult) → {domain: rule[]}` | Groups matched rules by clinical domain |

**`evaluate()` options:**
- `domains: string[]` — restrict evaluation to specific domains
- `minPriority: number` — minimum priority threshold (default: 1)

**Output sort order:** priority descending → domain order → rule ID

**Domain order:** `access → wire → lesion_prep → imaging → stent → bifurcation → haemodynamics`

### `pci/engine/loader.js` — Rule Loader

Exports `PciLoader` with:

| Export | Description |
|---|---|
| `loadRules(basePath?)` | Async: fetches all domain JSON files via `fetch()` (browser) |
| `caseFromWizardState(S)` | Normalises wizard UI state `S` to a validated case input object |
| `RULE_DOMAINS` | Array of domain name strings in evaluation order |

Node.js tests use their own `loadRulesFromDisk()` helper (defined inline in `engine.test.js`) which reads files synchronously via `fs`.

### Dual Environment Export Pattern

Both engine files use the same export pattern — works as CommonJS, and as a browser global:

```js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PciEngine;   // Node.js / CommonJS
} else if (typeof window !== 'undefined') {
  window.PciEngine = PciEngine; // Browser global
}
```

Do not use ES module syntax (`import`/`export`) — it would break the browser compatibility without a bundler.

---

## Case Input Schema

Defined in `pci/schema/case-input.schema.json` (JSON Schema draft-07).

**Required fields:**

| Field | Type | Values |
|---|---|---|
| `vessel` | string | `LM`, `LAD`, `LCx`, `RCA`, `Branch`, `Graft` |
| `calcification` | string | `none`, `mild`, `moderate`, `severe` |
| `thrombus` | boolean | |
| `timi` | integer | `0`, `1`, `2`, `3` |
| `lesion_length_mm` | number | 5–60 |
| `morphology` | string | `Discrete`, `Tubular`, `Diffuse`, `Ostial`, `Angulated`, `Tortuous` |
| `lvef` | string | `normal` (>55%), `mild` (45–55%), `moderate` (30–44%), `severe` (<30%) |
| `haem_status` | string | `stable`, `compromised` |

**Optional fields:** `multivessel` (boolean), `last_remaining_vessel` (boolean), `bifurcation` (object)

**Bifurcation sub-fields:** `present` (required), `medina_prox_mv`, `medina_dist_mv`, `medina_sb` (0/1 integers), `sb_size` (`lt1.5`/`1.5-2.5`/`gt2.5`), `sb_angle` (`acute`/`moderate`/`obtuse`)

### Engine-Derived Fields

Computed at evaluation time in `derive()` — **never set in input**:

| Derived field | Derivation |
|---|---|
| `lesion_long` | `lesion_length_mm > 20` |
| `lesion_vlong` | `lesion_length_mm > 30` |
| `timi_zero` | `timi === 0` |
| `timi_impaired` | `timi < 3` |
| `lvef_reduced` | `lvef` in `[moderate, severe]` |
| `lvef_severe` | `lvef === severe` |
| `haem_compromised` | `haem_status === compromised` |
| `sb_large` | `bifurcation.sb_size === gt2.5` |
| `sb_ostial` | `bifurcation.medina_sb === 1` |
| `lm_bif` | `vessel === LM && bifurcation.present === true` |

---

## Rule File Format

Each domain file (`pci/rules/<domain>.json`) has the structure:

```json
{
  "domain": "access",
  "version": "2.0.0",
  "last_reviewed": "2025-01",
  "sources": ["ESC 2024", "SCAI"],
  "rules": [ ... ]
}
```

**Each rule object:**

```json
{
  "id": "acc-radial-preference",
  "domain": "access",
  "priority": 1,
  "logic": "all",
  "conditions": [],
  "action": "Radial access preferred over femoral for all PCI.",
  "caution": null,
  "evidence": { "source": "ESC", "year": 2024, "class": "I", "level": "A" },
  "active": true
}
```

**Required rule fields:** `id`, `domain`, `priority`, `logic`, `active`, `action`, `evidence`

**Rule field constraints:**
- `priority`: integer 1–3 (3 = highest precedence in sort)
- `logic`: `"all"` (all conditions must match) or `"any"` (at least one must match)
- `conditions`: array of condition objects; empty array = unconditional match (always fires)
- `caution`: string or `null` (never any other type)
- `active`: `false` rules are silently skipped — use this instead of deleting rules
- **Deprecated fields:** `rationale`, `detail` — must not appear in any rule

**Condition object:**

```json
{ "field": "vessel", "op": "eq", "value": "LM" }
```

**Valid operators:** `eq`, `not_eq`, `in`, `not_in`, `gt`, `gte`, `lt`, `lte`, `is_true`, `is_false`, `has`, `not_has`

- `in` / `not_in`: `value` must be an array
- `gt` / `gte` / `lt` / `lte`: `value` must be a number; field must resolve to a number
- `is_true` / `is_false`: no `value` needed
- `has` / `not_has`: tests array membership (field is an array, value is a scalar)

**Dot-notation field paths** are supported: `bifurcation.sb_size`, `bifurcation.medina_sb`

---

## Adding or Modifying Rules

1. Edit the relevant `pci/rules/<domain>.json` file
2. Follow the rule object schema exactly (all required fields, no deprecated fields)
3. Use a unique `id` following the existing naming pattern: `<domain-prefix>-<descriptor>` (e.g., `acc-lm-guide-size`, `prep-sevcalc`)
4. Set `active: false` to disable a rule without removing it
5. Run tests to verify: `node pci/test/engine.test.js`
6. If adding a new clinical scenario that needs test coverage, add a `test()` case in `pci/test/engine.test.js`

---

## Web UI

`pci/index.html` is a fully self-contained single-page application. It requires no build step and can be opened directly in a browser or served as a static file.

- All CSS is embedded inline
- Uses Google Fonts (DM Serif Display, DM Sans, JetBrains Mono) via CDN
- Forces light mode regardless of system preference (`color-scheme: light`)
- Loads rule files via `fetch()` relative to the HTML file location
- Calls `PciLoader.caseFromWizardState()` to normalise UI state, then `PciEngine.evaluate()`, then `PciEngine.groupByDomain()` to render results

---

## Development Conventions

### Code Style
- `'use strict'` at the top of every JS file
- 2-space indentation
- Single quotes for strings
- JSDoc comments on exported functions
- No external dependencies — keep it that way

### No Build System
There is no `package.json`, no bundler, no transpiler. Do not introduce one without strong justification. The zero-dependency approach is intentional.

### Rule Schema Discipline
- Never add fields to rules that are not in the schema
- Never use `rationale` or `detail` fields (they were removed in schema v2.0.0)
- The data integrity tests will catch schema violations automatically

### Testing
- Always run `node pci/test/engine.test.js` after any change to rule files or engine code
- Both test suites must pass before committing: `node pci/test/engine.test.js` and `node cvf/test/interpreter.test.js`
- Add new tests for new clinical scenarios; don't rely on data-integrity tests alone

### Deployment
The project targets static file hosting (e.g., Netlify). There is no server-side component. Do not add server-side logic.

---

## Git Branches

- `main` / `master` — stable branch
- `claude/<task>` — AI-assisted feature branches (follow this naming for any AI-driven work)

---

## What Does NOT Exist (by design)

- No `package.json` — no npm, no node_modules
- No CI/CD pipeline — no `.github/workflows/`
- No environment variables — nothing to configure
- No database — fully stateless
- No backend server — pure static files
- No TypeScript — plain JavaScript only
- No linting/formatting config — follow existing style manually
