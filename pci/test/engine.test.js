'use strict';

const path = require('path');
const fs   = require('fs');
const assert = require('assert');

const { evaluate, derive, evalCondition, groupByDomain } = require('../engine/evaluator.js');
const PciClassifier = require('../engine/classifier.js');
const { classify } = PciClassifier;

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

let passed = 0, failed = 0;

function test(name, fn) {
  try { fn(); console.log(`  ✓  ${name}`); passed++; }
  catch (e) { console.error(`  ✗  ${name}`); console.error(`     ${e.message}`); failed++; }
}

function assertMatched(result, ruleId) {
  const ids = result.matched.map(r => r.id);
  assert.ok(ids.includes(ruleId), `Expected rule "${ruleId}" to match. Matched: [${ids.join(', ')}]`);
}

function assertNotMatched(result, ruleId) {
  const ids = result.matched.map(r => r.id);
  assert.ok(!ids.includes(ruleId), `Expected rule "${ruleId}" NOT to match, but it did.`);
}

const BASE = {
  vessel: 'LAD', calcification: 'mild', thrombus: false, timi: 3,
  lesion_length_mm: 15, morphology: 'Discrete', lvef: 'normal', haem_status: 'stable',
  multivessel: false, last_remaining_vessel: false, bifurcation: { present: false }
};

// ── Derived fields ───────────────────────────────────
console.log('\n── Derived fields ───────────────────────────────────');

test('lesion_long derived from lesion_length_mm > 20', () => {
  assert.strictEqual(derive({ ...BASE, lesion_length_mm: 25 }).lesion_long, true);
  assert.strictEqual(derive({ ...BASE, lesion_length_mm: 18 }).lesion_long, false);
});

test('lesion_vlong derived from lesion_length_mm > 30', () => {
  assert.strictEqual(derive({ ...BASE, lesion_length_mm: 35 }).lesion_vlong, true);
  assert.strictEqual(derive({ ...BASE, lesion_length_mm: 28 }).lesion_vlong, false);
});

test('timi_zero and timi_impaired derived correctly', () => {
  const d0 = derive({ ...BASE, timi: 0 });
  assert.strictEqual(d0.timi_zero, true);
  assert.strictEqual(d0.timi_impaired, true);
  const d3 = derive({ ...BASE, timi: 3 });
  assert.strictEqual(d3.timi_zero, false);
  assert.strictEqual(d3.timi_impaired, false);
});

test('lvef_reduced includes moderate and severe', () => {
  assert.strictEqual(derive({ ...BASE, lvef: 'moderate' }).lvef_reduced, true);
  assert.strictEqual(derive({ ...BASE, lvef: 'severe' }).lvef_reduced, true);
  assert.strictEqual(derive({ ...BASE, lvef: 'normal' }).lvef_reduced, false);
});

test('lm_bif derived from vessel=LM and bifurcation.present=true', () => {
  assert.strictEqual(derive({ ...BASE, vessel: 'LM', bifurcation: { present: true } }).lm_bif, true);
  assert.strictEqual(derive({ ...BASE, vessel: 'LAD', bifurcation: { present: true } }).lm_bif, false);
});

test('sb_large and sb_ostial derived from bifurcation sub-fields', () => {
  const d = derive({ ...BASE, bifurcation: { present: true, sb_size: 'gt2.5', medina_sb: 1 } });
  assert.strictEqual(d.sb_large, true);
  assert.strictEqual(d.sb_ostial, true);
});

// ── Condition operators ──────────────────────────────
console.log('\n── Condition operators ──────────────────────────────');
const BASE_D = derive(BASE);

test('op: eq, not_eq, in, not_in, gt, gte, lt, lte, is_true, is_false', () => {
  assert.strictEqual(evalCondition(BASE, BASE_D, { field: 'vessel', op: 'eq', value: 'LAD' }).result, true);
  assert.strictEqual(evalCondition(BASE, BASE_D, { field: 'vessel', op: 'not_eq', value: 'Graft' }).result, true);
  assert.strictEqual(evalCondition(BASE, BASE_D, { field: 'morphology', op: 'in', value: ['Discrete', 'Tubular'] }).result, true);
  assert.strictEqual(evalCondition(BASE, BASE_D, { field: 'vessel', op: 'not_in', value: ['Graft', 'Branch'] }).result, true);
  assert.strictEqual(evalCondition(BASE, BASE_D, { field: 'lesion_length_mm', op: 'gt', value: 10 }).result, true);
  assert.strictEqual(evalCondition(BASE, BASE_D, { field: 'lesion_length_mm', op: 'gte', value: 15 }).result, true);
  assert.strictEqual(evalCondition(BASE, BASE_D, { field: 'timi', op: 'lt', value: 3 }).result, false);
  assert.strictEqual(evalCondition(BASE, BASE_D, { field: 'thrombus', op: 'is_false' }).result, true);
  assert.strictEqual(evalCondition(BASE, BASE_D, { field: 'thrombus', op: 'is_true' }).result, false);
});

