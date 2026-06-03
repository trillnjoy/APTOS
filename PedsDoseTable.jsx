import { useState, useMemo, useCallback, useEffect } from "react";

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
  const MIN_W = 0.3;
  const MAX_W = 150;
  const wLow  = dose => dose / (targetMgKg * (1 + vf));
  const wHigh = dose => dose / (targetMgKg * (1 - vf));
  const pVar  = (dose, wt) => (dose - wt * targetMgKg) / (wt * targetMgKg) * 100;

  const poolVols = buildSyringePool(activeSyringes);
  const eligible = deviceLimited ? poolVols.filter(v => v.tier >= 3 || v.vol > 3.0) : poolVols;

  const forcedVolKeys = new Set();
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

  const NICU_MAX_W = 2.5;
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
    const useForced = readyForced.length > 0 && (!best || readyForced[0].vol <= best.vol);
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
          formulary = true } = formulation;
  const effectiveMax = maxDose ?? Infinity;
  const vf    = variancePct / 100;
  const MAX_W = 150;
  const maxTabs = Math.min(Math.ceil(effectiveMax / strength), 40);

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

// ── Cross-formulation tablet table builder ─────────────────────────────────────
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

  const MAX_W = 150;
  const MIN_W = 0.3;
  const effectiveMax = maxDose ?? Infinity;
  const unit = formulations[0].unit;

  // Unified candidate pool from all active formulations
  const all = formulations.flatMap(f =>
    tabletCandidates(f, targetMgKg, variancePct, effectiveMax)
  ).filter(s => s.wLow < MAX_W);

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
  const MAX_W = 150;

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
// Same sequential filter as tablets — unified candidate pool across all active
// formulations, cursor walk from MIN_W, tier-first selection.
// Whole-bag doses (tier 0) win as soon as they enter the tolerance window,
// producing natural coarsening from fine syringe steps to full-bag doses.
// Gap-fill: underdose default (extend previous band), same as tablet algorithm.
function buildCrossInjectableTable(formulations, targetMgKg, variancePct, maxDose, activeSyringes) {
  if (!formulations.length) return [];

  const MAX_W = 150;
  const MIN_W = 0.3;
  const effectiveMax = maxDose ?? Infinity;
  const unit = formulations[0].unit;

  // Unified candidate pool from all active formulations
  const all = formulations.flatMap(f =>
    buildInjectableCandidates(f, targetMgKg, variancePct, effectiveMax, activeSyringes)
  ).filter(c => c.wLow < MAX_W);

  if (!all.length) return [];

  // Sequential filter — cursor walk (identical structure to tablet algorithm)
  const rawSeq = [];
  let cursor = MIN_W;

  while (cursor < MAX_W - 0.0001) {
    const reachable = all.filter(c =>
      c.wLow <= cursor + 0.0001 &&
      c.wHigh > cursor + 0.0001
    );

    if (!reachable.length) {
      const next = all
        .filter(c => c.wLow > cursor)
        .sort((a, b) => a.wLow - b.wLow)[0];
      if (!next) break;
      // Gap-fill: underdose default — extend previous band
      if (rawSeq.length > 0) rawSeq[rawSeq.length - 1].rowWHigh = next.wLow;
      cursor = next.wLow;
      continue;
    }

    // Minimum band width filter — prevent hair-thin collision bands
    const meaningful = reachable.filter(c => c.wHigh - cursor > 0.05);
    const pool2 = meaningful.length ? meaningful : reachable;

    const best = pool2.reduce((a, b) => {
      if (a.tier !== b.tier)                     return a.tier < b.tier ? a : b;
      if (Math.abs(b.wHigh - a.wHigh) > 0.0001) return b.wHigh > a.wHigh ? b : a;
      if (a.vol !== b.vol)                       return a.vol < b.vol ? a : b;
      return a;
    });

    const isLast = best.dose >= effectiveMax - 0.001;

    // Communicability snap: if best is a non-round integer-mL step (tier 1),
    // try rounding its dose to the nearest commQuantum multiple. Only accepted
    // if the snapped dose still reaches cursor and overPct stays within tolerance.
    // Whole-bag (tier 0) and syringe candidates (tier ≥ 2) are never snapped.
    let finalStep = best;
    if (best.tier === 1 && !isLast) {
      const conc = best.dose / best.vol;
      const commQuantum = deriveCommQuantum(conc);
      const snappedDose = snapToComm(best.dose, cursor, conc, targetMgKg, variancePct, commQuantum);
      if (snappedDose !== best.dose) {
        const snappedVol = Math.round(snappedDose / conc * 100000) / 100000;
        const snappedWHigh = snappedDose / (targetMgKg * (1 - variancePct/100));
        // Safety: snapped wHigh must advance cursor, otherwise skip snap
        if (snappedWHigh > cursor + 0.0001) {
          finalStep = { ...best, dose: snappedDose, vol: snappedVol,
                        wLow:  snappedDose / (targetMgKg * (1 + variancePct/100)),
                        wHigh: snappedWHigh };
        }
      }
    }

    // Re-check isLast against finalStep dose (snap may have crossed maxDose)
    const finalIsLast = isLast || finalStep.dose >= effectiveMax - 0.001;

    rawSeq.push({
      step:     finalStep,
      rowWLow:  cursor,
      rowWHigh: finalIsLast ? MAX_W : finalStep.wHigh,
      isLast:   finalIsLast,
    });

    cursor = finalIsLast ? MAX_W : finalStep.wHigh;
    if (finalIsLast) break;
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
        volLabel:     `${step.vol} mL`,
        formLabel:    step.formLabel,
        syringeLabel: step.syringeLabel || "",
        overPct, underPct, flagged, oot: false, isLast,
      };
    });
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
  const [formClass,       setFormClass]       = useState(null);   // selected route-form class
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

  // Formulations in the selected class
  const classFormulations = useMemo(() => {
    if (!drug || !formClass) return [];
    return drug.formulations
      .map((f, i) => ({ f, i }))
      .filter(({ f }) => getFormClass(f) === formClass);
  }, [drug, formClass]);

  // Checked (active) formulations — those contributing to band generation
  const activeFormulations = useMemo(() =>
    classFormulations.filter(({ i }) => checkedForms[i] !== false).map(({ f }) => f),
    [classFormulations, checkedForms]);

  const isLiquid     = formClass === "oral-liquid";
  const isInjectable = formClass === "injectable";
  const isSolid      = formClass === "oral-tablet-ir" || formClass === "oral-tablet-er" || formClass === "oral-capsule";
  // For liquid: use the first active formulation (liquids don't cross-formulate)
  const liquidFormulation = isLiquid ? activeFormulations[0] ?? null : null;
  const isApap = isLiquid && drug?.generic?.toLowerCase() === "acetaminophen";

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
    setDrugIdx(idx); setFormClass(null); setCheckedForms({});
    setRefFormIdx(-1); setCommittedTarget(null); setCommittedMax(null);
    setDoseText(""); setMaxDoseText(""); setDrugFilter(""); setDrugOpen(false);
    setRefOpen(false); setRefInfo(null);
  }, []);

  // When class changes: default all formulations in class to checked
  const SOLID_CLASSES = new Set(["oral-tablet-ir","oral-tablet-er","oral-capsule"]);

  // Auto-select route-form class when drug has only one
  useEffect(() => {
    if (availableClasses.length === 1 && formClass === null) {
      selectClass(availableClasses[0]);
    }
  }, [availableClasses]);

  const selectClass = useCallback((cls) => {
    setFormClass(cls); setCheckedForms({}); setRefFormIdx(-1);
    setCommittedTarget(null); setCommittedMax(null);
    setDoseText(""); setMaxDoseText("");
    if (SOLID_CLASSES.has(cls)) {
      setMinWtText("15");
      setCommittedMinWt(15);
    } else {
      setMinWtText("");
      setCommittedMinWt(null);
    }
    // Acetaminophen oral liquid: auto-enable APAP syringe and 1 mL (0.05)
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
    if (!drug || !formClass || committedTarget === null) return null;
    if (activeFormulations.length === 0) return null;

    let raw;
    if (isLiquid) {
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
  }, [drug, formClass, committedTarget, variance, activeFormulations,
      liquidFormulation, activeSyringes, effectiveMax, effectiveMinWt,
      isLiquid, isInjectable]);

  const fmtPct = v => v === null ? "—" : (v >= 0 ? "+" : "\u2212") + Math.abs(v).toFixed(1) + "%";

  // Vol-based display: liquid and injectable both show mL column
  // Injectable also shows Formulation column (cross-formulation like solid)
  const isFluid = isLiquid || isInjectable;

  // Column count: liquid has syringe col; solid has formulation col
  const colCount = isLiquid ? 6 : 6; // wt | dose | form/vol | syr(liquid only) | formLabel(solid only) | under | over

  // ── PDF generation ─────────────────────────────────────────────────────────
  const generatePDF = useCallback(async () => {
    if (!rows || !drug) return;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
    const PW = doc.internal.pageSize.getWidth();
    const PH = doc.internal.pageSize.getHeight();
    const ML = 36, MR = 36, MT = 36;
    let y = MT;

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
    doc.text(CLASS_LABELS[formClass] || formClass, ML+8, y+24);
    const meta = `Target ${committedTarget} mg/kg   ·   min ${effectiveMinWt} kg${effectiveMax ? `   ·   max ${effectiveMax} mg` : ""}   ·   +/-${variance}%   ·   ${rows.length} rows`;
    doc.setFontSize(8); doc.text(meta, ML+8, y+36);
    y += bandH;

    const pdfLiquid = isFluid;
    const colHeaders = pdfLiquid
      ? ["Wt (kg)","Dose","Under","Over","Vol","Syr"]
      : ["Wt (kg)","Dose","Under","Over","Qty","Formulation"];
    const colX = pdfLiquid
      ? [ML, ML+90, ML+170, ML+225, ML+285, ML+355]
      : [ML, ML+90, ML+170, ML+225, ML+280, ML+340];

    const hdrH = 18;
    doc.setFillColor(245,245,241); doc.rect(ML, y, PW-ML-MR, hdrH, "F");
    doc.setFont("helvetica","bold"); doc.setFontSize(8); doc.setTextColor(34,34,34);
    colHeaders.forEach((h,i) => doc.text(h.toUpperCase(), colX[i], y+12));
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
      doc.text(typeof r.wEnd==="string"?`>= ${r.wStart}`:`${r.wStart}-${r.wEnd}`, colX[0], textY);
      doc.setFont("helvetica","bold"); doc.text(r.doseLabel, colX[1], textY);
      doc.setFont("helvetica","normal");
      const uOot = r.underPct!==null && Math.abs(r.underPct) > variance+0.05;
      doc.setTextColor(...(uOot?[192,57,43]:[68,68,68]));
      doc.setFont("helvetica", uOot?"bold":"normal");
      doc.text(pdfPct(r.underPct), colX[2], textY);
      const oOot = Math.abs(r.overPct) > variance+0.05;
      doc.setTextColor(...(oOot?[192,57,43]:[68,68,68]));
      doc.setFont("helvetica", oOot?"bold":"normal");
      doc.text(pdfPct(r.overPct), colX[3], textY);
      doc.setFont("helvetica","normal"); doc.setTextColor(26,26,26);
      doc.text(r.volLabel, colX[4], textY);
      if (pdfLiquid) {
        doc.setTextColor(85,85,85); doc.text(r.syringeLabel||"", colX[5], textY);
      } else {
        doc.setTextColor(85,85,85); doc.setFontSize(8);
        doc.text((r.formLabel||"").substring(0,28), colX[5], textY);
        doc.setFontSize(9);
      }
      doc.setDrawColor(220,220,216); doc.line(ML, y+rowH, PW-MR, y+rowH);
      y += rowH;
    });

    doc.setFont("helvetica","italic"); doc.setFontSize(7); doc.setTextColor(150,150,150);
    doc.text("Weight bands: lower bound inclusive, upper bound exclusive  ·  Pharmacy verification required before clinical use",
      PW/2, y+12, { align:"center" });
    doc.save(`APTOS_${drug.generic.replace(/\s+/g,"_")}_${now.toISOString().slice(0,10)}.pdf`);
  }, [rows, drug, formClass, committedTarget, effectiveMax, effectiveMinWt, variance, isLiquid, isInjectable, isFluid]);

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

        {/* Row 2: Route-form class — segment control */}
        {drug && availableClasses.length > 0 && (
          <div>
            <span style={CAP}>Route / Form</span>
            <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
              {availableClasses.map(cls => (
                <button key={cls} onClick={() => selectClass(cls)}
                        style={{ fontFamily:SANS, fontSize:13, fontWeight:600, border:"2px solid",
                                 borderColor: formClass===cls ? "#1c2333" : "#b0b8c4",
                                 borderRadius:5, padding:"6px 12px", cursor:"pointer",
                                 background: formClass===cls ? "#1c2333" : "#fff",
                                 color: formClass===cls ? "#fff" : "#555" }}>
                  {CLASS_LABELS[cls] || cls}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Row 3: Formulation multi-select */}
        {formClass && classFormulations.length > 0 && (
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
        {formClass && (
          <div style={{ display:"grid", gridTemplateColumns:"90px 1fr 100px 90px", gap:6 }}>
            <div>
              <span style={CAP}>Min Wt</span>
              <input style={ctrlBase} type="number"
                     placeholder={SOLID_CLASSES.has(formClass) ? "15" : "0.3"}
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

        {/* Liquid: syringe checkboxes */}
        {(isLiquid || isInjectable) && formClass && (
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
            <table style={{ width:"100%", borderCollapse:"collapse", fontFamily:INTER }}>
              <thead>
                <tr style={{ background:"#1c2333" }}>
                  <th colSpan={isLiquid ? 6 : 6} style={{ padding:"7px 10px", textAlign:"left" }}>
                    <div style={{ color:"#fff", fontWeight:700, fontSize:13, fontFamily:SANS }}>
                      {drug.generic}
                    </div>
                    <div style={{ color:"#c8d8e8", fontWeight:500, fontSize:12, marginTop:2, fontFamily:SANS }}>
                      {CLASS_LABELS[formClass]}
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
                  </tr>
                ))}
              </tbody>
            </table>
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
              : !formClass
                ? "Select route / form"
                : committedTarget === null
                  ? "Enter target dose/kg"
                  : activeFormulations.length === 0
                    ? "Select at least one formulation"
                    : "Tap away from dose field to generate"}
          </div>
        )}
      </div>

      {/* Floating PDF button */}
      {rows && (
        <div style={{ position:"fixed", bottom:24, right:20, zIndex:100 }}>
          <button onClick={generatePDF} style={{
            background:"#1c2333", color:"#fff", border:"none", borderRadius:28,
            padding:"12px 22px", fontSize:14, fontWeight:700, cursor:"pointer",
            fontFamily:SANS, boxShadow:"0 4px 16px rgba(0,0,0,0.35)", letterSpacing:0.3 }}>
            ⬇ PDF
          </button>
        </div>
      )}
    </div>
  );
}
