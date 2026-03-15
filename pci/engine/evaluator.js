/**
 * HeartPilot PCI Rule Evaluator
 * ─────────────────────────────
 * Pure deterministic engine. Takes a normalised case input and a rule array,
 * returns matched rules with full condition trace.
 *
 * No DOM dependencies. Works in Node (tests) and browser (wizard).
 *
 * @version 1.0.0
 */

'use strict';

// ── Field accessor ────────────────────────────────────────────────────────────
// Resolves dot-notation paths against a case object.
// e.g. "bifurcation.medina_sb" → case.bifurcation.medina_sb
function getField(caseInput, fieldPath) {
  return fieldPath.split('.').reduce((obj, key) => {
    if (obj === null || obj === undefined) return undefined;
    return obj[key];
  }, caseInput);
}

// ── Derived fields ────────────────────────────────────────────────────────────
// Computed at evaluation time so rules can reference them directly.
function derive(caseInput) {
  const c = caseInput;
  const ll = c.lesion_length_mm ?? 0;
  const bif = c.bifurcation ?? {};
  return {
    lesion_long:      ll > 20,
    lesion_vlong:     ll > 30,
    timi_zero:        c.timi === 0,
    timi_impaired:    c.timi < 3,
    lvef_reduced:     c.lvef === 'moderate' || c.lvef === 'severe',
    lvef_severe:      c.lvef === 'severe',
    haem_compromised: c.haem_status === 'compromised',
    sb_large:         bif.sb_size === 'gt2.5',
    sb_ostial:        bif.medina_sb === 1,
    lm_bif:           c.vessel === 'LM' && bif.present === true,
  };
}

// ── Single condition evaluator ────────────────────────────────────────────────
// Returns { result: boolean, field, op, expected, actual }
function evalCondition(caseInput, derived, condition) {
  const { field, op, value } = condition;

  // Prefer derived field if it exists, otherwise resolve from case
  const actual = Object.prototype.hasOwnProperty.call(derived, field)
    ? derived[field]
    : getField(caseInput, field);

  let result;
  switch (op) {
    case 'eq':       result = actual === value; break;
    case 'not_eq':   result = actual !== value; break;
    case 'in':       result = Array.isArray(value) && value.includes(actual); break;
    case 'not_in':   result = Array.isArray(value) && !value.includes(actual); break;
    case 'gt':       result = typeof actual === 'number' && actual > value; break;
    case 'gte':      result = typeof actual === 'number' && actual >= value; break;
    case 'lt':       result = typeof actual === 'number' && actual < value; break;
    case 'lte':      result = typeof actual === 'number' && actual <= value; break;
    case 'is_true':  result = actual === true; break;
    case 'is_false': result = actual === false; break;
    case 'has':      result = Array.isArray(actual) && actual.includes(value); break;
    case 'not_has':  result = !Array.isArray(actual) || !actual.includes(value); break;
    default:
      console.warn(`HeartPilot evaluator: unknown operator "${op}" in rule condition`);
      result = false;
  }

  return { result, field, op, expected: value, actual };
}

// ── Rule evaluator ────────────────────────────────────────────────────────────
// Returns { matched: boolean, rule, trace: ConditionResult[] }
function evalRule(caseInput, derived, rule) {
  if (!rule.active) {
    return { matched: false, rule, trace: [], skipped: 'inactive' };
  }

  const conditions = rule.conditions ?? [];

  // Empty conditions = always matches (global/generic rules)
  if (conditions.length === 0) {
    return { matched: true, rule, trace: [] };
  }

  const trace = conditions.map(c => evalCondition(caseInput, derived, c));
  const logic = rule.logic ?? 'all';

  const matched = logic === 'any'
    ? trace.some(t => t.result)
    : trace.every(t => t.result);

  return { matched, rule, trace };
}

// ── Main entry point ──────────────────────────────────────────────────────────
/**
 * Evaluate all rules against a case input.
 *
 * @param {object} caseInput  - Normalised case (validated against case-input.schema.json)
 * @param {Array}  rules      - Flat array of rule objects from all domain files
 * @param {object} [options]
 * @param {string[]} [options.domains]    - Filter to specific domains (default: all)
 * @param {number}   [options.minPriority] - Minimum priority to include (default: 1)
 * @returns {MatchResult}
 */
function evaluate(caseInput, rules, options = {}) {
  const { domains, minPriority = 1 } = options;
  const derived = derive(caseInput);

  const candidates = rules.filter(r => {
    if (minPriority && (r.priority ?? 1) < minPriority) return false;
    if (domains && !domains.includes(r.domain)) return false;
    return true;
  });

  const results = candidates.map(r => evalRule(caseInput, derived, r));
  const matched = results.filter(r => r.matched);

  // Sort: priority desc, then domain order, then id
  const DOMAIN_ORDER = ['access', 'wire', 'lesion_prep', 'imaging', 'stent', 'bifurcation', 'haemodynamics'];
  matched.sort((a, b) => {
    const pd = (b.rule.priority ?? 1) - (a.rule.priority ?? 1);
    if (pd !== 0) return pd;
    const da = DOMAIN_ORDER.indexOf(a.rule.domain);
    const db = DOMAIN_ORDER.indexOf(b.rule.domain);
    return (da === -1 ? 99 : da) - (db === -1 ? 99 : db);
  });

  return {
    caseInput,
    derived,
    matched: matched.map(r => r.rule),
    matchCount: matched.length,
    trace: matched,  // full trace available for debugging / testing
  };
}

/**
 * Group matched rules by domain.
 * Useful for rendering strategy sections in the UI.
 */
function groupByDomain(matchResult) {
  const groups = {};
  for (const rule of matchResult.matched) {
    if (!groups[rule.domain]) groups[rule.domain] = [];
    groups[rule.domain].push(rule);
  }
  return groups;
}

// ── Export (works as ES module, CommonJS, and browser global) ─────────────────
const PciEngine = { evaluate, groupByDomain, derive, evalCondition };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PciEngine;
} else if (typeof window !== 'undefined') {
  window.PciEngine = PciEngine;
}
