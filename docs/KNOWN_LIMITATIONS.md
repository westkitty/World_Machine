# Known limitations

## Simplifications (by design)

- **Resolution.** 642 regions of ≈ 790,000 km² each; a “settlement” is a regional
  community, not a town. Coastlines and biome borders are smoothed for display, so near a
  coast the drawn shoreline can differ slightly from the cell’s land/sea classification; the
  inspector always reports the simulated cell.
- **Climate** is rule-based (zonal bands, prevailing-wind moisture advection, orographic
  lift, seasonal sinusoids). There is no atmospheric or ocean circulation and climate does
  not change in response to civilisation, except through scenario events and crises.
- **Economy** has no money or prices. Trade is cooperative redistribution: settlements ship
  surplus above their reserve to partners below 1.5× theirs, and specialise by comparative
  advantage. Energy is a local grid flow and is never stored or traded.
- **Society** is aggregate: values (growth, conservation, openness), relations
  (cooperation/competition with reasons), specialisation labels, autonomous building and
  agreements. There are no individual agents, no warfare and no scripted political stages;
  hostility manifests as trade friction and embargo.
- **Territory** grows from 7 to at most 13 regions by population; borders do not shift by
  conflict.
- **Crises** are a fixed set (drought, blight, epidemic, wildfire, mine collapse, famine) with
  one or two responses each.
- **Technology** is a flat list of nine independent techs, not a tree.

## Gaps and unverified behaviour

- **Frame-rate targets unverified.** No FPS measurements were possible (hidden browser pane);
  see `docs/VALIDATION.md` for CPU-side timings. No mobile-device testing.
- **Automated browser tests active (P007/CP09).** Automated real-browser journeys are verified via Playwright (`bun run test:e2e`) across Desktop Chromium and mobile touch (Pixel 7 emulation), testing boot/start, tab navigation, clock controls, strategy comparison with fork semantics, overwrite protections, and scenario constraints.
- **Audio** was never listened to; it is restrained procedural synthesis, not composed music.
- **Export/Import** through real native OS file dialogs, Firefox and Safari were not exercised.
- **WebGL context-loss recovery active (P077/CP19).** WebGL context loss and recovery are verified across Desktop Chromium and Pixel 7 mobile touch emulation via Playwright (`tests/e2e/journeys.spec.ts`, Journey 10), preserving simulation continuity, camera orientation, and active selection with zero shader errors or resource duplication.
- **Camera bookmarks** store on first click (empty slot) or Shift-click; there is no visible
  indicator of which slots are filled.
- **Bloom cost.** Bloom adds ~15 draw calls of full-screen passes on Medium/High. The
  adaptive governor disables it if frames stay above 30 ms, but this was not exercised on a
  real slow device.
- **Studio lighting** is a presentation choice: the key light follows the camera, so the
  rendered terminator does not represent planetary time of day. Choose *Orbital* in
  Settings for a physical day/night cycle (season-aware declination).
- **No screen shake or hit-stop.** Deliberately omitted for a slow strategic globe (motion
  comfort); emphasis comes from ripples, particles, bloom, sound and toasts instead.
- **Nonblocking strategy comparison active (P006/CP18).** Clone and forecast processing run in a background Web Worker (`forecast.worker.ts`) with live progress reporting, in-flight cancellation, and automatic staleness detection.
- **Balance.** Scenario thresholds were tuned against scripted strategies; human players may
  find some easier or harder. The reference sandbox world tends toward abundance in its
  first decades; scarcity arrives through growth, soil exhaustion, crises and policy.
- **Sandbox Unrestricted** is toggled by writing a rules flag directly from the UI rather
  than through the command layer.
- **Bundle size** is 816 kB (224 kB gzip) in one chunk; it could be split.

## Follow-up recommendations

1. Add a Playwright suite: start each mode, found/build/route via clicks, save → load,
   touch gestures on a mobile profile, and an FPS sampling run with the pane visible.
2. Measure frame rates on a mainstream laptop, an iPhone and a mid-range Android device;
   tune quality presets from data.
3. Move strategy comparison into a Web Worker (the simulation is already DOM-free).
4. Sample real FPS with the pane visible and on phones; tune bloom resolution per preset.
5. Playtest scenarios with people and retune thresholds.
