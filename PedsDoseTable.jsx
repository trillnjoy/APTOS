import { useState, useMemo, useCallback, useEffect } from "react";

// ── Shared clinical constants ──────────────────────────────────────────────────
// Single source of truth for weight bounds and NICU zone threshold.
// All three band builders (liquid, tablet, injectable) reference these values.
// Do not change without understanding the clinical rationale for each.
const CONFIG = {
  // Minimum weight for any displayed band. Below 0.300 kg oral dosing of the
  // drugs covered by this application is not clinically feasible. (Manifesto p.3)
  MIN_W: 0.3,

  // Maximum weight ceiling. Bands open-end at >= wLow(maxDose) above this.
  MAX_W: 150,

  // NICU zone upper boundary. Below this cursor position, the liquid and
  // injectable builders retain every step at the finest active syringe
  // graduation rather than applying tier-preference selection.
  // Primary purpose: contain the influence of the 0.01 mL neonatal syringe
  // (off by default, activated by checkbox) to the weight range where
  // hundredths-of-mL precision is genuinely needed. Above 1.0 kg the tier
  // system naturally outcompetes 0.01 mL steps with coarser, simpler
  // graduations — no special containment needed. Below 1.0 kg every step
  // matters and should be retained regardless of tier.
  NICU_MAX_W: 1.0,

  // Weight threshold for the unified oral builder (buildCrossOralTable).
  // Below this: liquid forced waypoints apply, liquid preferred at equal tier.
  // At/above this: whole-tablet doses become forced waypoints, liquid waypoints
  // suppressed. ~20 kg is where most children can reliably swallow tablets and
  // where dispensing a measured liquid volume offers diminishing benefit.
  SOLID_PREF_WT: 20,
};

// ── Drug catalogue ─────────────────────────────────────────────────────────────
const FALLBACK_DB = [
  {
    generic: "Acetaminophen",
    formulary: true,
    formulations: [
      { label: "160 mg/5 mL suspension (32 mg/mL)", concentration: 32, unit: "mg",
        form: "liquid", form_canonical: "oral suspension",
        preferredVols: [1.25, 2.5, 3.75, 8, 10], deviceLimited: false,
        ndc: "50580-0140-04", item_id: "SAMPLE", _source: "FALLBACK",
        rxcui: "1148399", rxnorm_name: "Acetaminophen 32 MG/ML Oral Solution", _rxnorm_src: "ndc" },
      { label: "325 mg tablet", concentration: 325, unit: "mg",
        form: "tablet", form_canonical: "tablet",
        canHalf: true, canQuarter: true, canEighth: false,
        ndc: "50580-0449-30", item_id: "SAMPLE", _source: "FALLBACK",
        rxcui: "198440", rxnorm_name: "Acetaminophen 325 MG Oral Tablet", _rxnorm_src: "ndc" },
    ]
  },
  {
    generic: "carvedilol",
    formulary: true,
    formulations: [
      { label: "CARVEDILOL 3.125 MG TAB", concentration: 3.125, unit: "mg",
        form: "tablet", form_canonical: "tablet",
        canHalf: true, canQuarter: false, canEighth: false,
        ndc: "00007-4139-20", item_id: "SAMPLE", _source: "FALLBACK",
        rxcui: "200031", rxnorm_name: "carvedilol 3.125 MG Oral Tablet", _rxnorm_src: "ndc" },
      { label: "CARVEDILOL 12.5 MG TAB", concentration: 12.5, unit: "mg",
        form: "tablet", form_canonical: "tablet",
        canHalf: true, canQuarter: true, canEighth: false,
        ndc: "00007-4140-20", item_id: "SAMPLE", _source: "FALLBACK",
        rxcui: "200032", rxnorm_name: "carvedilol 12.5 MG Oral Tablet", _rxnorm_src: "ndc" },
      { label: "CARVEDILOL 25 MG TAB", concentration: 25, unit: "mg",
        form: "tablet", form_canonical: "tablet",
        canHalf: false, canQuarter: false, canEighth: false,
        ndc: "00007-4141-20", item_id: "SAMPLE", _source: "FALLBACK",
        rxcui: "200033", rxnorm_name: "carvedilol 25 MG Oral Tablet", _rxnorm_src: "ndc" },
    ]
  },
  {
    generic: "morphine",
    formulary: true,
    formulations: [
      { label: "MORPHINE 2 MG/ML INJ VIAL", concentration: 2, unit: "mg",
        form: "injectable", form_canonical: "injectable solution",
        vialVol: 10, ndc: "00641-6008-25", item_id: "SAMPLE", _source: "FALLBACK",
        rxcui: "892473", rxnorm_name: "Morphine Sulfate 2 MG/ML Injectable Solution", _rxnorm_src: "ndc" },
    ]
  },
  {
    generic: "cephalexin",
    formulary: true,
    formulations: [
      { label: "CEPHALEXIN 250 MG CAP", concentration: 250, unit: "mg",
        form: "capsule", form_canonical: "capsule",
        canHalf: false, canQuarter: false, canEighth: false,
        ndc: "00093-3147-01", item_id: "SAMPLE", _source: "FALLBACK",
        rxcui: "309112", rxnorm_name: "cephalexin 250 MG Oral Capsule", _rxnorm_src: "ndc" },
      { label: "CEPHALEXIN 500 MG CAP", concentration: 500, unit: "mg",
        form: "capsule", form_canonical: "capsule",
        canHalf: false, canQuarter: false, canEighth: false,
        ndc: "00093-3148-01", item_id: "SAMPLE", _source: "FALLBACK",
        rxcui: "309114", rxnorm_name: "cephalexin 500 MG Oral Capsule", _rxnorm_src: "ndc" },
    ]
  },
  {
    generic: "HYDROmorphone",
    formulary: true,
    formulations: [
      { label: "HYDROmorphone ORAL 2 MG TAB", concentration: 2, unit: "mg",
        form: "tablet", form_canonical: "tablet",
        canHalf: true, canQuarter: true, canEighth: false,
        ndc: "00406-3241-01", item_id: "SAMPLE", _source: "FALLBACK",
        rxcui: "897696", rxnorm_name: "hydromorphone hydrochloride 2 MG Oral Tablet", _rxnorm_src: "ndc" },
      { label: "HYDROmorphone ORAL 4 MG TAB", concentration: 4, unit: "mg",
        form: "tablet", form_canonical: "tablet",
        canHalf: true, canQuarter: true, canEighth: false,
        ndc: "00406-3242-01", item_id: "SAMPLE", _source: "FALLBACK",
        rxcui: "897702", rxnorm_name: "hydromorphone hydrochloride 4 MG Oral Tablet", _rxnorm_src: "ndc" },
    ]
  },
  {
    generic: "ciprofloxacin",
    formulary: true,
    formulations: [
      { label: "CIPROFLOXACIN 200 MG/100 ML D5W BAG", concentration: 2, unit: "mg",
        form: "injectable", form_canonical: "injectable solution",
        vialVol: 100, ndc: "25021-0192-82", item_id: "1296", _source: "FALLBACK",
        rxcui: "1665210", rxnorm_name: "100 ML ciprofloxacin 2 MG/ML Injection", _rxnorm_src: "ndc" },
      { label: "CIPROFLOXACIN 400 MG/200 ML D5W BAG", concentration: 2, unit: "mg",
        form: "injectable", form_canonical: "injectable solution",
        vialVol: 200, ndc: "25021-0192-87", item_id: "1291", _source: "FALLBACK",
        rxcui: "1665212", rxnorm_name: "200 ML ciprofloxacin 2 MG/ML Injection", _rxnorm_src: "ndc" },
    ]
  },
  {
    generic: "caffeine citrate",
    formulary: true,
    formulations: [
      { label: "CAFFEINE CITRATE 20 MG/ML ORAL SOLN 3 ML",
        concentration: 20, unit: "mg",
        form: "liquid", form_canonical: "oral solution",
        preferredVols: [], deviceLimited: false,
        ndc: "00409-4955-01", item_id: "SAMPLE", _source: "FALLBACK",
        rxcui: "849928",
        rxnorm_name: "caffeine citrate 20 MG/ML Oral Solution",
        _rxnorm_src: "ndc" },
    ]
  },
  {
    generic: "morphine",
    formulary: true,
    formulations: [
      // 1 mg/mL, 10 mL PF vial — standard NICU dilution.
      // At 0.05–0.1 mg/kg exercises NICU zone; whole vial (10 mL = 10 mg) is tier-0.
      { label: "MORPHINE INJ *PF* 10 MG/10 ML",
        concentration: 1, unit: "mg",
        form: "injectable", form_canonical: "injectable solution",
        vialVol: 10,
        ndc: "00409-3815-12", item_id: "8763", _source: "FALLBACK",
        rxcui: "1728800",
        rxnorm_name: "10 ML morphine sulfate 1 MG/ML Injection",
        _rxnorm_src: "ndc" },
      // 0.5 mg/mL, 10 mL PF vial (Duramorph) — finest concentration, neonatal.
      // At 0.05 mg/kg: 0.3 kg neonate = 0.015 mg = 0.03 mL. Deep NICU zone.
      // Cross-formulation with 1 mg/mL tests coarsening across concentrations.
      { label: "MORPHINE INJ *PF* 5 MG/10 ML",
        concentration: 0.5, unit: "mg",
        form: "injectable", form_canonical: "injectable solution",
        vialVol: 10,
        ndc: "00641-6020-10", item_id: "8762", _source: "FALLBACK",
        rxcui: "892473",
        rxnorm_name: "10 ML morphine sulfate 0.5 MG/ML Injection [Duramorph]",
        _rxnorm_src: "ndc" },
    ]
  },
  {
    generic: "vecuronium",
    formulary: true,
    formulations: [
      // 10 mg/mL, 1 mL vial — undiluted concentrate (all one time or PICU use).
      // Entire dose range is sub-1 mL: 0.1 mg/kg at 10 kg = 1 mg = 0.1 mL.
      // Tests syringe pool at very small volumes across the PICU weight range.
      { label: "VECURONIUM 10 MG VIAL (all one time or PICU)",
        concentration: 10, unit: "mg",
        form: "injectable", form_canonical: "injectable solution",
        vialVol: 1,
        ndc: "81565-0206-02", item_id: "3449", _source: "FALLBACK",
        rxcui: "859437",
        rxnorm_name: "vecuronium bromide 1 MG/ML Injectable Solution",
        _rxnorm_src: "ndc" },
      // 1 mg/mL, 10 mL vial — diluted (CTICU/NICCU prn).
      // At 0.1 mg/kg: 0.3 kg neonate = 0.03 mg = 0.03 mL. NICU zone.
      // Cross-formulation with 10 mg/mL: same dose, 10× the volume — algorithm
      // must select the formulation appropriate to each weight range.
      { label: "VECURONIUM 1 MG/ML in SW INJ (all CTICU / NICCU prn)",
        concentration: 1, unit: "mg",
        form: "injectable", form_canonical: "injectable solution",
        vialVol: 10,
        ndc: "81565-0206-02A", item_id: "24399", _source: "FALLBACK",
        rxcui: null,
        rxnorm_name: null,
        _rxnorm_src: "ignored" },
    ]
  },
  {
    // levETIRAcetam — tall-man lettering preserved from formulary
    generic: "levETIRAcetam",
    formulary: true,
    formulations: [
      // 100 mg/mL oral solution — the deviceLimited test case.
      // NOTE: formulary has deviceLimited: false. The FALLBACK_DB previously had
      // deviceLimited: true for levetiracetam. Batch 5 should resolve which is correct.
      // At 20-60 mg/kg pediatric dosing, 100 mg/mL produces 0.2-0.6 mL/kg —
      // device-limited behavior (0.1 mL precision throughout) is clinically appropriate
      // even if the flag is not set in the current extract.
      { label: "levETIRAcetam ORAL 100 MG/ML SOLN",
        concentration: 100, unit: "mg",
        form: "liquid", form_canonical: "oral solution",
        preferredVols: [], deviceLimited: false,
        ndc: "31722-0574-47", item_id: "9068", _source: "FALLBACK",
        rxcui: "403884",
        rxnorm_name: "levetiracetam 100 MG/ML Oral Solution",
        _rxnorm_src: "ndc" },
      // 500 mg/5 mL unit-dose — same concentration, different pack.
      { label: "levETIRAcetam UD 500 MG/5 ML SOLN",
        concentration: 100, unit: "mg",
        form: "liquid", form_canonical: "oral solution",
        preferredVols: [], deviceLimited: false,
        ndc: "60687-0249-77", item_id: "9068", _source: "FALLBACK",
        rxcui: "403884",
        rxnorm_name: "levetiracetam 100 MG/ML Oral Solution",
        _rxnorm_src: "ndc" },
    ]
  },
];
const DRUG_DB = window.APTOS_DRUG_DB || FALLBACK_DB;

// ── Route-form class classification ───────────────────────────────────────────
// Groups formulations into pharmacist-meaningful dispensing categories.
// Band generation is per-class — formulations across classes are never mixed.
function getFormClass(f) {
  const form = f.form;
  const canonical = (f.form_canonical || "").toLowerCase();
  if (form === "liquid")      return "oral-liquid";
  if (form === "injectable")  return "injectable";
  if (form === "capsule")     return "oral-capsule";
  if (form === "tablet") {
    if (/extended release|delayed release|er |dr |xr /.test(canonical))
      return "oral-tablet-er";
    return "oral-tablet-ir";
  }
  return "other";
}

