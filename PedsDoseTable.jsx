import { useState, useMemo, useCallback } from "react";

// ── Drug catalogue ─────────────────────────────────────────────────────────────
// Loaded at runtime from formulary.json + aptos_params.json merged in index.html.
// Falls back to empty array if not yet available (should not occur in normal flow).
const DRUG_DB = window.APTOS_DRUG_DB || [];

// ── Weight rounding ────────────────────────────────────────────────────────────
// Three-tier precision matching clinical measurement precision:
//   < 5 kg  → hundredths (neonatal/NICU range — 50g differences matter)
//   5–20 kg → tenths (infant/toddler — 100g precision appropriate)
//   ≥ 20 kg → integer (school-age/adolescent — kg-level precision sufficient)
// The tier is determined by the ACTUAL value, not a pre-rounded value,
// so tier crossings at 5.00 and 20.00 kg are handled correctly.
function roundW(w) {
  if (w < 5)  return Math.round(w * 100) / 100;  // e.g. 4.27 kg
  if (w < 20) return Math.round(w * 10)  / 10;   // e.g. 12.5 kg
  return Math.round(w);                            // e.g. 34 kg
}

// ── Syringe-legal volume pool ──────────────────────────────────────────────────
// Volume-range-based syringe assignment: each syringe OWNS a specific volume
// range. Volumes within that range are assigned exclusively to that syringe,
// eliminating cross-syringe tier conflicts that caused wild label jumping.
//
// Ownership:
//   1 mL syringe  → 0.01–1.5 mL  (overlap 1.0–1.5 with 3 mL)
//   3 mL syringe  → 1.6–3.0 mL
//   5 mL standard → 3.1–5.0 mL
//   10 mL syringe → 5.1–10.0 mL  (+ >10 mL multiple draws)
//
// Intra-syringe tier hierarchy (lower = simpler/safer to read):
//   Tier 0: whole mL marks
//   Tier 1: X.5 mL marks
//   Tier 2: 0.2 mL steps
//   Tier 3: 0.1 mL steps
//   Tier 4: 0.05 mL steps
//   Tier 5: 0.01 mL steps
function buildSyringePool(activeSyringes) {
  const map = new Map();

  const add = (v, label, tier) => {
    const key = Math.round(v * 100000);
    const ex  = map.get(key);
    if (!ex || tier < ex.tier)
      map.set(key, { vol: v, syringeLabel: label, tier });
  };

  // 1 mL syringe owns 0.01–1.0 mL; 1.0 mL shared with 3 mL (1 mL preferred when active)
  if (activeSyringes.has("1mL_005")) {
    for (let i = 1; i <= 30; i++) {
      const v = Math.round(i * 0.05 * 100000) / 100000;
      if (v > 1.0) break;
      let tier = 4;
      if (Math.abs(v - Math.round(v)) < 0.0001)                                 tier = 0;
      else if (Math.abs(v * 2 - Math.round(v * 2)) < 0.0001)                    tier = 1;
      else if (Math.abs(v * 10 - Math.round(v * 10)) < 0.0001)                  tier = 3;
      add(v, "1", tier);
    }
  }
  if (activeSyringes.has("1mL_001")) {
    for (let i = 1; i <= 150; i++) {
      const v = Math.round(i * 0.01 * 100000) / 100000;
      if (v > 1.0) break;
      let tier = 5;
      if (Math.abs(v - Math.round(v)) < 0.0001)                                 tier = 0;
      else if (Math.abs(v * 2 - Math.round(v * 2)) < 0.0001)                    tier = 1;
      else if (Math.abs(v * 10 - Math.round(v * 10)) < 0.0001)                  tier = 3;
      else if (Math.abs(v * 20 - Math.round(v * 20)) < 0.0001)                  tier = 4;
      add(v, "1*", tier);
    }
  }

  // 3 mL syringe owns 1.1–3.0 mL
  if (activeSyringes.has("3mL")) {
    for (let i = 1; i <= 30; i++) {
      const v = Math.round(i * 0.1 * 100000) / 100000;
      if (v < 1.0) continue;  // 1 mL syringe preferred ≤1.0 mL but 3 mL can serve 1.0 mL
      let tier = 3;
      if (Math.abs(v - Math.round(v)) < 0.0001)                                 tier = 0;
      else if (Math.abs(v * 2 - Math.round(v * 2)) < 0.0001)                    tier = 1;
      add(v, "3", tier);
    }
  }

  // 5 mL standard owns 3.1–5.0 mL
  if (activeSyringes.has("5mL_std")) {
    for (let i = 1; i <= 25; i++) {
      const v = Math.round(i * 0.2 * 100000) / 100000;
      if (v <= 3.0 || v > 5.0) continue;
      let tier = 2;
      if (Math.abs(v - Math.round(v)) < 0.0001)                                 tier = 0;
      else if (Math.abs(v * 2 - Math.round(v * 2)) < 0.0001)                    tier = 1;
      add(v, "5", tier);
    }
    [3.5, 4.5].forEach(v => add(v, "5", 1));
  }

  // Special APAP 5 mL
  if (activeSyringes.has("5mL_apap")) {
    [1.25, 2.5, 3.75, 5.0].forEach(v =>
      map.set(Math.round(v * 100000), { vol: v, syringeLabel: "5*", tier: 1 }));
  }

  // 10 mL syringe owns 5.1–10.0 mL + above 10 mL draws
  if (activeSyringes.has("10mL")) {
    for (let i = 1; i <= 50; i++) {
      const v = Math.round(i * 0.2 * 100000) / 100000;
      if (v <= 5.0 || v > 10.0) continue;
      let tier = 2;
      if (Math.abs(v - Math.round(v)) < 0.0001)                                 tier = 0;
      else if (Math.abs(v * 2 - Math.round(v * 2)) < 0.0001)                    tier = 1;
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

// ── Liquid table builder ───────────────────────────────────────────────────────
// Architecture: syringe-first, tier-first sequential filter.
//
// Step 1 — Pool: generate all syringe-legal volumes from active syringes.
//   Every volume in this pool is physically dispensable without any rounding.
//   No mathematical series is generated separately and snapped afterward.
//
// Step 2 — Annotate: compute the dose, weight bounds, and forced status for
//   each candidate. Forced waypoints (preferredVols, APAP syringe marks) are
//   always retained regardless of the filter criterion.
//
// Step 3 — Tier-first sequential filter: walk candidates and at each cursor
//   position select the SIMPLEST eligible candidate (lowest tier) that advances
//   the cursor, rather than the one with the highest WtH. This ensures the
//   algorithm prefers whole-mL doses over 0.1 mL steps when both would satisfy
//   the tolerance criterion, producing clinically communicable tables.
//
// Step 4 — Display rows: band boundaries use the actual mathematical WtL/WtH
//   values with precision-aware rounding and inclusive lower / exclusive upper
//   convention: a patient at the displayed lower bound belongs to THIS band;
//   a patient at the displayed upper bound belongs to the NEXT band.

function buildLiquidTable(formulation, targetMgKg, variancePct, activeSyringes) {
  const { concentration: conc, maxDose, preferredVols = [], unit,
          deviceLimited = false } = formulation;
  const vf    = variancePct / 100;
  const MIN_W = 0.3;  // 300g — below this oral dosing is not clinically feasible
  const MAX_W = 150;

  const wLow   = dose => dose / (targetMgKg * (1 + vf));
  const wHigh  = dose => dose / (targetMgKg * (1 - vf));
  const pVar   = (dose, wt) => (dose - wt * targetMgKg) / (wt * targetMgKg) * 100;

  // Build candidate pool from syringe-legal volumes
  const poolVols = buildSyringePool(activeSyringes);

  // device-limited: prefer fine-graduation tiers (3+) at low volumes but
  // allow coarser tiers once volume exceeds 3 mL (the 3 mL syringe limit).
  // This lets levetiracetam use 0.1 mL precision at low weights but switch
  // to clean whole/half-mL steps for adolescent doses.
  const eligible = deviceLimited
    ? poolVols.filter(v => v.tier >= 3 || v.vol > 3.0)
    : poolVols;

  // ── Forced waypoints ────────────────────────────────────────────────────────
  // Three sources of forced waypoints — all are mandatory row anchors:
  //
  // 1. Formulation aliquots: 1 mL and 5 mL volumes are the natural reference
  //    points encoded in every suspension's label (e.g. "400 mg/5 mL").
  //    These always appear as explicit rows regardless of what the sequential
  //    filter would select, provided the dose is within maxDose.
  //
  // 2. Explicit preferredVols from the formulation DB (e.g. APAP 8 mL, 10 mL).
  //
  // 3. Special APAP 5 mL syringe marks (1.25, 2.5, 3.75, 5.0 mL) when active.

  const forcedVolKeys = new Set();

  // Source 1: formulation aliquots — the five primary syringe fill landmarks
  // that clinicians and caregivers are trained to recognize. These correspond
  // to the standard reference volumes on oral syringes (half and full on the
  // 5 mL and 10 mL syringes) and the natural mental-math checkpoints built
  // into every suspension label (e.g. "400 mg / 5 mL").
  // Reference: Meyers RS, J Pediatr Pharmacol Ther 2024;29(1):22–31
  [1.0, 2.5, 5.0, 7.5, 10.0].forEach(v => {
    const dose = Math.round(v * conc * 10000) / 10000;
    if (dose <= maxDose + 0.001) forcedVolKeys.add(Math.round(v * 100000));
  });

  // Source 2: explicit preferredVols
  preferredVols.forEach(v => forcedVolKeys.add(Math.round(v * 100000)));

  // Source 3: APAP syringe marks
  const apapForced = new Set(
    activeSyringes.has("5mL_apap") ? [1.25, 2.5, 3.75, 5.0].map(v => Math.round(v * 100000)) : []
  );
  apapForced.forEach(k => forcedVolKeys.add(k));

  const prefForced = forcedVolKeys; // unified set

  const candidates = eligible
    .map(v => ({
      ...v,
      dose:   Math.round(v.vol * conc * 10000) / 10000,
      forced: prefForced.has(Math.round(v.vol * 100000)),
    }))
    .filter(c => c.dose > 0 && c.dose <= maxDose + 0.001);

  // ── Two-phase sequential filter ──────────────────────────────────────────
  //
  // PHASE 1 — NICU zone (weight < 2.5 kg):
  //   No tier preference. Every physically dispensable step that the sequential
  //   filter would retain is kept. Resolution is the finest graduation on the
  //   active 1 mL syringe (0.05 mL standard, 0.01 mL neonatal). This is a
  //   non-negotiable safety requirement — sub-2.5 kg patients are in NICU and
  //   a 0.05 mL difference at 3 mg/mL is 0.15 mg, which is clinically
  //   meaningful at these weights and doses.
  //
  // PHASE 2 — Pediatric zone (weight ≥ 2.5 kg):
  //   Tier-first selection resumes. Among eligible candidates at each cursor
  //   position, the simplest readable graduation wins: whole mL first, then
  //   X.5 mL, then 0.2 mL steps, then 0.1 mL, then 0.05 mL.
  //
  // Forced waypoints override tier preference in both phases.
  // The two phases join seamlessly at the 2.5 kg boundary.

  const NICU_MAX_W = 2.5;  // kg — below this, finest resolution required

  const retained     = [];
  const retainedKeys = new Set();
  let prevWtH = MIN_W;

  function pickNext(inNicuZone) {
    const lastDose = retained.length > 0 ? retained[retained.length - 1].dose : 0;

    // Forced waypoints always take priority regardless of zone
    const readyForced = candidates.filter(c =>
      c.forced &&
      !retainedKeys.has(Math.round(c.vol * 100000)) &&
      c.dose > lastDose + 0.0001 &&
      wLow(c.dose) <= prevWtH + 0.0001
    ).sort((a, b) => a.vol - b.vol);

    const eligible2 = candidates.filter(c =>
      !c.forced &&
      !retainedKeys.has(Math.round(c.vol * 100000)) &&
      c.dose > lastDose + 0.0001 &&
      wLow(c.dose) <= prevWtH + 0.0001
    );

    let best = null;
    if (eligible2.length > 0) {
      if (inNicuZone) {
        // NICU phase: no tier preference — take the step that advances cursor
        // most (highest WtH), using smallest volume as tiebreaker to stay
        // at finest resolution without skipping steps
        best = eligible2.reduce((a, b) => {
          if (b.wHigh !== undefined) {
            // compare WtH
          }
          // Among eligible at cursor, pick smallest volume (finest step)
          // so we don't skip any resolution step in the NICU zone
          return a.vol <= b.vol ? a : b;
        });
      } else {
        // Pediatric phase: tier-first → highest WtH → largest volume
        best = eligible2.reduce((a, b) => {
          if (b.tier < a.tier) return b;
          if (b.tier === a.tier && wHigh(b.dose) > wHigh(a.dose) + 0.0001) return b;
          if (b.tier === a.tier &&
              Math.abs(wHigh(b.dose) - wHigh(a.dose)) < 0.0001 &&
              b.vol > a.vol) return b;
          return a;
        });
      }
    }

    const useForced = readyForced.length > 0 &&
                      (!best || readyForced[0].vol <= best.vol);
    return useForced ? readyForced[0] : best;
  }

  while (prevWtH < MAX_W - 0.0001) {
    const lastDose   = retained.length > 0 ? retained[retained.length - 1].dose : 0;
    const inNicuZone = prevWtH < NICU_MAX_W;

    const chosen = pickNext(inNicuZone);

    if (!chosen) {
      const nextAny = candidates
        .filter(c => !retainedKeys.has(Math.round(c.vol * 100000)) && c.dose > lastDose)
        .sort((a, b) => wLow(a.dose) - wLow(b.dose))[0];
      if (!nextAny || wLow(nextAny.dose) >= MAX_W - 0.0001) break;
      prevWtH = wLow(nextAny.dose);
      continue;
    }

    const isLast = chosen.dose >= maxDose - 0.001;
    retainedKeys.add(Math.round(chosen.vol * 100000));
    retained.push({ ...chosen, isLast });
    prevWtH = isLast ? MAX_W : wHigh(chosen.dose);
    if (isLast) break;
  }

  // Rows below MIN_W are suppressed — they were retained by the filter to
  // advance the cursor but are not clinically appropriate to display.
  const rows = [];

  // ── Main retained rows ─────────────────────────────────────────────────────
  // Only retained doses whose WtL >= MIN_W become display rows.
  // Doses below MIN_W are used by the sequential filter to advance the cursor
  // but are never shown — patients below MIN_W (300g) are outside the scope
  // of any oral dosing table regardless of drug.
  //
  // Each row's lower bound = WtL of this dose (inclusive).
  // Each row's upper bound = WtL of the next DISPLAYED dose (exclusive),
  // or MAX_W for the last row.
  //
  // The upper bound of the last sub-MIN_W row hands off cleanly to the first
  // displayed row because the sequential filter guarantees no weight gaps.

  // Identify which retained doses are displayable
  const displayable = retained.filter(r => wLow(r.dose) >= MIN_W - 0.0001);

  for (let i = 0; i < displayable.length; i++) {
    const r    = displayable[i];
    const next = displayable[i + 1];

    const rowWtL = wLow(r.dose);
    const rawWtH = r.isLast ? MAX_W : (next ? wLow(next.dose) : wHigh(r.dose));
    const effectiveWtH = Math.min(rawWtH, MAX_W);

    // Skip degenerate rows
    if (effectiveWtH <= rowWtL + 0.0001 && !r.isLast) continue;

    const overPct  = pVar(r.dose, rowWtL);
    const underPct = r.isLast ? null : pVar(r.dose, effectiveWtH);
    const flagged  = Math.abs(overPct) > variancePct + 0.05 ||
                     (!r.isLast && underPct !== null &&
                      Math.abs(underPct) > variancePct + 0.05);

    rows.push({
      wStart:       roundW(rowWtL),
      wEnd:         r.isLast ? `>= ${roundW(rowWtL)}` : roundW(effectiveWtH),
      doseLabel:    `${r.dose} ${unit}`,
      volLabel:     `${r.vol} mL`,
      syringeLabel: r.syringeLabel,
      overPct, underPct, flagged,
      oot: false, isLast: r.isLast,
    });
  }

  return rows;
}

// ── Tablet algorithm ───────────────────────────────────────────────────────────
// Unchanged from previous version — whole-tab anchors with half/quarter fills,
// absorption for transition gaps, open-ended max-dose row.
function buildTabletTable(formulation, targetMgKg, variancePct, canHalf, canQuarter) {
  const { concentration: strength, unit, maxDose } = formulation;
  const vf     = variancePct / 100;
  const MAX_W  = 150;
  const maxTabs = Math.ceil(maxDose / strength);

  function ann(steps) {
    return steps.filter(s => s.dose <= maxDose + 0.001).map(s => ({
      ...s,
      wLow:  s.dose / (targetMgKg * (1 + vf)),
      wHigh: s.dose / (targetMgKg * (1 - vf)),
    }));
  }

  const wholes = ann(Array.from({ length: maxTabs }, (_, i) => ({
    dispensed: i + 1, dose: (i + 1) * strength,
    label: `${i + 1} ${i === 0 ? "tab" : "tabs"}`, tier: 0,
  })));

  const halves = canHalf ? ann(Array.from({ length: maxTabs * 2 }, (_, i) => {
    const d = (i + 1) * 0.5;
    if (d % 1 === 0) return null;
    const whole = Math.floor(d);
    return { dispensed: d, dose: d * strength,
             label: `${whole > 0 ? whole : ""}½ ${d === 0.5 ? "tab" : "tabs"}`, tier: 1 };
  }).filter(Boolean)) : [];

  const quarters = canQuarter ? ann(Array.from({ length: maxTabs * 4 }, (_, i) => {
    const d = (i + 1) * 0.25;
    if (d % 0.5 === 0) return null;
    const whole = Math.floor(d);
    const frac  = d - whole;
    return { dispensed: d, dose: d * strength,
             label: `${whole > 0 ? whole : ""}${frac < 0.3 ? "¼" : "¾"} ${d < 1 ? "tab" : "tabs"}`,
             tier: 2 };
  }).filter(Boolean)) : [];

  if (!wholes.length) return [];

  function fillBetween(available, gapStart, gapEnd, minD, maxD) {
    const rows = []; let cursor = gapStart, lastD = minD;
    const el = available.filter(s =>
      s.dispensed > minD + 0.0001 && s.dispensed < maxD - 0.0001 &&
      s.wLow <= gapStart + 0.0001);
    while (cursor < gapEnd - 0.0001) {
      const elig = el.filter(s => s.wLow <= cursor + 0.0001 && s.dispensed > lastD + 0.0001);
      if (!elig.length) break;
      const best = elig.reduce((a, b) =>
        b.wHigh > a.wHigh + 0.0001 ? b :
        Math.abs(b.wHigh - a.wHigh) <= 0.0001 && a.tier <= b.tier ? a : b);
      rows.push({ step: best, rowWLow: cursor, rowWHigh: Math.min(best.wHigh, gapEnd), isLast: false });
      lastD = best.dispensed; cursor = best.wHigh;
    }
    return rows;
  }

  const rawSeq = [];
  for (let i = 0; i < wholes.length; i++) {
    const anchor = wholes[i], nextAnchor = wholes[i + 1];
    const isLast = anchor.dose >= maxDose - 0.001;
    rawSeq.push({ step: anchor, rowWLow: anchor.wLow,
                  rowWHigh: isLast ? MAX_W : anchor.wHigh, isLast });
    if (isLast || !nextAnchor) break;
    const gapS = anchor.wHigh, gapE = nextAnchor.wLow;
    if (gapE > gapS + 0.0001) {
      const hf = fillBetween(halves, gapS, gapE, anchor.dispensed, nextAnchor.dispensed);
      rawSeq.push(...hf);
      const lH = hf.length > 0 ? hf[hf.length - 1].rowWHigh : gapS;
      const lD = hf.length > 0 ? hf[hf.length - 1].step.dispensed : anchor.dispensed;
      if (lH < gapE - 0.0001)
        rawSeq.push(...fillBetween(quarters, lH, gapE, lD, nextAnchor.dispensed));
    }
  }

  for (let i = 1; i < rawSeq.length; i++) rawSeq[i].rowWLow = rawSeq[i - 1].rowWHigh;

  for (let i = 0; i < rawSeq.length - 1; i++) {
    const c = rawSeq[i], n = rawSeq[i + 1];
    if (n.rowWLow <= c.rowWHigh + 0.0001) continue;
    const ic  = Math.abs((c.step.dose - n.rowWLow * targetMgKg) / (n.rowWLow * targetMgKg) * 100);
    const in_ = Math.abs((n.step.dose - c.rowWHigh * targetMgKg) / (c.rowWHigh * targetMgKg) * 100);
    if (ic <= in_) c.rowWHigh = n.rowWLow; else n.rowWLow = c.rowWHigh;
  }

  return rawSeq.map(({ step, rowWLow, rowWHigh, isLast }) => {
    const overPct  = ((step.dose - rowWLow * targetMgKg) / (rowWLow * targetMgKg)) * 100;
    const underPct = isLast ? null
      : ((step.dose - rowWHigh * targetMgKg) / (rowWHigh * targetMgKg)) * 100;
    const flagged  = Math.abs(overPct) > variancePct + 0.05 ||
                     (!isLast && underPct !== null && Math.abs(underPct) > variancePct + 0.05);
    return {
      wStart:       roundW(rowWLow),
      wEnd:         isLast ? `>= ${roundW(rowWLow)}` : roundW(rowWHigh),
      doseLabel:    `${step.dose} ${unit}`,
      volLabel:     step.label,
      syringeLabel: "",
      overPct, underPct, flagged, oot: false, isLast,
    };
  });
}

function buildTable(formulation, targetMgKg, variancePct, canHalf, canQuarter, activeSyringes) {
  if (formulation.form === "liquid" || formulation.form === "injectable") {
    return buildLiquidTable(formulation, targetMgKg, variancePct, activeSyringes);
  }
  // tablet and capsule — capsule never splits regardless of canHalf/canQuarter
  const half    = formulation.form === "tablet" ? canHalf    : false;
  const quarter = formulation.form === "tablet" ? canQuarter : false;
  return buildTabletTable(formulation, targetMgKg, variancePct, half, quarter);
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const MONO = "'DM Mono','Courier New',monospace";
const INTER = "'Inter', -apple-system, BlinkMacSystemFont, sans-serif";
const ctrlBase = {
  fontFamily: MONO, fontSize: 15, border: "2px solid #b0b8c4", borderRadius: 5,
  background: "#fff", color: "#111", width: "100%", boxSizing: "border-box",
  padding: "8px 10px", height: 42,
};
// Injected via <style> — placeholder brightness fix
const placeholderStyle = `
  input::placeholder { color: #888 !important; opacity: 1; }
`;
const selStyle = {
  ...ctrlBase, appearance: "none", paddingRight: 28,
  backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath fill='%23444' d='M0 0l5 6 5-6z'/%3E%3C/svg%3E\")",
  backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center", cursor: "pointer",
};
const CAP = {
  display: "block", fontSize: 13, fontWeight: 700, letterSpacing: 0.5,
  textTransform: "uppercase", color: "#555", marginBottom: 4,
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif",
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

// ── Component ──────────────────────────────────────────────────────────────────
export default function PedsDoseTable() {
  const [drugIdx,          setDrugIdx]          = useState(-1);
  const [formIdx,          setFormIdx]          = useState(-1);
  const [doseText,         setDoseText]         = useState("");
  const [committedTarget,  setCommittedTarget]  = useState(null);
  const [maxDoseText,      setMaxDoseText]      = useState("");
  const [committedMax,     setCommittedMax]     = useState(null);
  const [variance,         setVariance]         = useState(20);
  const [canHalf,          setCanHalf]          = useState(true);
  const [canQuarter,       setCanQuarter]       = useState(false);
  const [activeSyringes,   setActiveSyringes]   = useState(
    new Set(["1mL_005", "3mL", "5mL_std", "10mL"])
  );
  const [minWtText,        setMinWtText]        = useState("");
  const [committedMinWt,   setCommittedMinWt]   = useState(null);

  const drug        = drugIdx >= 0 ? DRUG_DB[drugIdx] : null;
  const formulation = drug && formIdx >= 0 ? drug.formulations[formIdx] : null;
  const isLiquid    = formulation?.form === "liquid" || formulation?.form === "injectable";
  const isSolid     = formulation?.form === "tablet" || formulation?.form === "capsule";
  const isApap      = formulation?.form === "liquid" && drug?.generic === "Acetaminophen";

  const toggleSyringe = useCallback((key) => {
    setActiveSyringes(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const selectForm = useCallback((idx) => {
    setFormIdx(idx);
    setCommittedTarget(null);
    setCommittedMax(null);
    setDoseText("");
    if (idx >= 0 && drug) {
      const f = drug.formulations[idx];
      setCanHalf(f.canHalf ?? false);
      setCanQuarter(f.canQuarter ?? false);
      const md = f.maxDose ?? "";
      setMaxDoseText(md !== "" ? String(md) : "");
      setCommittedMax(f.maxDose ?? null);
    } else {
      setMaxDoseText("");
    }
  }, [drug]);

  const commitDose = useCallback(() => {
    const v = parseFloat(doseText);
    setCommittedTarget(isNaN(v) || v <= 0 ? null : v);
  }, [doseText]);

  const commitMax = useCallback(() => {
    const v = parseFloat(maxDoseText);
    setCommittedMax(isNaN(v) || v <= 0 ? null : v);
  }, [maxDoseText]);

  const commitMinWt = useCallback(() => {
    const v = parseFloat(minWtText);
    setCommittedMinWt(isNaN(v) || v <= 0 ? null : v);
  }, [minWtText]);

  const effectiveMax   = committedMax ?? formulation?.maxDose ?? null;
  const effectiveMinWt = committedMinWt ?? 0.3;

  const rows = useMemo(() => {
    if (!formulation || committedTarget === null || effectiveMax === null) return null;
    const f = { ...formulation, maxDose: effectiveMax };
    const raw = buildTable(f, committedTarget, variance, canHalf, canQuarter, activeSyringes);
    if (!raw) return null;
    // Apply user-defined minimum weight floor:
    // suppress rows entirely below the floor; clamp the first visible row's wStart display value
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
    return filtered;
  }, [formulation, committedTarget, variance, canHalf, canQuarter, activeSyringes, effectiveMax, effectiveMinWt]);

  const fmtPct = v =>
    v === null ? "—" : (v >= 0 ? "+" : "\u2212") + Math.abs(v).toFixed(1) + "%";

  const [showInfo, setShowInfo] = useState(false);

  const generatePDF = useCallback(async () => {
    if (!rows || !formulation || !drug) return;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
    const PW = doc.internal.pageSize.getWidth();   // 612
    const PH = doc.internal.pageSize.getHeight();  // 792
    const ML = 36, MR = 36, MT = 36;
    let y = MT;

    // ── Logo + header block ──────────────────────────────────────────────────
    try {
      const res = await fetch("Aptos_512.png");
      const blob = await res.blob();
      const b64 = await new Promise(resolve => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.readAsDataURL(blob);
      });
      const logoH = 48, logoW = 48;
      doc.addImage(b64, "PNG", ML, y, logoW, logoH);
    } catch(e) { /* logo unavailable — skip silently */ }

    // APTOS wordmark
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(28, 35, 51);
    doc.text("APTOS", ML + 56, y + 18);

    // Tagline
    doc.setFont("times", "italic");
    doc.setFontSize(10);
    doc.setTextColor(100, 120, 140);
    doc.text("Doses Designed to Fit", ML + 56, y + 32);

    // Date/time stamp
    const now = new Date();
    const stamp = now.toLocaleString(undefined, {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit"
    });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(140, 140, 140);
    doc.text(stamp, PW - MR, y + 12, { align: "right" });

    y += 56;

    // ── Dark metadata band ───────────────────────────────────────────────────
    const bandH = 46;
    doc.setFillColor(28, 35, 51);
    doc.rect(ML, y, PW - ML - MR, bandH, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(255, 255, 255);
    doc.text(drug.generic, ML + 8, y + 13);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(184, 207, 224);
    doc.text(formulation.label, ML + 8, y + 24);

    const meta = `${committedTarget} ${formulation.doseUnit}  ·  min ${effectiveMinWt} kg  ·  max ${effectiveMax} ${formulation.unit}  ·  ±${variance}%  ·  ${rows.length} rows`;
    doc.setFontSize(8);
    doc.text(meta, ML + 8, y + 36);

    y += bandH;

    // ── Column headers ───────────────────────────────────────────────────────
    const colHeaders = isLiquid
      ? ["Wt (kg)", "Dose", "Vol", "Syr", "Under", "Over"]
      : ["Wt (kg)", "Dose", "Form", "Under", "Over"];
    const colX = isLiquid
      ? [ML, ML+110, ML+195, ML+265, ML+315, ML+385]
      : [ML, ML+120, ML+210, ML+300, ML+370];
    const colAlign = isLiquid
      ? ["left","left","left","center","center","center"]
      : ["left","left","left","center","center"];

    const hdrH = 18;
    doc.setFillColor(245, 245, 241);
    doc.rect(ML, y, PW - ML - MR, hdrH, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(34, 34, 34);
    colHeaders.forEach((h, i) => {
      doc.text(h.toUpperCase(), colX[i] + (colAlign[i] === "center" ? 25 : 0), y + 12,
        { align: colAlign[i] });
    });
    y += hdrH;

    // ── Table rows ───────────────────────────────────────────────────────────
    const rowH = 16;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);

    rows.forEach((r, idx) => {
      if (y + rowH > PH - 36) {
        doc.addPage();
        y = MT;
      }

      // Alternating row background
      if (idx % 2 === 0) {
        doc.setFillColor(252, 252, 250);
        doc.rect(ML, y, PW - ML - MR, rowH, "F");
      }

      // OOT highlight
      if (r.flagged) {
        doc.setFillColor(255, 252, 220);
        doc.rect(ML, y, PW - ML - MR, rowH, "F");
      }

      const textY = y + 11;
      const ootColor = r.oot ? [180,180,180] : null;

      // PDF-safe formatters (no unicode minus or ≥)
      const pdfPct = v => v === null ? "--"
        : (v >= 0 ? "+" : "-") + Math.abs(v).toFixed(1) + "%";

      // Wt — ASCII-safe ≥ replacement
      doc.setTextColor(...(ootColor || [26,26,26]));
      doc.setFont("helvetica", "normal");
      const wtLabel = typeof r.wEnd === "string"
        ? `>= ${r.wStart}` : `${r.wStart}-${r.wEnd}`;
      doc.text(wtLabel, colX[0], textY);

      // Dose (bold)
      doc.setFont("helvetica", "bold");
      doc.text(r.doseLabel, colX[1], textY);

      // Vol — right-aligned to column right edge
      doc.setFont("helvetica", "normal");
      doc.text(r.volLabel, colX[2] + 48, textY, { align: "right" });

      if (isLiquid) {
        // Syr — centered
        doc.setTextColor(...(ootColor || [85,85,85]));
        doc.text(r.syringeLabel, colX[3] + 22, textY, { align: "center" });
      }

      // Under — right-aligned
      const uIdx = isLiquid ? 4 : 3;
      const uOot = !r.oot && r.underPct !== null && Math.abs(r.underPct) > variance + 0.05;
      doc.setTextColor(...(ootColor || (uOot ? [192,57,43] : [68,68,68])));
      doc.setFont("helvetica", uOot ? "bold" : "normal");
      doc.text(pdfPct(r.underPct), colX[uIdx] + 48, textY, { align: "right" });

      // Over — right-aligned
      const oIdx = isLiquid ? 5 : 4;
      const oOot = !r.oot && Math.abs(r.overPct) > variance + 0.05;
      doc.setTextColor(...(ootColor || (oOot ? [192,57,43] : [68,68,68])));
      doc.setFont("helvetica", oOot ? "bold" : "normal");
      doc.text(pdfPct(r.overPct), colX[oIdx] + 48, textY, { align: "right" });

      // Row border
      doc.setDrawColor(220, 220, 216);
      doc.line(ML, y + rowH, PW - MR, y + rowH);

      y += rowH;
    });

    // ── Footer note ──────────────────────────────────────────────────────────
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text(
      "Weight bands: lower bound inclusive, upper bound exclusive  ·  Pharmacy verification required before clinical use",
      PW / 2, y + 12, { align: "center" }
    );

    // ── Save ─────────────────────────────────────────────────────────────────
    const fname = `APTOS_${drug.generic.replace(/\s+/g,"_")}_${now.toISOString().slice(0,10)}.pdf`;
    doc.save(fname);
  }, [rows, formulation, drug, committedTarget, effectiveMax, effectiveMinWt, variance, isLiquid, fmtPct]);

  // Column count: liquid tables have a syringe column, solid tables do not
  const colCount = isLiquid ? 6 : 5;

  return (
    <div style={{ fontFamily: MONO, background: "#f2f2ee", minHeight: "100vh", color: "#1a1a1a" }}>
      <style>{placeholderStyle}</style>

      {/* ── Header ── */}
      <div style={{ background: "#1c2333", color: "#fff", padding: "10px 14px",
                    display: "flex", alignItems: "center", gap: 10 }}>
        <img src="Aptos_192.png" alt="APTOS"
             style={{ width: 36, height: 36, borderRadius: 8, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: 4,
                        textTransform: "uppercase", fontFamily: "'Arial Black',Arial,sans-serif" }}>APTOS</div>
          <div style={{ fontSize: 13, color: "#c8d8e8", fontStyle: "italic",
                        fontFamily: "Georgia,'Times New Roman',serif", letterSpacing: 0.2, marginTop: 2 }}>
            Doses Designed to Fit
          </div>
        </div>
        <button onClick={() => setShowInfo(true)}
           title="About APTOS"
           style={{ color: "#1c2333", background: "#c8d8e8", fontStyle: "italic",
                    fontFamily: "Georgia,'Times New Roman',serif",
                    fontSize: 13, fontWeight: 700, border: "none", cursor: "pointer",
                    flexShrink: 0, width: 24, height: 24, borderRadius: "50%",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    lineHeight: 1 }}>i</button>
      </div>

      {/* ── Info Modal ── */}
      {showInfo && (
        <div onClick={() => setShowInfo(false)}
             style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
                      zIndex: 200, display: "flex", alignItems: "center",
                      justifyContent: "center", padding: 24 }}>
          <div onClick={e => e.stopPropagation()}
               style={{ background: "#fff", borderRadius: 10, padding: 24,
                        maxWidth: 480, width: "100%", boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
                        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between",
                          marginBottom: 14 }}>
              <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: 2,
                            fontFamily: "'Arial Black', Arial, sans-serif",
                            textTransform: "uppercase", color: "#1c2333" }}>APTOS</div>
              <button onClick={() => setShowInfo(false)}
                      style={{ background: "none", border: "none", fontSize: 20,
                               cursor: "pointer", color: "#888", lineHeight: 1, padding: 0 }}>x</button>
            </div>
            <div style={{ fontSize: 13, color: "#1c2333", lineHeight: 1.6 }}>
              <p style={{ marginBottom: 10 }}>
                <strong>Doses Designed to Fit.</strong>
              </p>
              <p style={{ marginBottom: 10 }}>
                This application generates standardized weight-band dosing tables for the full pediatric size spectrum -- from the 350-gram premature infant to the bariatric adolescent -- across liquid, solid, and injectable drug formulations.
              </p>
              <p style={{ marginBottom: 10 }}>
                Every band represents a physically dispensable dose from a split tab to a volume on an available syringe, with variance from the weight-based target bounded within a declared tolerance. The algorithm eliminates manual calculation, ensures no weight gap or overlap, and produces tables ready for pharmacy verification into standardized dosing tools in any commercial EHR that supports the function.
              </p>
              <p style={{ marginBottom: 16 }}>
                Output is intended for pharmacists and prescribers building order sets and clinical decision support tools with an approach that embraces core medication safety principles while also preventing unwarranted variance, facilitating pharmacy verification and dispensing, avoiding waste of trivial volumes from additional vials, and optimizing efficiency. Pharmacy verification is required before clinical use.
              </p>
              <a href="Peds_Dosing_Summary.pdf" target="_blank" rel="noopener noreferrer"
                 style={{ display: "inline-block", background: "#1c2333", color: "#fff",
                          padding: "8px 16px", borderRadius: 6, fontSize: 13,
                          fontWeight: 600, textDecoration: "none", letterSpacing: 0.3 }}>
                Methodology and Evidence Base (PDF)
              </a>
            </div>
          </div>
        </div>
      )}

      {/* ── Controls ── */}
      <div style={{ background: "#fff", borderBottom: "2px solid #1c2333",
                    padding: "10px 12px", display: "flex", flexDirection: "column", gap: 7 }}>

        {/* Row 1: Drug (full width) */}
        <div>
          <span style={CAP}>Drug</span>
          <select style={selStyle} value={drugIdx}
            onChange={e => {
              setDrugIdx(+e.target.value);
              setFormIdx(-1); setCommittedTarget(null); setCommittedMax(null);
              setDoseText(""); setMaxDoseText("");
            }}>
            <option value={-1}>— select drug —</option>
            {DRUG_DB.map((d, i) =>
              <option key={i} value={i}>{d.generic}</option>
            )}
          </select>
        </div>

        {/* Row 2: Formulation | Max Dose */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: 8 }}>
          <div>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between",
                          marginBottom: 4 }}>
              <span style={CAP}>Formulation</span>
              {formulation?.ndc && formulation.ndc !== "***MANUAL***" && (
                <span
                  onClick={() => navigator.clipboard?.writeText(formulation.ndc)}
                  title="Tap to copy NDC"
                  style={{ fontSize: 11, color: "#999", cursor: "pointer",
                           fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
                           userSelect: "all" }}>
                  NDC {formulation.ndc}
                </span>
              )}
            </div>
            <select style={selStyle} value={formIdx} disabled={!drug}
              onChange={e => selectForm(+e.target.value)}>
              <option value={-1}>— select —</option>
              {drug && drug.formulations.map((f, i) =>
                <option key={i} value={i}>{f.label}</option>
              )}
            </select>
          </div>
          <div>
            <span style={CAP}>Max ({formulation?.unit ?? "mg"})</span>
            <input
              style={ctrlBase}
              type="number" placeholder="e.g. 60"
              value={maxDoseText} onChange={e => setMaxDoseText(e.target.value)}
              onBlur={commitMax} onKeyDown={e => e.key === "Enter" && e.target.blur()}
              step="1" min="0" inputMode="decimal" disabled={!formulation}
            />
          </div>
        </div>

        {/* Row 3: Min Wt | Target Dose | Variance */}
        <div style={{ display: "grid", gridTemplateColumns: "105px 1fr 100px", gap: 8 }}>
          <div>
            <span style={CAP}>Min Wt (kg)</span>
            <input style={ctrlBase} type="number" placeholder="0.3"
              value={minWtText} onChange={e => setMinWtText(e.target.value)}
              onBlur={commitMinWt} onKeyDown={e => e.key === "Enter" && e.target.blur()}
              step="0.1" min="0" inputMode="decimal" />
          </div>
          <div>
            <span style={CAP}>Target ({formulation?.doseUnit ?? "mg/kg"})</span>
            <input style={ctrlBase} type="number" placeholder="e.g. 12.5"
              value={doseText} onChange={e => setDoseText(e.target.value)}
              onBlur={commitDose} onKeyDown={e => e.key === "Enter" && e.target.blur()}
              step="0.1" min="0" inputMode="decimal" />
          </div>
          <div>
            <span style={CAP}>Variance</span>
            <select style={selStyle} value={variance}
              onChange={e => setVariance(Number(e.target.value))}>
              <option value={5}>± 5%</option>
              <option value={10}>± 10%</option>
              <option value={15}>± 15%</option>
              <option value={20}>± 20%</option>
            </select>
          </div>
        </div>

        {/* Tablet: splittability checkboxes — tablets only */}
        {formulation?.form === "tablet" && (
          <div style={{ display: "flex", gap: 16, paddingTop: 2 }}>
            {[["canHalf", canHalf, setCanHalf, "Half-tab splittable"],
              ["canQtr",  canQuarter, setCanQuarter, "Quarter-tab splittable"]].map(
              ([key, val, setter, lbl]) => (
                <label key={key} style={{ display: "flex", alignItems: "center",
                  gap: 5, fontSize: 11, color: "#555", cursor: "pointer" }}>
                  <input type="checkbox" checked={val}
                    onChange={e => setter(e.target.checked)} />
                  {lbl}
                </label>
              ))}
          </div>
        )}

        {/* Liquid: syringe availability checkboxes */}
        {isLiquid && (
          <div style={{ borderTop: "1px solid #eee", paddingTop: 5 }}>
            <span style={CAP}>Syringes available</span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "4px 0" }}>
              {/* Row 1: 1 mL (0.05) | 3 mL (0.1) | 5 mL std | 10 mL */}
              {[
                { key: "1mL_005", label: "1 mL (0.05)", defaultOn: true  },
                { key: "3mL",     label: "3 mL (0.1)",  defaultOn: true  },
                { key: "5mL_std", label: "5 mL std",    defaultOn: true  },
                { key: "10mL",    label: "10 mL",        defaultOn: true  },
              ].map(({ key, label, defaultOn }) => (
                <label key={key} style={{
                  display: "flex", alignItems: "center", gap: 5,
                  fontSize: 12, cursor: "pointer",
                  color: activeSyringes.has(key) ? "#1c2333" : "#aaa",
                  fontWeight: activeSyringes.has(key) ? 700 : 400,
                }}>
                  <input type="checkbox" checked={activeSyringes.has(key)}
                    onChange={() => toggleSyringe(key)}
                    style={{ accentColor: "#1c2333", width: 14, height: 14 }} />
                  {label}
                </label>
              ))}
              {/* Row 2: 1 mL (0.01) | (empty) | 5 mL APAP (if APAP) | (empty) */}
              <label style={{
                display: "flex", alignItems: "center", gap: 5,
                fontSize: 12, cursor: "pointer",
                color: activeSyringes.has("1mL_001") ? "#1c2333" : "#aaa",
                fontWeight: activeSyringes.has("1mL_001") ? 700 : 400,
              }}>
                <input type="checkbox" checked={activeSyringes.has("1mL_001")}
                  onChange={() => toggleSyringe("1mL_001")}
                  style={{ accentColor: "#1c2333", width: 14, height: 14 }} />
                1 mL (0.01)
              </label>
              <div />
              {isApap ? (
                <label style={{
                  display: "flex", alignItems: "center", gap: 5,
                  fontSize: 12, cursor: "pointer",
                  color: activeSyringes.has("5mL_apap") ? "#1c2333" : "#aaa",
                  fontWeight: activeSyringes.has("5mL_apap") ? 700 : 400,
                }}>
                  <input type="checkbox" checked={activeSyringes.has("5mL_apap")}
                    onChange={() => toggleSyringe("5mL_apap")}
                    style={{ accentColor: "#1c2333", width: 14, height: 14 }} />
                  5 mL APAP
                </label>
              ) : <div />}
              <div /> {/* col 4 empty */}
            </div>
          </div>
        )}
      </div>

      {/* ── Table output ── */}
      <div style={{ padding: "8px 10px" }}>
        {rows ? (
          <div style={{ background: "#fff", borderRadius: 6, overflow: "hidden",
                        border: "1px solid #d0d0c8" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: INTER }}>
              <thead>
                {/* Metadata row */}
                <tr style={{ background: "#1c2333" }}>
                  <th colSpan={colCount} style={{ padding: "7px 10px", textAlign: "left" }}>
                    <div style={{ color: "#fff", fontWeight: 700, fontSize: 13,
                                  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif" }}>
                      {drug.generic}
                    </div>
                    <div style={{ color: "#fff", fontWeight: 500, fontSize: 12, marginTop: 2,
                                  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif" }}>
                      {formulation.label}
                    </div>
                    <div style={{ color: "#b8cfe0", fontSize: 11, marginTop: 3 }}>
                      {committedTarget} {formulation.doseUnit}
                      {" · "}min {effectiveMinWt} kg
                      {" · "}max {effectiveMax} {formulation.unit}
                      {" · "}±{variance}%
                      {" · "}{rows.length} rows
                    </div>
                  </th>
                </tr>
                {/* Column headers */}
                <tr style={{ background: "#f5f5f1" }}>
                  <th style={{ ...TH, textAlign: "left",   color: "#444" }}>Wt (kg)</th>
                  <th style={{ ...TH, textAlign: "left",   color: "#444" }}>Dose</th>
                  <th style={{ ...TH, textAlign: "right",   color: "#444" }}>
                    {isLiquid ? "Vol" : "Form"}
                  </th>
                  {isLiquid && (
                    <th style={{ ...TH, textAlign: "center", color: "#444", padding: "6px 4px" }}>Syr</th>
                  )}
                  <th style={{ ...TH, textAlign: "right", color: "#444", padding: "6px 4px" }}>Under</th>
                  <th style={{ ...TH, textAlign: "right", color: "#444", padding: "6px 4px" }}>Over</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={{
                    background: r.oot
                      ? "#f0f0f0"
                      : r.flagged
                        ? "#fff4ec"
                        : i % 2 === 0 ? "#fff" : "#fafaf6",
                  }}>
                    {/* Weight range — inclusive lower, exclusive upper */}
                    <td style={{ ...TD, color: r.oot ? "#999" : "inherit" }}>
                      {typeof r.wEnd === "string"
                        ? r.wEnd
                        : `${r.wStart}-${r.wEnd}`}
                      {r.oot && (
                        <span style={{ marginLeft: 4, background: "#888", color: "#fff",
                          fontSize: 7, fontWeight: 700, padding: "1px 3px",
                          borderRadius: 2, verticalAlign: "middle" }}>OOT</span>
                      )}
                      {!r.oot && r.flagged && (
                        <span style={{ marginLeft: 4, background: "#c85a00", color: "#fff",
                          fontSize: 7, fontWeight: 700, padding: "1px 3px",
                          borderRadius: 2, verticalAlign: "middle" }}>⚠</span>
                      )}
                    </td>
                    <td style={{ ...TD, fontWeight: r.oot ? 400 : 700,
                                  color: r.oot ? "#999" : "inherit" }}>
                      {r.doseLabel}
                    </td>
                    <td style={{ ...TD, textAlign: "right", color: r.oot ? "#999" : "inherit" }}>
                      {r.volLabel}
                    </td>
                    {isLiquid && (
                      <td style={{ ...TD, padding: "6px 4px", textAlign: "center",
                                    fontSize: 11, fontWeight: 700,
                                    color: r.oot ? "#bbb" : "#555" }}>
                        {r.syringeLabel}
                      </td>
                    )}
                    <td style={{ ...TD, padding: "6px 4px", textAlign: "right", fontWeight: 600,
                                  color: r.oot ? "#bbb"
                                    : (r.underPct !== null && Math.abs(r.underPct) > variance + 0.05)
                                      ? "#c0392b" : "#444" }}>
                      {fmtPct(r.underPct)}
                    </td>
                    <td style={{ ...TD, padding: "6px 4px", textAlign: "right", fontWeight: 600,
                                  color: r.oot ? "#bbb"
                                    : (Math.abs(r.overPct) > variance + 0.05)
                                      ? "#c0392b" : "#444" }}>
                      {fmtPct(r.overPct)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Precision note */}
            <div style={{ fontSize: 11, color: "#999", textAlign: "center",
                          padding: "5px", borderTop: "1px solid #eee" }}>
              Weight bands: lower bound inclusive, upper bound exclusive
              {" · "}Pharmacy verification only
            </div>
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: "30px 0", color: "#555", fontSize: 14 }}>
            {!formulation
              ? "Select drug and formulation"
              : !doseText
                ? "Enter target dose"
                : "Tap away from dose field to generate"}
          </div>
        )}
      </div>

      {/* ── Floating PDF button ── */}
      {rows && (
        <div style={{ position: "fixed", bottom: 24, right: 20, zIndex: 100 }}>
          <button onClick={generatePDF} style={{
            background: "#1c2333", color: "#fff", border: "none", borderRadius: 28,
            padding: "12px 22px", fontSize: 14, fontWeight: 700, cursor: "pointer",
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif",
            boxShadow: "0 4px 16px rgba(0,0,0,0.35)", letterSpacing: 0.3,
          }}>
            ⬇ PDF
          </button>
        </div>
      )}
    </div>
  );
}