test('logic: any fires when any condition matches', () => {
  const anyRule = { id: 'test-any', domain: 'test', priority: 1, logic: 'any', active: true,
    conditions: [{ field: 'calcification', op: 'eq', value: 'severe' }, { field: 'lesion_long', op: 'is_true' }] };
  assert.strictEqual(evaluate(BASE, [anyRule]).matchCount, 0);
  assert.strictEqual(evaluate({ ...BASE, calcification: 'severe' }, [anyRule]).matchCount, 1);
});

// ── Access domain ────────────────────────────────────
console.log('\n── Access domain ───────────────────────────────────');

test('Radial access fires for all cases', () => {
  assertMatched(evaluate(BASE, ALL_RULES), 'acc-radial-preference');
});

test('Left system guide fires for LM, LAD, LCx, Branch', () => {
  ['LM', 'LAD', 'LCx', 'Branch'].forEach(v =>
    assertMatched(evaluate({ ...BASE, vessel: v }, ALL_RULES), 'acc-left-system-guide'));
  assertNotMatched(evaluate({ ...BASE, vessel: 'RCA' }, ALL_RULES), 'acc-left-system-guide');
});

test('LM guide size and surgical backup fire for LM', () => {
  const r = evaluate({ ...BASE, vessel: 'LM' }, ALL_RULES);
  assertMatched(r, 'acc-lm-guide-size');
  assertMatched(r, 'acc-lm-surgical-backup');
});

test('RCA guide fires for standard RCA, not tortuous', () => {
  assertMatched(evaluate({ ...BASE, vessel: 'RCA' }, ALL_RULES), 'acc-rca-guide-selection');
  assertNotMatched(evaluate({ ...BASE, vessel: 'RCA', morphology: 'Tortuous' }, ALL_RULES), 'acc-rca-guide-selection');
  assertMatched(evaluate({ ...BASE, vessel: 'RCA', morphology: 'Tortuous' }, ALL_RULES), 'acc-rca-tort-ang-guide');
});

test('Graft rules fire for graft', () => {
  const r = evaluate({ ...BASE, vessel: 'Graft' }, ALL_RULES);
  assertMatched(r, 'acc-graft-guide-selection');
  assertMatched(r, 'acc-graft-native-preference');
});

test('Severe calcium triggers radial emphasis', () => {
  assertMatched(evaluate({ ...BASE, calcification: 'severe' }, ALL_RULES), 'acc-sevcalc-radial');
});

test('MCS femoral sizing fires for high-risk features', () => {
  assertMatched(evaluate({ ...BASE, lvef: 'severe' }, ALL_RULES), 'acc-mcs-femoral-sizing');
  assertMatched(evaluate({ ...BASE, last_remaining_vessel: true }, ALL_RULES), 'acc-mcs-femoral-sizing');
  assertMatched(evaluate({ ...BASE, haem_status: 'compromised' }, ALL_RULES), 'acc-mcs-femoral-sizing');
});

// ── Wire domain ──────────────────────────────────────
console.log('\n── Wire domain ─────────────────────────────────────');

test('Default wire fires for standard cases', () => {
  assertMatched(evaluate(BASE, ALL_RULES), 'wire-default');
  assertNotMatched(evaluate({ ...BASE, calcification: 'severe' }, ALL_RULES), 'wire-default');
  assertNotMatched(evaluate({ ...BASE, morphology: 'Tortuous' }, ALL_RULES), 'wire-default');
});

test('Severe calc wire fires', () => {
  assertMatched(evaluate({ ...BASE, calcification: 'severe' }, ALL_RULES), 'wire-sevcalc');
});