const CLASS_LABELS = {
  "oral-liquid":    "Oral Liquid",
  "oral-tablet-ir": "Oral Tablet (IR)",
  "oral-tablet-er": "Oral Tablet (ER/DR)",
  "oral-capsule":   "Oral Capsule",
  "injectable":     "Injectable",
  "other":          "Other",
};

// ── Weight rounding ────────────────────────────────────────────────────────────
function roundW(w) {
  if (w < 5)  return Math.round(w * 100) / 100;
  if (w < 20) return Math.round(w * 10)  / 10;
  return Math.round(w);
}

// ── Syringe pool ───────────────────────────────────────────────────────────────
function buildSyringePool(activeSyringes) {
  const map = new Map();
  const add = (v, label, tier) => {
    const key = Math.round(v * 100000);
    const ex  = map.get(key);
    if (!ex || tier < ex.tier) map.set(key, { vol: v, syringeLabel: label, tier });
  };
  if (activeSyringes.has("1mL_005")) {
    for (let i = 1; i <= 30; i++) {
      const v = Math.round(i * 0.05 * 100000) / 100000;
      if (v > 1.0) break;
      let tier = 4;
      if (Math.abs(v - Math.round(v)) < 0.0001)                              tier = 0;
      else if (Math.abs(v * 2 - Math.round(v * 2)) < 0.0001)                 tier = 1;
      else if (Math.abs(v * 10 - Math.round(v * 10)) < 0.0001)               tier = 3;
      add(v, "1", tier);
    }
  }
  if (activeSyringes.has("1mL_001")) {
    for (let i = 1; i <= 150; i++) {
      const v = Math.round(i * 0.01 * 100000) / 100000;
      if (v > 1.0) break;
      let tier = 5;
      if (Math.abs(v - Math.round(v)) < 0.0001)                              tier = 0;
      else if (Math.abs(v * 2 - Math.round(v * 2)) < 0.0001)                 tier = 1;
      else if (Math.abs(v * 10 - Math.round(v * 10)) < 0.0001)               tier = 3;
      else if (Math.abs(v * 20 - Math.round(v * 20)) < 0.0001)               tier = 4;
      add(v, "1*", tier);
    }
  }
  if (activeSyringes.has("3mL")) {
    for (let i = 1; i <= 30; i++) {
      const v = Math.round(i * 0.1 * 100000) / 100000;
      if (v < 1.0) continue;
      let tier = 3;
      if (Math.abs(v - Math.round(v)) < 0.0001)                              tier = 0;
      else if (Math.abs(v * 2 - Math.round(v * 2)) < 0.0001)                 tier = 1;
      add(v, "3", tier);
    }
  }
  if (activeSyringes.has("5mL_std")) {
    for (let i = 1; i <= 25; i++) {
      const v = Math.round(i * 0.2 * 100000) / 100000;
      if (v <= 3.0 || v > 5.0) continue;
      let tier = 2;
      if (Math.abs(v - Math.round(v)) < 0.0001)                              tier = 0;
      else if (Math.abs(v * 2 - Math.round(v * 2)) < 0.0001)                 tier = 1;
      add(v, "5", tier);
    }
    [3.5, 4.5].forEach(v => add(v, "5", 1));
  }
  if (activeSyringes.has("5mL_apap")) {
    [1.25, 2.5, 3.75, 5.0].forEach(v =>
      map.set(Math.round(v * 100000), { vol: v, syringeLabel: "5*", tier: 1 }));
  }
  if (activeSyringes.has("10mL")) {
    for (let i = 1; i <= 50; i++) {
      const v = Math.round(i * 0.2 * 100000) / 100000;
      if (v <= 5.0 || v > 10.0) continue;
      let tier = 2;
      if (Math.abs(v - Math.round(v)) < 0.0001)                              tier = 0;
      else if (Math.abs(v * 2 - Math.round(v * 2)) < 0.0001)                 tier = 1;
      add(v, "10", tier);
    }
    [5.5, 6.5, 7.5, 8.5, 9.5, 10.5].forEach(v => add(v, "10", 1));
    [5, 6, 7, 8, 9, 10].forEach(v => add(v, "10", 0));
    for (let i = 21; i <= 60; i++) {
      const v = Math.round(i * 0.5 * 100000) / 100000;
      add(v, "10×", Math.abs(v - Math.round(v)) < 0.0001 ? 0 : 1);
    }
  }
  return [...map.values()].sort((a, b) => a.vol - b.vol);
}

// ── Liquid table builder (single formulation) ──────────────────────────────────
// Unchanged from v1.7 — operates on one liquid formulation as before.
function buildLiquidTable(formulation, targetMgKg, variancePct, maxDose, activeSyringes) {
  const { concentration: conc, preferredVols = [], unit, deviceLimited = false } = formulation;
  const effectiveMax = maxDose ?? Infinity;
  const vf    = variancePct / 100;
  const MIN_W = CONFIG.MIN_W;
  const MAX_W = CONFIG.MAX_W;
  const wLow  = dose => dose / (targetMgKg * (1 + vf));
  const wHigh = dose => dose / (targetMgKg * (1 - vf));
  const pVar  = (dose, wt) => (dose - wt * targetMgKg) / (wt * targetMgKg) * 100;

  const poolVols = buildSyringePool(activeSyringes);
  const eligible = deviceLimited ? poolVols.filter(v => v.tier >= 3 || v.vol > 3.0) : poolVols;

  const forcedVolKeys = new Set();
  // Forced aliquots at 1, 2.5, 5, 7.5, 10 mL anchor the clinically standard
  // reference volumes for suspensions labeled "x mg/5 mL". These VOLUMES are
  // the landmarks (Meyers 2024 Table 1) — the resulting mg dose is whatever it is.
  // Do NOT filter by dose roundness: senna (1.76 mg/mL) produces 8.8 mg at 5 mL
  // which is non-integer but IS the label dose. Same for diphenhydrAMINE (12.5 mg),
  // tacrolimus, cloBAZam, losartan, and 13 other formulary drugs.
  // The tier-check in useForced (below) prevents disruptive insertion — that is the
  // correct general solution. Do not add dose-roundness suppression here.
  [1.0, 2.5, 5.0, 7.5, 10.0].forEach(v => {
    const dose = Math.round(v * conc * 10000) / 10000;
    if (dose <= effectiveMax + 0.001) forcedVolKeys.add(Math.round(v * 100000));
  });
  preferredVols.forEach(v => forcedVolKeys.add(Math.round(v * 100000)));
  const apapForced = new Set(
    activeSyringes.has("5mL_apap") ? [1.25, 2.5, 3.75, 5.0].map(v => Math.round(v * 100000)) : []
  );
  apapForced.forEach(k => forcedVolKeys.add(k));

  const candidates = eligible
    .map(v => ({ ...v, dose: Math.round(v.vol * conc * 10000) / 10000,
                       forced: forcedVolKeys.has(Math.round(v.vol * 100000)) }))
    .filter(c => c.dose > 0 && c.dose <= effectiveMax + 0.001);

  // NICU zone: retain every step at the finest active syringe graduation.
  // Applies only while prevWtH < CONFIG.NICU_MAX_W. See CONFIG block for rationale.
  const NICU_MAX_W = CONFIG.NICU_MAX_W;
  const retained = []; const retainedKeys = new Set();
  let prevWtH = MIN_W;

  function pickNext(inNicuZone) {
    const lastDose = retained.length > 0 ? retained[retained.length - 1].dose : 0;
    const readyForced = candidates.filter(c =>
      c.forced && !retainedKeys.has(Math.round(c.vol * 100000)) &&
      c.dose > lastDose + 0.0001 && wLow(c.dose) <= prevWtH + 0.0001
    ).sort((a, b) => a.vol - b.vol);
    const eligible2 = candidates.filter(c =>
      !c.forced && !retainedKeys.has(Math.round(c.vol * 100000)) &&
      c.dose > lastDose + 0.0001 && wLow(c.dose) <= prevWtH + 0.0001
    );
    let best = null;
    if (eligible2.length > 0) {
      if (inNicuZone) {
        best = eligible2.reduce((a, b) => a.vol <= b.vol ? a : b);
      } else {
        best = eligible2.reduce((a, b) => {
          if (b.tier < a.tier) return b;
          if (b.tier === a.tier && wHigh(b.dose) > wHigh(a.dose) + 0.0001) return b;
          if (b.tier === a.tier && Math.abs(wHigh(b.dose) - wHigh(a.dose)) < 0.0001 && b.vol > a.vol) return b;
          return a;
        });
      }
    }
    // A forced waypoint wins only when its tier is no worse than the organic best.
    // This prevents a tier-1 forced volume (e.g. 7.5 mL = X.5 mark on 10 mL syringe)
    // from inserting itself between two tier-0 organic candidates (whole-mL steps),
    // which would create a narrow micro-band. Example: diphenhydrAMINE 2.5 mg/mL —
    // 7.5 mL = 18.75 mg (tier-1) must not displace 8 mL = 20 mg (tier-0 organic).
    // DO NOT remove this tier check without re-validating diphenhydrAMINE at max=25.
    const useForced = readyForced.length > 0 &&
      (!best || (readyForced[0].vol <= best.vol && readyForced[0].tier <= best.tier));
    return useForced ? readyForced[0] : best;
  }

  while (prevWtH < MAX_W - 0.0001) {
    const lastDose = retained.length > 0 ? retained[retained.length - 1].dose : 0;
    const inNicuZone = prevWtH < NICU_MAX_W;
    const chosen = pickNext(inNicuZone);
    if (!chosen) {
      const nextAny = candidates
        .filter(c => !retainedKeys.has(Math.round(c.vol * 100000)) && c.dose > lastDose)
        .sort((a, b) => wLow(a.dose) - wLow(b.dose))[0];
      if (!nextAny || wLow(nextAny.dose) >= MAX_W - 0.0001) break;
      prevWtH = wLow(nextAny.dose); continue;
    }
    const isLast = chosen.dose >= effectiveMax - 0.001;
    retainedKeys.add(Math.round(chosen.vol * 100000));
    retained.push({ ...chosen, isLast });
    prevWtH = isLast ? MAX_W : wHigh(chosen.dose);
    if (isLast) break;
  }

  const displayable = retained.filter(r => wLow(r.dose) >= MIN_W - 0.0001);
  const rows = [];
  for (let i = 0; i < displayable.length; i++) {
    const r = displayable[i]; const next = displayable[i + 1];
    const rowWtL = wLow(r.dose);
    const rawWtH = r.isLast ? MAX_W : (next ? wLow(next.dose) : wHigh(r.dose));
    const effectiveWtH = Math.min(rawWtH, MAX_W);
    if (effectiveWtH <= rowWtL + 0.0001 && !r.isLast) continue;
    const overPct  = pVar(r.dose, rowWtL);
    const underPct = r.isLast ? null : pVar(r.dose, effectiveWtH);
    const flagged  = Math.abs(overPct) > variancePct + 0.05 ||
                     (!r.isLast && underPct !== null && Math.abs(underPct) > variancePct + 0.05);
    rows.push({
      wStart: roundW(rowWtL),
      wEnd:   r.isLast ? `>= ${roundW(rowWtL)}` : roundW(effectiveWtH),
      doseLabel:    `${r.dose} ${unit}`,
      volLabel:     `${r.vol} mL`,
      syringeLabel: r.syringeLabel,
      formLabel:    formulation.label,
      overPct, underPct, flagged, oot: false, isLast: r.isLast,
    });
  }
  return rows;
}

