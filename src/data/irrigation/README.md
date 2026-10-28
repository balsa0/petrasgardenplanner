# Irrigation product data (Hunter + Rain Bird)

Manufacturer performance data for the planner's Irrigation step. The step computes throw radius, flow,
pressure at each head, zone flow, pipe velocity and precipitation-rate matching from it.
Every record has a `source` URL (catalog PDF plus `#page=N`, or a spec sheet). Values not
published by the manufacturer are left out. The few derived or estimated values are flagged in
`note` (or with `fitsBasis: "estimate"`), and gaps are listed at the end.

## Files

| file | content | records |
|---|---|---|
| `bodies.json` | spray bodies, rotors, shrub adapters (`kind`: `spray-body` / `rotor` / `bubbler-body`) | 80 |
| `nozzles.json` | spray, rotary, rotor, strip, bubbler nozzles, plus drip emitters and dripline | 320 (43 series) |
| `valves.json` | zone valves with pressure-loss curves | 16 |
| `boxes.json` | valve boxes (Rain Bird only; Hunter makes none) | 14 |
| `pipes.json` | Hazen-Williams C, velocity limits, PE100 / PE80 / LDPE sizes | 34 sizes |
| `sources.json` | generic water-source presets (mains by meter, well, tank pump, booster) | 10 |
| `accessories.json` | drip filters, pressure regulators, control-zone kits (extra file) | 39 |

## Coverage

**Hunter** (US catalog Vol. 40, imperial tables converted):
- Spray bodies: Pro-Spray PROS-00/02/03/04/06/12, plus PRS30 and PRS40 variants, and PS Ultra PSU-02/04/06.
- Spray nozzles: Pro-Fixed, Pro-Adjustable 4A–17A, Pro-HE, the MP Rotator family (MP800SR, MP815, MP1000/2000/3000/3500, MP Corner, MP LCS/RCS/SS strips), strip nozzles, short-radius micro sprays, and the MSBN, PCN and PCB bubblers.
- Rotors with per-nozzle tables: PGJ, SRM, PGP Ultra, I-20 and PRB (blue, gray low-angle, green high-flow, black short-radius, MPR-25/30/35), I-25 (standard and high-speed), I-40 (standard, high-speed, -ON).
- Valves: PGV 1"/1.5"/2", ICV 1"/1.5"/2".
- Drip: HDL-CV, HDL-PC, HDL-COP dripline with maximum run lengths; PLD 16 mm from the EM cut sheet; HE point-source emitters.
- Drip accessories: PCZ, ACZ and ICZ kits, HFR filter-regulators, HY filters, Senninger regulators.

**Rain Bird** (2023 domestic catalog, imperial tables converted, plus spec sheets):
- Spray bodies: UNI-Spray US-400; 1800 series (1802/1803/1804/1806/1812 in standard, SAM, PRS, P45, SAM-PRS and SAM-P45 versions); PA-8S shrub adapters, including PRS and P45.
- Spray and rotary nozzles: U-Series (8/10/12/15), HE-VAN (8/10/12/15), VAN (4–18), MPR (5/8/10/12/15 F/H/Q, 8 FLT, 5-series stream bubblers), 15-series strips (EST/CST/LCS/RCS/SST, 9SST), R-VAN14/18/24 with -360 and LCS/RCS/SST strips.
- Bubblers: 1300A-F; 1401, 1402 and 1404.
- Rotors: 3504; 32SA; 5004/5006/5012 including Plus/SAM/PRS and the shrub model, with Rain Curtain, low-angle and 5000-MPR nozzles; Falcon 6504; 8005; 7005 (legacy).
- Valves: HV, 075/100-DV, 100-DVF, PGA 1"/1.5"/2", PEB 1"/1.5"/2".
- Valve boxes: VB-7RND, VB-10RND, VB-STD, VB-JMB/-H, the PVB series, and international VBA02672–02675.
- Drip: XFD 0.6 and 0.9 gph with maximum lateral lengths; Xeri-Bug XB-05/10/20PC and XBT-10/20; PC-05/07/10 modules; XCZ control-zone kits.

## Units and conventions