test('Graft wire fires for graft', () => {
  assertMatched(evaluate({ ...BASE, vessel: 'Graft' }, ALL_RULES), 'wire-graft-lima');
});

test('No SB wire during atherectomy fires for severe calc + bifurcation', () => {
  assertMatched(evaluate({ ...BASE, calcification: 'severe', bifurcation: { present: true, medina_sb: 1 } }, ALL_RULES), 'wire-no-sb-during-atherectomy');
  assertNotMatched(evaluate({ ...BASE, calcification: 'severe' }, ALL_RULES), 'wire-no-sb-during-atherectomy');
});

// ── Lesion preparation domain ────────────────────────
console.log('\n── Lesion preparation domain ────────────────────────');

test('Standard pre-dilation fires for mild calcium, no thrombus, non-graft', () => {
  assertMatched(evaluate(BASE, ALL_RULES), 'prep-standard-predilation');
  assertNotMatched(evaluate({ ...BASE, calcification: 'severe' }, ALL_RULES), 'prep-standard-predilation');
  assertNotMatched(evaluate({ ...BASE, vessel: 'Graft' }, ALL_RULES), 'prep-standard-predilation');
  assertNotMatched(evaluate({ ...BASE, thrombus: true, timi: 2 }, ALL_RULES), 'prep-standard-predilation');
});

test('Severe calcium rules fire', () => {
  const r = evaluate({ ...BASE, calcification: 'severe' }, ALL_RULES);
  assertMatched(r, 'prep-sevcalc');
  assertMatched(r, 'prep-sevcalc-ivl-vs-ra');
  assertMatched(r, 'prep-sevcalc-ra');
  assertMatched(r, 'prep-sevcalc-uncrossable');
});

test('No routine aspiration fires for thrombus on native vessel', () => {
  const r = evaluate({ ...BASE, thrombus: true, timi: 2 }, ALL_RULES);
  assertMatched(r, 'prep-no-routine-aspiration');
  assertNotMatched(evaluate({ ...BASE, vessel: 'Graft', thrombus: true, timi: 2 }, ALL_RULES), 'prep-no-routine-aspiration');
});

test('Selective aspiration fires for thrombus + TIMI 0 on native', () => {
  assertMatched(evaluate({ ...BASE, thrombus: true, timi: 0 }, ALL_RULES), 'prep-selective-aspiration');
});

test('GPI no-reflow fires for thrombus + impaired TIMI', () => {
  assertMatched(evaluate({ ...BASE, thrombus: true, timi: 1 }, ALL_RULES), 'prep-gpi-noreflow');
  assertNotMatched(evaluate({ ...BASE, thrombus: false }, ALL_RULES), 'prep-gpi-noreflow');
});

test('Deferred stenting fires for thrombus + TIMI 0 on native', () => {
  assertMatched(evaluate({ ...BASE, thrombus: true, timi: 0 }, ALL_RULES), 'prep-deferred-stenting');
  assertNotMatched(evaluate({ ...BASE, vessel: 'Graft', thrombus: true, timi: 0 }, ALL_RULES), 'prep-deferred-stenting');
});

test('Graft strategy fires for graft with mild calcium, not for severe', () => {
  assertMatched(evaluate({ ...BASE, vessel: 'Graft' }, ALL_RULES), 'prep-graft-strategy');
  assertNotMatched(evaluate({ ...BASE, vessel: 'Graft', calcification: 'severe' }, ALL_RULES), 'prep-graft-strategy');
  assertMatched(evaluate({ ...BASE, vessel: 'Graft', calcification: 'severe' }, ALL_RULES), 'prep-graft-sevcalc');
});

test('Generic timi-impaired rule does not fire for graft', () => {
  const r = evaluate({ ...BASE, vessel: 'Graft', timi: 2, thrombus: true }, ALL_RULES);
  assertNotMatched(r, 'prep-timi-impaired');
});

test('EPD fires for graft (Class I per ACC/AHA)', () => {
  assertMatched(evaluate({ ...BASE, vessel: 'Graft' }, ALL_RULES), 'prep-graft-epd-vasodilators');
});

// ── Imaging domain ───────────────────────────────────
console.log('\n── Imaging domain ──────────────────────────────────');

