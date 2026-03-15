/**
 * HeartPilot PCI Rule Loader
 * ──────────────────────────
 * Fetches all domain rule files and merges into a single flat array
 * suitable for PciEngine.evaluate().
 *
 * Browser: uses fetch(). Node/test: use loadRulesFromDisk().
 */

'use strict';

const RULE_DOMAINS = [
  'access',
  'wire',
  'lesion_prep',
  'imaging',
  'stent',
  'bifurcation',
  'haemodynamics',
];

/**
 * Browser: load all rule files via fetch.
 * @param {string} [basePath] - Base path to the rules directory (default: 'rules/')
 * @returns {Promise<Array>} Flat merged rule array
 */
async function loadRules(basePath = 'rules/') {
  const results = await Promise.allSettled(
    RULE_DOMAINS.map(domain =>
      fetch(`${basePath}${domain}.json`)
        .then(r => {
          if (!r.ok) throw new Error(`HTTP ${r.status} loading ${domain}.json`);
          return r.json();
        })
        .then(data => {
          // Each file is { domain, rules: [...] }
          const rules = data.rules ?? data;
          // Stamp domain onto each rule if not already set
          return rules.map(rule => ({ ...rule, domain: rule.domain ?? domain }));
        })
    )
  );

  const allRules = [];
  for (let i = 0; i < results.length; i++) {
    if (results[i].status === 'fulfilled') {
      allRules.push(...results[i].value);
    } else {
      console.warn(`HeartPilot: failed to load rules/${RULE_DOMAINS[i]}.json —`, results[i].reason);
    }
  }

  return allRules;
}

/**
 * Derive normalised case input from the PCI wizard state object S.
 * Call this immediately before evaluate() to get a clean case snapshot.
 *
 * @param {object} S - Wizard state
 * @returns {object} Normalised case input (matches case-input.schema.json)
 */
function caseFromWizardState(S) {
  const bif = S.bifurcation;
  return {
    vessel:               S.vessel,
    calcification:        S.calcification,
    thrombus:             !!S.thrombus,
    timi:                 S.timi ?? 3,
    lesion_length_mm:     S.lesionLength ?? 15,
    morphology:           S.morphology,
    lvef:                 S.lvef ?? 'normal',
    haem_status:          S.haemStatus ?? 'stable',
    multivessel:          !!S.multiVessel,
    last_remaining_vessel:!!S.singleVessel,
    bifurcation: bif ? {
      present:       true,
      medina_prox_mv:S.medina?.[0] ?? 0,
      medina_dist_mv:S.medina?.[1] ?? 0,
      medina_sb:     S.medina?.[2] ?? 0,
      sb_size:       S.sbSize   ?? null,
      sb_angle:      S.sbAngle  ?? null,
    } : { present: false },
  };
}

const PciLoader = { loadRules, caseFromWizardState, RULE_DOMAINS };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PciLoader;
} else if (typeof window !== 'undefined') {
  window.PciLoader = PciLoader;
}
