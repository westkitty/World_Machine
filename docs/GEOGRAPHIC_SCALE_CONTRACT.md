# The World Machine — Geographic Scale Contract

**Proposal:** P061 · **Phase:** F0 (Foundation) · **Authority:** `src/sim/scale.ts`

## 1. Overview and Purpose

*The World Machine* simulates an entire Earth-sized rocky planet populated by emerging regional civilizations. This document establishes the authoritative geographic scale contract governing the spatial abstraction, measurement units, simulation formulas, user-interface inspectors, and 3D globe presentation.

A common failure mode in planetary simulations is scale ambiguity—confusing a "settlement" with a single town, a "building" with an individual house, or a "region" with a local farm. Under this contract, every spatial mechanic has a clearly defined physical scale, unit symbol, and visual correspondence.

---

## 2. The 642-Cell Spherical Planetary Abstraction

The simulated planet is an Earth-sized sphere with a physical volumetric radius of $R = 6,371\text{ km}$.

The globe is partitioned into **642 discrete regions** formed as the Voronoi dual cells of an icosahedron subdivided three times ($N = 642$ cells total: exactly 12 pentagons and 630 hexagons).

| Planetary Parameter | Mathematical Formulation | Metric Value | Comparative Reference |
|---|---|---|---|
| **Radius ($R$)** | Mean volumetric radius | $6,371\text{ km}$ | Earth |
| **Surface Area ($A$)** | $4\pi R^2$ | $510,064,472\text{ km}^2$ | Earth total surface |
| **Circumference ($C$)** | $2\pi R$ | $40,030\text{ km}$ | Earth equator |
| **Cell Count ($N$)** | Geodesic dual partition | $642\text{ cells}$ | Discrete simulation regions |
| **Mean Cell Area** | $A / 642$ | $\approx 794,493\text{ km}^2$ | Approx. size of Chile, Turkey, or Mozambique |
| **Mean Cell Diameter** | $2\sqrt{A / (642\pi)}$ | $\approx 1,006\text{ km}$ | Distance from Paris to Milan |
| **Mean Neighbor Spacing** | Great-circle center-to-center | $\approx 926\text{ km}$ | Inter-regional journey distance |
| **Globe 3D Unit** | Three.js coordinate scale | $1.0\text{ unit} = 6,371\text{ km}$ | Unit sphere coordinate space |

---

## 3. Spatial Units Dictionary

Every simulation mechanic, ledger quantity, and visual element maps to a named unit in `SPATIAL_UNITS` (`src/sim/scale.ts`):

1. **Distance (`km`)**: Great-circle surface distance across the sphere calculated via spherical trigonometry (`greatCircleKm`).
2. **Land Area (`km²`)**: Exact spherical-polygon surface area on the globe computed via solid angles of the Voronoi vertices.
3. **Elevation (`m`)**: Vertical relief above or below mean planetary sea level (datum 0 m). Ranges from $-5,840\text{ m}$ in deep oceanic trenches to $+5,600\text{ m}$ in alpine massifs.
4. **Geographic Region (`reg`)**: Discrete cell spanning $\approx 790,000\text{ km}^2$, possessing homogeneous underlying biome, elevation, climate, and soil properties.
5. **Regional Community (`comm`)**: A civilization settlement governing a core region and up to 12 contiguous frontier territories. Populations range from 400 to 20,000+ citizens; a settlement represents an organized regional society, not an isolated village.
6. **Regional Complex (`cpx`)**: Landscape-scale infrastructure installations (e.g. extensive agricultural basins, industrial mining districts, power grids, or port complexes). Each 790,000 km² region hosts at most 2 complexes.
7. **Inter-regional Highway (`road`)**: Engineered transit corridor linking adjacent region centers ($\sim 926\text{ km}$ average length). Construction and upkeep costs are scaled per 1,000 km.
8. **Trade Corridor (`corridor`)**: Active bilateral transport routes over land highways or sea lanes with monthly throughput and travel time.
9. **Precipitation (`mm/mo`)**: Liquid-water equivalent depth of monthly rainfall and snowfall.
10. **Temperature (`°C`)**: Monthly mean surface air temperature, calculated with latitude insolation and an environmental lapse rate of $-6.5^\circ\text{C}$ per $1,000\text{ m}$ elevation.
11. **Biomass Stock (`B`)**: Standing ecological vegetation and harvestable timber/biomass, scaled relative to regional land area fraction.
12. **Freshwater Stock (`W`)**: Accessible regional surface and groundwater reserves, renewed monthly by precipitation and watershed runoff.
13. **Ore Deposit (`O`)**: Finite geological mineral reserves concentrated primarily in upland and mountain massifs.
14. **Visual Projection (`gu`)**: Normalized 3D Cartesian coordinates on the Three.js unit sphere where $1.0\text{ unit} = 6,371\text{ km}$.

---

## 4. Geographic Classification Contract

Cells are partitioned into five mutually exclusive geographic categories via `classifyCellGeography(...)`:

- **Inland Region (`inland`)**: Continental interior land cell where 100% of adjacent neighbors are also land (0 sea neighbors).
- **Coastal Region (`coastal`)**: Continental maritime boundary land cell bordering open ocean or shelf waters on a landmass with $> 2$ cells.
- **Island Region (`island`)**: Insular land cell belonging to an isolated small landmass ($\le 2$ cells total) bordered predominantly or completely by the sea.
- **Continental Shelf (`shelf`)**: Shallow marine waters (depth $< 300\text{ m}$ or immediately adjacent to land), providing rich marine fisheries.
- **Open Ocean (`ocean`)**: Deep pelagic ocean basin separating continental landmasses.

---

## 5. Representative Scale Examples in TERRA-1

In the canonical reference world `TERRA-1`, the geographic classification produces three verified representative reference topologies:

### A. Inland Reference (Region 11)
- **Classification:** Inland region
- **Landmass:** Major continent ($> 5$ connected cells)
- **Sea Neighbors:** 0 of 6 neighbors
- **Area:** $\approx 782,100\text{ km}^2$ ($98\%$ of mean region)
- **Role:** Deep continental breadbasket/mining heartland; completely insulated from naval trade and sea storms.

### B. Coastal Reference (Region 2)
- **Classification:** Coastal region
- **Landmass:** Major continent ($> 5$ connected cells)
- **Sea Neighbors:** 3 of 6 neighbors
- **Area:** $\approx 814,200\text{ km}^2$ ($102\%$ of mean region)
- **Role:** Continental port hub; connects overland highways with overseas shipping corridors.

### C. Island Reference (Region 14)
- **Classification:** Island region
- **Landmass:** Isolated insular landmass ($\le 2$ connected cells)
- **Sea Neighbors:** 5 of 6 neighbors
- **Area:** $\approx 773,900\text{ km}^2$ ($97\%$ of mean region)
- **Role:** Maritime outpost; relies exclusively on seafaring routes for inter-community trade.

---

## 6. Implementation & Verification Mapping

- **Simulation Scale Logic:** `src/sim/scale.ts`
- **UI Inspectors:** `src/ui/panels.ts` (`regionPanel` displays geographic classification, area in $\text{km}^2$ and $\%$ of mean region, and regional complexes capacity)
- **Automated Verification:** `tests/scale.test.ts` (verifies unit definitions, $4\pi R^2$ conservation, classification invariants, and TERRA-1 representative cases)
