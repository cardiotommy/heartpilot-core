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
  assert.ok(typeof r.narrative === 'string');
  assert.strictEqual(r.incomplete, false);
  assert.strictEqual(r.id, 'cahp');
});

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

// ── TTM Risk Score ─────────────────────────────────────────────────────────────
console.log('\nTTM Risk Score');

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

test('TTM: incomplete when paco2 absent', function() {
  var r = OhcaScores.ttm({
    age: 65, location: 'home', initialRhythm: 'non_shockable',
    noFlowTime: 5, lowFlowTime: 20, epinephrineDose: 3,
    pupilsReactive: false, ph: 7.20, gcsMotor: 1, paco2: null
  });
  assert.strictEqual(r.incomplete, true);
  assert.ok(r.incompleteReason.indexOf('PaCO2') >= 0);
});

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

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
