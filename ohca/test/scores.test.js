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
