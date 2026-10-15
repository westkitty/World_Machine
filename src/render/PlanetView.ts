import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { Noise3 } from '../sim/noise';
import { Rng, seedRng } from '../sim/rng';
import { solarDeclination } from '../sim/systems/climate';
import { getTopology, nearestCell, type Vec3 } from '../sim/topology';
import type { BuildingType, WorldState } from '../sim/types';
import { EffectsLayer } from './effects';
import { buildPlanetMesh, paintLights, paintPlanet, type PlanetMeshData } from './planetMesh';
import {
  atmosphereFragment, atmosphereVertex, cloudFragment, cloudVertex, glowFragment, glowVertex,
  oceanFragment, oceanVertex, planetFragment, planetVertex, skyFragment, skyVertex, starFragment, starVertex,
} from './shaders';

export type Quality = 'low' | 'medium' | 'high';
export type Lighting = 'studio' | 'orbital';

export interface ViewOptions {
  quality: Quality;
  reducedMotion: boolean;
  reducedEffects: boolean;
  lighting?: Lighting;
}

const QUALITY = {
  low: { level: 5, pixelRatio: 1, clouds: false, stars: 900, bloom: false, waves: 0, sky: false },
  medium: { level: 5, pixelRatio: 1.5, clouds: true, stars: 1800, bloom: true, waves: 1, sky: true },
  high: { level: 6, pixelRatio: 2, clouds: true, stars: 3200, bloom: true, waves: 1, sky: true },
} as const;

const BUILDING_COLORS: Record<BuildingType, number> = {
  farm: 0xc9d36a, mine: 0xd0764a, storage: 0xd9b56a, energy: 0x6fd1e0, port: 0x7aa6ff,
};
const GOOD_COLORS: Record<string, [number, number, number]> = {
  food: [0.72, 0.9, 0.42], water: [0.44, 0.78, 1.0], timber: [0.85, 0.62, 0.36], ore: [1.0, 0.6, 0.36],
};
const MAX_SETTLEMENTS = 64;
const MAX_BUILDINGS = 320;
const MAX_SHIPMENTS = 600;
const HAZE = new THREE.Color(0.32, 0.52, 0.95);

interface RoutePolyline {
  routeId: number;
  points: THREE.Vector3[];
  cumulative: number[];
}

/** Event kinds the view knows how to celebrate or warn about. */
export type FxKind = 'founded' | 'built' | 'construction' | 'ruined' | 'crisis' | 'agreement' | 'tech' | 'relief' | 'success' | 'failure' | 'abandoned' | 'invalid' | 'reserve' | 'migrant';

/**
 * Owns every Three.js object. The simulation never touches this class; the
 * App pushes state in via `syncWorld` (new world), `syncTick` (after a tick)
 * and `frame` (each animation frame). All GPU resources it creates are
 * disposed in `dispose` or when replaced.
 */