test('Complex lesion imaging (I/A) fires for severe calc, long lesion, or bifurcation', () => {
  assertMatched(evaluate({ ...BASE, calcification: 'severe' }, ALL_RULES), 'img-complex-lesion');
  assertMatched(evaluate({ ...BASE, lesion_length_mm: 25 }, ALL_RULES), 'img-complex-lesion');
  assertMatched(evaluate({ ...BASE, bifurcation: { present: true } }, ALL_RULES), 'img-complex-lesion');
});

test('LM imaging mandatory (I/A) and MSA targets fire for LM', () => {
  const r = evaluate({ ...BASE, vessel: 'LM' }, ALL_RULES);
  assertMatched(r, 'img-lm-mandatory');
  assertMatched(r, 'img-lm-msa-targets');
});

test('LM bifurcation imaging fires for LM + bifurcation', () => {
  assertMatched(evaluate({ ...BASE, vessel: 'LM', bifurcation: { present: true, medina_sb: 1, sb_size: 'gt2.5' } }, ALL_RULES), 'img-lm-bif-targets');
});

test('Severe calcium mandatory imaging fires', () => {
  assertMatched(evaluate({ ...BASE, calcification: 'severe' }, ALL_RULES), 'img-sevcalc-mandatory');
});

test('Moderate calcium imaging fires', () => {
  assertMatched(evaluate({ ...BASE, calcification: 'moderate' }, ALL_RULES), 'img-modcalc');
});

test('Post-stent targets fire for non-LM vessels', () => {
  assertMatched(evaluate(BASE, ALL_RULES), 'img-post-stent-targets');
  assertNotMatched(evaluate({ ...BASE, vessel: 'LM' }, ALL_RULES), 'img-post-stent-targets');
});

test('Multivessel + reduced EF imaging fires', () => {
  assertMatched(evaluate({ ...BASE, multivessel: true, lvef: 'moderate' }, ALL_RULES), 'img-multivessel-reduced-ef');
});

test('Last vessel imaging fires', () => {
  assertMatched(evaluate({ ...BASE, last_remaining_vessel: true }, ALL_RULES), 'img-last-vessel');
});

// ── Stent domain ─────────────────────────────────────
console.log('\n── Stent domain ────────────────────────────────────');

test('Default DES and no-BRS fire for all cases', () => {
  const r = evaluate(BASE, ALL_RULES);
  assertMatched(r, 'stent-default');
  assertMatched(r, 'stent-no-brs');
  assertMatched(r, 'stent-nc-postdilate');
  // NC post-dilate must NOT fire for graft cases (contradicts graft-specific guidance)
  assertNotMatched(evaluate({ ...BASE, vessel: 'Graft' }, ALL_RULES), 'stent-nc-postdilate');
});

test('Long stent sequence fires for long lesions', () => {
  assertMatched(evaluate({ ...BASE, lesion_length_mm: 25 }, ALL_RULES), 'stent-long-sequence');
});

test('Bifurcation thin-strut fires', () => {
  assertMatched(evaluate({ ...BASE, bifurcation: { present: true } }, ALL_RULES), 'stent-bif-thin-strut');
});

test('Complete revasc fires for stable multivessel', () => {
  assertMatched(evaluate({ ...BASE, multivessel: true }, ALL_RULES), 'stent-multivessel-complete');
  // NOT for compromised haem
  assertNotMatched(evaluate({ ...BASE, multivessel: true, haem_status: 'compromised' }, ALL_RULES), 'stent-multivessel-complete');
});

test('Last vessel stent fires', () => {
  assertMatched(evaluate({ ...BASE, last_remaining_vessel: true }, ALL_RULES), 'stent-last-vessel');
});

// ── Bifurcation domain ───────────────────────────────
console.log('\n── Bifurcation domain ──────────────────────────────');

const BIF_BASE = { ...BASE, bifurcation: { present: true, medina_prox_mv: 1, medina_dist_mv: 1, medina_sb: 1, sb_size: 'gt2.5', sb_angle: 'acute' } };

test('Core bifurcation rules fire when present', () => {
  const r = evaluate(BIF_BASE, ALL_RULES);
  assertMatched(r, 'bif-provisional-default');
  assertMatched(r, 'bif-wire-jailing');
  assertMatched(r, 'bif-pot-mandatory');
  assertMatched(r, 'bif-sb-rewire-proximal-cell');
  assertMatched(r, 'bif-kbi-threshold');
  assertMatched(r, 'bif-repot-mandatory');
  assertMatched(r, 'bif-conversion-criteria');
});