- **Units:** pressure in bar, radius in m, flow in L/min (drip records also carry `flowLph`), precipitation in mm/h, box sizes in cm, pipe sizes in mm.
- **Conversion:** values were converted from the US tables: `bar = psi × 0.0689476` (2 dp), `m = ft × 0.3048` (2 dp), `L/min = gpm × 3.78541` (2 dp), `mm/h = in/h × 25.4` (1 dp). Table pressures are therefore the manufacturer's tested pressures: 30 psi becomes 2.07 bar, 45 psi becomes 3.10.
- **ids:** kebab-case `brand-model[-nozzle]`, for example `hunter-mp2000-90-210`, `rainbird-van-12`, `rainbird-5000-nozzle-3-0`, `hunter-pgp-ultra-blue-5-0`, `rainbird-5000-mpr-30-h`, `rainbird-xfd-09`. Decimal points become `-`. ids are unique across all files.
- **Nozzle tables:** `table` rows are sorted by ascending `bar`. Interpolate linearly between rows. Outside `pressureRange`, flag the head instead of extrapolating.

## How to use the data (planner notes)

- **Body → nozzle:**
  - `body.nozzleSeries` lists the nozzle `series` ids the manufacturer pairs with that body.
  - Spray bodies also carry `compatibleSeries`: the other brand's spray series. Both brands use the industry-standard spray-nozzle thread, but neither manufacturer publishes cross-brand performance, so treat these as allowed-with-warning.
  - Bubbler, emitter and dripline records may be placed without a body, on a riser or tubing.
- **Rotor nozzles:**
  - One record per nozzle number. Look them up by `series` and `nozzleNumber`; for example, PGP Ultra blue 5.0 is `hunter-pgp-ultra-blue-5-0`.
  - `arc` on a rotor nozzle is the body's arc-adjustment range.
  - Rotor flow in the table is independent of the arc setting, except for the matched-precipitation nozzles: `rainbird-5000-mpr-*` and `hunter-pgp-ultra-mpr*` have fixed Q/T/H/F arcs.
- **Adjustable nozzles** (VAN, HE-VAN, Pro-Adjustable, R-VAN, MP Rotator):
  - `tables` holds the manufacturer's rows keyed by arc. `table` is the row set for `tableArc` (the largest arc published).
  - For other arcs: `flow ≈ flow(tableArc) × arc / tableArc`. Radius does not change with arc.
  - Some MP models such as MP…-90-210 have no 360° row.
- **Precipitation:**
  - `precipSq` and `precipTri` are the manufacturer's square and triangular spacing at 50% of throw diameter (head-to-head).
  - For rotor nozzles, `precipArc: 180` means the published rate is for half-circle operation. For full circle, divide by 2; for a quarter, multiply by 2. Matched-precipitation rotor nozzles use their own arc (`precipArc` equals the nozzle arc).
  - Spray-nozzle precipitation is for the nozzle's own arc. For any layout, compute `P = 60 000 × Q(L/min) × 360 / arc / (S × L)` mm/h.
  - Missing precipitation: Rain Bird 15-series strips, MPR stream bubblers, 1300/1400, 32SA, Hunter MP Corner and Pro strips, micro sprays, all bubblers and drip.
  - R-VAN strip `precipSq` is the catalog's "straight-line spacing" figure.
- **Strips:**
  - `arc: "strip"`, with `pattern` (LCS/RCS/SST/CST/EST) and nominal `size {w,l}` in m. Rows carry `w`, `l` and `radius`.
  - `radius` is the farthest throw from the head: `l` for corner or end strips, `l/2` for side or centre strips. Render the rectangle against the head position and the pattern.
- **Pressure-regulated bodies** (`regulated`, e.g. 1800-PRS 2.07, P45 3.10, PRS30 2.07, PRS40 2.76, 5000 PRS 3.10): nozzle pressure = `min(pressure at body inlet, regulated)`. Warn when the inlet is barely above `regulated`.
- **Rotor recommended range:** Hunter rotors carry both `pressureRange` (allowable) and `recommendedRange`.
- **Radius reduction:** `radiusAdjust` is the maximum % reduction by screw (Rain Bird spray 25%, R-VAN derived from the published minimum radius in `minRadius`, MP Rotator 25%).
- **Valves:**
  - `loss` is the globe/straight configuration as `[{lpm, bar}]`. Interpolate, and flag flows outside `flowRange`.
  - Optional alternative curves: `lossAngle`, and `lossMaleBarb` / `lossMaleMale` where published.
  - Valve `pressureRange` is the valve's pressure rating (up to 15 bar), not a nozzle limit.