// ── Tablet candidate generator ────────────────────────────────────────────────
// Returns all dispensable dose steps for ONE formulation as annotated objects.
// Tier hierarchy (lower = preferred by sequential filter):
//   0 = whole tab             — always preferred
//   1 = half tab  (X½)        — accepted when whole doesn't reach cursor
//   2 = ¾ tab                 — necessary evil; disappears as weight/tolerance permits
//   3 = ¼ tab                 — finest necessary evil; lowest weights only
// ¾ and ¼ only generated when canQuarter=true.
function tabletCandidates(formulation, targetMgKg, variancePct, maxDose) {
  const { concentration: strength, unit, canHalf = false, canQuarter = false,
          formulary = true,
          // maxTablets: max whole tablets dispensed in a single dose. Default 4 —
          // beyond this, a different strength should be used. Set higher in the
          // formulary for drugs where no larger strength exists (e.g. carvedilol
          // 3.125 mg when 6.25 mg is unavailable). Set to 1 for capsules that
          // cannot be split and exist only in one strength.
          maxTablets = 4 } = formulation;
  const effectiveMax = maxDose ?? Infinity;
  const vf    = variancePct / 100;
  const MAX_W = CONFIG.MAX_W;
  const maxTabs = Math.min(Math.ceil(effectiveMax / strength), maxTablets);

  const ann = steps => steps
    .filter(s => s.dose <= effectiveMax + 0.001)
    .map(s => ({
      ...s, unit,
      formLabel: formulation.label,
      formulary,
      wLow:  s.dose / (targetMgKg * (1 + vf)),
      wHigh: s.dose / (targetMgKg * (1 - vf)),
    }));

  // Tier 0 — whole tabs
  const wholes = ann(Array.from({ length: maxTabs }, (_, i) => ({
    dispensed: i + 1, dose: (i + 1) * strength,
    label: `${i + 1} ${i === 0 ? "tab" : "tabs"}`, tier: 0,
  })));

  // Tier 1 — half tabs (X.5 multiples, skip whole numbers)
  const halves = canHalf ? ann(Array.from({ length: maxTabs * 2 }, (_, i) => {
    const d = (i + 1) * 0.5;
    if (d % 1 === 0) return null;
    const whole = Math.floor(d);
    return { dispensed: d, dose: d * strength,
             label: `${whole > 0 ? whole : ""}½ ${d === 0.5 ? "tab" : "tabs"}`, tier: 1 };
  }).filter(Boolean)) : [];

  // Tier 2 — ¾ tabs (0.75, 1.75, 2.75 ... requires canQuarter)
  const threeQuarters = canQuarter ? ann(Array.from({ length: maxTabs * 4 }, (_, i) => {
    const d = Math.round((i + 1) * 0.25 * 1000) / 1000;
    const frac = Math.round((d - Math.floor(d)) * 1000) / 1000;
    if (Math.abs(frac - 0.75) > 0.001) return null;
    const whole = Math.floor(d);
    return { dispensed: d, dose: d * strength,
             label: `${whole > 0 ? whole : ""}¾ ${d < 1 ? "tab" : "tabs"}`, tier: 2 };
  }).filter(Boolean)) : [];

  // Tier 3 — ¼ tabs (0.25, 1.25, 2.25 ... requires canQuarter)
  const quarters = canQuarter ? ann(Array.from({ length: maxTabs * 4 }, (_, i) => {
    const d = Math.round((i + 1) * 0.25 * 1000) / 1000;
    const frac = Math.round((d - Math.floor(d)) * 1000) / 1000;
    if (Math.abs(frac - 0.25) > 0.001) return null;
    const whole = Math.floor(d);
    return { dispensed: d, dose: d * strength,
             label: `${whole > 0 ? whole : ""}¼ ${d < 1 ? "tab" : "tabs"}`, tier: 3 };
  }).filter(Boolean)) : [];

  return [...wholes, ...halves, ...threeQuarters, ...quarters]
    .filter(s => s.wLow < MAX_W)
    .sort((a, b) => a.dose - b.dose || a.tier - b.tier);
}

// ── Cross-formulation oral table builder (liquid + solid unified) ──────────────
// Unified candidate pool across all active liquid AND solid oral formulations.
// Two-zone forced waypoint strategy:
//
//   Below CONFIG.SOLID_PREF_WT (20 kg): liquid forced waypoints apply (1,2.5,5,7.5,10 mL)
//     anchoring the standard "x mg/5 mL" reference volumes. Liquid preferred at equal tier.
//
//   At/above CONFIG.SOLID_PREF_WT: whole-tablet doses become forced waypoints.
//     Liquid forced waypoints suppressed to prevent crowding (e.g. 320 mg liquid
//     immediately before 325 mg tablet). Solid preferred at equal tier.
//
// This produces the clinically expected sequence: liquid precision steps at low
// weights → natural transition → tablet doses (whole, half, quarter) at high weights.
// Candidate key: compound "form:volKey:label" — prevents dedup collision between
// liquid 1.0 mL and solid 1.0 whole tab.
function buildCrossOralTable(liquidFormulations, solidFormulations, targetMgKg, variancePct, maxDose, activeSyringes) {
  const MAX_W         = CONFIG.MAX_W;
  const MIN_W         = CONFIG.MIN_W;
  const NICU_MAX_W    = CONFIG.NICU_MAX_W;
  const SOLID_PREF_WT = CONFIG.SOLID_PREF_WT;
  const effectiveMax  = maxDose ?? Infinity;
  const vf = variancePct / 100;

  const wLow  = dose => dose / (targetMgKg * (1 + vf));
  const wHigh = dose => dose / (targetMgKg * (1 - vf));
  const pVar  = (dose, wt) => (dose - wt * targetMgKg) / (wt * targetMgKg) * 100;

  const pool = buildSyringePool(activeSyringes);

  // ── Liquid candidates with forced waypoint flags ───────────────────────────
  // Forced waypoints (1,2.5,5,7.5,10 mL) are tagged; they are only honored
  // when cursor < SOLID_PREF_WT.
  const FORCED_VOLS_ML = new Set([1.0, 2.5, 5.0, 7.5, 10.0]);
  const liquidCandidates = liquidFormulations.flatMap(f => {
    const conc = f.concentration;
    return pool.map(({ vol, syringeLabel, tier }) => {
      const dose = Math.round(vol * conc * 100000) / 100000;
      if (dose <= 0 || dose > effectiveMax + 0.001) return null;
      const isForced = FORCED_VOLS_ML.has(vol);
      return {
        key:          `liq:${Math.round(vol * 100000)}:${f.label}`,
        vol, dose, tier, unit: f.unit,
        volLabel:     `${vol} mL`,
        formLabel:    f.label,
        syringeLabel, isLiquid: true, isForced,
        wLow:  wLow(dose),
        wHigh: wHigh(dose),
      };
    }).filter(Boolean);
  });

  // ── Solid candidates — deduplicated by dose across formulations ───────────────
  // When multiple strengths produce the same dose (e.g. 200 mg = 2×100 mg or 1×200 mg),
  // keep the candidate requiring fewest physical units (lowest dispensed count).
  const rawSolidCandidates = solidFormulations.flatMap(f =>
    tabletCandidates(f, targetMgKg, variancePct, effectiveMax).map(c => {
      const disp = c.dispensed;
      const isForced = typeof disp === 'number' &&
                       Math.abs(disp - Math.round(disp)) < 0.001 && disp >= 1;
      return { ...c, vol: disp,
               key: `tab:${Math.round(disp * 100000)}:${c.formLabel}`,
               volLabel: c.label, isLiquid: false, isForced };
    })
  ).filter(c => c.wLow < MAX_W);

  const solidCandidates = deduplicateTabletCandidates(rawSolidCandidates);

  const all = [...liquidCandidates, ...solidCandidates]
    .filter(c => c.wLow < MAX_W)
    .sort((a, b) => a.dose - b.dose || a.tier - b.tier);

  if (!all.length) return [];

  const retained     = [];
  const retainedKeys = new Set();
  let prevWtH = MIN_W;

  while (prevWtH < MAX_W - 0.0001) {
    const lastDose    = retained.length > 0 ? retained[retained.length - 1].dose : 0;
    const inNicuZone  = prevWtH < NICU_MAX_W;
    const solidZone   = prevWtH >= SOLID_PREF_WT;

    const reachable = all.filter(c =>
      !retainedKeys.has(c.key) &&
      c.dose > lastDose + 0.0001 &&
      c.wLow <= prevWtH + 0.0001 &&
      c.wHigh > prevWtH + 0.0001
    );

    if (!reachable.length) {
      const nextAny = all
        .filter(c => !retainedKeys.has(c.key) && c.dose > lastDose)
        .sort((a, b) => a.wLow - b.wLow)[0];
      if (!nextAny || nextAny.wLow >= MAX_W - 0.0001) break;
      prevWtH = nextAny.wLow;
      continue;
    }

    let chosen;

    if (inNicuZone) {
      // NICU zone: finest step
      chosen = reachable.reduce((a, b) => a.vol <= b.vol ? a : b);

    } else if (solidZone) {
      // Solid zone (≥ SOLID_PREF_WT): whole-tablet forced candidates take priority.
      // Among forced solid candidates, prefer lowest dose (next logical tablet step).
      // If no forced solid is reachable, fall through to tier-first organic selection.
      const forcedSolid = reachable.filter(c => !c.isLiquid && c.isForced);
      if (forcedSolid.length > 0) {
        chosen = forcedSolid.reduce((a, b) => a.dose < b.dose ? a : b);
      } else {
        // Organic: tier-first, same-tier prefer solid over liquid, then coverage
        const meaningful = reachable.filter(c => c.wHigh - prevWtH > 0.05);
        const p = meaningful.length ? meaningful : reachable;
        chosen = p.reduce((a, b) => {
          if (a.tier !== b.tier) return a.tier < b.tier ? a : b;
          // Same tier: prefer solid in solid zone
          if (a.isLiquid !== b.isLiquid) return a.isLiquid ? b : a;
          return b.wHigh > a.wHigh ? b : a;
        });
      }

    } else {
      // Liquid zone (< SOLID_PREF_WT): liquid forced waypoints take priority.
      const forcedLiquid = reachable.filter(c => c.isLiquid && c.isForced);
      if (forcedLiquid.length > 0) {
        // Among multiple forced liquid candidates, pick lowest vol (next clean step)
        chosen = forcedLiquid.reduce((a, b) => a.vol < b.vol ? a : b);
      } else {
        // Organic: tier-first, prefer liquid, then coverage
        const meaningful = reachable.filter(c => c.wHigh - prevWtH > 0.05);
        const p = meaningful.length ? meaningful : reachable;
        chosen = p.reduce((a, b) => {
          if (a.tier !== b.tier) return a.tier < b.tier ? a : b;
          // Same tier: prefer liquid in liquid zone
          if (a.isLiquid !== b.isLiquid) return a.isLiquid ? a : b;
          return b.wHigh > a.wHigh ? b : a;
        });
      }
    }

    const isLast = chosen.dose >= effectiveMax - 0.001;
    retainedKeys.add(chosen.key);
    retained.push({ ...chosen, isLast });
    prevWtH = isLast ? MAX_W : wHigh(chosen.dose);
    if (isLast) break;
  }

  if (!retained.length) return [];

  const displayable = retained.filter(r => wLow(r.dose) >= MIN_W - 0.0001);
  const rows = [];
  for (let i = 0; i < displayable.length; i++) {
    const r    = displayable[i];
    const next = displayable[i + 1];
    const rowWtL      = wLow(r.dose);
    const rawWtH      = r.isLast ? MAX_W : (next ? wLow(next.dose) : wHigh(r.dose));
    const effectiveWtH = Math.min(rawWtH, MAX_W);
    if (effectiveWtH <= rowWtL + 0.0001 && !r.isLast) continue;
    const overPct  = pVar(r.dose, rowWtL);
    const underPct = r.isLast ? null : pVar(r.dose, effectiveWtH);
    const flagged  = Math.abs(overPct) > variancePct + 0.05 ||
                     (!r.isLast && underPct !== null && Math.abs(underPct) > variancePct + 0.05);
    rows.push({
      wStart:      roundW(rowWtL),
      wEnd:        r.isLast ? `>= ${roundW(rowWtL)}` : roundW(effectiveWtH),
      doseLabel:   `${r.dose} ${r.unit}`,
      volLabel:    r.volLabel,
      formLabel:   r.formLabel,
      syringeLabel: r.syringeLabel || "",
      overPct, underPct, flagged, oot: false, isLast: r.isLast,
      isLiquid: r.isLiquid,
    });
  }
  return rows;
}
// ── Cross-strength tablet deduplication ───────────────────────────────────────
// When multiple tablet strengths are active (e.g. amiodarone 100 mg + 200 mg),
// both generate candidates at shared dose points (200 mg = 2×100 mg or 1×200 mg,
// 400 mg = 4×100 mg or 2×200 mg). For each unique dose, keep the candidate that
// requires the fewest physical units (lowest dispensed count) — minimum dispensing
// steps, minimum error surface. Tiebreak on tier (whole tab preferred over fraction).
function deduplicateTabletCandidates(candidates) {
  const best = new Map(); // dose (rounded) → best candidate
  for (const c of candidates) {
    const key = Math.round(c.dose * 1000);
    const prev = best.get(key);
    if (!prev) { best.set(key, c); continue; }
    // Prefer fewest units dispensed; break ties by tier (lower = better)
    if (c.dispensed < prev.dispensed ||
        (c.dispensed === prev.dispensed && c.tier < prev.tier)) {
      best.set(key, c);
    }
  }
  return [...best.values()].sort((a, b) => a.dose - b.dose || a.tier - b.tier);
}

