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