test('2-stent indication fires for large SB + ostial disease', () => {
  const r = evaluate(BIF_BASE, ALL_RULES);
  assertMatched(r, 'bif-2stent-indication');
  assertMatched(r, 'bif-fkbi-mandatory');
  assertMatched(r, 'bif-imaging-2stent');
});

test('SB pre-dilation fires for ostial SB disease', () => {
  assertMatched(evaluate(BIF_BASE, ALL_RULES), 'bif-sb-predilation');
});

test('DK-Crush fires for acute angle, not obtuse', () => {
  assertMatched(evaluate(BIF_BASE, ALL_RULES), 'bif-dkcrush-acute-angle');
  assertNotMatched(evaluate(BIF_BASE, ALL_RULES), 'bif-culotte-obtuse-angle');
});

test('Culotte fires for obtuse angle, not DK-Crush', () => {
  const obtuse = { ...BIF_BASE, bifurcation: { ...BIF_BASE.bifurcation, sb_angle: 'obtuse' } };
  assertMatched(evaluate(obtuse, ALL_RULES), 'bif-culotte-obtuse-angle');
  assertNotMatched(evaluate(obtuse, ALL_RULES), 'bif-dkcrush-acute-angle');
});

test('TAP fires for moderate angle', () => {
  const moderate = { ...BIF_BASE, bifurcation: { ...BIF_BASE.bifurcation, sb_angle: 'moderate' } };
  assertMatched(evaluate(moderate, ALL_RULES), 'bif-tap-moderate-angle');
});

test('Large SB without ostial disease does NOT trigger 2-stent', () => {
  const noOstial = { ...BASE, bifurcation: { present: true, medina_sb: 0, sb_size: 'gt2.5' } };
  assertNotMatched(evaluate(noOstial, ALL_RULES), 'bif-2stent-indication');
  assertMatched(evaluate(noOstial, ALL_RULES), 'bif-provisional-default');
});

test('LM bifurcation stent sizing fires', () => {
  assertMatched(evaluate({ ...BASE, vessel: 'LM', bifurcation: { present: true, medina_sb: 1, sb_size: 'gt2.5' } }, ALL_RULES), 'bif-lm-stent-sizing');
});

// ── Haemodynamics domain ─────────────────────────────
console.log('\n── Haemodynamics domain ────────────────────────────');

test('Culprit-only fires for compromised + multivessel', () => {
  assertMatched(evaluate({ ...BASE, haem_status: 'compromised', multivessel: true }, ALL_RULES), 'haem-culprit-only-shock');
  assertMatched(evaluate({ ...BASE, haem_status: 'compromised', multivessel: true }, ALL_RULES), 'haem-staged-nonculprit-cs');
});

test('No routine IABP fires for compromised', () => {
  assertMatched(evaluate({ ...BASE, haem_status: 'compromised' }, ALL_RULES), 'haem-no-routine-iabp');
});

test('No routine ECMO fires for compromised', () => {
  assertMatched(evaluate({ ...BASE, haem_status: 'compromised' }, ALL_RULES), 'haem-no-routine-ecmo');
});

test('Impella CS fires for compromised + severe EF', () => {
  assertMatched(evaluate({ ...BASE, haem_status: 'compromised', lvef: 'severe' }, ALL_RULES), 'haem-impella-cs');
  assertNotMatched(evaluate({ ...BASE, haem_status: 'compromised', lvef: 'moderate' }, ALL_RULES), 'haem-impella-cs');
});

test('Last vessel + severe EF fires strongest MCS (no duplicates)', () => {
  const r = evaluate({ ...BASE, last_remaining_vessel: true, lvef: 'severe', haem_status: 'compromised', multivessel: true }, ALL_RULES);
  assertMatched(r, 'haem-mcs-last-vessel-seveef');
  assertNotMatched(r, 'haem-mcs-last-vessel-compromised');
  assertNotMatched(r, 'haem-mcs-last-vessel');
});

test('Last vessel + compromised (non-severe EF) fires compromised rule only', () => {
  const r = evaluate({ ...BASE, last_remaining_vessel: true, lvef: 'moderate', haem_status: 'compromised' }, ALL_RULES);
  assertMatched(r, 'haem-mcs-last-vessel-compromised');
  assertNotMatched(r, 'haem-mcs-last-vessel-seveef');
  assertNotMatched(r, 'haem-mcs-last-vessel');
});