// Unified candidate pool across all active formulations.
// Sequential filter identical in spirit to the liquid syringe algorithm:
//   - Walk from MIN_W upward via cursor
//   - At each cursor, all candidates whose wLow ≤ cursor are reachable
//   - Select by tier first (whole > half > ¾ > ¼), then widest coverage,
//     then fewest units — natural coarsening as weight increases
//   - ¼ and ¾ appear at low weights where only fine fractions reach cursor;
//     they disappear as soon as halves and wholes satisfy the tolerance window
//   - Gaps: when no candidate reaches cursor, the previous band expands to absorb
//     the gap (underdose default). Existing variance flagging shows the cost honestly.
//     Before first band, gap is honest absence — table starts at first reachable weight.
function buildCrossTabletTable(formulations, targetMgKg, variancePct, maxDose) {
  if (!formulations.length) return [];

  const MAX_W = CONFIG.MAX_W;
  const MIN_W = CONFIG.MIN_W;
  const effectiveMax = maxDose ?? Infinity;
  const unit = formulations[0].unit;

  // Unified candidate pool — deduplicated by dose across formulations
  const all = deduplicateTabletCandidates(
    formulations.flatMap(f =>
      tabletCandidates(f, targetMgKg, variancePct, effectiveMax)
    ).filter(s => s.wLow < MAX_W)
  );

  if (!all.length) return [];

  // Sequential filter — cursor walk
  const rawSeq = [];
  let cursor = MIN_W;

  while (cursor < MAX_W - 0.0001) {
    // All candidates reachable at this cursor position
    const reachable = all.filter(c =>
      c.wLow <= cursor + 0.0001 &&
      c.wHigh > cursor + 0.0001
    );

    if (!reachable.length) {
      // Gap — no candidate reaches cursor within tolerance.
      // Default: underdose — extend the previous band's wHigh to absorb the gap.
      // The existing variance flagging will show the honest out-of-tolerance cost.
      // If no previous band exists (gap before first candidate), advance silently
      // to first reachable candidate — table starts there, min weight is higher
      // than requested and that is the honest answer.
      const next = all
        .filter(c => c.wLow > cursor)
        .sort((a, b) => a.wLow - b.wLow)[0];
      if (!next) break;
      if (rawSeq.length > 0) {
        // Extend previous band to cover the gap
        rawSeq[rawSeq.length - 1].rowWHigh = next.wLow;
      }
      cursor = next.wLow;
      continue;
    }

    // Selection: tier first (0=whole best), then widest coverage, then fewest units
    // Require candidate to provide meaningful band width (> 0.05 kg)
    // to prevent hair-thin collision bands at cross-formulation boundaries
    const meaningful = reachable.filter(c => c.wHigh - cursor > 0.05);
    const pool = meaningful.length ? meaningful : reachable;
    const best = pool.reduce((a, b) => {
      if (a.tier !== b.tier)                       return a.tier < b.tier ? a : b;
      if (Math.abs(b.wHigh - a.wHigh) > 0.0001)   return b.wHigh > a.wHigh ? b : a;
      if (a.dispensed !== b.dispensed)              return a.dispensed < b.dispensed ? a : b;
      return a;
    });

    const isLast = best.dose >= effectiveMax - 0.001;
    rawSeq.push({
      step:     best,
      rowWLow:  cursor,
      rowWHigh: isLast ? MAX_W : best.wHigh,
      isLast,
    });

    cursor = isLast ? MAX_W : best.wHigh;
    if (isLast) break;
  }

  if (!rawSeq.length) return [];

  return rawSeq
    .filter(({ rowWLow, rowWHigh, isLast }) =>
      isLast ? rowWLow >= MIN_W - 0.0001 : rowWHigh > MIN_W + 0.0001)
    .map(({ step, rowWLow, rowWHigh, isLast }) => {
      const displayWLow = Math.max(rowWLow, MIN_W);
      const overPct  = ((step.dose - displayWLow * targetMgKg) / (displayWLow * targetMgKg)) * 100;
      const underPct = isLast ? null
        : ((step.dose - rowWHigh * targetMgKg) / (rowWHigh * targetMgKg)) * 100;
      const flagged  = Math.abs(overPct) > variancePct + 0.05 ||
                       (!isLast && underPct !== null && Math.abs(underPct) > variancePct + 0.05);
      return {
        wStart:       roundW(displayWLow),
        wEnd:         isLast ? `>= ${roundW(displayWLow)}` : roundW(rowWHigh),
        doseLabel:    `${step.dose} ${unit}`,
        volLabel:     step.label,
        formLabel:    step.formLabel,
        syringeLabel: "",
        overPct, underPct, flagged, oot: false, isLast,
      };
    });
}

// ── Injectable communicability helpers ────────────────────────────────────────
// deriveCommQuantum: largest round-mg step achievable at an integer mL volume.
// At 2 mg/mL: 5 mL = 10 mg → quantum = 10. Used to snap near-round doses.
function deriveCommQuantum(conc) {
  if (!conc || conc <= 0) return 1;
  for (const q of [100, 50, 25, 10, 5, 2, 1]) {
    const mL = q / conc;
    // Require integer mL AND at most 10 mL per quantum step — prevents returning
    // 100 mg (50 mL) for 2 mg/mL when 10 mg (5 mL) is the clinically sensible unit.
    if (Math.round(mL) >= 1 && Math.abs(mL - Math.round(mL)) < 0.0001 && mL <= 10) return q;
  }
  return 1;
}

// snapToComm: given a raw dose and the current cursor, return the nearest
// commQuantum multiple if it (a) is within 70% of one quantum step of raw,
// (b) reaches within REACH_SLACK of the cursor, and (c) the overdose at
// cursor stays within SNAP_GATE.
//
// SNAP_GATE = variancePct + 2.5%: honors the 5% step spacing of the variance
// selector (2.5% = half a step). 158→160 at ±10% produces +11.1%; gate=12.5%; fires.
//
// REACH_SLACK = min(commQuantum×0.7 / (target×(1+vf)), cursor×5%):
// Scales with the weight-space width of a quantum step rather than an absolute
// kg value. The 5% of cursor cap prevents wide slack at low weights — 0.5 kg
// slack at 9 kg is clinically significant; capped at 0.45 kg (5% of 9 kg).
// At 45 kg the formula governs (1.06 kg < 2.25 kg cap). Dangerous upward snaps
// at low weights (e.g. 63→70 mg, wLow(70) is 1.52 kg past cursor, cap=0.45 kg)
// are correctly blocked; safe downward snaps (63→60, diff≈0) are allowed.
//
// Scoring: when candidates are within commQuantum/4 of each other (equidistant
// at the scale of the quantum), prefer lower absolute overdose. Otherwise closer wins.
function snapToComm(rawDose, cursor, conc, targetMgKg, variancePct, commQuantum) {
  const vf              = variancePct / 100;
  const THRESHOLD       = commQuantum * 0.7;
  const SNAP_GATE       = variancePct + 2.5;
  const REACH_SLACK     = Math.min(
    commQuantum * 0.7 / (targetMgKg * (1 + vf)),
    cursor * 0.05
  );
  const DIST_TIE_WINDOW = commQuantum / 4;

  let bestSnap = null, bestDist = Infinity, bestOv = null;
  for (const snapped of [
    Math.floor(rawDose / commQuantum) * commQuantum,
    Math.ceil(rawDose  / commQuantum) * commQuantum,
  ]) {
    if (snapped <= 0 || snapped === rawDose) continue;
    const dist = Math.abs(snapped - rawDose);
    if (dist > THRESHOLD) continue;
    const wLowSnapped = snapped / (targetMgKg * (1 + vf));
    const overPct     = (snapped - cursor * targetMgKg) / (cursor * targetMgKg) * 100;
    if (wLowSnapped > cursor + REACH_SLACK) continue;
    if (Math.abs(overPct) > SNAP_GATE) continue;
    const absOv = Math.abs(overPct);
    if (!bestSnap) { bestSnap = snapped; bestDist = dist; bestOv = absOv; continue; }
    const distDiff = Math.abs(dist - bestDist);
    if (distDiff > DIST_TIE_WINDOW) {
      if (dist < bestDist) { bestSnap = snapped; bestDist = dist; bestOv = absOv; }
    } else {
      if (absOv < bestOv - 0.05) { bestSnap = snapped; bestDist = dist; bestOv = absOv; }
    }
  }
  return bestSnap ?? rawDose;
}

// ── Injectable candidate generator ────────────────────────────────────────────
// Generates dose candidates for ONE injectable formulation.
// Below 30 mL: syringe pool graduations (same tiers as oral liquid).
// Above 30 mL: integer mL steps at concentration (natural coarsening via
//   sequential filter — no artificial step size imposed).
// Whole-bag/vial volume → tier 0 (preferred over all partial draws).
// Infinitely divisible — no canHalf/canQuarter; all volumes are candidates.
function buildInjectableCandidates(formulation, targetMgKg, variancePct, maxDose, activeSyringes) {
  const { concentration: conc, unit, vialVol } = formulation;
  if (!conc || conc <= 0) return [];
  const effectiveMax = maxDose ?? Infinity;
  const vf    = variancePct / 100;
  const MAX_W = CONFIG.MAX_W;

  const ann = (vol) => {
    const dose = Math.round(vol * conc * 100000) / 100000;
    if (dose <= 0 || dose > effectiveMax + 0.001) return null;
    const isWholeBag = vialVol && Math.abs(vol - vialVol) < 0.001;
    // Tier: whole bag = 0; whole mL (>30) = 1; syringe tiers (≤30) carried from pool
    let tier = isWholeBag ? 0 : (vol > 30 ? 1 : 5); // syringe tiers filled below
    return {
      vol, dose, tier, unit,
      label:     `${vol} mL`,
      formLabel: formulation.label,
      wLow:  dose / (targetMgKg * (1 + vf)),
      wHigh: dose / (targetMgKg * (1 - vf)),
    };
  };

  const candidates = [];

  // ── Below 30 mL: syringe pool ──────────────────────────────────────────────
  const pool = buildSyringePool(activeSyringes);
  for (const s of pool) {
    if (s.vol > 30) continue;
    const c = ann(s.vol);
    if (!c) continue;
    // Check if this volume is exactly a whole vial — override tier to 0
    const isWholeBag = vialVol && Math.abs(s.vol - vialVol) < 0.001;
    c.tier = isWholeBag ? 0 : s.tier;
    c.syringeLabel = s.syringeLabel;
    candidates.push(c);
  }

  // ── Above 30 mL: integer mL steps up to vialVol ceiling ───────────────────
  // Start from 31 mL (or first integer above last syringe vol)
  // Safety cap: never iterate past 500 mL regardless of vialVol or maxDose.
  const ceiling = vialVol
    ? Math.min(vialVol, 500)
    : (effectiveMax < Infinity ? Math.min(Math.ceil(effectiveMax / conc) + 5, 500) : 500);
  for (let v = 31; v <= ceiling + 0.001; v++) {
    const vr = Math.round(v * 100000) / 100000;
    const c = ann(vr);
    if (!c) continue;
    // Tier already set: 0 for whole bag, 1 for integer mL
    candidates.push(c);
  }

  return candidates.filter(c => c.wLow < MAX_W);
}

