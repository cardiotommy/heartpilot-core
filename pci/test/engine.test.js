/**
 * HeartPilot PCI Engine — Test Suite
 * ────────────────────────────────────
 * Run with: node test/engine.test.js
 *
 * No test framework required — pure Node assertions.
 */

'use strict';

const path = require('path');
const fs   = require('fs');
const assert = require('assert');

// Load engine
const { evaluate, derive, evalCondition, groupByDomain } = require('../engine/evaluator.js');

// ── Load all rule files ───────────────────────────────────────────
function loadRulesFromDisk(rulesDir) {
  const domains = ['access', 'wire', 'lesion_prep', 'imaging', 'stent', 'bifurcation', 'haemodynamics'];
  const allRules = [];
  for (const domain of domains) {
    const filePath = path.join(rulesDir, `${domain}.json`);
    if (!fs.existsSync(filePath)) { console.warn(`  ⚠ Missing: ${domain}.json`); continue; }
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const rules = data.rules ?? data;
    rules.forEach(r => { if (!r.domain) r.domain = domain; });
    allRules.push(...rules);
  }
  return allRules;
}

const RULES_DIR = path.join(__dirname, '../rules');
const ALL_RULES = loadRulesFromDisk(RULES_DIR);

// ── Test helpers ──────────────────────────────────────────────────
let passed = 0, failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓  ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ✗  ${name}`);
    console.error(`     ${e.message}`);
    failed++;
  }
}

function assertMatched(result, ruleId) {
  const ids = result.matched.map(r => r.id);
  assert.ok(ids.includes(ruleId), `Expected rule "${ruleId}" to match. Matched: [${ids.join(', ')}]`);
}

function assertNotMatched(result, ruleId) {
  const ids = result.matched.map(r => r.id);
  assert.ok(!ids.includes(ruleId), `Expected rule "${ruleId}" NOT to match, but it did.`);
}

// ── Section: Derived fields ───────────────────────────────────────
console.log('\n── Derived fields ───────────────────────────────────');

test('lesion_long derived from lesion_length_mm > 20', () => {
  const d = derive({ lesion_length_mm: 25, timi: 3, lvef: 'normal', haem_status: 'stable', bifurcation: { present: false } });
  assert.strictEqual(d.lesion_long, true);
  const d2 = derive({ lesion_length_mm: 18, timi: 3, lvef: 'normal', haem_status: 'stable', bifurcation: { present: false } });
  assert.strictEqual(d2.lesion_long, false);
});

test('lesion_vlong derived from lesion_length_mm > 30', () => {
  const d = derive({ lesion_length_mm: 35, timi: 3, lvef: 'normal', haem_status: 'stable', bifurcation: { present: false } });
  assert.strictEqual(d.lesion_vlong, true);
  const d2 = derive({ lesion_length_mm: 28, timi: 3, lvef: 'normal', haem_status: 'stable', bifurcation: { present: false } });
  assert.strictEqual(d2.lesion_vlong, false);
});

test('timi_zero and timi_impaired derived correctly', () => {
  const d0 = derive({ timi: 0, lesion_length_mm: 15, lvef: 'normal', haem_status: 'stable', bifurcation: { present: false } });
  assert.strictEqual(d0.timi_zero, true);
  assert.strictEqual(d0.timi_impaired, true);
  const d3 = derive({ timi: 3, lesion_length_mm: 15, lvef: 'normal', haem_status: 'stable', bifurcation: { present: false } });
  assert.strictEqual(d3.timi_zero, false);
  assert.strictEqual(d3.timi_impaired, false);
});

test('lvef_reduced includes moderate and severe', () => {
  const dm = derive({ lvef: 'moderate', timi: 3, lesion_length_mm: 15, haem_status: 'stable', bifurcation: { present: false } });
  assert.strictEqual(dm.lvef_reduced, true);
  const ds = derive({ lvef: 'severe', timi: 3, lesion_length_mm: 15, haem_status: 'stable', bifurcation: { present: false } });
  assert.strictEqual(ds.lvef_reduced, true);
  const dn = derive({ lvef: 'normal', timi: 3, lesion_length_mm: 15, haem_status: 'stable', bifurcation: { present: false } });
  assert.strictEqual(dn.lvef_reduced, false);
});

test('lm_bif derived from vessel=LM and bifurcation.present=true', () => {
  const d = derive({ vessel: 'LM', timi: 3, lesion_length_mm: 15, lvef: 'normal', haem_status: 'stable', bifurcation: { present: true } });
  assert.strictEqual(d.lm_bif, true);
  const d2 = derive({ vessel: 'LAD', timi: 3, lesion_length_mm: 15, lvef: 'normal', haem_status: 'stable', bifurcation: { present: true } });
  assert.strictEqual(d2.lm_bif, false);
});

test('sb_large and sb_ostial derived from bifurcation sub-fields', () => {
  const d = derive({ timi: 3, lesion_length_mm: 15, lvef: 'normal', haem_status: 'stable',
    bifurcation: { present: true, sb_size: 'gt2.5', medina_sb: 1 } });
  assert.strictEqual(d.sb_large, true);
  assert.strictEqual(d.sb_ostial, true);
});

// ── Section: Condition operators ────────────────────────────────
console.log('\n── Condition operators ──────────────────────────────');

const BASE = { vessel: 'LAD', calcification: 'mild', thrombus: false, timi: 3,
  lesion_length_mm: 15, morphology: 'Discrete', lvef: 'normal', haem_status: 'stable',
  multivessel: false, last_remaining_vessel: false, bifurcation: { present: false } };
const BASE_D = derive(BASE);

test('op: eq matches and rejects', () => {
  const r1 = evalCondition(BASE, BASE_D, { field: 'vessel', op: 'eq', value: 'LAD' });
  assert.strictEqual(r1.result, true);
  const r2 = evalCondition(BASE, BASE_D, { field: 'vessel', op: 'eq', value: 'RCA' });
  assert.strictEqual(r2.result, false);
});

test('op: not_eq matches and rejects', () => {
  const r = evalCondition(BASE, BASE_D, { field: 'vessel', op: 'not_eq', value: 'Graft' });
  assert.strictEqual(r.result, true);
  const r2 = evalCondition(BASE, BASE_D, { field: 'vessel', op: 'not_eq', value: 'LAD' });
  assert.strictEqual(r2.result, false);
});

test('op: in and not_in', () => {
  const r1 = evalCondition(BASE, BASE_D, { field: 'morphology', op: 'in', value: ['Tortuous', 'Angulated', 'Discrete'] });
  assert.strictEqual(r1.result, true);
  const r2 = evalCondition(BASE, BASE_D, { field: 'morphology', op: 'in', value: ['Tortuous', 'Angulated'] });
  assert.strictEqual(r2.result, false);
  const r3 = evalCondition(BASE, BASE_D, { field: 'vessel', op: 'not_in', value: ['Graft', 'Branch'] });
  assert.strictEqual(r3.result, true);
});

test('op: gt, gte, lt, lte', () => {
  const r1 = evalCondition(BASE, BASE_D, { field: 'lesion_length_mm', op: 'gt', value: 10 });
  assert.strictEqual(r1.result, true);
  const r2 = evalCondition(BASE, BASE_D, { field: 'lesion_length_mm', op: 'gt', value: 20 });
  assert.strictEqual(r2.result, false);
  const r3 = evalCondition(BASE, BASE_D, { field: 'lesion_length_mm', op: 'gte', value: 15 });
  assert.strictEqual(r3.result, true);
  const r4 = evalCondition(BASE, BASE_D, { field: 'timi', op: 'lt', value: 3 });
  assert.strictEqual(r4.result, false);
});

test('op: is_true, is_false', () => {
  const r1 = evalCondition(BASE, BASE_D, { field: 'thrombus', op: 'is_false' });
  assert.strictEqual(r1.result, true);
  const r2 = evalCondition(BASE, BASE_D, { field: 'thrombus', op: 'is_true' });
  assert.strictEqual(r2.result, false);
});

test('op: derived field via is_true (lesion_long)', () => {
  const longCase = { ...BASE, lesion_length_mm: 25 };
  const longD = derive(longCase);
  const r = evalCondition(longCase, longD, { field: 'lesion_long', op: 'is_true' });
  assert.strictEqual(r.result, true);
});

test('logic: any fires when any condition matches', () => {
  const anyRule = {
    id: 'test-any', domain: 'test', priority: 1, logic: 'any', active: true,
    conditions: [
      { field: 'calcification', op: 'eq', value: 'severe' },
      { field: 'lesion_long', op: 'is_true' },
      { field: 'bifurcation.present', op: 'is_true' },
    ]
  };
  // None match
  const r1 = evaluate(BASE, [anyRule]);
  assert.strictEqual(r1.matchCount, 0);
  // One matches (severe calcium)
  const r2 = evaluate({ ...BASE, calcification: 'severe' }, [anyRule]);
  assert.strictEqual(r2.matchCount, 1);
});

// ── Section: Clinical scenarios ─────────────────────────────────
console.log('\n── Clinical scenarios ───────────────────────────────');

test('Radial access rule fires for all cases', () => {
  const result = evaluate(BASE, ALL_RULES);
  assertMatched(result, 'acc-radial-preference');
});

test('LM rules fire for LM vessel', () => {
  const lmCase = { ...BASE, vessel: 'LM' };
  const result = evaluate(lmCase, ALL_RULES);
  assertMatched(result, 'acc-lm-guide-size');
  assertMatched(result, 'acc-lm-surgical-backup');
  assertMatched(result, 'img-lm-mandatory');
  assertMatched(result, 'stent-lm');
  assertMatched(result, 'prep-lm');
});

test('LM rules do not fire for non-LM vessel', () => {
  const result = evaluate({ ...BASE, vessel: 'LAD' }, ALL_RULES);
  assertNotMatched(result, 'acc-lm-guide-size');
  assertNotMatched(result, 'img-lm-mandatory');
});

test('Severe calcium rules fire', () => {
  const caseCalc = { ...BASE, calcification: 'severe' };
  const result = evaluate(caseCalc, ALL_RULES);
  assertMatched(result, 'prep-sevcalc');
  assertMatched(result, 'prep-sevcalc-ivl-vs-ra');
  assertMatched(result, 'wire-sevcalc');
  assertMatched(result, 'img-complex-lesion');
});

test('Compound severe calcium + ostial fires specific rule, not generic only', () => {
  const caseCalcOstial = { ...BASE, calcification: 'severe', morphology: 'Ostial' };
  const result = evaluate(caseCalcOstial, ALL_RULES);
  assertMatched(result, 'prep-sevcalc');         // generic severe calc
  assertMatched(result, 'prep-sevcalc-ostial');  // specific compound rule
});

test('Graft rules fire for Graft vessel', () => {
  const graftCase = { ...BASE, vessel: 'Graft' };
  const result = evaluate(graftCase, ALL_RULES);
  assertMatched(result, 'acc-graft-guide-selection');
  assertMatched(result, 'prep-graft-strategy');
  assertMatched(result, 'prep-graft-epd-vasodilators');
  assertMatched(result, 'stent-graft');
  // Graft-native preference should also fire
  assertMatched(result, 'acc-graft-native-preference');
});

test('Graft-specific rules do NOT fire for non-graft vessel', () => {
  const result = evaluate({ ...BASE, vessel: 'RCA' }, ALL_RULES);
  assertNotMatched(result, 'acc-graft-guide-selection');
  assertNotMatched(result, 'prep-graft-strategy');
});

test('Thrombus + TIMI 0 + native vessel fires correct rule, not graft rule', () => {
  const thr0 = { ...BASE, vessel: 'LAD', thrombus: true, timi: 0 };
  const result = evaluate(thr0, ALL_RULES);
  assertMatched(result, 'prep-thrombus-timi0-native');
  assertNotMatched(result, 'prep-thrombus-timi0-graft');
  assertNotMatched(result, 'prep-thrombus-preserved-native');
});

test('Thrombus + TIMI 0 + Graft fires graft rule', () => {
  const thrGraft = { ...BASE, vessel: 'Graft', thrombus: true, timi: 0 };
  const result = evaluate(thrGraft, ALL_RULES);
  assertMatched(result, 'prep-thrombus-timi0-graft');
  assertNotMatched(result, 'prep-thrombus-timi0-native');
});

test('Thrombus with preserved flow (TIMI 1) fires preserved-flow rule', () => {
  const thr1 = { ...BASE, vessel: 'LAD', thrombus: true, timi: 1 };
  const result = evaluate(thr1, ALL_RULES);
  assertMatched(result, 'prep-thrombus-preserved-native');
  assertNotMatched(result, 'prep-thrombus-timi0-native');
});

test('Bifurcation rules fire when bifurcation present', () => {
  const bifCase = { ...BASE, bifurcation: { present: true, medina_prox_mv: 1, medina_dist_mv: 1, medina_sb: 1, sb_size: 'gt2.5', sb_angle: 'acute' } };
  const result = evaluate(bifCase, ALL_RULES);
  assertMatched(result, 'bif-provisional-default');
  assertMatched(result, 'bif-pot-mandatory');
  assertMatched(result, 'bif-wire-jailing');
  assertMatched(result, 'bif-2stent-indication');
  assertMatched(result, 'bif-fkbi-mandatory');
  assertMatched(result, 'bif-dkcrush-acute-angle');
});

test('Bifurcation obtuse angle fires Culotte rule, not DK-Crush', () => {
  const bifObtuse = { ...BASE, bifurcation: { present: true, medina_prox_mv: 1, medina_dist_mv: 1, medina_sb: 1, sb_size: 'gt2.5', sb_angle: 'obtuse' } };
  const result = evaluate(bifObtuse, ALL_RULES);
  assertMatched(result, 'bif-culotte-obtuse-angle');
  assertNotMatched(result, 'bif-dkcrush-acute-angle');
});

test('Large SB without ostial disease does NOT trigger 2-stent indication', () => {
  const bifNoOstial = { ...BASE, bifurcation: { present: true, medina_sb: 0, sb_size: 'gt2.5' } };
  const result = evaluate(bifNoOstial, ALL_RULES);
  assertNotMatched(result, 'bif-2stent-indication');
  assertMatched(result, 'bif-provisional-default');
});

test('LM bifurcation fires lm_bif imaging rule', () => {
  const lmBif = { ...BASE, vessel: 'LM', bifurcation: { present: true, medina_sb: 1, sb_size: 'gt2.5', sb_angle: 'moderate' } };
  const result = evaluate(lmBif, ALL_RULES);
  assertMatched(result, 'img-lm-bif-targets');
  assertMatched(result, 'img-lm-mandatory');
});

test('Haem compromised + multivessel fires culprit-only rule', () => {
  const shock = { ...BASE, haem_status: 'compromised', multivessel: true };
  const result = evaluate(shock, ALL_RULES);
  assertMatched(result, 'haem-culprit-only-shock');
});

test('Last remaining vessel + severe EF fires strongest MCS rule', () => {
  const lrvSev = { ...BASE, last_remaining_vessel: true, lvef: 'severe' };
  const result = evaluate(lrvSev, ALL_RULES);
  assertMatched(result, 'haem-mcs-last-vessel-seveef');
  assertMatched(result, 'haem-mcs-last-vessel'); // generic LRV rule also fires
});

test('Severe EF + LM fires MCS consideration rule', () => {
  const sevLM = { ...BASE, lvef: 'severe', vessel: 'LM' };
  const result = evaluate(sevLM, ALL_RULES);
  assertMatched(result, 'haem-mcs-severe-ef-high-risk-vessel');
});

test('Domain filter restricts results to specified domain', () => {
  const result = evaluate({ ...BASE, vessel: 'LM' }, ALL_RULES, { domains: ['imaging'] });
  const domains = [...new Set(result.matched.map(r => r.domain))];
  assert.deepStrictEqual(domains, ['imaging']);
  assertMatched(result, 'img-lm-mandatory');
  assertNotMatched(result, 'acc-lm-guide-size');
});

test('groupByDomain organises results correctly', () => {
  const result = evaluate({ ...BASE, vessel: 'LM', calcification: 'severe' }, ALL_RULES);
  const groups = groupByDomain(result);
  assert.ok(groups['access'], 'Expected access group');
  assert.ok(groups['imaging'], 'Expected imaging group');
  assert.ok(groups['lesion_prep'], 'Expected lesion_prep group');
});

test('Inactive rules are never matched', () => {
  const inactiveRule = {
    id: 'test-inactive', domain: 'test', priority: 1, logic: 'all',
    active: false, conditions: [],
    action: 'Should never appear'
  };
  const result = evaluate(BASE, [...ALL_RULES, inactiveRule]);
  assertNotMatched(result, 'test-inactive');
});

test('All rules have required fields: id, domain, priority, logic, active, action, evidence', () => {
  const missing = ALL_RULES.filter(r =>
    !r.id || !r.domain || !r.priority || !r.logic || r.active === undefined ||
    !r.action || !r.evidence
  );
  assert.strictEqual(missing.length, 0,
    `Rules missing required fields: ${missing.map(r => r.id || '(no id)').join(', ')}`);
});

test('All rule ids are unique', () => {
  const ids = ALL_RULES.map(r => r.id);
  const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
  assert.strictEqual(duplicates.length, 0, `Duplicate rule ids: ${duplicates.join(', ')}`);
});

test('All conditions reference valid operators', () => {
  const VALID_OPS = ['eq','not_eq','in','not_in','gt','gte','lt','lte','is_true','is_false','has','not_has'];
  const invalid = [];
  for (const rule of ALL_RULES) {
    for (const cond of (rule.conditions ?? [])) {
      if (!VALID_OPS.includes(cond.op)) {
        invalid.push(`${rule.id}: unknown op "${cond.op}"`);
      }
    }
  }
  assert.strictEqual(invalid.length, 0, `Invalid operators:\n  ${invalid.join('\n  ')}`);
});

// ── Summary ───────────────────────────────────────────────────────
console.log(`\n── Results: ${passed} passed, ${failed} failed (${ALL_RULES.length} rules loaded) ──`);
if (failed > 0) process.exit(1);