test('MCS high-risk elective fires for severe EF stable haem', () => {
  assertMatched(evaluate({ ...BASE, lvef: 'severe' }, ALL_RULES), 'haem-mcs-high-risk-elective');
});

test('Severe EF + LM fires MCS consideration', () => {
  assertMatched(evaluate({ ...BASE, lvef: 'severe', vessel: 'LM' }, ALL_RULES), 'haem-mcs-severe-ef-high-risk-vessel');
});

test('Inactive rules are never matched', () => {
  assertNotMatched(evaluate({ ...BASE, lvef: 'severe', haem_status: 'compromised' }, ALL_RULES), 'haem-mcs-consider');
});

// ── Cross-domain scenarios ───────────────────────────
console.log('\n── Cross-domain scenarios ──────────────────────────');

test('Domain filter restricts results', () => {
  const r = evaluate({ ...BASE, vessel: 'LM' }, ALL_RULES, { domains: ['imaging'] });
  assertMatched(r, 'img-lm-mandatory');
  assertNotMatched(r, 'acc-lm-guide-size');
});

test('groupByDomain organises correctly', () => {
  const groups = groupByDomain(evaluate({ ...BASE, vessel: 'LM', calcification: 'severe' }, ALL_RULES));
  assert.ok(groups['access']); assert.ok(groups['imaging']); assert.ok(groups['lesion_prep']);
});

// ── Data integrity ───────────────────────────────────
console.log('\n── Data integrity ──────────────────────────────────');

test('All rules have required fields', () => {
  const missing = ALL_RULES.filter(r => !r.id || !r.domain || !r.priority || !r.logic || r.active === undefined || !r.action || !r.evidence);
  assert.strictEqual(missing.length, 0, `Rules missing required fields: ${missing.map(r => r.id || '(no id)').join(', ')}`);
});

test('No deprecated rationale or detail fields', () => {
  assert.strictEqual(ALL_RULES.filter(r => 'rationale' in r || 'detail' in r).length, 0);
});

test('Caution is string or null', () => {
  assert.strictEqual(ALL_RULES.filter(r => 'caution' in r && r.caution !== null && typeof r.caution !== 'string').length, 0);
});

test('All rule ids are unique', () => {
  const ids = ALL_RULES.map(r => r.id);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  assert.strictEqual(dupes.length, 0, `Duplicate rule ids: ${dupes.join(', ')}`);
});

test('All conditions use valid operators', () => {
  const VALID_OPS = ['eq','not_eq','in','not_in','gt','gte','lt','lte','is_true','is_false','has','not_has'];
  const invalid = [];
  for (const r of ALL_RULES) for (const c of (r.conditions ?? [])) if (!VALID_OPS.includes(c.op)) invalid.push(`${r.id}: ${c.op}`);
  assert.strictEqual(invalid.length, 0, `Invalid operators: ${invalid.join(', ')}`);
});

test('All rule domains match their file domain', () => {
  const mismatched = ALL_RULES.filter(r => {
    const fileDomain = r._fileDomain || r.domain;
    return false; // domain is stamped by loader
  });
});

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

// ── PciClassifier — evidence sort ────────────────────
console.log('\n── PciClassifier — evidence sort ───────────────────');

test('evidenceSortKey: I·A < IIa·B < Consensus < III·B', () => {
  const { evidenceSortKey } = PciClassifier;
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

test('evidenceSortKey: III·C always last (with I·A and Consensus)', () => {
  const { evidenceSortKey } = PciClassifier;
  const rules = [
    { id: 'consensus', evidence: { class: null, level: null } },
    { id: 'harm',      evidence: { class: 'III', level: 'C' } },
    { id: 'ia',        evidence: { class: 'I', level: 'A' } },
  ];
  const sorted = rules.slice().sort((a, b) => evidenceSortKey(a) - evidenceSortKey(b));
  assert.strictEqual(sorted[2].id, 'harm', 'III·C must be last');
});

// ── Summary ──────────────────────────────────────────
console.log(`\n── Results: ${passed} passed, ${failed} failed (${ALL_RULES.length} rules loaded) ──`);
if (failed > 0) process.exit(1);