// ── Cross-formulation injectable table builder ─────────────────────────────────
// Architecture mirrors buildLiquidTable (retained-array, liquid-style gaps) rather
// than the tablet solid-style rawSeq builder. Rationale: injectables share the same
// continuous volumetric candidate space as oral liquids — syringe graduations below
// 30 mL, integer-mL steps above 30 mL. Gaps are rare and when they occur represent
// genuine clinical absence, not a tablet formulation boundary. Showing them honestly
// (liquid approach) is safer than silently extending the previous band (solid approach).
//
// Two candidate zones, unified in one cursor walk:
//   Sub-30 mL  — syringe pool tiers (same as oral liquid). NICU zone applies.
//   Above-30 mL — integer-mL tier-1 steps; whole-bag tier-0. Snap applies.
//
// NICU zone (prevWtH < CONFIG.NICU_MAX_W): retain smallest-vol candidate at each
// step — same behavior as liquid builder. Applies only to low-concentration
// injectables at low doses in small patients (e.g. morphine 0.1 mg/kg neonatal).
// Has no effect when cursor is already past NICU_MAX_W at band-generation start.
//
// Gap behavior (liquid style):
//   Before first band: silently advance cursor to first reachable candidate.
//   Mid-table gap: silently advance cursor. The resulting gap in weight coverage
//   is visible in the output as missing weight ranges — honest, not hidden.
//   For narrow-therapeutic-index drugs (morphine) this is the correct behavior.
//
// Communicability snap: applied post-selection to tier-1 (above-30 mL) candidates
// only. Tier-0 (whole bag) and syringe candidates (tier ≥ 2) are never snapped.
function buildCrossInjectableTable(formulations, targetMgKg, variancePct, maxDose, activeSyringes) {
  if (!formulations.length) return [];

  const MAX_W = CONFIG.MAX_W;
  const MIN_W = CONFIG.MIN_W;
  const NICU_MAX_W = CONFIG.NICU_MAX_W;
  const effectiveMax = maxDose ?? Infinity;
  const vf   = variancePct / 100;
  const unit = formulations[0].unit;

  const wLow  = dose => dose / (targetMgKg * (1 + vf));
  const wHigh = dose => dose / (targetMgKg * (1 - vf));
  const pVar  = (dose, wt) => (dose - wt * targetMgKg) / (wt * targetMgKg) * 100;

  // Unified candidate pool — all formulations, all volumes
  const all = formulations.flatMap(f =>
    buildInjectableCandidates(f, targetMgKg, variancePct, effectiveMax, activeSyringes)
  ).filter(c => c.wLow < MAX_W);

  if (!all.length) return [];

  // ── Sequential filter — retained-array cursor walk ─────────────────────────
  // Mirrors buildLiquidTable structure. prevWtH is the upper weight of the last
  // retained band (starts at MIN_W). retained holds chosen candidates in order.
  const retained = [];
  const retainedKeys = new Set();  // keyed by Math.round(vol * 100000)
  let prevWtH = MIN_W;

  while (prevWtH < MAX_W - 0.0001) {
    const lastDose = retained.length > 0 ? retained[retained.length - 1].dose : 0;
    const inNicuZone = prevWtH < NICU_MAX_W;

    // Reachable: not yet retained, dose advances, wLow within cursor
    const reachable = all.filter(c =>
      !retainedKeys.has(Math.round(c.vol * 100000)) &&
      c.dose > lastDose + 0.0001 &&
      c.wLow <= prevWtH + 0.0001 &&
      c.wHigh > prevWtH + 0.0001
    );

    if (!reachable.length) {
      // Gap: no candidate reaches this cursor position.
      // Liquid-style: silently advance to the next reachable candidate.
      // The gap will be visible in the output as a missing weight range.
      const nextAny = all
        .filter(c => !retainedKeys.has(Math.round(c.vol * 100000)) && c.dose > lastDose)
        .sort((a, b) => a.wLow - b.wLow)[0];
      if (!nextAny || nextAny.wLow >= MAX_W - 0.0001) break;
      prevWtH = nextAny.wLow;
      continue;
    }

    // Selection
    let chosen;
    if (inNicuZone) {
      // NICU zone: smallest vol — every graduation retained for finest precision
      chosen = reachable.reduce((a, b) => a.vol <= b.vol ? a : b);
    } else {
      // Tier-first, then widest coverage, then smallest vol (fewer mL = simpler)
      // Tier hierarchy: 0=whole bag > 1=integer mL (above 30) > 2-5=syringe steps
      const meaningful = reachable.filter(c => c.wHigh - prevWtH > 0.05);
      const pool = meaningful.length ? meaningful : reachable;
      chosen = pool.reduce((a, b) => {
        if (a.tier !== b.tier)                     return a.tier < b.tier ? a : b;
        if (Math.abs(b.wHigh - a.wHigh) > 0.0001) return b.wHigh > a.wHigh ? b : a;
        if (a.vol !== b.vol)                       return a.vol < b.vol ? a : b;
        return a;
      });
    }

    // Communicability snap — tier-1 (above-30 mL integer steps) only, not last band
    const isLast = chosen.dose >= effectiveMax - 0.001;
    if (chosen.tier === 1 && !isLast) {
      const conc = chosen.dose / chosen.vol;
      const commQuantum = deriveCommQuantum(conc);
      const snappedDose = snapToComm(chosen.dose, prevWtH, conc, targetMgKg, variancePct, commQuantum);
      if (snappedDose !== chosen.dose) {
        const snappedVol   = Math.round(snappedDose / conc * 100000) / 100000;
        const snappedWHigh = snappedDose / (targetMgKg * (1 - vf));
        if (snappedWHigh > prevWtH + 0.0001) {
          chosen = { ...chosen, dose: snappedDose, vol: snappedVol,
                     wLow:  snappedDose / (targetMgKg * (1 + vf)),
                     wHigh: snappedWHigh };
        }
      }
    }

    // Re-check isLast after snap (snap may have crossed effectiveMax)
    const finalIsLast = isLast || chosen.dose >= effectiveMax - 0.001;

    retainedKeys.add(Math.round(chosen.vol * 100000));
    retained.push({ ...chosen, isLast: finalIsLast });
    prevWtH = finalIsLast ? MAX_W : chosen.wHigh;
    if (finalIsLast) break;
  }

  if (!retained.length) return [];

  // ── Display row construction — mirrors buildLiquidTable ────────────────────
  // Band top = wLow(next retained candidate), matching liquid builder convention.
  // This produces conservative, non-overlapping bands whose boundaries align with
  // where the next dose becomes appropriate, not where the current dose's tolerance
  // window ends. Honest gaps appear as weight ranges with no row.
  const displayable = retained.filter(r => wLow(r.dose) >= MIN_W - 0.0001);
  const rows = [];
  for (let i = 0; i < displayable.length; i++) {
    const r    = displayable[i];
    const next = displayable[i + 1];
    const rowWtL      = wLow(r.dose);
    const rawWtH      = r.isLast ? MAX_W : (next ? wLow(next.dose) : wHigh(r.dose));
    const effectiveWtH = Math.min(rawWtH, MAX_W);
    if (effectiveWtH <= rowWtL + 0.0001 && !r.isLast) continue;
    const overPct  = pVar(r.dose, rowWtL);
    const underPct = r.isLast ? null : pVar(r.dose, effectiveWtH);
    const flagged  = Math.abs(overPct) > variancePct + 0.05 ||
                     (!r.isLast && underPct !== null && Math.abs(underPct) > variancePct + 0.05);
    rows.push({
      wStart:       roundW(rowWtL),
      wEnd:         r.isLast ? `>= ${roundW(rowWtL)}` : roundW(effectiveWtH),
      doseLabel:    `${r.dose} ${unit}`,
      volLabel:     `${r.vol} mL`,
      formLabel:    r.formLabel,
      syringeLabel: r.syringeLabel || "",
      overPct, underPct, flagged, oot: false, isLast: r.isLast,
    });
  }
  return rows;
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const INTER = "'Inter', -apple-system, BlinkMacSystemFont, sans-serif";
const SANS  = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif";
const ctrlBase = {
  fontFamily: SANS, fontSize: 16, border: "2px solid #b0b8c4", borderRadius: 5,
  background: "#fff", color: "#111", width: "100%", boxSizing: "border-box",
  padding: "8px 10px", height: 42,
};
const placeholderStyle = `input::placeholder { color: #888 !important; opacity: 1; }`;
const selStyle = {
  ...ctrlBase, appearance: "none", paddingRight: 28,
  backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath fill='%23444' d='M0 0l5 6 5-6z'/%3E%3C/svg%3E\")",
  backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center", cursor: "pointer",
};
const CAP = {
  display: "block", fontSize: 13, fontWeight: 700, letterSpacing: 0.5,
  textTransform: "uppercase", color: "#555", marginBottom: 4, fontFamily: SANS,
};
const TH = {
  padding: "6px 8px", fontSize: 11, fontWeight: 700, letterSpacing: 0.6,
  textTransform: "uppercase", borderBottom: "2px solid #ccc", whiteSpace: "nowrap",
  color: "#222", fontFamily: INTER, fontVariantNumeric: "tabular-nums",
};
const TD = {
  padding: "6px 8px", fontSize: 14, whiteSpace: "nowrap",
  fontFamily: INTER, fontVariantNumeric: "tabular-nums",
};

// ── RefSection ─────────────────────────────────────────────────────────────────
function RefSection({ title, text }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderTop: "1px solid #eee", marginTop: 4 }}>
      <div onClick={() => setOpen(o => !o)}
           style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "7px 0", cursor: "pointer", userSelect: "none" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#444" }}>{title}</span>
        <span style={{ fontSize: 11, color: "#aaa", transform: open ? "rotate(180deg)" : "none",
                       transition: "transform 0.15s", display: "inline-block" }}>v</span>
      </div>
      {open && (
        <div style={{ fontSize: 12, color: "#333", lineHeight: 1.6,
                      paddingBottom: 8, whiteSpace: "pre-wrap" }}>{text}</div>
      )}
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function PedsDoseTable() {
  const [drugIdx,         setDrugIdx]         = useState(-1);
  const [formClasses,     setFormClasses]     = useState(new Set()); // active route-form classes
  const [checkedForms,    setCheckedForms]    = useState({});     // formIdx → boolean
  const [refFormIdx,      setRefFormIdx]      = useState(-1);     // formulation selected for drug ref
  const [doseText,        setDoseText]        = useState("");
  const [committedTarget, setCommittedTarget] = useState(null);
  const [maxDoseText,     setMaxDoseText]     = useState("");
  const [committedMax,    setCommittedMax]    = useState(null);
  const [variance,        setVariance]        = useState(20);
  const [activeSyringes,  setActiveSyringes]  = useState(
    new Set(["1mL_005", "3mL", "5mL_std", "10mL"])
  );
  const [minWtText,       setMinWtText]       = useState("");
  const [committedMinWt,  setCommittedMinWt]  = useState(null);
  const [refOpen,         setRefOpen]         = useState(false);
  const [refInfo,         setRefInfo]         = useState(null);
  const [refLoading,      setRefLoading]      = useState(false);
  const [drugOpen,        setDrugOpen]        = useState(false);
  const [drugFilter,      setDrugFilter]      = useState("");
  const [showInfo,        setShowInfo]        = useState(false);

  const drug = drugIdx >= 0 ? DRUG_DB[drugIdx] : null;

  // ── Derived formulation sets ───────────────────────────────────────────────
  // Available route-form classes for selected drug
  const availableClasses = useMemo(() => {
    if (!drug) return [];
    const seen = new Set();
    drug.formulations.forEach(f => seen.add(getFormClass(f)));
    return [...seen];
  }, [drug]);

  // Formulations in all selected classes (flat, no segregation when multi-select)
  const classFormulations = useMemo(() => {
    if (!drug || !formClasses.size) return [];
    return drug.formulations
      .map((f, i) => ({ f, i }))
      .filter(({ f }) => formClasses.has(getFormClass(f)));
  }, [drug, formClasses]);

  // Checked (active) formulations — those contributing to band generation
  const activeFormulations = useMemo(() =>
    classFormulations.filter(({ i }) => checkedForms[i] !== false).map(({ f }) => f),
    [classFormulations, checkedForms]);

  const isLiquid     = formClasses.size === 1 && formClasses.has("oral-liquid");
  const isInjectable = formClasses.size === 1 && formClasses.has("injectable");
  const isSolid      = formClasses.size > 0 && [...formClasses].every(c =>
    c === "oral-tablet-ir" || c === "oral-tablet-er" || c === "oral-capsule");
  const isOralMulti  = formClasses.size > 1 && !formClasses.has("injectable");
  // For single liquid class: use first active formulation
  const liquidFormulation = isLiquid ? activeFormulations[0] ?? null : null;
  const isApap = (isLiquid || isOralMulti) && drug?.generic?.toLowerCase() === "acetaminophen";

  // Drug ref formulation
  const refFormulation = refFormIdx >= 0 && drug
    ? drug.formulations[refFormIdx] : null;

  const toggleSyringe = useCallback((key) => {
    setActiveSyringes(prev => {
      const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next;
    });
  }, []);

  // When drug changes: reset everything
  const selectDrug = useCallback((idx) => {
    setDrugIdx(idx); setFormClasses(new Set()); setCheckedForms({});
    setRefFormIdx(-1); setCommittedTarget(null); setCommittedMax(null);
    setDoseText(""); setMaxDoseText(""); setDrugFilter(""); setDrugOpen(false);
    setRefOpen(false); setRefInfo(null);
  }, []);

  const SOLID_CLASSES = new Set(["oral-tablet-ir","oral-tablet-er","oral-capsule"]);

  // Auto-select route-form class when drug has only one available
  useEffect(() => {
    if (availableClasses.length === 1 && formClasses.size === 0) {
      toggleClass(availableClasses[0]);
    }
  }, [availableClasses]);

  // Toggle a route-form class on/off.
  // Injectable is exclusive — clears all oral classes when selected (and vice versa).
  const toggleClass = useCallback((cls) => {
    setFormClasses(prev => {
      const next = new Set(prev);
      const isInj = cls === "injectable";
      const hasInj = next.has("injectable");

      if (next.has(cls)) {
        // Deselecting: remove this class
        next.delete(cls);
      } else {
        // Selecting: injectable clears oral; oral clears injectable
        if (isInj) next.clear();
        else if (hasInj) next.clear();
        next.add(cls);
      }
      return next;
    });

    // Reset params when class selection changes
    setCheckedForms({}); setRefFormIdx(-1);
    setCommittedTarget(null); setCommittedMax(null);
    setDoseText(""); setMaxDoseText("");

    // Min weight: default 15 for solid-only selections
    const willBeSolid = SOLID_CLASSES.has(cls);
    if (willBeSolid) {
      setMinWtText("15"); setCommittedMinWt(15);
    } else {
      setMinWtText(""); setCommittedMinWt(null);
    }

    // Syringe defaults
    if (cls === "oral-liquid" && drug?.generic?.toLowerCase() === "acetaminophen") {
      setActiveSyringes(new Set(["1mL_005", "3mL", "5mL_std", "10mL", "5mL_apap"]));
    } else {
      setActiveSyringes(new Set(["1mL_005", "3mL", "5mL_std", "10mL"]));
    }
  }, [drug]);

  const toggleForm = useCallback((idx) => {
    setCheckedForms(prev => ({ ...prev, [idx]: prev[idx] === false ? true : false }));
  }, []);

  const commitDose   = useCallback(() => { const v = parseFloat(doseText);   setCommittedTarget(isNaN(v)||v<=0?null:v); }, [doseText]);
  const commitMax    = useCallback(() => { const v = parseFloat(maxDoseText); setCommittedMax(isNaN(v)||v<=0?null:v); }, [maxDoseText]);
  const commitMinWt  = useCallback(() => { const v = parseFloat(minWtText);  setCommittedMinWt(isNaN(v)||v<=0?null:v); }, [minWtText]);

  const effectiveMax   = committedMax ?? null;
  const effectiveMinWt = committedMinWt ?? 0.3;

  // ── Drug reference fetch ───────────────────────────────────────────────────
  const parseFDA = useCallback((r) => ({
    source:            'openFDA',
    brandName:         r.openfda?.brand_name?.[0]        ?? null,
    genericName:       r.openfda?.generic_name?.[0]       ?? null,
    manufacturer:      r.openfda?.manufacturer_name?.[0]  ?? null,
    route:             r.openfda?.route?.[0]              ?? null,
    productType:       r.openfda?.product_type?.[0]       ?? null,
    substanceName:     r.openfda?.substance_name?.[0]     ?? null,
    rxcui:             r.openfda?.rxcui?.[0]              ?? null,
    indications:       r.indications_and_usage?.[0]       ?? null,
    dosage:            r.dosage_and_administration?.[0]   ?? null,
    pediatricUse:      r.pediatric_use?.[0]               ?? null,
    warnings:          r.warnings?.[0]                    ?? null,
    warningsBoxed:     r.boxed_warning?.[0]               ?? null,
    contraindications: r.contraindications?.[0]           ?? null,
    adverseReactions:  r.adverse_reactions?.[0]           ?? null,
    overdosage:        r.overdosage?.[0]                  ?? null,
    storageHandling:   r.storage_and_handling?.[0]        ?? null,
  }), []);

  const fetchDrugInfo = useCallback(async (rxcui) => {
    try {
      const splRes = await fetch(`https://dailymed.nlm.nih.gov/dailymed/services/v2/rxcuis/${rxcui}/spls.json?pagesize=1`);
      if (splRes.ok) {
        const splData = await splRes.json();
        const setId = splData?.data?.[0]?.setid;
        if (setId) {
          const labelRes = await fetch(`https://dailymed.nlm.nih.gov/dailymed/services/v2/spls/${setId}.json`);
          if (labelRes.ok) {
            const label = await labelRes.json();
            const spl = label?.spl || label;
            if (spl) {
              const DM = { '34067-9':'indications','34068-7':'dosage','34081-0':'pediatricUse',
                           '43685-7':'warnings','34071-1':'warningsBoxed','34070-3':'contraindications',
                           '34084-4':'adverseReactions','34088-5':'overdosage','44425-7':'storageHandling' };
              const info = { source:'DailyMed', brandName:spl.title||null, genericName:null,
                             manufacturer:spl.labeler_name||null, route:null, productType:spl.product_type||null,
                             substanceName:null, rxcui:null, indications:null, dosage:null, pediatricUse:null,
                             warnings:null, warningsBoxed:null, contraindications:null, adverseReactions:null,
                             overdosage:null, storageHandling:null };
              for (const sec of (spl.sections || spl.set_sections || [])) {
                const key = DM[sec.loinc_code || sec.code];
                if (key && sec.text) info[key] = sec.text;
              }
              const p = (spl.products || [])[0];
              if (p) { info.genericName = p.generic_name||null; info.route = p.route||null;
                       info.substanceName = p.active_ingredient_name||null; }
              return info;
            }
          }
        }
      }
    } catch(_) {}
    try {
      const fdaRes = await fetch(`https://api.fda.gov/drug/label.json?search=openfda.rxcui:"${rxcui}"&limit=1`);
      if (fdaRes.ok) {
        const fdaData = await fdaRes.json();
        const r = fdaData.results?.[0];
        if (r) return parseFDA(r);
      }
    } catch(_) {}
    return null;
  }, [parseFDA]);

  useEffect(() => {
    setRefInfo(null);
    if (!refFormulation?.rxcui) return;
    setRefLoading(true);
    fetchDrugInfo(refFormulation.rxcui)
      .then(info => { setRefInfo(info); setRefLoading(false); })
      .catch(() => setRefLoading(false));
  }, [refFormulation?.rxcui, fetchDrugInfo]);

  // ── Band generation ────────────────────────────────────────────────────────
  const rows = useMemo(() => {
    if (!drug || !formClasses.size || committedTarget === null) return null;
    if (activeFormulations.length === 0) return null;

    let raw;
    if (isOralMulti) {
      const liquidForms = activeFormulations.filter(f => f.form === "liquid");
      const solidForms  = activeFormulations.filter(f => f.form !== "liquid" && f.form !== "injectable");
      raw = buildCrossOralTable(liquidForms, solidForms, committedTarget, variance, effectiveMax, activeSyringes);
    } else if (isLiquid) {
      if (!liquidFormulation) return null;
      raw = buildLiquidTable(liquidFormulation, committedTarget, variance, effectiveMax, activeSyringes);
    } else if (isInjectable) {
      raw = buildCrossInjectableTable(activeFormulations, committedTarget, variance, effectiveMax, activeSyringes);
    } else {
      raw = buildCrossTabletTable(activeFormulations, committedTarget, variance, effectiveMax);
    }
    if (!raw || !raw.length) return null;

    const floor = effectiveMinWt;
    const filtered = raw.filter(r => {
      const wEnd = typeof r.wEnd === "string" ? Infinity : Number(r.wEnd);
      return wEnd > floor;
    });
    if (filtered.length > 0) {
      const first = filtered[0];
      const firstStart = Number(first.wStart);
      if (firstStart < floor) filtered[0] = { ...first, wStart: roundW(floor) };
    }
    return filtered.length ? filtered : null;
  }, [drug, formClasses, committedTarget, variance, activeFormulations,
      liquidFormulation, activeSyringes, effectiveMax, effectiveMinWt,
      isLiquid, isInjectable, isOralMulti]);

  const fmtPct = v => v === null ? "—" : (v >= 0 ? "+" : "\u2212") + Math.abs(v).toFixed(1) + "%";

  const isFluid = isLiquid || isInjectable;

  // Column count: liquid has syringe col; solid has formulation col
  const colCount = isLiquid ? 6 : 6; // wt | dose | form/vol | syr(liquid only) | formLabel(solid only) | under | over

  // ── PDF generation ─────────────────────────────────────────────────────────
  const generatePDF = useCallback(async () => {
    if (!rows || !drug) return;
    const { jsPDF } = window.jspdf;
    // Landscape letter — more horizontal room for Formulation column
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
    const PW = doc.internal.pageSize.getWidth();   // 792 pt
    const PH = doc.internal.pageSize.getHeight();  // 612 pt
    const ML = 36, MR = 36, MT = 36;
    let y = MT;

    // Helper: strip trailing .0 from a one-decimal string
    const fmtDose = v => String(parseFloat(v.toFixed(1)));

    try {
      const res = await fetch("Aptos_512.png");
      const blob = await res.blob();
      const b64 = await new Promise(resolve => { const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsDataURL(blob); });
      doc.addImage(b64, "PNG", ML, y, 48, 48);
    } catch(e) {}

    doc.setFont("helvetica","bold"); doc.setFontSize(18); doc.setTextColor(28,35,51);
    doc.text("APTOS", ML + 56, y + 18);
    doc.setFont("times","italic"); doc.setFontSize(10); doc.setTextColor(100,120,140);
    doc.text("Doses Designed to Fit", ML + 56, y + 32);
    const now = new Date();
    const stamp = now.toLocaleString(undefined,{year:"numeric",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"});
    doc.setFont("helvetica","normal"); doc.setFontSize(8); doc.setTextColor(140,140,140);
    doc.text(stamp, PW - MR, y + 12, { align: "right" });
    y += 56;

    const bandH = 46;
    doc.setFillColor(28,35,51); doc.rect(ML, y, PW-ML-MR, bandH, "F");
    doc.setFont("helvetica","bold"); doc.setFontSize(11); doc.setTextColor(255,255,255);
    doc.text(drug.generic, ML+8, y+13);
    doc.setFont("helvetica","normal"); doc.setFontSize(9); doc.setTextColor(184,207,224);
    const formClassLabel = [...formClasses].map(c => CLASS_LABELS[c] || c).join(" + ");
    doc.text(formClassLabel, ML+8, y+24);
    const meta = `Target ${committedTarget} mg/kg   ·   min ${effectiveMinWt} kg${effectiveMax ? `   ·   max ${effectiveMax} mg` : ""}   ·   +/-${variance}%   ·   ${rows.length} rows`;
    doc.setFontSize(8); doc.text(meta, ML+8, y+36);
    y += bandH;

    // Column layout (landscape 720 pt usable):
    // Wt(80) Dose(70) Under(52) Over(52) Vol(52) Syr/Formulation(flex) From(52) To(52)
    // For liquid: Syr is narrow (30). For solid/multi: Formulation gets remaining ~260pt.
    const C = {
      wt:   ML,
      dose: ML + 82,
      und:  ML + 162,
      ovr:  ML + 214,
      vol:  ML + 266,
      form: ML + 318,   // Syr label (liquid) or Formulation (solid) — full string
      from: ML + 580,
      to:   ML + 636,
    };
    const colHeaders = isLiquid
      ? ["Wt (kg)","Dose","Under","Over","Vol","Syr","From","To"]
      : ["Wt (kg)","Dose","Under","Over","Vol","Formulation","From","To"];
    const colXArr = [C.wt, C.dose, C.und, C.ovr, C.vol, C.form, C.from, C.to];

    const hdrH = 18;
    doc.setFillColor(245,245,241); doc.rect(ML, y, PW-ML-MR, hdrH, "F");
    doc.setFont("helvetica","bold"); doc.setFontSize(8); doc.setTextColor(34,34,34);
    colHeaders.forEach((h, i) => doc.text(h.toUpperCase(), colXArr[i], y+12));
    y += hdrH;

    const rowH = 16;
    doc.setFont("helvetica","normal"); doc.setFontSize(9);
    rows.forEach((r, idx) => {
      if (y + rowH > PH - 36) { doc.addPage(); y = MT; }
      if (idx % 2 === 0) { doc.setFillColor(252,252,250); doc.rect(ML, y, PW-ML-MR, rowH, "F"); }
      if (r.flagged) { doc.setFillColor(255,252,220); doc.rect(ML, y, PW-ML-MR, rowH, "F"); }
      const textY = y + 11;
      const pdfPct = v => v===null?"--":(v>=0?"+":"-")+Math.abs(v).toFixed(1)+"%";
      doc.setTextColor(26,26,26);
      doc.text(typeof r.wEnd==="string"?`>= ${r.wStart}`:`${r.wStart}-${r.wEnd}`, C.wt, textY);
      doc.setFont("helvetica","bold"); doc.text(r.doseLabel, C.dose, textY);
      doc.setFont("helvetica","normal");
      const uOot = r.underPct!==null && Math.abs(r.underPct) > variance+0.05;
      doc.setTextColor(...(uOot?[192,57,43]:[68,68,68]));
      doc.setFont("helvetica", uOot?"bold":"normal");
      doc.text(pdfPct(r.underPct), C.und, textY);
      const oOot = Math.abs(r.overPct) > variance+0.05;
      doc.setTextColor(...(oOot?[192,57,43]:[68,68,68]));
      doc.setFont("helvetica", oOot?"bold":"normal");
      doc.text(pdfPct(r.overPct), C.ovr, textY);
      doc.setFont("helvetica","normal"); doc.setTextColor(26,26,26);
      doc.text(r.volLabel, C.vol, textY);
      doc.setTextColor(85,85,85); doc.setFontSize(8);
      if (isLiquid) {
        doc.text(r.syringeLabel||"", C.form, textY);
      } else {
        doc.text(r.formLabel||"", C.form, textY);
      }
      doc.setFontSize(8); doc.setTextColor(100,100,100);
      doc.text(fmtDose(r.wStart * committedTarget), C.from, textY);
      doc.text(r.isLast ? "—" : fmtDose(r.wEnd * committedTarget), C.to, textY);
      doc.setFontSize(9);
      doc.setDrawColor(220,220,216); doc.line(ML, y+rowH, PW-MR, y+rowH);
      y += rowH;
    });

    doc.setFont("helvetica","italic"); doc.setFontSize(7); doc.setTextColor(150,150,150);
    doc.text("Weight bands: lower bound inclusive, upper bound exclusive  ·  Pharmacy verification required before clinical use",
      PW/2, y+12, { align:"center" });
    // Use window.open with a blob URL so iOS PWA hands off to Safari rather
    // than opening the PDF inside the webview (which traps the user with no back navigation).
    const blob = doc.output("blob");
    const url  = URL.createObjectURL(blob);
    window.open(url, "_blank");
    // Revoke after a short delay to free memory once Safari has taken the handoff
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }, [rows, drug, formClasses, committedTarget, effectiveMax, effectiveMinWt, variance, isLiquid, isInjectable, isFluid]);

  const generateXLSX = useCallback(() => {
    if (!rows || !drug) return;
    const XLSX = window.XLSX;
    if (!XLSX) { alert("SheetJS not loaded"); return; }

    const formClassLabel = [...formClasses].map(c => CLASS_LABELS[c] || c).join(" + ");
    const meta = [
      ["Drug",     drug.generic],
      ["Form",     formClassLabel],
      ["Target",   `${committedTarget} mg/kg`],
      ["Min Wt",   `${effectiveMinWt} kg`],
      ["Max Dose", effectiveMax ? `${effectiveMax} mg` : "—"],
      ["Variance", `±${variance}%`],
      ["Rows",     rows.length],
      ["Note",     "Pharmacy verification required before clinical use"],
      [],
    ];
    const isMultiForm = [...formClasses].length > 1 || isInjectable;
    const headers = ["Wt (kg)","Dose","Vol","Under %","Over %",
                     ...(isMultiForm ? ["Formulation"] : []),
                     "From","To"];
    const dataRows = rows.map(r => {
      const wt   = r.isLast ? `>= ${r.wStart}` : `${r.wStart}–${r.wEnd}`;
      const from = parseFloat((r.wStart * committedTarget).toFixed(1));
      const to   = r.isLast ? "—" : parseFloat((r.wEnd * committedTarget).toFixed(1));
      const base = [wt, r.doseLabel, r.volLabel,
        r.underPct !== null ? r.underPct.toFixed(1) : "—",
        r.overPct  !== null ? r.overPct.toFixed(1)  : "—"];
      return isMultiForm ? [...base, r.formLabel, from, to] : [...base, from, to];
    });
    const wsData = [...meta, headers, ...dataRows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws["!cols"] = [
      { wch:14 },{ wch:14 },{ wch:12 },{ wch:10 },{ wch:10 },
      ...(isMultiForm ? [{ wch:40 }] : []),
      { wch:10 },{ wch:10 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Dosing Bands");
    const now = new Date();
    XLSX.writeFile(wb, `APTOS_${drug.generic.replace(/\s+/g,"_")}_${now.toISOString().slice(0,10)}.xlsx`);
  }, [rows, drug, formClasses, committedTarget, effectiveMax, effectiveMinWt, variance, isInjectable]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: INTER, background: "#f2f2ee", minHeight: "100vh", color: "#1a1a1a" }}
         onMouseDown={() => setDrugOpen(false)}
         onTouchStart={() => setDrugOpen(false)}>
      <style>{placeholderStyle}</style>

      {/* Header */}
      <div style={{ background:"#1c2333", color:"#fff", padding:"10px 14px",
                    display:"flex", alignItems:"center", gap:10 }}>
        <img src="Aptos_192.png" alt="APTOS" style={{ width:36, height:36, borderRadius:8, flexShrink:0 }} />
        <div style={{ flex:1 }}>
          <div style={{ fontSize:22, fontWeight:900, letterSpacing:4, textTransform:"uppercase",
                        fontFamily:"'Arial Black',Arial,sans-serif" }}>APTOS</div>
          <div style={{ fontSize:13, color:"#c8d8e8", fontStyle:"italic",
                        fontFamily:"Georgia,'Times New Roman',serif", letterSpacing:0.2, marginTop:2 }}>
            Doses Designed to Fit
          </div>
        </div>
        <button onClick={() => setShowInfo(true)}
                style={{ color:"#1c2333", background:"#c8d8e8", fontStyle:"italic",
                         fontFamily:"Georgia,'Times New Roman',serif", fontSize:13, fontWeight:700,
                         border:"none", cursor:"pointer", flexShrink:0, width:24, height:24,
                         borderRadius:"50%", display:"flex", alignItems:"center",
                         justifyContent:"center", lineHeight:1 }}>i</button>
      </div>

      {/* Info Modal */}
      {showInfo && (
        <div onClick={() => setShowInfo(false)}
             style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", zIndex:200,
                      display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
          <div onClick={e => e.stopPropagation()}
               style={{ background:"#fff", borderRadius:10, padding:24, maxWidth:480, width:"100%",
                        boxShadow:"0 8px 32px rgba(0,0,0,0.3)", fontFamily:SANS }}>
            <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:14 }}>
              <div style={{ fontSize:18, fontWeight:800, letterSpacing:2, fontFamily:"'Arial Black',Arial,sans-serif",
                            textTransform:"uppercase", color:"#1c2333" }}>APTOS</div>
              <button onClick={() => setShowInfo(false)}
                      style={{ background:"none", border:"none", fontSize:20, cursor:"pointer",
                               color:"#888", lineHeight:1, padding:0 }}>x</button>
            </div>
            <div style={{ fontSize:13, color:"#1c2333", lineHeight:1.6 }}>
              <p style={{ marginBottom:10 }}><strong>Doses Designed to Fit.</strong></p>
              <p style={{ marginBottom:10 }}>
                This application generates standardized weight-band dosing tables for the full pediatric size
                spectrum — from the 350-gram premature infant to the bariatric adolescent — across liquid,
                solid, and injectable drug formulations.
              </p>
              <p style={{ marginBottom:10 }}>
                Every band represents a physically dispensable dose — a volume on an available syringe or a
                whole, half, or quarter tablet — with variance from the weight-based target bounded within a
                declared tolerance. The algorithm searches across all compatible formulations of a drug to find
                the optimal product for each weight band, reflecting how inpatient pharmacists assign products
                to orders entered by generic name and route.
              </p>
              <p style={{ marginBottom:16 }}>
                Output is intended for pharmacists and prescribers building order sets and clinical decision
                support tools. Pharmacy verification is required before clinical use.
              </p>
              <a href="Peds_Dosing_Summary.pdf" target="_blank" rel="noopener noreferrer"
                 style={{ display:"inline-block", background:"#1c2333", color:"#fff",
                          padding:"8px 16px", borderRadius:6, fontSize:13, fontWeight:600,
                          textDecoration:"none", letterSpacing:0.3 }}>
                Methodology and Evidence Base (PDF)
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Controls */}
      <div onMouseDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()}
           style={{ background:"#fff", borderBottom:"2px solid #1c2333",
                    padding:"10px 12px", display:"flex", flexDirection:"column", gap:7 }}>

        {/* Row 1: Drug */}
        <div style={{ position:"relative" }}>
          <span style={CAP}>Drug</span>
          <div onClick={e => { e.stopPropagation(); setDrugOpen(o => !o); }}
               style={{ ...ctrlBase, display:"flex", alignItems:"center", justifyContent:"space-between",
                        cursor:"pointer", fontFamily:SANS, color:drug?"#111":"#aaa" }}>
            <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
              {drug ? drug.generic : "-- select drug --"}
            </span>
            <span style={{ flexShrink:0, marginLeft:8, color:"#666" }}>v</span>
          </div>
          {drugOpen && (
            <div onMouseDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()}
                 onClick={e => e.stopPropagation()}
                 style={{ position:"absolute", top:"100%", left:0, right:0, zIndex:300,
                          background:"#fff", border:"2px solid #b0b8c4", borderRadius:5,
                          boxShadow:"0 4px 20px rgba(0,0,0,0.15)", maxHeight:320,
                          display:"flex", flexDirection:"column" }}>
              <div style={{ padding:"6px 8px", borderBottom:"1px solid #eee", flexShrink:0 }}>
                <input autoFocus placeholder="Search drugs..." value={drugFilter}
                       onChange={e => setDrugFilter(e.target.value)}
                       onClick={e => e.stopPropagation()}
                       style={{ width:"100%", border:"1px solid #ccc", borderRadius:4,
                                padding:"5px 8px", fontSize:16, fontFamily:SANS, outline:"none" }} />
              </div>
              <div style={{ overflowY:"auto", flex:1 }}
                   ref={el => {
                     if (el && drugIdx >= 0) {
                       const sel = el.querySelector('[data-selected="true"]');
                       if (sel) sel.scrollIntoView({ block:"nearest" });
                     }
                   }}>
                {DRUG_DB
                  .map((d, i) => ({ d, i }))
                  .filter(({ d }) => d.generic.toLowerCase().includes(drugFilter.toLowerCase()))
                  .map(({ d, i }) => (
                    <div key={i} data-selected={i===drugIdx?"true":"false"}
                         onClick={() => { selectDrug(i); setDrugFilter(""); }}
                         style={{ padding:"9px 12px", fontSize:14, fontFamily:SANS, cursor:"pointer",
                                  color:"#111", background:i===drugIdx?"#e8eef8":"transparent",
                                  borderBottom:"1px solid #f0f0ee" }}>
                      {d.generic}
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* Row 2: Route-form class — multi-select (injectable exclusive) */}
        {drug && availableClasses.length > 0 && (
          <div>
            <span style={CAP}>Route / Form</span>
            <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
              {availableClasses.map(cls => {
                const active = formClasses.has(cls);
                return (
                  <button key={cls} onClick={() => toggleClass(cls)}
                          style={{ fontFamily:SANS, fontSize:13, fontWeight:600, border:"2px solid",
                                   borderColor: active ? "#1c2333" : "#b0b8c4",
                                   borderRadius:5, padding:"6px 12px", cursor:"pointer",
                                   background: active ? "#1c2333" : "#fff",
                                   color: active ? "#fff" : "#555" }}>
                    {CLASS_LABELS[cls] || cls}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Row 3: Formulation multi-select — flat list across all active classes */}
        {formClasses.size > 0 && classFormulations.length > 0 && (
          <div>
            <span style={CAP}>Formulations</span>
            <div style={{ display:"flex", flexDirection:"column", gap:3,
                          border:"1px solid #d0d0c8", borderRadius:5, padding:"6px 8px",
                          background:"#fafaf8", maxHeight:160, overflowY:"auto" }}>
              {classFormulations.map(({ f, i }) => {
                const checked = checkedForms[i] !== false;
                const isRef   = refFormIdx === i;
                return (
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:8,
                                        padding:"4px 4px", borderRadius:4,
                                        background: isRef ? "#e8eef8" : "transparent" }}>
                    <input type="checkbox" checked={checked}
                           onChange={() => toggleForm(i)}
                           style={{ accentColor:"#1c2333", width:15, height:15, flexShrink:0 }} />
                    <span onClick={() => setRefFormIdx(isRef ? -1 : i)}
                          style={{ fontSize:13, fontFamily:SANS, flex:1, cursor:"pointer",
                                   color: checked ? "#111" : "#aaa",
                                   textDecoration: isRef ? "underline" : "none" }}>
                      {f.label}
                    </span>
                    {!f.formulary && (
                      <span style={{ fontSize:9, fontWeight:700, color:"#888", letterSpacing:0.5,
                                     background:"#eee", padding:"1px 4px", borderRadius:3 }}>NF</span>
                    )}
                    {f.rxcui && (
                      <span style={{ fontSize:9, color:"#aaa" }}>RxCUI {f.rxcui}</span>
                    )}
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize:11, color:"#888", marginTop:3, fontFamily:SANS }}>
              Tap a formulation name to view its drug reference
            </div>
          </div>
        )}

        {/* Row 4: Min Wt | Dose/kg | Max | Var */}
        {formClasses.size > 0 && (
          <div style={{ display:"grid", gridTemplateColumns:"90px 1fr 100px 90px", gap:6 }}>
            <div>
              <span style={CAP}>Min Wt</span>
              <input style={ctrlBase} type="number"
                     placeholder={isSolid ? "15" : "0.3"}
                     value={minWtText} onChange={e => setMinWtText(e.target.value)}
                     onBlur={commitMinWt} onKeyDown={e => e.key==="Enter"&&e.target.blur()}
                     step="0.1" min="0" inputMode="decimal" />
            </div>
            <div>
              <span style={CAP}>Dose/kg</span>
              <input style={ctrlBase} type="number" placeholder="e.g. 12.5"
                     value={doseText} onChange={e => setDoseText(e.target.value)}
                     onBlur={commitDose} onKeyDown={e => e.key==="Enter"&&e.target.blur()}
                     step="0.1" min="0" inputMode="decimal" />
            </div>
            <div>
              <span style={CAP}>Max</span>
              <input style={ctrlBase} type="number" placeholder="optional"
                     value={maxDoseText} onChange={e => setMaxDoseText(e.target.value)}
                     onBlur={commitMax} onKeyDown={e => e.key==="Enter"&&e.target.blur()}
                     step="1" min="0" inputMode="decimal" />
            </div>
            <div>
              <span style={CAP}>Var</span>
              <select style={selStyle} value={variance}
                      onChange={e => setVariance(Number(e.target.value))}>
                <option value={5}>±5%</option>
                <option value={10}>±10%</option>
                <option value={15}>±15%</option>
                <option value={20}>±20%</option>
              </select>
            </div>
          </div>
        )}

        {/* Liquid/injectable: syringe checkboxes — shown when any liquid or injectable class is active */}
        {(isLiquid || isInjectable || isOralMulti) && formClasses.size > 0 && (
          <div style={{ borderTop:"1px solid #eee", paddingTop:5 }}>
            <span style={CAP}>Syringes available</span>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:"4px 0" }}>
              {[
                { key:"1mL_005", label:"1 mL (0.05)" },
                { key:"3mL",     label:"3 mL (0.1)"  },
                { key:"5mL_std", label:"5 mL std"    },
                { key:"10mL",    label:"10 mL"        },
              ].map(({ key, label }) => (
                <label key={key} style={{ display:"flex", alignItems:"center", gap:5,
                                         fontSize:12, cursor:"pointer",
                                         color:activeSyringes.has(key)?"#1c2333":"#aaa",
                                         fontWeight:activeSyringes.has(key)?700:400 }}>
                  <input type="checkbox" checked={activeSyringes.has(key)}
                         onChange={() => toggleSyringe(key)}
                         style={{ accentColor:"#1c2333", width:14, height:14 }} />
                  {label}
                </label>
              ))}
              <label style={{ display:"flex", alignItems:"center", gap:5, fontSize:12, cursor:"pointer",
                              color:activeSyringes.has("1mL_001")?"#1c2333":"#aaa",
                              fontWeight:activeSyringes.has("1mL_001")?700:400 }}>
                <input type="checkbox" checked={activeSyringes.has("1mL_001")}
                       onChange={() => toggleSyringe("1mL_001")}
                       style={{ accentColor:"#1c2333", width:14, height:14 }} />
                1 mL (0.01)
              </label>
              <div />
              {isApap ? (
                <label style={{ display:"flex", alignItems:"center", gap:5, fontSize:12, cursor:"pointer",
                                color:activeSyringes.has("5mL_apap")?"#1c2333":"#aaa",
                                fontWeight:activeSyringes.has("5mL_apap")?700:400 }}>
                  <input type="checkbox" checked={activeSyringes.has("5mL_apap")}
                         onChange={() => toggleSyringe("5mL_apap")}
                         style={{ accentColor:"#1c2333", width:14, height:14 }} />
                  5 mL APAP
                </label>
              ) : <div />}
              <div />
            </div>
          </div>
        )}
      </div>

      {/* Drug Reference Windowshade */}
      {refFormulation && (
        <div style={{ borderBottom:"1px solid #d8d8d0" }}>
          <div onClick={() => setRefOpen(o => !o)}
               style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
                        padding:"8px 12px", cursor:"pointer", userSelect:"none",
                        background:refOpen?"#f0f0ec":"#f5f5f1",
                        borderBottom:refOpen?"1px solid #d8d8d0":"none" }}>
            <span style={{ fontSize:12, fontWeight:600, color:"#444", fontFamily:SANS }}>
              Drug Reference — {refFormulation.label}
              {refFormulation.rxcui ? ` (RxCUI: ${refFormulation.rxcui})` : " (no RxCUI)"}
              {refLoading && <span style={{ marginLeft:8, fontSize:10, color:"#999", fontStyle:"italic" }}>loading...</span>}
            </span>
            <span style={{ fontSize:12, color:"#888", transform:refOpen?"rotate(180deg)":"none",
                           transition:"transform 0.2s", display:"inline-block" }}>v</span>
          </div>
          {refOpen && (
            <div style={{ padding:"12px 14px", background:"#fff", fontFamily:SANS }}>
              {!refFormulation.rxcui ? (
                <div style={{ fontSize:12, color:"#999", fontStyle:"italic" }}>No RxCUI for this formulation.</div>
              ) : !refInfo && !refLoading ? (
                <div style={{ fontSize:12, color:"#999", fontStyle:"italic" }}>No label data found for RxCUI {refFormulation.rxcui}.</div>
              ) : refLoading ? (
                <div style={{ fontSize:12, color:"#888", fontStyle:"italic" }}>Fetching drug reference data...</div>
              ) : (
                <div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:"5px 16px", marginBottom:10 }}>
                    {[
                      { label:"NDC",    value:refFormulation.ndc&&refFormulation.ndc!=="***MANUAL***"?refFormulation.ndc:null,
                        copy:refFormulation.ndc?refFormulation.ndc.replace(/^0(\d{4}-)/,'$1'):null },
                      { label:"RxCUI",  value:refFormulation.rxcui||null,  copy:refFormulation.rxcui||null },
                      { label:"RxNorm", value:refFormulation.rxnorm_name||null, copy:refFormulation.rxnorm_name||null },
                    ].filter(({value})=>value).map(({label,value,copy})=>(
                      <div key={label} style={{ display:"flex", alignItems:"baseline", gap:4 }}>
                        <span style={{ fontSize:9, fontWeight:700, letterSpacing:0.8, textTransform:"uppercase", color:"#aaa" }}>{label}</span>
                        <span onClick={() => navigator.clipboard?.writeText(copy)}
                              title={`Tap to copy ${label}`}
                              style={{ fontSize:11, color:"#555", cursor:"pointer", userSelect:"all" }}>{value}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize:14, fontWeight:700, marginBottom:2 }}>{refInfo.brandName ?? refFormulation.label}</div>
                  <div style={{ fontSize:12, color:"#666", fontStyle:"italic", marginBottom:10 }}>
                    {refInfo.genericName ?? drug.generic}{refInfo.manufacturer ? ` · ${refInfo.manufacturer}` : ""}
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:5, marginBottom:10 }}>
                    {[["Route",refInfo.route],["Product Type",refInfo.productType],
                      ["Substance",refInfo.substanceName],["Source",refInfo.source]].map(([lbl,val])=>(
                      <div key={lbl} style={{ background:"#f5f5f1", borderRadius:5, padding:"5px 8px", border:"1px solid #e4e5e9" }}>
                        <div style={{ fontSize:9, fontWeight:700, letterSpacing:0.7, textTransform:"uppercase", color:"#aaa", marginBottom:2 }}>{lbl}</div>
                        <div style={{ fontSize:12, fontWeight:500, color:val?"#1c2333":"#bbb" }}>{val??"--"}</div>
                      </div>
                    ))}
                  </div>
                  <a href={`https://dailymed.nlm.nih.gov/dailymed/search.cfm?labeltype=all&query=RXCUI:${refFormulation.rxcui}`}
                     target="_blank" rel="noopener noreferrer"
                     style={{ display:"inline-block", fontSize:11, fontWeight:600, color:"#3a6fd8",
                              border:"1px solid #c5d3ef", background:"#e8eef8", borderRadius:4,
                              padding:"3px 8px", textDecoration:"none", marginBottom:12 }}>
                    View on DailyMed
                  </a>
                  {[["Indications & Usage",refInfo.indications],["Dosage & Administration",refInfo.dosage],
                    ["Pediatric Use",refInfo.pediatricUse],["Warnings",refInfo.warnings],
                    ["Contraindications",refInfo.contraindications],["Adverse Reactions",refInfo.adverseReactions],
                    ["Overdosage",refInfo.overdosage],["Storage & Handling",refInfo.storageHandling]]
                    .filter(([,text])=>text).map(([title,text])=>(
                    <RefSection key={title} title={title} text={text} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <div style={{ padding:"8px 10px" }}>
        {rows ? (
          <div style={{ background:"#fff", borderRadius:6, overflow:"hidden", border:"1px solid #d0d0c8" }}>
            <div style={{ overflowX:"auto", WebkitOverflowScrolling:"touch" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontFamily:INTER }}>
              <thead>
                <tr style={{ background:"#1c2333" }}>
                  <th colSpan={isLiquid ? 6 : 6} style={{ padding:"7px 10px", textAlign:"left" }}>
                    <div style={{ color:"#fff", fontWeight:700, fontSize:13, fontFamily:SANS }}>
                      {drug.generic}
                    </div>
                    <div style={{ color:"#c8d8e8", fontWeight:500, fontSize:12, marginTop:2, fontFamily:SANS }}>
                      {[...formClasses].map(c => CLASS_LABELS[c] || c).join(" + ")}
                      {isLiquid && liquidFormulation ? ` — ${liquidFormulation.label}` : ""}
                    </div>
                    <div style={{ color:"#b8cfe0", fontSize:11, marginTop:3, whiteSpace:"nowrap",
                                  overflow:"hidden", textOverflow:"ellipsis" }}>
                      Target {committedTarget} mg/kg
                      {"   ·   "}min {effectiveMinWt} kg
                      {effectiveMax ? `   ·   max ${effectiveMax} mg` : ""}
                      {"   ·   "}±{variance}%
                      {"   ·   "}{rows.length} rows
                    </div>
                  </th>
                </tr>
                <tr style={{ background:"#f5f5f1" }}>
                  <th style={{ ...TH, textAlign:"left",   color:"#444" }}>Wt (kg)</th>
                  <th style={{ ...TH, textAlign:"left",   color:"#444" }}>Dose</th>
                  <th style={{ ...TH, textAlign:"right", color:"#444", padding:"6px 4px" }}>Under</th>
                  <th style={{ ...TH, textAlign:"right", color:"#444", padding:"6px 4px" }}>Over</th>
                  <th style={{ ...TH, textAlign:"right",  color:"#444" }}>{isFluid ? "Vol" : "Qty"}</th>
                  {isLiquid && <th style={{ ...TH, textAlign:"center", color:"#444", padding:"6px 4px" }}>Syr</th>}
                  {!isLiquid && <th style={{ ...TH, textAlign:"left",  color:"#444" }}>Formulation</th>}
                  <th style={{ ...TH, textAlign:"right", color:"#444", padding:"6px 4px" }}>From</th>
                  <th style={{ ...TH, textAlign:"right", color:"#444", padding:"6px 4px" }}>To</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={{
                    background: r.oot ? "#f0f0f0"
                      : r.flagged ? "#fff4ec"
                      : i%2===0 ? "#fff" : "#fafaf6"
                  }}>
                    <td style={{ ...TD, color:r.oot?"#999":"inherit" }}>
                      {typeof r.wEnd==="string" ? r.wEnd : `${r.wStart}-${r.wEnd}`}
                      {r.oot && <span style={{ marginLeft:4, background:"#888", color:"#fff",
                        fontSize:7, fontWeight:700, padding:"1px 3px", borderRadius:2,
                        verticalAlign:"middle" }}>OOT</span>}
                      {!r.oot && r.flagged && <span style={{ marginLeft:4, background:"#c85a00", color:"#fff",
                        fontSize:7, fontWeight:700, padding:"1px 3px", borderRadius:2,
                        verticalAlign:"middle" }}>⚠</span>}
                    </td>
                    <td style={{ ...TD, fontWeight:r.oot?400:700, color:r.oot?"#999":"inherit" }}>
                      {r.doseLabel}
                    </td>
                    <td style={{ ...TD, padding:"6px 4px", textAlign:"right", fontWeight:600,
                                 color:r.oot?"#bbb"
                                   :(r.underPct!==null&&Math.abs(r.underPct)>variance+0.05)?"#c0392b":"#444" }}>
                      {fmtPct(r.underPct)}
                    </td>
                    <td style={{ ...TD, padding:"6px 4px", textAlign:"right", fontWeight:600,
                                 color:r.oot?"#bbb"
                                   :Math.abs(r.overPct)>variance+0.05?"#c0392b":"#444" }}>
                      {fmtPct(r.overPct)}
                    </td>
                    <td style={{ ...TD, textAlign:"right", color:r.oot?"#999":"inherit" }}>
                      {r.volLabel}
                    </td>
                    {isLiquid && (
                      <td style={{ ...TD, padding:"6px 4px", textAlign:"center", fontSize:11,
                                   fontWeight:700, color:r.oot?"#bbb":"#555" }}>
                        {r.syringeLabel}
                      </td>
                    )}
                    {!isLiquid && (
                      <td style={{ ...TD, fontSize:11, color:r.oot?"#bbb":"#666",
                                   maxWidth:160, overflow:"hidden", textOverflow:"ellipsis" }}>
                        {r.formLabel}
                      </td>
                    )}
                    <td style={{ ...TD, padding:"6px 4px", textAlign:"right", fontSize:11, color:r.oot?"#bbb":"#666" }}>
                      {String(parseFloat((r.wStart * committedTarget).toFixed(1)))}
                    </td>
                    <td style={{ ...TD, padding:"6px 4px", textAlign:"right", fontSize:11, color:r.oot?"#bbb":"#666" }}>
                      {r.isLast ? "—" : String(parseFloat((r.wEnd * committedTarget).toFixed(1)))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>{/* end scroll wrapper */}
            <div style={{ fontSize:11, color:"#999", textAlign:"center", padding:"5px",
                          borderTop:"1px solid #eee" }}>
              Weight bands: lower bound inclusive, upper bound exclusive
              {" · "}Pharmacy verification required
            </div>
          </div>
        ) : (
          <div style={{ textAlign:"center", padding:"30px 0", color:"#555", fontSize:14 }}>
            {!drug
              ? "Select a drug"
              : !formClasses.size
                ? "Select route / form"
                : committedTarget === null
                  ? "Enter target dose/kg"
                  : activeFormulations.length === 0
                    ? "Select at least one formulation"
                    : "Tap away from dose field to generate"}
          </div>
        )}

        {/* Export buttons — inline below table */}
        {rows && (
          <div style={{ display:"flex", gap:10, justifyContent:"center",
                        padding:"12px 16px 20px", background:"#f2f2ee" }}>
            <button onClick={generatePDF} style={{
              background:"#1c2333", color:"#fff", border:"none", borderRadius:8,
              padding:"10px 22px", fontSize:14, fontWeight:700, cursor:"pointer",
              fontFamily:SANS, boxShadow:"0 2px 8px rgba(0,0,0,0.25)", letterSpacing:0.3 }}>
              ⬇ PDF
            </button>
            <button onClick={generateXLSX} style={{
              background:"#1d6b38", color:"#fff", border:"none", borderRadius:8,
              padding:"10px 22px", fontSize:14, fontWeight:700, cursor:"pointer",
              fontFamily:SANS, boxShadow:"0 2px 8px rgba(0,0,0,0.25)", letterSpacing:0.3 }}>
              ⬇ Excel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}