export class PlanetView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private planet: THREE.Mesh | null = null;
  planetData: PlanetMeshData | null = null;
  private planetMat: THREE.ShaderMaterial;
  private ocean: THREE.Mesh;
  private oceanMat: THREE.ShaderMaterial;
  private atmosphere: THREE.Mesh;
  atmosphereMat: THREE.ShaderMaterial;
  clouds: THREE.Mesh | null = null;
  private cloudTexture: THREE.Texture | null = null;
  private wetTexture: THREE.DataTexture;
  private sky: THREE.Mesh | null = null;
  private stars: THREE.Points | null = null;
  private starMat: THREE.ShaderMaterial | null = null;
  private sunLight = new THREE.DirectionalLight(0xfff1dc, 2.4);
  private fillLight = new THREE.HemisphereLight(0x8fb4ff, 0x20160c, 0.35);
  private settlementMesh: THREE.InstancedMesh;
  private beacons: THREE.Points;
  private beaconGeo: THREE.BufferGeometry;
  private glowMat: THREE.ShaderMaterial;
  private beaconBase: { size: number; color: THREE.Color; phase: number; cell: number }[] = [];
  private buildingMeshes = new Map<BuildingType, THREE.InstancedMesh>();
  private roads: LineSegments2;
  private routesActive: LineSegments2;
  private routesBlocked: LineSegments2;
  private migrations: LineSegments2;
  private crisisZones: LineSegments2;
  private routeMat: LineMaterial;
  private migrationMat: LineMaterial;
  private zoneMat: LineMaterial;
  private lineMats: LineMaterial[] = [];
  private shipments: THREE.Points;
  private shipGeo: THREE.BufferGeometry;
  private selection: Line2;
  private hover: Line2;
  private selMat: LineMaterial;
  private hoverMat: LineMaterial;
  readonly effects = new EffectsLayer();
  private polylines = new Map<number, RoutePolyline>();
  private routeSignature = '';
  sunAngle = 0.6;
  private sunDir = new THREE.Vector3(1, 0.2, 0.4).normalize();
  private focusAnim: { from: THREE.Vector3; to: THREE.Vector3; fromD: number; toD: number; t: number } | null = null;
  private seed = '';
  private lastPick = 0;
  private dummy = new THREE.Object3D();
  private time = 0;
  private cloudRot = 0;
  private lastInput = 0;
  private insets = { left: 0, right: 0, top: 0, bottom: 0 };
  private offset = new THREE.Vector2();
  private size = new THREE.Vector2(1, 1);
  private frameEma = 16;
  private slowFor = 0;
  private degraded = false;
  private crisisPulseTimer = 0;
  private crisisCells: { cell: number; color: number }[] = [];
  private celebrated = new WeakSet<object>();
  overlay = 'terrain';
  showBorders = true;
  selectedCell = -1;
  options: ViewOptions;
  contextLost = false;
  /** True while a menu is open over the planet: allows a slow cinematic drift. */
  cinematic = false;
  onContextChange: (lost: boolean) => void = () => {};
  onAdaptiveQuality: (message: string) => void = () => {};

  constructor(private container: HTMLElement, options: ViewOptions) {
    this.options = options;
    this.renderer = new THREE.WebGLRenderer({ antialias: options.quality !== 'low', powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    // Count draw calls across all composer passes in a frame.
    this.renderer.info.autoReset = false;
    this.renderer.setClearColor(0x02040a, 1);
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.setAttribute('aria-label', 'Planet view: drag to rotate, scroll or pinch to zoom, click or tap a region to select it');
    this.renderer.domElement.setAttribute('role', 'application');
    this.renderer.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.contextLost = true; this.onContextChange(true); });
    this.renderer.domElement.addEventListener('webglcontextrestored', () => { this.contextLost = false; this.onContextChange(false); });

    this.camera = new THREE.PerspectiveCamera(36, 1, 0.01, 200);
    this.camera.position.set(0.9, 1.1, 3.6);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.075;
    this.controls.enablePan = false;
    this.controls.minDistance = 1.28;
    this.controls.maxDistance = 6.5;
    this.controls.minPolarAngle = 0.08;
    this.controls.maxPolarAngle = Math.PI - 0.08;
    this.controls.zoomSpeed = 0.7;
    this.controls.rotateSpeed = 0.5;
    this.controls.autoRotateSpeed = 0.35;
    this.controls.addEventListener('start', () => { this.focusAnim = null; this.noteInput(); });

    this.scene.add(this.sunLight, this.sunLight.target, this.fillLight);
    const haze = { value: HAZE.clone() };
    this.wetTexture = new THREE.DataTexture(new Uint8Array(128 * 64 * 4).fill(128), 128, 64, THREE.RGBAFormat);
    this.wetTexture.magFilter = THREE.LinearFilter;
    this.wetTexture.wrapS = THREE.RepeatWrapping;
    this.wetTexture.needsUpdate = true;
    this.planetMat = new THREE.ShaderMaterial({
      vertexShader: planetVertex, fragmentShader: planetFragment,
      uniforms: {
        sunDir: { value: this.sunDir.clone() }, ambient: { value: 0.08 }, nightLights: { value: 1 }, overlayMode: { value: 0 },
        time: { value: 0 }, cloudMap: { value: null }, cloudRot: { value: 0 }, cloudShadow: { value: 0 }, hazeColor: haze,
      },
    });
    this.oceanMat = new THREE.ShaderMaterial({
      vertexShader: oceanVertex, fragmentShader: oceanFragment, transparent: true, depthWrite: false,
      uniforms: {
        sunDir: { value: this.sunDir.clone() }, deep: { value: new THREE.Color(0x041a36) }, shallow: { value: new THREE.Color(0x1f6f9c) },
        time: { value: 0 }, overlayMode: { value: 0 }, waves: { value: 1 }, hazeColor: haze,
      },
    });
    this.ocean = new THREE.Mesh(new THREE.IcosahedronGeometry(1.0, 48), this.oceanMat);
    this.ocean.renderOrder = 2;
    this.scene.add(this.ocean);
    this.atmosphereMat = new THREE.ShaderMaterial({
      vertexShader: atmosphereVertex, fragmentShader: atmosphereFragment, side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { sunDir: { value: this.sunDir.clone() }, strength: { value: 1 }, planetRadius: { value: 1.0 } },
    });
    this.atmosphere = new THREE.Mesh(new THREE.IcosahedronGeometry(1.16, 24), this.atmosphereMat);
    this.atmosphere.renderOrder = 7;
    this.scene.add(this.atmosphere);

    // Settlement towers: lit hexagonal prisms, plus additive beacon glows.
    this.settlementMesh = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.72, 1, 1, 6).translate(0, 0.5, 0),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, metalness: 0.35, emissive: 0x3a2a10, emissiveIntensity: 0.6 }),
      MAX_SETTLEMENTS,
    );
    this.settlementMesh.count = 0;
    this.settlementMesh.renderOrder = 4;
    this.scene.add(this.settlementMesh);
    this.glowMat = new THREE.ShaderMaterial({
      vertexShader: glowVertex, fragmentShader: glowFragment, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { pixelScale: { value: 300 } },
    });
    this.beaconGeo = new THREE.BufferGeometry();
    this.beaconGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_SETTLEMENTS * 3), 3));
    this.beaconGeo.setAttribute('size', new THREE.BufferAttribute(new Float32Array(MAX_SETTLEMENTS), 1));
    this.beaconGeo.setAttribute('tint', new THREE.BufferAttribute(new Float32Array(MAX_SETTLEMENTS * 4), 4));
    this.beaconGeo.setDrawRange(0, 0);
    this.beacons = new THREE.Points(this.beaconGeo, this.glowMat);
    this.beacons.frustumCulled = false;
    this.beacons.renderOrder = 6;
    this.scene.add(this.beacons);

    const bGeo: Record<BuildingType, THREE.BufferGeometry> = {
      farm: new THREE.BoxGeometry(1.2, 0.3, 1.2).translate(0, 0.15, 0),
      mine: new THREE.ConeGeometry(0.62, 1.15, 4).translate(0, 0.57, 0),
      storage: new THREE.CylinderGeometry(0.5, 0.55, 0.8, 8).translate(0, 0.4, 0),
      energy: new THREE.CylinderGeometry(0.3, 0.45, 1.5, 10).translate(0, 0.75, 0),
      port: new THREE.OctahedronGeometry(0.62).translate(0, 0.55, 0),
    };
    for (const t of Object.keys(bGeo) as BuildingType[]) {
      const m = new THREE.InstancedMesh(bGeo[t], new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.15, emissive: BUILDING_COLORS[t], emissiveIntensity: 0.12 }), MAX_BUILDINGS);
      m.count = 0;
      m.renderOrder = 4;
      this.buildingMeshes.set(t, m);
      this.scene.add(m);
    }

    const lineMat = (o: ConstructorParameters<typeof LineMaterial>[0]) => {
      const m = new LineMaterial({ transparent: true, depthWrite: false, ...o });
      this.lineMats.push(m);
      return m;
    };
    this.roads = new LineSegments2(new LineSegmentsGeometry(), lineMat({ color: 0xf0d49a, linewidth: 1.6, opacity: 0.8 }));
    this.roads.renderOrder = 3;
    this.routeMat = lineMat({ vertexColors: true, linewidth: 2.6, dashed: true, dashSize: 0.028, gapSize: 0.014, blending: THREE.AdditiveBlending });
    this.routesActive = new LineSegments2(new LineSegmentsGeometry(), this.routeMat);
    this.routesBlocked = new LineSegments2(new LineSegmentsGeometry(), lineMat({ color: 0xe0574a, linewidth: 1.8, opacity: 0.75, dashed: true, dashSize: 0.008, gapSize: 0.012 }));
    this.migrationMat = lineMat({ vertexColors: true, linewidth: 2.2, dashed: true, dashSize: 0.02, gapSize: 0.03, blending: THREE.AdditiveBlending });
    this.migrations = new LineSegments2(new LineSegmentsGeometry(), this.migrationMat);
    this.zoneMat = lineMat({ color: 0xff9a4a, linewidth: 1.8, opacity: 0.8, dashed: true, dashSize: 0.03, gapSize: 0.02, blending: THREE.AdditiveBlending });
    this.crisisZones = new LineSegments2(new LineSegmentsGeometry(), this.zoneMat);
    for (const l of [this.routesActive, this.routesBlocked, this.migrations, this.crisisZones]) { l.renderOrder = 5; l.frustumCulled = false; }
    this.roads.frustumCulled = false;
    this.scene.add(this.roads, this.routesActive, this.routesBlocked, this.migrations, this.crisisZones);

    this.shipGeo = new THREE.BufferGeometry();
    this.shipGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_SHIPMENTS * 3), 3));
    this.shipGeo.setAttribute('size', new THREE.BufferAttribute(new Float32Array(MAX_SHIPMENTS), 1));
    this.shipGeo.setAttribute('tint', new THREE.BufferAttribute(new Float32Array(MAX_SHIPMENTS * 4), 4));
    this.shipGeo.setDrawRange(0, 0);
    this.shipments = new THREE.Points(this.shipGeo, this.glowMat);
    this.shipments.frustumCulled = false;
    this.shipments.renderOrder = 6;
    this.scene.add(this.shipments);

    this.selMat = lineMat({ color: 0xffe3a0, linewidth: 2.6, depthTest: false });
    this.hoverMat = lineMat({ color: 0xffffff, linewidth: 1.6, opacity: 0.6, depthTest: false });
    this.selection = new Line2(new LineGeometry(), this.selMat);
    this.hover = new Line2(new LineGeometry(), this.hoverMat);
    this.selection.renderOrder = 10;
    this.hover.renderOrder = 9;
    this.selection.visible = false;
    this.hover.visible = false;
    this.scene.add(this.selection, this.hover, this.effects.group);

    this.applyQuality();
    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
  }

  noteInput(): void {
    this.lastInput = this.time;
    this.controls.autoRotate = false;
  }

  /** UI chrome covering the canvas; the planet is framed in the remaining space. */
  setInsets(insets: { left: number; right: number; top: number; bottom: number }): void {
    this.insets = insets;
  }

  // ---------------------------------------------------------------- world sync

  /** Build (or rebuild) everything that depends on the world's geometry. */
  syncWorld(state: WorldState, force = false): void {
    const key = state.seed + JSON.stringify(state.params) + QUALITY[this.options.quality].level;
    if (!force && this.planet && this.seed === key) {
      this.syncTick(state);
      return;
    }
    this.seed = key;
    if (this.planet) {
      this.scene.remove(this.planet);
      this.planet.geometry.dispose();
    }
    this.planetData = buildPlanetMesh(state, QUALITY[this.options.quality].level);
    this.planet = new THREE.Mesh(this.planetData.geometry, this.planetMat);
    this.planet.renderOrder = 1;
    this.scene.add(this.planet);
    this.buildClouds(state.seed);
    this.routeSignature = '';
    this.effects.clear();
    this.syncTick(state);
  }

  /** Update every state-derived layer after a simulation tick. */
  syncTick(state: WorldState): void {
    if (!this.planetData) return;
    paintPlanet(state, this.planetData, { overlay: this.overlay, showBorders: this.showBorders, selected: this.selectedCell });
    paintLights(state, this.planetData);
    this.setOverlayUniforms();
    this.updateWetMap(state);
    this.updateSettlements(state);
    this.updateBuildings(state);
    this.updateRoads(state);
    this.updateRoutes(state);
    this.updateMigrations(state);
    this.updateCrises(state);
  }

  setOverlay(id: string, state: WorldState): void {
    this.overlay = id;
    if (!this.planetData) return;
    paintPlanet(state, this.planetData, { overlay: id, showBorders: this.showBorders, selected: this.selectedCell });
    this.setOverlayUniforms();
  }

  private setOverlayUniforms(): void {
    const mode = this.overlay === 'terrain' ? 0 : 1;
    this.planetMat.uniforms.overlayMode.value = mode;
    this.oceanMat.uniforms.overlayMode.value = mode;
    if (this.clouds) (this.clouds.material as THREE.ShaderMaterial).uniforms.overlayMode.value = mode;
  }

  private surface(cell: number, lift = 0.004): THREE.Vector3 {
    const c = getTopology().centers[cell];
    const r = Math.max(1, this.planetData?.radiusOfCell[cell] ?? 1) + lift;
    return new THREE.Vector3(c[0] * r, c[1] * r, c[2] * r);
  }

  private orient(pos: THREE.Vector3, scale: number, height: number): void {
    this.dummy.position.copy(pos);
    this.dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), pos.clone().normalize());
    this.dummy.scale.set(scale, height, scale);
    this.dummy.updateMatrix();
  }

  /** Live precipitation → cloud cover: dry regions clear, wet regions and the tropics overcast. */
  private updateWetMap(state: WorldState): void {
    const topo = getTopology();
    const data = this.wetTexture.image.data as Uint8Array;
    const w = 128, h = 64;
    let hint = 0;
    for (let y = 0; y < h; y++) {
      const lat = ((y + 0.5) / h - 0.5) * Math.PI;
      for (let x = 0; x < w; x++) {
        const lon = ((x + 0.5) / w - 0.5) * Math.PI * 2;
        const v: Vec3 = [Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)];
        hint = nearestCell(topo, v, hint);
        const c = state.cells[hint];
        const wet = Math.max(0, Math.min(1, c.precip / 220 - c.drought * 0.6));
        data[(y * w + x) * 4] = Math.round(wet * 255);
      }
    }
    this.wetTexture.needsUpdate = true;
  }

  private updateSettlements(state: WorldState): void {
    const live = state.settlements.filter((s) => s.alive).slice(0, MAX_SETTLEMENTS);
    const color = new THREE.Color();
    this.beaconBase = [];
    const bpos = this.beaconGeo.getAttribute('position') as THREE.BufferAttribute;
    live.forEach((s, i) => {
      const size = 0.007 + 0.012 * Math.min(1, Math.sqrt(s.population / 25000));
      const height = 0.012 + 0.05 * Math.min(1, Math.log10(1 + s.population / 300) / 2.2);
      this.orient(this.surface(s.cellId, 0.0005), size, height);
      this.settlementMesh.setMatrixAt(i, this.dummy.matrix);
      // Status colour (always paired with text labels/icons in the UI).
      if (s.wellbeing > 0.7) color.set(0xffd98a); else if (s.wellbeing > 0.45) color.set(0xf0a050); else color.set(0xe0574a);
      this.settlementMesh.setColorAt(i, color);
      const top = this.surface(s.cellId, height + 0.004);
      bpos.setXYZ(i, top.x, top.y, top.z);
      this.beaconBase.push({ size: 10 + 22 * Math.min(1, Math.sqrt(s.population / 20000)), color: color.clone(), phase: (s.id * 1.618) % (Math.PI * 2), cell: s.cellId });
    });
    this.settlementMesh.count = live.length;
    this.settlementMesh.instanceMatrix.needsUpdate = true;
    if (this.settlementMesh.instanceColor) this.settlementMesh.instanceColor.needsUpdate = true;
    this.beaconGeo.setDrawRange(0, live.length);
    bpos.needsUpdate = true;
  }

  private updateBuildings(state: WorldState): void {
    const topo = getTopology();
    const slots = new Map<number, number>();
    const counts = new Map<BuildingType, number>();
    for (const b of state.buildings) {
      const mesh = this.buildingMeshes.get(b.type)!;
      const k = counts.get(b.type) ?? 0;
      if (k >= MAX_BUILDINGS) continue;
      const slot = slots.get(b.cellId) ?? 0;
      slots.set(b.cellId, slot + 1);
      // Spread structures around the cell centre toward its corners.
      const corners = topo.corners[b.cellId];
      const corner = corners[(slot * 2 + 1) % corners.length];
      const c = topo.centers[b.cellId];
      const t = 0.36;
      const v = new THREE.Vector3(c[0] + (corner[0] - c[0]) * t, c[1] + (corner[1] - c[1]) * t, c[2] + (corner[2] - c[2]) * t).normalize();
      v.multiplyScalar(Math.max(1, this.planetData?.radiusOfCell[b.cellId] ?? 1) + 0.0015);
      const scale = b.status === 'construction' ? 0.0045 : 0.0068;
      this.orient(v, scale, scale * (b.status === 'construction' ? 0.55 : 1.4));
      mesh.setMatrixAt(k, this.dummy.matrix);
      const col = new THREE.Color(BUILDING_COLORS[b.type]).multiplyScalar(b.status === 'construction' ? 0.45 : 0.45 + 0.55 * b.condition);
      mesh.setColorAt(k, col);
      counts.set(b.type, k + 1);
    }
    for (const [t, mesh] of this.buildingMeshes) {
      mesh.count = counts.get(t) ?? 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  private arc(a: THREE.Vector3, b: THREE.Vector3, segments: number, lift = 0, raise = 0): THREE.Vector3[] {
    const out: THREE.Vector3[] = [];
    const ra = a.length(), rb = b.length();
    const ua = a.clone().normalize(), ub = b.clone().normalize();
    const omega = Math.acos(Math.max(-1, Math.min(1, ua.dot(ub))));
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      let p: THREE.Vector3;
      if (omega < 1e-6) p = ua.clone();
      else {
        const s = Math.sin(omega);
        p = ua.clone().multiplyScalar(Math.sin((1 - t) * omega) / s).add(ub.clone().multiplyScalar(Math.sin(t * omega) / s));
      }
      p.multiplyScalar(ra + (rb - ra) * t + lift + raise * Math.sin(Math.PI * t));
      out.push(p);
    }
    return out;
  }

  private setSegments(line: LineSegments2, positions: number[], colors?: number[]): void {
    const old = line.geometry;
    const g = new LineSegmentsGeometry();
    if (positions.length) {
      g.setPositions(positions);
      if (colors) g.setColors(colors);
    }
    line.geometry = g;
    if (positions.length) line.computeLineDistances();
    line.visible = positions.length > 0;
    old.dispose();
  }

  private updateRoads(state: WorldState): void {
    const pts: number[] = [];
    for (const r of state.roads) {
      const seg = this.arc(this.surface(r.a, 0.0025), this.surface(r.b, 0.0025), 6);
      for (let i = 1; i < seg.length; i++) pts.push(seg[i - 1].x, seg[i - 1].y, seg[i - 1].z, seg[i].x, seg[i].y, seg[i].z);
    }
    this.setSegments(this.roads, pts);
  }

  private updateRoutes(state: WorldState): void {
    const signature = state.routes.map((r) => `${r.id}:${r.path.join('.')}`).join('|');
    if (signature !== this.routeSignature) {
      this.routeSignature = signature;
      this.polylines.clear();
      for (const r of state.routes) {
        const points: THREE.Vector3[] = [];
        for (let i = 0; i < r.path.length; i++) {
          const lift = r.mode === 'sea' ? 0.005 : 0.008;
          const p = this.surface(r.path[i], lift);
          if (!state.cells[r.path[i]].land) p.normalize().multiplyScalar(1 + lift);
          if (i === 0) { points.push(p); continue; }
          const seg = this.arc(points[points.length - 1], p, 5);
          for (let k = 1; k < seg.length; k++) points.push(seg[k]);
        }
        const cumulative = [0];
        for (let i = 1; i < points.length; i++) cumulative.push(cumulative[i - 1] + points[i].distanceTo(points[i - 1]));
        this.polylines.set(r.id, { routeId: r.id, points, cumulative });
      }
    }
    const act: number[] = [], actCol: number[] = [], blk: number[] = [];
    for (const r of state.routes) {
      const pl = this.polylines.get(r.id);
      if (!pl) continue;
      const util = r.capacity > 0 ? Math.min(1, r.movedLastTick / r.capacity) : 0;
      const recent = r.deliveredHistory.slice(-3).some((v) => v > 0);
      const base = r.mode === 'sea' ? [0.42, 0.86, 1.0] : [1.0, 0.76, 0.38];
      const k = recent ? 0.38 + 0.42 * util : 0.22;
      const col = base.map((c) => c * k);
      for (let i = 1; i < pl.points.length; i++) {
        const a = pl.points[i - 1], b = pl.points[i];
        if (r.active) { act.push(a.x, a.y, a.z, b.x, b.y, b.z); actCol.push(...col, ...col); }
        else blk.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
    }
    this.setSegments(this.routesActive, act, actCol);
    this.setSegments(this.routesBlocked, blk);
  }

  private updateMigrations(state: WorldState): void {
    const pos: number[] = [], col: number[] = [];
    for (const m of state.migrations) {
      const age = state.tick - m.tick;
      if (age > 4) continue;
      const a = this.surface(m.fromCell, 0.004), b = this.surface(m.toCell, 0.004);
      const raise = 0.04 + 0.12 * a.clone().normalize().angleTo(b.clone().normalize());
      const pts = this.arc(a, b, 28, 0, raise);
      const k = (1 - age / 5) * Math.min(1, 0.35 + m.amount / 800);
      const c = (m.founding ? [0.55, 1.0, 0.62] : [0.82, 0.66, 1.0]).map((x) => x * k);
      for (let i = 1; i < pts.length; i++) {
        pos.push(pts[i - 1].x, pts[i - 1].y, pts[i - 1].z, pts[i].x, pts[i].y, pts[i].z);
        col.push(...c, ...c);
      }
      // A soft landing pulse for this month's arrivals.
      if (age === 0 && !this.celebrated.has(m)) { this.celebrated.add(m); this.effects.ripple(b, m.founding ? 0x8dffa0 : 0xc9a8ff, 0.035, 1.6); }
    }
    this.setSegments(this.migrations, pos, col);
  }

  /** Drought regions are outlined; other active crises pulse at their location. */
  private updateCrises(state: WorldState): void {
    const pos: number[] = [];
    this.crisisCells = [];
    const topo = getTopology();
    for (const cr of state.crises) {
      if (cr.resolved) continue;
      if (cr.type === 'drought' && cr.radiusKm < 20000) {
        const c = topo.centers[cr.cellId];
        const center = new THREE.Vector3(c[0], c[1], c[2]);
        const ang = cr.radiusKm / 6371;
        const t1 = new THREE.Vector3().crossVectors(center, Math.abs(center.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize();
        const t2 = new THREE.Vector3().crossVectors(center, t1);
        const N = 96;
        let prev: THREE.Vector3 | null = null;
        for (let i = 0; i <= N; i++) {
          const th = (i / N) * Math.PI * 2;
          const p = center.clone().multiplyScalar(Math.cos(ang)).add(t1.clone().multiplyScalar(Math.sin(ang) * Math.cos(th))).add(t2.clone().multiplyScalar(Math.sin(ang) * Math.sin(th))).normalize().multiplyScalar(1.012);
          if (prev) pos.push(prev.x, prev.y, prev.z, p.x, p.y, p.z);
          prev = p;
        }
      } else if (cr.type !== 'drought') {
        const color = cr.type === 'epidemic' ? 0xc28cff : cr.type === 'wildfire' ? 0xff7a2e : cr.type === 'famine' ? 0xffb347 : 0xff5a4a;
        this.crisisCells.push({ cell: cr.cellId, color });
      }
    }
    this.setSegments(this.crisisZones, pos);
  }

  private setOutline(line: Line2, cell: number): void {
    const old = line.geometry;
    const g = new LineGeometry();
    if (cell >= 0) {
      const corners = getTopology().corners[cell];
      const r = Math.max(1, this.planetData?.radiusOfCell[cell] ?? 1) + 0.006;
      const pts = corners.flatMap((c) => [c[0] * r, c[1] * r, c[2] * r]);
      pts.push(pts[0], pts[1], pts[2]);
      g.setPositions(pts);
    }
    line.geometry = g;
    line.visible = cell >= 0;
    if (cell >= 0) line.computeLineDistances();
    old.dispose();
  }

  setSelection(cell: number): void {
    const changed = cell !== this.selectedCell;
    this.selectedCell = cell;
    this.setOutline(this.selection, cell);
    if (changed && cell >= 0 && !this.options.reducedMotion) this.effects.ripple(this.surface(cell, 0), 0xffe3a0, 0.06, 0.9);
  }

  setHover(cell: number, valid: boolean | null): void {
    this.hoverMat.color.set(valid === null ? 0xffffff : valid ? 0x7dffb0 : 0xff7a6a);
    this.setOutline(this.hover, cell);
  }

  /** In-world feedback for simulation events and player actions, scaled to significance. */
  fx(kind: FxKind, cell: number): void {
    if (cell < 0 || !this.planetData) return;
    const p = this.surface(cell, 0);
    const calm = this.options.reducedMotion;
    const e = this.effects;
    switch (kind) {
      case 'founded':
        e.ripple(p, 0x8dffa0, 0.09, 1.8); e.ripple(p, 0xffe3a0, 0.05, 1.2, 0.25);
        if (!calm) e.burst(p, { count: 46, color: 0xb8ffb0, speed: 0.05, life: 1.6, size: 5, rise: 0.75, lift: 0.01 });
        break;
      case 'built':
        e.ripple(p, 0xffd98a, 0.04, 1.1);
        if (!calm) e.burst(p, { count: 14, color: 0xffe0a0, speed: 0.03, life: 0.9, size: 3.5, rise: 0.4 });
        break;
      case 'construction':
        e.ripple(p, 0xd9b56a, 0.03, 0.8);
        if (!calm) e.burst(p, { count: 10, color: 0xcfb58a, speed: 0.02, life: 0.8, size: 3, rise: 0.15 });
        break;
      case 'reserve':
        e.ripple(p, 0x3fd18a, 0.05, 1.4);
        if (!calm) e.burst(p, { count: 16, color: 0x7dffb0, speed: 0.018, life: 1.4, size: 3, rise: 0.6, lift: 0.006 });
        break;
      case 'ruined': case 'abandoned':
        e.ripple(p, 0x9a8a80, 0.06, 1.6);
        if (!calm) e.burst(p, { count: 24, color: 0x8a7a70, speed: 0.025, life: 1.8, size: 5, rise: 0.5, lift: 0.004 });
        break;
      case 'crisis':
        e.ripple(p, 0xff5a4a, 0.12, 2.2); e.ripple(p, 0xff8a4a, 0.07, 1.6, 0.35);
        if (!calm) e.burst(p, { count: 30, color: 0xff7a3a, speed: 0.03, life: 1.6, size: 4, rise: 0.65, lift: 0.006 });
        break;
      case 'agreement': case 'relief':
        e.ripple(p, 0x6fe0d0, 0.07, 1.5); e.ripple(p, 0x6fe0d0, 0.04, 1.2, 0.3);
        break;
      case 'tech':
        e.ripple(p, 0xa8d8ff, 0.08, 1.8);
        if (!calm) e.burst(p, { count: 20, color: 0xbfe6ff, speed: 0.025, life: 1.4, size: 3.5, rise: 0.85, lift: 0.01 });
        break;
      case 'success':
        e.ripple(p, 0xffe3a0, 0.14, 2.4); e.ripple(p, 0xffffff, 0.08, 1.8, 0.3);
        if (!calm) e.burst(p, { count: 60, color: 0xffe3a0, speed: 0.05, life: 2, size: 5, rise: 0.85, lift: 0.012 });
        break;
      case 'failure':
        e.ripple(p, 0xe0574a, 0.12, 2.4);
        break;
      case 'invalid':
        e.ripple(p, 0xff6a5a, 0.025, 0.6);
        break;
      case 'migrant':
        e.ripple(p, 0xc9a8ff, 0.03, 1.2);
        break;
    }
  }

  // ---------------------------------------------------------------- per-frame

  /** Called every animation frame. `tickPhase` ∈ [0,1) interpolates shipments between ticks. */
  frame(dt: number, state: WorldState, tickPhase: number): void {
    if (this.contextLost) return;
    this.renderer.info.reset();
    const motion = this.options.reducedMotion ? 0 : 1;
    this.time += dt;
    this.updateCamera(dt, motion);
    this.updateSun(dt, state, motion);
    const t = this.time * motion;
    this.planetMat.uniforms.time.value = t;
    this.oceanMat.uniforms.time.value = t;
    if (this.starMat) this.starMat.uniforms.time.value = t;
    this.cloudRot += dt * 0.012 * motion;
    this.planetMat.uniforms.cloudRot.value = this.cloudRot;
    if (this.clouds) (this.clouds.material as THREE.ShaderMaterial).uniforms.rot.value = this.cloudRot;
    // Trade flows march along routes from origin to destination.
    this.routeMat.dashOffset -= dt * 0.05 * motion;
    this.migrationMat.dashOffset -= dt * 0.08 * motion;
    this.zoneMat.dashOffset -= dt * 0.01 * motion;
    this.selMat.opacity = 0.75 + 0.25 * Math.sin(this.time * 3.2 * motion + 1);
    this.animateBeacons(motion);
    this.updateShipments(state, tickPhase);
    this.pulseCrises(dt);
    this.effects.update(dt);
    if (this.composer && this.bloom?.enabled) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
    this.adapt(dt);
  }

  private updateCamera(dt: number, motion: number): void {
    if (this.focusAnim) {
      const f = this.focusAnim;
      f.t = Math.min(1, f.t + dt / 1.2);
      const e = f.t < 0.5 ? 4 * f.t ** 3 : 1 - (-2 * f.t + 2) ** 3 / 2;
      // Slight pull-back mid-flight gives a sense of travel over the globe.
      const arc = Math.sin(Math.PI * e) * 0.18 * Math.min(1, f.from.angleTo(f.to));
      const dir = f.from.clone().lerp(f.to, e).normalize();
      this.camera.position.copy(dir.multiplyScalar(f.fromD + (f.toD - f.fromD) * e + arc));
      if (f.t >= 1) this.focusAnim = null;
    }
    // Idle cinematic drift: after 40 s without input (or while a menu is open).
    const idle = this.time - this.lastInput > 40;
    this.controls.autoRotate = motion > 0 && !this.focusAnim && (this.cinematic || idle);
    this.controls.autoRotateSpeed = this.cinematic ? 0.5 : 0.22;
    const d = this.camera.position.length();
    this.controls.rotateSpeed = 0.16 + 0.36 * Math.min(1, (d - 1.2) / 3);
    this.controls.zoomSpeed = 0.45 + 0.4 * Math.min(1, (d - 1.2) / 3);
    this.controls.update(dt);
    // Frame the planet in the space left by UI panels (smoothly).
    const w = this.size.x, h = this.size.y;
    const tx = (this.insets.right - this.insets.left) / 2;
    const ty = (this.insets.bottom - this.insets.top) / 2;
    const k = motion ? 1 - Math.exp(-dt * 5) : 1;
    this.offset.x += (tx - this.offset.x) * k;
    this.offset.y += (ty - this.offset.y) * k;
    this.camera.setViewOffset(w, h, Math.round(this.offset.x * 10) / 10, Math.round(this.offset.y * 10) / 10, w, h);
  }

  private updateSun(dt: number, state: WorldState, motion: number): void {
    const sun = this.sunDir;
    if ((this.options.lighting ?? 'studio') === 'studio') {
      // Key light from upper-left, slightly in front: a readable terminator on the right limb.
      this.camera.updateMatrixWorld();
      const m = this.camera.matrixWorld.elements;
      const right = new THREE.Vector3(m[0], m[1], m[2]);
      const up = new THREE.Vector3(m[4], m[5], m[6]);
      const back = new THREE.Vector3(m[8], m[9], m[10]);
      sun.copy(right.multiplyScalar(-0.74).add(up.multiplyScalar(0.4)).add(back.multiplyScalar(0.46))).normalize();
    } else {
      this.sunAngle += dt * 0.05 * motion;
      const dec = (solarDeclination(state.tick) * Math.PI) / 180;
      sun.set(Math.cos(dec) * Math.cos(this.sunAngle), Math.sin(dec), Math.cos(dec) * Math.sin(this.sunAngle)).normalize();
    }
    this.planetMat.uniforms.sunDir.value.copy(sun);
    this.oceanMat.uniforms.sunDir.value.copy(sun);
    this.atmosphereMat.uniforms.sunDir.value.copy(sun);
    if (this.clouds) (this.clouds.material as THREE.ShaderMaterial).uniforms.sunDir.value.copy(sun);
    this.sunLight.position.copy(sun).multiplyScalar(10);
  }

  private animateBeacons(motion: number): void {
    const size = this.beaconGeo.getAttribute('size') as THREE.BufferAttribute;
    const tint = this.beaconGeo.getAttribute('tint') as THREE.BufferAttribute;
    this.beaconBase.forEach((b, i) => {
      const breathe = 1 + 0.12 * Math.sin(this.time * 1.6 * motion + b.phase);
      const sel = this.selectedCell === b.cell ? 1.5 : 1;
      size.setX(i, b.size * breathe * sel);
      tint.setXYZW(i, b.color.r, b.color.g, b.color.b, 0.55 + 0.15 * breathe);
    });
    size.needsUpdate = true;
    tint.needsUpdate = true;
  }

  private pulseCrises(dt: number): void {
    this.crisisPulseTimer -= dt;
    if (this.crisisPulseTimer > 0) return;
    this.crisisPulseTimer = this.options.reducedMotion ? 4 : 2.2;
    for (const c of this.crisisCells.slice(0, 12)) this.effects.ripple(this.surface(c.cell, 0), c.color, 0.05, 1.8);
    if (this.selectedCell >= 0 && !this.options.reducedMotion) this.effects.ripple(this.surface(this.selectedCell, 0), 0xffe3a0, 0.035, 1.6);
  }

  private updateShipments(state: WorldState, phase: number): void {
    let k = 0;
    const now = state.tick + phase;
    const pos = this.shipGeo.getAttribute('position') as THREE.BufferAttribute;
    const size = this.shipGeo.getAttribute('size') as THREE.BufferAttribute;
    const tint = this.shipGeo.getAttribute('tint') as THREE.BufferAttribute;
    const routes = new Map(state.routes.map((r) => [r.id, r]));
    for (const sh of state.shipments) {
      if (k >= MAX_SHIPMENTS) break;
      const pl = this.polylines.get(sh.routeId);
      const route = routes.get(sh.routeId);
      if (!pl || !route || pl.points.length < 2) continue;
      let t = (now - sh.departTick) / Math.max(1, sh.arriveTick - sh.departTick);
      t = Math.max(0, Math.min(1, t));
      if (sh.from !== route.a) t = 1 - t;
      const total = pl.cumulative[pl.cumulative.length - 1];
      const target = t * total;
      let i = 1;
      while (i < pl.cumulative.length - 1 && pl.cumulative[i] < target) i++;
      const segT = (target - pl.cumulative[i - 1]) / Math.max(1e-9, pl.cumulative[i] - pl.cumulative[i - 1]);
      const a = pl.points[i - 1], b = pl.points[i];
      pos.setXYZ(k, a.x + (b.x - a.x) * segT, a.y + (b.y - a.y) * segT, a.z + (b.z - a.z) * segT);
      size.setX(k, 5 + 6 * Math.min(1, Math.sqrt(sh.amount / 1500)));
      const c = GOOD_COLORS[sh.good] ?? [1, 1, 1];
      tint.setXYZW(k, c[0], c[1], c[2], 0.7);
      k++;
    }
    this.shipGeo.setDrawRange(0, k);
    pos.needsUpdate = true;
    size.needsUpdate = true;
    tint.needsUpdate = true;
  }

  /** Adaptive quality: if frames stay slow with bloom on, drop bloom and pixel ratio once. */
  private adapt(dt: number): void {
    if (dt <= 0 || dt > 0.25) return;
    this.frameEma = this.frameEma * 0.95 + dt * 1000 * 0.05;
    if (this.degraded || !this.bloom?.enabled) return;
    this.slowFor = this.frameEma > 30 ? this.slowFor + dt : 0;
    if (this.slowFor > 4) {
      this.degraded = true;
      this.bloom.enabled = false;
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1));
      this.resize();
      this.onAdaptiveQuality('Frame rate was low, so glow effects and resolution were reduced automatically. Change this under Settings → Graphics.');
    }
  }

  get averageFrameMs(): number {
    return this.frameEma;
  }

  // ---------------------------------------------------------------- camera & picking

  /** Map a pointer position to the simulation cell under it (−1 for space). */
  pick(clientX: number, clientY: number): number {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (!ray.ray.intersectSphere(new THREE.Sphere(new THREE.Vector3(), 1.002), hit)) return -1;
    const v = hit.normalize();
    this.lastPick = nearestCell(getTopology(), [v.x, v.y, v.z] as Vec3, this.lastPick);
    return this.lastPick;
  }

  focusCell(cell: number, distance?: number): void {
    const c = getTopology().centers[cell];
    const to = new THREE.Vector3(c[0], c[1], c[2]).normalize();
    const fromD = this.camera.position.length();
    const toD = distance ?? Math.min(fromD, 2.2);
    this.noteInput();
    if (this.options.reducedMotion) {
      this.camera.position.copy(to.multiplyScalar(toD));
      return;
    }
    this.focusAnim = { from: this.camera.position.clone().normalize(), to, fromD, toD, t: 0 };
  }

  getCameraState(): [number, number, number] {
    const p = this.camera.position;
    return [p.x, p.y, p.z];
  }

  setCameraState(p: [number, number, number]): void {
    const to = new THREE.Vector3(...p);
    this.noteInput();
    if (this.options.reducedMotion) { this.camera.position.copy(to); return; }
    this.focusAnim = { from: this.camera.position.clone().normalize(), to: to.clone().normalize(), fromD: this.camera.position.length(), toD: to.length(), t: 0 };
  }

  resetCamera(): void {
    this.setCameraState([0.9, 1.1, 3.6]);
  }

  zoomBy(factor: number): void {
    this.noteInput();
    const d = Math.max(this.controls.minDistance, Math.min(this.controls.maxDistance, this.camera.position.length() * factor));
    if (this.options.reducedMotion) { this.camera.position.setLength(d); return; }
    const dir = this.camera.position.clone().normalize();
    this.focusAnim = { from: dir, to: dir.clone(), fromD: this.camera.position.length(), toD: d, t: 0.35 };
  }

  /** Screen position of a cell centre, and whether it faces the camera. */
  project(cell: number): { x: number; y: number; visible: boolean } {
    const p = this.surface(cell, 0.03);
    const facing = p.clone().normalize().dot(this.camera.position.clone().sub(p).normalize());
    const s = p.clone().project(this.camera);
    const rect = this.renderer.domElement.getBoundingClientRect();
    return { x: (s.x * 0.5 + 0.5) * rect.width, y: (-s.y * 0.5 + 0.5) * rect.height, visible: facing > 0.15 && s.z < 1 };
  }

  /** How strongly a cell faces the camera, 0..1 (for fading labels at the limb). */
  facing(cell: number): number {
    const p = this.surface(cell, 0.03);
    return Math.max(0, p.clone().normalize().dot(this.camera.position.clone().sub(p).normalize()));
  }

  get cameraDistance(): number {
    return this.camera.position.length();
  }

  // ---------------------------------------------------------------- quality & lifecycle

  setOptions(options: ViewOptions, state: WorldState): void {
    const levelChanged = QUALITY[options.quality].level !== QUALITY[this.options.quality].level;
    this.options = options;
    this.degraded = false;
    this.applyQuality();
    if (levelChanged) this.syncWorld(state, true);
    else this.buildClouds(state.seed);
  }

  private applyQuality(): void {
    const q = QUALITY[this.options.quality];
    const fx = !this.options.reducedEffects;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio));
    this.atmosphereMat.uniforms.strength.value = fx ? 1 : 0.55;
    this.oceanMat.uniforms.waves.value = fx ? q.waves : 0;
    this.effects.intensity = fx ? (this.options.quality === 'low' ? 0.5 : 1) : 0.3;
    this.buildSky(q.sky && fx, q.stars);
    if (q.bloom && fx) {
      if (!this.composer) {
        this.composer = new EffectComposer(this.renderer);
        this.composer.addPass(new RenderPass(this.scene, this.camera));
        this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.55, 0.78);
        this.composer.addPass(this.bloom);
        this.composer.addPass(new OutputPass());
      }
      this.bloom!.enabled = true;
      this.bloom!.strength = this.options.quality === 'high' ? 0.62 : 0.5;
    } else if (this.bloom) {
      this.bloom.enabled = false;
    }
    this.resize();
  }

  private buildSky(withBand: boolean, starCount: number): void {
    if (this.stars) {
      this.scene.remove(this.stars);
      this.stars.geometry.dispose();
      this.starMat?.dispose();
      this.stars = null;
    }
    if (this.sky) {
      this.scene.remove(this.sky);
      this.sky.geometry.dispose();
      (this.sky.material as THREE.Material).dispose();
      this.sky = null;
    }
    if (withBand) {
      this.sky = new THREE.Mesh(new THREE.SphereGeometry(90, 48, 24), new THREE.ShaderMaterial({ vertexShader: skyVertex, fragmentShader: skyFragment, side: THREE.BackSide, depthWrite: false }));
      this.sky.renderOrder = -2;
      this.scene.add(this.sky);
    }
    const rng = new Rng(seedRng('stars'));
    const pts: number[] = [], cols: number[] = [], sizes: number[] = [], phases: number[] = [];
    const bandN = new THREE.Vector3(0.35, 0.86, 0.38).normalize();
    for (let i = 0; i < starCount; i++) {
      const z = rng.range(-1, 1), t = rng.range(0, Math.PI * 2), r = Math.sqrt(1 - z * z);
      const v = new THREE.Vector3(r * Math.cos(t), z, r * Math.sin(t));
      // More stars crowd toward the galactic band.
      if (Math.abs(v.dot(bandN)) > 0.3 && rng.chance(0.45)) { i--; continue; }
      v.multiplyScalar(60);
      pts.push(v.x, v.y, v.z);
      const temp = rng.next();
      const b = Math.pow(rng.next(), 2.2) * 0.9 + 0.1;
      cols.push(b * (0.75 + temp * 0.25), b * (0.8 + 0.15 * (1 - Math.abs(temp - 0.5))), b * (0.8 + (1 - temp) * 0.25));
      sizes.push(1 + Math.pow(rng.next(), 6) * 3.5);
      phases.push(rng.next());
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    g.setAttribute('tint', new THREE.Float32BufferAttribute(cols, 3));
    g.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));
    g.setAttribute('phase', new THREE.Float32BufferAttribute(phases, 1));
    this.starMat = new THREE.ShaderMaterial({
      vertexShader: starVertex, fragmentShader: starFragment, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { time: { value: 0 }, twinkle: { value: this.options.reducedMotion ? 0 : 1 } },
    });
    this.stars = new THREE.Points(g, this.starMat);
    this.stars.renderOrder = -1;
    this.scene.add(this.stars);
  }

  private buildClouds(seed: string): void {
    if (this.clouds) {
      this.scene.remove(this.clouds);
      this.clouds.geometry.dispose();
      (this.clouds.material as THREE.Material).dispose();
      this.clouds = null;
    }
    this.cloudTexture?.dispose();
    this.cloudTexture = null;
    this.planetMat.uniforms.cloudShadow.value = 0;
    this.planetMat.uniforms.cloudMap.value = null;
    if (!QUALITY[this.options.quality].clouds || this.options.reducedEffects) return;
    const w = this.options.quality === 'high' ? 1024 : 512, h = w / 2;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(w, h);
    const noise = new Noise3(new Rng(seedRng(`${seed}:clouds`)));
    const noise2 = new Noise3(new Rng(seedRng(`${seed}:clouds2`)));
    for (let y = 0; y < h; y++) {
      const lat = (0.5 - y / h) * Math.PI;
      for (let x = 0; x < w; x++) {
        const lon = (x / w) * Math.PI * 2 - Math.PI;
        const vx = Math.cos(lat) * Math.cos(lon), vy = Math.sin(lat), vz = Math.cos(lat) * Math.sin(lon);
        // Domain-warped fBm gives swirling weather systems rather than blobs.
        const wx = noise.fbm(vx * 1.6 + 3, vy * 1.6, vz * 1.6, 3) * 0.6;
        const wz = noise.fbm(vx * 1.6, vy * 1.6 + 7, vz * 1.6, 3) * 0.6;
        const n1 = noise.fbm((vx + wx) * 3.2, vy * 3.2, (vz + wz) * 3.2, 5);
        const n2 = noise2.fbm(vx * 5.5 + wz, vy * 5.5, vz * 5.5 + wx, 4);
        const i = (y * w + x) * 4;
        img.data[i] = Math.max(0, Math.min(255, (n1 * 0.5 + 0.5) * 255));
        img.data[i + 1] = Math.max(0, Math.min(255, (n2 * 0.5 + 0.5) * 255));
        img.data[i + 2] = 0;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.NoColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    this.cloudTexture = tex;
    const mat = new THREE.ShaderMaterial({
      vertexShader: cloudVertex, fragmentShader: cloudFragment, transparent: true, depthWrite: false,
      uniforms: { map: { value: tex }, wetMap: { value: this.wetTexture }, sunDir: { value: this.sunDir.clone() }, opacity: { value: 0.78 }, rot: { value: this.cloudRot }, overlayMode: { value: this.overlay === 'terrain' ? 0 : 1 } },
    });
    this.clouds = new THREE.Mesh(new THREE.IcosahedronGeometry(1.022, 40), mat);
    this.clouds.renderOrder = 6;
    this.scene.add(this.clouds);
    this.planetMat.uniforms.cloudMap.value = tex;
    this.planetMat.uniforms.cloudShadow.value = 0.32;
  }

  /** Kept for API compatibility: overlays now fade clouds in-shader instead of hiding them. */
  setCloudsVisible(_v: boolean): void {}

  resize(): void {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.size.set(w, h);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    // Portrait screens widen the vertical FOV so the globe keeps a similar horizontal framing.
    const aspect = this.camera.aspect;
    this.camera.fov = aspect >= 1 ? 36 : Math.min(72, (2 * Math.atan(Math.tan((18 * Math.PI) / 180) / aspect) * 180) / Math.PI * 0.86);
    this.camera.updateProjectionMatrix();
    const pr = this.renderer.getPixelRatio();
    this.composer?.setPixelRatio(pr);
    this.composer?.setSize(w, h);
    for (const m of this.lineMats) m.resolution.set(w, h);
    const px = (h * pr) / (2 * Math.tan((this.camera.fov * Math.PI) / 360));
    this.glowMat.uniforms.pixelScale.value = px * 0.0042;
    this.effects.setPixelScale(px * 0.0042);
  }

  stats(): { calls: number; triangles: number; geometries: number; textures: number } {
    const i = this.renderer.info;
    return { calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures };
  }

  dispose(): void {
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else mat?.dispose?.();
    });
    this.cloudTexture?.dispose();
    this.wetTexture.dispose();
    this.effects.dispose();
    this.composer?.dispose();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
