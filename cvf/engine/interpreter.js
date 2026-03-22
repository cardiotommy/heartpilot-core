/**
 * HeartPilot CVF Interpreter
 * ───────────────────────────
 * Pure deterministic engine. Takes invasive physiological measurements and
 * returns a physiological phenotype classification with evidence basis.
 *
 * No DOM dependencies. Works in Node (tests) and browser (wizard).
 *
 * @version 1.0.0
 */

'use strict';

var CvfInterpreter = (function () {

  var THRESHOLDS = {
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

  function interpret(values) {
    throw new Error('not implemented');
  }

  return {
    interpret:  interpret,
    THRESHOLDS: THRESHOLDS,
  };

}());

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CvfInterpreter;
} else if (typeof window !== 'undefined') {
  window.CvfInterpreter = CvfInterpreter;
}