- **Boxes:**
  - `inner` is the clear top opening (round: `d`), with `innerBottom` and `outer` where published.
  - `fits` counts 3/4"–1" valves.
  - `fitsBasis: "manufacturer"` applies only to VB-7RND and VB-10RND ("single valves"), RNDVBA10 (1) and STDVBA (4).
  - Everything else is an area-scaled **estimate** from the STDVBA rating; see each record's note.
- **Pipes:**
  - `materials[].sizes[]` gives `{od, pn, sdr, wall, id}` in mm.
  - Use `hazenC` = 140 (manufacturer PE charts). Warn above `maxVelocity` = 1.5 m/s; treat `maxVelocityHard` = 2.3 m/s as an error.
  - Hazen-Williams (SI): `hf[m/m] = 10.67 × Q^1.852 / (C^1.852 × d^4.87)`, with Q in m³/s and d in m.
- **Drip:**
  - Emitter `flow` is per emitter, in L/min. Zone flow = number of emitters × flow.
  - PC devices have flat two-row tables across their regulation range.
  - `maxRunM` (dripline) gives the maximum lateral length by spacing and inlet pressure.
  - Use the `accessories.json` kits and regulators: their `regulated` outlet and `inletRequired` table give the minimum inlet pressure.
- **Sources:**
  - `pressure` is the static band [min, max] in bar, and `flow` is the recommended usable flow in L/min.
  - Mains presets also carry `meterLoss` `[{lpm, bar}]`. Subtract it before the pipe network.
  - Pump presets give `[pressure at rated flow, shut-off pressure]`. Users should edit all presets.

## Gaps and caveats

- **Pipes (EN 12201-2):** the official EN 12201-2 / ISO 4427-2 table is not freely available. Wall thicknesses come from the AGRU-FRANK DIN 8074 table (same ISO 4065 SDR series). EN product listings give 0.1 mm thicker walls for 20 SDR11, 32 SDR11 and 32 SDR17; these are noted per size, and `id` differs by 0.2 mm or less. PE80 16 mm exists only as SDR9. No SDR26 below 40 mm and no SDR17 below 25 mm.
- **Valve boxes:**
  - Hunter makes no valve boxes (only the MB-0811 drip box, without dimensions).
  - Rain Bird publishes no valve-count capacity except the cases listed above, so most `fits` values are estimates.
  - VB-SPR and VB-MAX are omitted (only outer sizes are published). PVB round box heights are not published.
- **Rain Bird nozzles and rotors:**
  - 5000 PRS performance tables are not stored; use the `regulated` logic.
  - 32SA has only 3 tested pressures and no precipitation.
  - 7005 is legacy (not in the 2023 catalog). Its data comes from the 7005/8005 Operation Guide hosted by a distributor; its arc range is assumed to match 8005 and its pop-up height is not sourced.
  - 1300A-F radius is not published, and 1400 / Xeri-Bug flows are nominal PC values (the Xeri-Bug curve chart is not digitised).
  - Not included: XFCV, XFS and XFS-CV dripline; RD1800 bodies.
- **Hunter:**
  - Pro-Fixed TT/TQ patterns (12/15 ft) have no catalog rows. No radius-reduction % is published except for MP Rotator. Short-radius micro-spray precipitation is "no overlap" only and is omitted.
  - PLD has no maximum run lengths or ID. PLD 17 mm and the new LDL dripline are not included.
  - PGV 1" losses are whole psi (coarse). HY filter flow ranges are the span of their loss tables, and Senninger regulators have no loss tables.
  - AFB flood bubbler, ICV-301 and 1.5"/2" ICZ/IBZ kits are not included.
  - MP Side Strip at 55 psi: the catalog's GPH column is inconsistent with its GPM column; GPM was used.
  - hunterirrigation.com product pages returned HTTP 403; data was taken from PDFs on redesign.hunterindustries.com.
- **Water sources:**
  - The EU meter presets (DN15/DN20) take Q3 and the 0.63 bar loss at Q3 from a Diehl datasheet. Loss rows below Q3 are derived (∝Q²), and "usable flow = 75% of Q3" applies the Rain Bird 75% rule to Q3, which is an assumption.
  - Mains pressure 1.5–6 bar is the Budapest Waterworks contractual service-point band.
  - The well preset is a 30/50 psi pressure-switch band plus a nominal 3 m³/h pump.
  - All presets are starting points; measure the actual static pressure and flow.
- **Units:** metric catalogs were not used. All values were converted from US tables, so pressures sit on psi steps (1.03, 1.38, 1.72, 2.07 … bar).
