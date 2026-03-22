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

  // ── Thresholds ──────────────────────────────────────────────────────────────

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

  // ── Static content ──────────────────────────────────────────────────────────

  var EVIDENCE = {
    source:     'ESC',
    year:       2024,
    classLabel: 'IIa',
    level:      'B',
    rationale:  'CFR cut-off of 2.0 and IMR cut-off of 25 per ESC 2024 Chronic Coronary Syndrome guidelines. FFR cut-off of 0.80 per ESC 2024.',
  };

  var GREY_ZONE_NOTE = 'FFR values between 0.75 and 0.80 fall within the historical grey zone from the original DEFER and FAME trials. While \u2264\u00a00.80 is the current guideline threshold, deferral of revascularisation may still be reasonable in this range, informed by clinical context and shared decision-making with the patient.';

  var PHENOTYPES = {
    'Normal physiology': {
      subtitle: 'No epicardial or microvascular disease detected',
      summary:  'All measured indices are within normal limits. There is no evidence of significant obstructive epicardial coronary artery disease or coronary microvascular dysfunction.',
      color:    '#059669',
    },
    'Epicardial disease': {
      subtitle: 'Obstructive epicardial CAD \u2014 revascularisation to consider',
      summary:  'Pressure indices confirm haemodynamically significant epicardial stenosis. Where coronary flow reserve is measured and normal, the flow impairment is attributable to the focal epicardial lesion rather than microvascular disease.',
      color:    '#dc2626',
    },
    'Structural CMD': {
      subtitle: 'Coronary microvascular dysfunction \u2014 elevated resistance',
      summary:  'Normal epicardial physiology with reduced coronary flow reserve and elevated microvascular resistance. This pattern is consistent with structural coronary microvascular dysfunction (CMD). No haemodynamically significant epicardial stenosis is present.',
      color:    '#92400e',
    },
    'Functional CMD': {
      subtitle: 'Coronary microvascular dysfunction \u2014 functional or vasospastic aetiology',
      summary:  'Normal epicardial physiology with reduced coronary flow reserve but preserved microvascular resistance. This pattern suggests functional coronary microvascular dysfunction, such as microvascular spasm or abnormal vasomotion, rather than structural microvascular disease.',
      color:    '#92400e',
    },
    'Diffuse epicardial disease': {
      subtitle: 'Diffuse non-focal epicardial CAD \u2014 microvascular resistance preserved',
      summary:  'Pressure indices are abnormal and coronary flow reserve is reduced, but microvascular resistance is normal. This pattern suggests diffuse or serial epicardial disease causing the flow impairment, rather than true microvascular dysfunction.',
      color:    '#4c1d95',
    },
    'Mixed disease': {
      subtitle: 'Coexistent epicardial CAD and microvascular dysfunction',
      summary:  'Both epicardial and microvascular pathology are present. Pressure indices confirm haemodynamically significant epicardial stenosis, and microvascular indices confirm coexistent coronary microvascular dysfunction. This mixed pattern has implications for management beyond revascularisation alone.',
      color:    '#831843',
    },
    'Microvascular dysfunction': {
      subtitle: 'Coronary microvascular dysfunction \u2014 subtype undetermined',
      summary:  'Normal epicardial physiology with reduced coronary flow reserve, consistent with coronary microvascular dysfunction (CMD). IMR measurement is required to distinguish structural CMD (elevated microvascular resistance) from functional CMD (normal resistance, vasospastic aetiology).',
      color:    '#92400e',
    },
    'Mixed / diffuse epicardial disease': {
      subtitle: 'Epicardial disease with possible microvascular involvement',
      summary:  'Abnormal pressure indices and reduced coronary flow reserve are present. Without IMR measurement, it is not possible to determine whether the reduced CFR reflects diffuse epicardial disease alone or coexistent microvascular dysfunction.',
      color:    '#4c1d95',
    },
    'Non-obstructive': {
      subtitle: 'No significant epicardial stenosis \u2014 microvascular status not fully assessed',
      summary:  'Pressure indices do not confirm haemodynamically significant epicardial stenosis. Coronary flow reserve was not measured; a full microvascular phenotype cannot be determined from pressure data alone.',
      color:    '#334155',
    },
  };

  var RESTING_INFO = {
    ifr:  { name: 'iFR',   fullName: 'instantaneous wave-free ratio',           threshold: THRESHOLDS.IFR  },
    pdpa: { name: 'Pd:Pa', fullName: 'resting distal-to-aortic pressure ratio', threshold: THRESHOLDS.PDPA },
    rfr:  { name: 'RFR',   fullName: 'resting full-cycle ratio',                threshold: THRESHOLDS.RFR  },
    dfr:  { name: 'DFR',   fullName: 'diastolic pressure ratio',                threshold: THRESHOLDS.DFR  },
  };

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function isEpicardialAbnormal(v) {
    var ffrAbnormal     = v.ffr !== null && v.ffr <= THRESHOLDS.FFR;
    var restingAbnormal = false;
    if (v.restingType !== null && v.restingValue !== null) {
      var info = RESTING_INFO[v.restingType];
      if (info) restingAbnormal = v.restingValue <= info.threshold;
    }
    return ffrAbnormal || restingAbnormal;
  }

  function buildMeasurements(v) {
    var results = [];

    if (v.ffr !== null) {
      var fNormal = v.ffr > THRESHOLDS.FFR;
      results.push({
        name:     'FFR',
        fullName: 'fractional flow reserve',
        value:    v.ffr,
        normal:   fNormal,
        label:    fNormal ? 'Normal > 0.80' : 'Abnormal \u2264 0.80',
      });
    }

    if (v.restingType !== null && v.restingValue !== null) {
      var info = RESTING_INFO[v.restingType] || RESTING_INFO['ifr'];
      var rNormal = v.restingValue > info.threshold;
      results.push({
        name:     info.name,
        fullName: info.fullName,
        value:    v.restingValue,
        normal:   rNormal,
        label:    rNormal
          ? 'Normal > ' + info.threshold
          : 'Abnormal \u2264 ' + info.threshold,
      });
    }

    if (v.cfr !== null) {
      var cNormal = v.cfr >= THRESHOLDS.CFR;
      results.push({
        name:     'CFR',
        fullName: 'coronary flow reserve',
        value:    v.cfr,
        normal:   cNormal,
        label:    cNormal ? 'Normal \u2265 2.0' : 'Reduced < 2.0',
      });
    }

    if (v.imr !== null) {
      var iNormal = v.imr < THRESHOLDS.IMR;
      results.push({
        name:     'IMR',
        fullName: 'index of microcirculatory resistance',
        value:    v.imr,
        normal:   iNormal,
        label:    iNormal ? 'Normal < 25' : 'Elevated \u2265 25',
      });
    }

    return results;
  }

  function classify(v) {
    var epicardial = isEpicardialAbnormal(v);
    var hasCfr     = v.cfr !== null;
    var hasImr     = v.imr !== null;

    if (hasCfr) {
      var cfrLow = v.cfr < THRESHOLDS.CFR;

      if (hasImr) {
        var imrHigh = v.imr >= THRESHOLDS.IMR;
        if (!epicardial && !cfrLow)            return 'Normal physiology';
        if (epicardial  && !cfrLow)            return 'Epicardial disease';
        if (!epicardial && cfrLow && imrHigh)  return 'Structural CMD';
        if (!epicardial && cfrLow && !imrHigh) return 'Functional CMD';
        if (epicardial  && cfrLow && !imrHigh) return 'Diffuse epicardial disease';
        /* epicardial && cfrLow && imrHigh */   return 'Mixed disease';
      }

      // CFR measured, IMR absent
      if (!epicardial && !cfrLow) return 'Normal physiology';
      if (epicardial  && !cfrLow) return 'Epicardial disease';
      if (!epicardial && cfrLow)  return 'Microvascular dysfunction';
      /* epicardial && cfrLow */   return 'Mixed / diffuse epicardial disease';
    }

    // CFR absent (IMR may or may not be present — epicardial axis only)
    return epicardial ? 'Epicardial disease' : 'Non-obstructive';
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  /**
   * Interpret invasive physiological measurements.
   *
   * All keys must be present; null means "not measured" — never omit a key.
   * The interpreter does not handle undefined.
   *
   * @param {Object}        values
   * @param {number|null}   values.ffr           fractional flow reserve
   * @param {string|null}   values.restingType   'ifr'|'pdpa'|'rfr'|'dfr'
   * @param {number|null}   values.restingValue
   * @param {number|null}   values.cfr           coronary flow reserve
   * @param {number|null}   values.imr           index of microcirculatory resistance
   * @returns {Object} PhenotypeResult
   */
  function interpret(values) {
    var v = {
      ffr:          values.ffr          != null ? values.ffr          : null,
      restingType:  values.restingType  != null ? values.restingType  : null,
      restingValue: values.restingValue != null ? values.restingValue : null,
      cfr:          values.cfr          != null ? values.cfr          : null,
      imr:          values.imr          != null ? values.imr          : null,
    };

    // Validate resting index pair
    if (v.restingType !== null && v.restingValue === null) {
      console.warn('CvfInterpreter: restingType provided but restingValue is null — treating resting index as not measured');
      v.restingType = null;
    }
    if (v.restingValue !== null && v.restingType === null) {
      console.warn('CvfInterpreter: restingValue provided but restingType is null — treating resting index as not measured');
      v.restingValue = null;
    }

    var phenotypeName = classify(v);
    var phenotypeData = PHENOTYPES[phenotypeName];

    var greyZone = v.ffr !== null &&
                   v.ffr >= THRESHOLDS.FFR_GREY_ZONE_LOW &&
                   v.ffr <= THRESHOLDS.FFR_GREY_ZONE_HIGH;

    return {
      phenotype:    phenotypeName,
      subtitle:     phenotypeData.subtitle,
      summary:      phenotypeData.summary,
      color:        phenotypeData.color,
      measurements: buildMeasurements(v),
      evidence:     EVIDENCE,
      greyZone:     greyZone,
      greyZoneNote: greyZone ? GREY_ZONE_NOTE : null,
    };
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
