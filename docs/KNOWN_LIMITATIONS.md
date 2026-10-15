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
- **No automated browser tests.** Playwright was not available; browser behaviour was checked
  manually. A Playwright suite for the critical journeys is the recommended next addition.
- **Audio** was never listened to; it is restrained procedural synthesis, not composed music.
- **Export/Import** through real file dialogs, **WebGL context loss/restore**, Firefox and
  Safari were not exercised.
- **Camera bookmarks** store on first click (empty slot) or Shift-click; there is no visible
  indicator of which slots are filled.
- **Line width.** Trade routes, roads and migration arcs use 1-pixel WebGL lines; on high-DPI
  screens they are thin.
- **Comparison runs synchronously** on the main thread: a 10-year comparison briefly blocks
  the UI (≈ 1 s on a fast laptop with ~20 settlements).
- **Balance.** Scenario thresholds were tuned against scripted strategies; human players may
  find some easier or harder. The reference sandbox world tends toward abundance in its
  first decades; scarcity arrives through growth, soil exhaustion, crises and policy.
- **Sandbox Unrestricted** is toggled by writing a rules flag directly from the UI rather
  than through the command layer.
- **Bundle size** is 739 kB (204 kB gzip) in one chunk; it could be split.

## Follow-up recommendations

1. Add a Playwright suite: start each mode, found/build/route via clicks, save → load,
   touch gestures on a mobile profile, and an FPS sampling run with the pane visible.
2. Measure frame rates on a mainstream laptop, an iPhone and a mid-range Android device;
   tune quality presets from data.
3. Move strategy comparison into a Web Worker (the simulation is already DOM-free).
4. Render routes as screen-space ribbons for legibility on high-DPI displays.
5. Playtest scenarios with people and retune thresholds.
