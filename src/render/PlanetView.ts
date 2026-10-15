import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Noise3 } from '../sim/noise';
import { Rng, seedRng } from '../sim/rng';
import { solarDeclination } from '../sim/systems/climate';
import { getTopology, nearestCell, type Vec3 } from '../sim/topology';
import type { BuildingType, WorldState } from '../sim/types';
import { buildPlanetMesh, paintLights, paintPlanet, type PlanetMeshData } from './planetMesh';
import {
  atmosphereFragment, atmosphereVertex, cloudFragment, cloudVertex, flowFragment, flowVertex,
  oceanFragment, oceanVertex, planetFragment, planetVertex,
} from './shaders';

export type Quality = 'low' | 'medium' | 'high';

export interface ViewOptions {
  quality: Quality;
  reducedMotion: boolean;
  reducedEffects: boolean;
}

const QUALITY = {
  low: { level: 5, pixelRatio: 1, clouds: false, stars: 600 },
  medium: { level: 5, pixelRatio: 1.5, clouds: true, stars: 1400 },
  high: { level: 6, pixelRatio: 2, clouds: true, stars: 2400 },
} as const;

const BUILDING_COLORS: Record<BuildingType, number> = {
  farm: 0xc9d36a, mine: 0xd0764a, storage: 0xd9b56a, energy: 0x6fd1e0, port: 0x7aa6ff,
};
const MAX_SETTLEMENTS = 64;
const MAX_BUILDINGS = 320;
const MAX_SHIPMENTS = 600;

interface RoutePolyline {
  routeId: number;
  points: THREE.Vector3[];
  cumulative: number[];
}

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
  private planet: THREE.Mesh | null = null;
  private planetData: PlanetMeshData | null = null;
  private planetMat: THREE.ShaderMaterial;
  private ocean: THREE.Mesh;
  private oceanMat: THREE.ShaderMaterial;
  private atmosphere: THREE.Mesh;
  private atmosphereMat: THREE.ShaderMaterial;
  private clouds: THREE.Mesh | null = null;
  private cloudTexture: THREE.Texture | null = null;
  private stars: THREE.Points | null = null;
  private settlementMesh: THREE.InstancedMesh;
  private ringMesh: THREE.InstancedMesh;
  private buildingMeshes = new Map<BuildingType, THREE.InstancedMesh>();
  private roads: THREE.LineSegments;
  private routes: THREE.LineSegments;
  private migrations: THREE.LineSegments;
  private flowMat: THREE.ShaderMaterial;
  private shipments: THREE.InstancedMesh;
  private selection: THREE.LineLoop;
  private hover: THREE.LineLoop;
  private polylines = new Map<number, RoutePolyline>();
  private routeSignature = '';
  private sunAngle = 0.6;
  private focusAnim: { from: THREE.Vector3; to: THREE.Vector3; fromD: number; toD: number; t: number } | null = null;
  private seed = '';
  private lastPick = 0;
  private dummy = new THREE.Object3D();
  private time = 0;
  overlay = 'terrain';
  showBorders = true;
  selectedCell = -1;
  options: ViewOptions;
  contextLost = false;
  onContextChange: (lost: boolean) => void = () => {};

  constructor(private container: HTMLElement, options: ViewOptions) {
    this.options = options;
    this.renderer = new THREE.WebGLRenderer({ antialias: options.quality !== 'low', powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x03050b, 1);
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.setAttribute('aria-label', 'Planet view: drag to rotate, scroll or pinch to zoom, click or tap a region to select it');
    this.renderer.domElement.setAttribute('role', 'application');
    this.renderer.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.contextLost = true; this.onContextChange(true); });
    this.renderer.domElement.addEventListener('webglcontextrestored', () => { this.contextLost = false; this.onContextChange(false); });

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.01, 100);
    this.camera.position.set(0.6, 0.9, 3.4);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.minDistance = 1.28;
    this.controls.maxDistance = 6.5;
    this.controls.minPolarAngle = 0.08;
    this.controls.maxPolarAngle = Math.PI - 0.08;
    this.controls.zoomSpeed = 0.8;
    this.controls.rotateSpeed = 0.5;
    this.controls.addEventListener('start', () => { this.focusAnim = null; });

    const sun = new THREE.Vector3(1, 0.2, 0.4).normalize();
    this.planetMat = new THREE.ShaderMaterial({
      vertexShader: planetVertex, fragmentShader: planetFragment,
      uniforms: { sunDir: { value: sun.clone() }, ambient: { value: 0.22 }, nightLights: { value: 1 }, overlayMode: { value: 0 } },
    });
    this.oceanMat = new THREE.ShaderMaterial({
      vertexShader: oceanVertex, fragmentShader: oceanFragment, transparent: true, depthWrite: false,
      uniforms: { sunDir: { value: sun.clone() }, deep: { value: new THREE.Color(0x07203f) }, shallow: { value: new THREE.Color(0x2c7fa8) }, time: { value: 0 }, overlayMode: { value: 0 } },
    });
    this.ocean = new THREE.Mesh(new THREE.IcosahedronGeometry(1.0, 40), this.oceanMat);
    this.ocean.renderOrder = 2;
    this.scene.add(this.ocean);
    this.atmosphereMat = new THREE.ShaderMaterial({
      vertexShader: atmosphereVertex, fragmentShader: atmosphereFragment, side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { sunDir: { value: sun.clone() }, strength: { value: 1 } },
    });
    this.atmosphere = new THREE.Mesh(new THREE.IcosahedronGeometry(1.075, 24), this.atmosphereMat);
    this.scene.add(this.atmosphere);

    this.settlementMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.75, 1, 1, 6).translate(0, 0.5, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }), MAX_SETTLEMENTS);
    this.settlementMesh.count = 0;
    this.settlementMesh.renderOrder = 4;
    this.scene.add(this.settlementMesh);
    this.ringMesh = new THREE.InstancedMesh(new THREE.RingGeometry(0.85, 1, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }), MAX_SETTLEMENTS);
    this.ringMesh.count = 0;
    this.ringMesh.renderOrder = 3;
    this.scene.add(this.ringMesh);
    const bGeo: Record<BuildingType, THREE.BufferGeometry> = {
      farm: new THREE.BoxGeometry(1, 0.35, 1).translate(0, 0.17, 0),
      mine: new THREE.ConeGeometry(0.6, 1.1, 4).translate(0, 0.55, 0),
      storage: new THREE.BoxGeometry(0.8, 0.8, 0.8).translate(0, 0.4, 0),
      energy: new THREE.CylinderGeometry(0.35, 0.45, 1.4, 8).translate(0, 0.7, 0),
      port: new THREE.OctahedronGeometry(0.6).translate(0, 0.5, 0),
    };
    for (const t of Object.keys(bGeo) as BuildingType[]) {
      const m = new THREE.InstancedMesh(bGeo[t], new THREE.MeshBasicMaterial({ color: BUILDING_COLORS[t] }), MAX_BUILDINGS);
      m.count = 0;
      m.renderOrder = 4;
      this.buildingMeshes.set(t, m);
      this.scene.add(m);
    }
    this.roads = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xe8c98a, transparent: true, opacity: 0.85 }));
    this.roads.renderOrder = 3;
    this.scene.add(this.roads);
    this.flowMat = new THREE.ShaderMaterial({
      vertexShader: flowVertex, fragmentShader: flowFragment, transparent: true, depthWrite: false,
      uniforms: { time: { value: 0 }, animate: { value: 1 } },
    });
    this.routes = new THREE.LineSegments(new THREE.BufferGeometry(), this.flowMat);
    this.routes.renderOrder = 5;
    this.scene.add(this.routes);
    this.migrations = new THREE.LineSegments(new THREE.BufferGeometry(), this.flowMat);
    this.migrations.renderOrder = 5;
    this.scene.add(this.migrations);
    this.shipments = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), MAX_SHIPMENTS);
    this.shipments.count = 0;
    this.shipments.renderOrder = 6;
    this.scene.add(this.shipments);
    this.selection = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffe3a0, transparent: true, opacity: 0.95, depthTest: false }));
    this.selection.renderOrder = 10;
    this.scene.add(this.selection);
    this.hover = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthTest: false }));
    this.hover.renderOrder = 9;
    this.scene.add(this.hover);

    this.applyQuality();
    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
  }

  // ---------------------------------------------------------------- world sync

  /** Build (or rebuild) everything that depends on the world's geometry. */
  syncWorld(state: WorldState, force = false): void {
    if (!force && this.planet && this.seed === state.seed + JSON.stringify(state.params) + QUALITY[this.options.quality].level) {
      this.syncTick(state);
      return;
    }
    this.seed = state.seed + JSON.stringify(state.params) + QUALITY[this.options.quality].level;
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
    this.syncTick(state);
  }

  /** Update every state-derived layer after a simulation tick. */
  syncTick(state: WorldState): void {
    if (!this.planetData) return;
    paintPlanet(state, this.planetData, { overlay: this.overlay, showBorders: this.showBorders, selected: this.selectedCell });
    paintLights(state, this.planetData);
    this.planetMat.uniforms.overlayMode.value = this.overlay === 'terrain' ? 0 : 1;
    this.oceanMat.uniforms.overlayMode.value = this.overlay === 'terrain' ? 0 : 1;
    this.updateSettlements(state);
    this.updateBuildings(state);
    this.updateRoads(state);
    this.updateRoutes(state);
    this.updateMigrations(state);
    if (this.selectedCell >= 0) this.setSelection(this.selectedCell);
  }

  setOverlay(id: string, state: WorldState): void {
    this.overlay = id;
    if (!this.planetData) return;
    paintPlanet(state, this.planetData, { overlay: id, showBorders: this.showBorders, selected: this.selectedCell });
    const mode = id === 'terrain' ? 0 : 1;
    this.planetMat.uniforms.overlayMode.value = mode;
    this.oceanMat.uniforms.overlayMode.value = mode;
  }

  private surface(cell: number, lift = 0.004): THREE.Vector3 {
    const c = getTopology().centers[cell];
    const r = (this.planetData?.radiusOfCell[cell] ?? 1) + lift;
    return new THREE.Vector3(c[0] * r, c[1] * r, c[2] * r);
  }

  private orient(pos: THREE.Vector3, scale: number, height: number): void {
    this.dummy.position.copy(pos);
    this.dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), pos.clone().normalize());
    this.dummy.scale.set(scale, height, scale);
    this.dummy.updateMatrix();
  }

  private updateSettlements(state: WorldState): void {
    const live = state.settlements.filter((s) => s.alive).slice(0, MAX_SETTLEMENTS);
    const color = new THREE.Color();
    live.forEach((s, i) => {
      const size = 0.006 + 0.012 * Math.min(1, Math.sqrt(s.population / 25000));
      const height = 0.01 + 0.05 * Math.min(1, Math.log10(1 + s.population / 300) / 2.2);
      this.orient(this.surface(s.cellId, 0.001), size, height);
      this.settlementMesh.setMatrixAt(i, this.dummy.matrix);
      // Status colour (always paired with text labels/icons in the UI).
      if (s.wellbeing > 0.7) color.set(0xffd98a); else if (s.wellbeing > 0.45) color.set(0xf0a050); else color.set(0xe0574a);
      this.settlementMesh.setColorAt(i, color);
      this.orient(this.surface(s.cellId, 0.0015), size * 2.6, 1);
      this.ringMesh.setMatrixAt(i, this.dummy.matrix);
      this.ringMesh.setColorAt(i, color);
    });
    this.settlementMesh.count = live.length;
    this.ringMesh.count = live.length;
    this.settlementMesh.instanceMatrix.needsUpdate = true;
    this.ringMesh.instanceMatrix.needsUpdate = true;
    if (this.settlementMesh.instanceColor) this.settlementMesh.instanceColor.needsUpdate = true;
    if (this.ringMesh.instanceColor) this.ringMesh.instanceColor.needsUpdate = true;
  }

  private updateBuildings(state: WorldState): void {
    const topo = getTopology();
    const slots = new Map<number, number>();
    const counts = new Map<BuildingType, number>();
    for (const m of this.buildingMeshes.values()) m.count = 0;
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
      const t = 0.38;
      const v = new THREE.Vector3(c[0] + (corner[0] - c[0]) * t, c[1] + (corner[1] - c[1]) * t, c[2] + (corner[2] - c[2]) * t).normalize();
      v.multiplyScalar((this.planetData?.radiusOfCell[b.cellId] ?? 1) + 0.002);
      const scale = b.status === 'construction' ? 0.0045 : 0.0065;
      this.orient(v, scale, scale * (b.status === 'construction' ? 0.6 : 1.4));
      mesh.setMatrixAt(k, this.dummy.matrix);
      const col = new THREE.Color(BUILDING_COLORS[b.type]).multiplyScalar(b.status === 'construction' ? 0.5 : 0.45 + 0.55 * b.condition);
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

  private updateRoads(state: WorldState): void {
    const pts: number[] = [];
    for (const r of state.roads) {
      const seg = this.arc(this.surface(r.a, 0.0025), this.surface(r.b, 0.0025), 6);
      for (let i = 1; i < seg.length; i++) pts.push(seg[i - 1].x, seg[i - 1].y, seg[i - 1].z, seg[i].x, seg[i].y, seg[i].z);
    }
    this.roads.geometry.dispose();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.roads.geometry = g;
  }

  private updateRoutes(state: WorldState): void {
    const signature = state.routes.map((r) => `${r.id}:${r.path.join('.')}`).join('|');
    if (signature !== this.routeSignature) {
      this.routeSignature = signature;
      this.polylines.clear();
      for (const r of state.routes) {
        const points: THREE.Vector3[] = [];
        for (let i = 0; i < r.path.length; i++) {
          const lift = r.mode === 'sea' ? 0.006 : 0.007;
          const p = this.surface(r.path[i], lift);
          if (!state.cells[r.path[i]].land) p.normalize().multiplyScalar(1 + lift);
          if (i === 0) { points.push(p); continue; }
          const seg = this.arc(points[points.length - 1], p, 4);
          for (let k = 1; k < seg.length; k++) points.push(seg[k]);
        }
        const cumulative = [0];
        for (let i = 1; i < points.length; i++) cumulative.push(cumulative[i - 1] + points[i].distanceTo(points[i - 1]));
        this.polylines.set(r.id, { routeId: r.id, points, cumulative });
      }
    }
    const pos: number[] = [], dist: number[] = [], tint: number[] = [];
    for (const r of state.routes) {
      const pl = this.polylines.get(r.id);
      if (!pl) continue;
      const util = r.capacity > 0 ? Math.min(1, r.movedLastTick / r.capacity) : 0;
      const recent = r.deliveredHistory.slice(-3).some((v) => v > 0);
      const col = !r.active ? [0.85, 0.3, 0.25] : r.mode === 'sea' ? [0.45, 0.85, 1.0] : [1.0, 0.78, 0.4];
      const alpha = !r.active ? 0.5 : recent ? 0.55 + 0.45 * util : 0.35;
      for (let i = 1; i < pl.points.length; i++) {
        const a = pl.points[i - 1], b = pl.points[i];
        pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
        dist.push(pl.cumulative[i - 1], pl.cumulative[i]);
        tint.push(...col, alpha, ...col, alpha);
      }
    }
    this.routes.geometry.dispose();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('dist', new THREE.Float32BufferAttribute(dist, 1));
    g.setAttribute('tint', new THREE.Float32BufferAttribute(tint, 4));
    this.routes.geometry = g;
  }

  private updateMigrations(state: WorldState): void {
    const pos: number[] = [], dist: number[] = [], tint: number[] = [];
    for (const m of state.migrations) {
      const age = state.tick - m.tick;
      if (age > 4) continue;
      const a = this.surface(m.fromCell, 0.004), b = this.surface(m.toCell, 0.004);
      const raise = 0.04 + 0.12 * a.clone().normalize().angleTo(b.clone().normalize());
      const pts = this.arc(a, b, 24, 0, raise);
      const alpha = (1 - age / 5) * Math.min(1, 0.35 + m.amount / 800);
      const col = m.founding ? [0.6, 1.0, 0.65] : [0.85, 0.7, 1.0];
      let d = 0;
      for (let i = 1; i < pts.length; i++) {
        const seg = pts[i].distanceTo(pts[i - 1]);
        pos.push(pts[i - 1].x, pts[i - 1].y, pts[i - 1].z, pts[i].x, pts[i].y, pts[i].z);
        dist.push(d, d + seg);
        d += seg;
        tint.push(...col, alpha, ...col, alpha);
      }
    }
    this.migrations.geometry.dispose();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('dist', new THREE.Float32BufferAttribute(dist, 1));
    g.setAttribute('tint', new THREE.Float32BufferAttribute(tint, 4));
    this.migrations.geometry = g;
  }

  private outline(line: THREE.LineLoop, cell: number): void {
    line.geometry.dispose();
    const g = new THREE.BufferGeometry();
    if (cell >= 0) {
      const corners = getTopology().corners[cell];
      const r = Math.max(1, this.planetData?.radiusOfCell[cell] ?? 1) + 0.006;
      g.setAttribute('position', new THREE.Float32BufferAttribute(corners.flatMap((c) => [c[0] * r, c[1] * r, c[2] * r]), 3));
    }
    line.geometry = g;
  }

  setSelection(cell: number): void {
    this.selectedCell = cell;
    this.outline(this.selection, cell);
  }

  setHover(cell: number, valid: boolean | null): void {
    (this.hover.material as THREE.LineBasicMaterial).color.set(valid === null ? 0xffffff : valid ? 0x7dffb0 : 0xff7a6a);
    this.outline(this.hover, cell);
  }

  // ---------------------------------------------------------------- per-frame

  /** Called every animation frame. `tickPhase` ∈ [0,1) interpolates shipments between ticks. */
  frame(dt: number, state: WorldState, tickPhase: number): void {
    if (this.contextLost) return;
    const motion = this.options.reducedMotion ? 0 : 1;
    this.time += dt;
    this.sunAngle += dt * 0.05 * motion;
    const dec = (solarDeclination(state.tick) * Math.PI) / 180;
    const sun = new THREE.Vector3(Math.cos(dec) * Math.cos(this.sunAngle), Math.sin(dec), Math.cos(dec) * Math.sin(this.sunAngle)).normalize();
    this.planetMat.uniforms.sunDir.value.copy(sun);
    this.oceanMat.uniforms.sunDir.value.copy(sun);
    this.atmosphereMat.uniforms.sunDir.value.copy(sun);
    this.oceanMat.uniforms.time.value = this.time * motion;
    this.flowMat.uniforms.time.value = this.time;
    this.flowMat.uniforms.animate.value = motion;
    if (this.clouds) {
      this.clouds.rotation.y += dt * 0.006 * motion;
      (this.clouds.material as THREE.ShaderMaterial).uniforms.sunDir.value.copy(sun);
    }
    this.updateShipments(state, tickPhase);
    if (this.focusAnim) {
      const f = this.focusAnim;
      f.t = Math.min(1, f.t + dt / 1.1);
      const e = f.t < 0.5 ? 2 * f.t * f.t : 1 - (-2 * f.t + 2) ** 2 / 2;
      const dir = f.from.clone().lerp(f.to, e).normalize();
      this.camera.position.copy(dir.multiplyScalar(f.fromD + (f.toD - f.fromD) * e));
      if (f.t >= 1) this.focusAnim = null;
    }
    // Slow down rotation when close to the surface for precise inspection.
    const d = this.camera.position.length();
    this.controls.rotateSpeed = 0.18 + 0.35 * Math.min(1, (d - 1.2) / 3);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  private updateShipments(state: WorldState, phase: number): void {
    let k = 0;
    const now = state.tick + phase;
    for (const sh of state.shipments) {
      if (k >= MAX_SHIPMENTS) break;
      const pl = this.polylines.get(sh.routeId);
      if (!pl || pl.points.length < 2) continue;
      const route = state.routes.find((r) => r.id === sh.routeId);
      if (!route) continue;
      let t = (now - sh.departTick) / Math.max(1, sh.arriveTick - sh.departTick);
      t = Math.max(0, Math.min(1, t));
      if (sh.from !== route.a) t = 1 - t;
      const total = pl.cumulative[pl.cumulative.length - 1];
      const target = t * total;
      let i = 1;
      while (i < pl.cumulative.length - 1 && pl.cumulative[i] < target) i++;
      const segT = (target - pl.cumulative[i - 1]) / Math.max(1e-9, pl.cumulative[i] - pl.cumulative[i - 1]);
      const p = pl.points[i - 1].clone().lerp(pl.points[i], segT);
      const s = 0.0028 + 0.004 * Math.min(1, Math.sqrt(sh.amount / 1500));
      this.dummy.position.copy(p);
      this.dummy.scale.setScalar(s);
      this.dummy.quaternion.identity();
      this.dummy.updateMatrix();
      this.shipments.setMatrixAt(k, this.dummy.matrix);
      const col = sh.good === 'food' ? 0xb7e36b : sh.good === 'water' ? 0x6fc8ff : sh.good === 'timber' ? 0xc89b5a : 0xff9a5a;
      this.shipments.setColorAt(k, new THREE.Color(col));
      k++;
    }
    this.shipments.count = k;
    this.shipments.instanceMatrix.needsUpdate = true;
    if (this.shipments.instanceColor) this.shipments.instanceColor.needsUpdate = true;
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
    if (this.options.reducedMotion) { this.camera.position.copy(to); return; }
    this.focusAnim = { from: this.camera.position.clone().normalize(), to: to.clone().normalize(), fromD: this.camera.position.length(), toD: to.length(), t: 0 };
  }

  resetCamera(): void {
    this.setCameraState([0.6, 0.9, 3.4]);
  }

  zoomBy(factor: number): void {
    const d = Math.max(this.controls.minDistance, Math.min(this.controls.maxDistance, this.camera.position.length() * factor));
    this.camera.position.setLength(d);
  }

  /** Screen position of a cell centre, and whether it faces the camera. */
  project(cell: number): { x: number; y: number; visible: boolean } {
    const p = this.surface(cell, 0.03);
    const facing = p.clone().normalize().dot(this.camera.position.clone().sub(p).normalize());
    const s = p.clone().project(this.camera);
    const rect = this.renderer.domElement.getBoundingClientRect();
    return { x: (s.x * 0.5 + 0.5) * rect.width, y: (-s.y * 0.5 + 0.5) * rect.height, visible: facing > 0.15 && s.z < 1 };
  }

  get cameraDistance(): number {
    return this.camera.position.length();
  }

  // ---------------------------------------------------------------- quality & lifecycle

  setOptions(options: ViewOptions, state: WorldState): void {
    const levelChanged = QUALITY[options.quality].level !== QUALITY[this.options.quality].level;
    this.options = options;
    this.applyQuality();
    if (levelChanged) this.syncWorld(state, true);
    else this.buildClouds(state.seed);
  }

  private applyQuality(): void {
    const q = QUALITY[this.options.quality];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio));
    this.atmosphereMat.uniforms.strength.value = this.options.reducedEffects ? 0.45 : 1;
    this.atmosphere.visible = this.options.quality !== 'low' || !this.options.reducedEffects;
    if (this.stars) {
      this.scene.remove(this.stars);
      this.stars.geometry.dispose();
      (this.stars.material as THREE.Material).dispose();
      this.stars = null;
    }
    const rng = new Rng(seedRng('stars'));
    const pts: number[] = [], cols: number[] = [];
    for (let i = 0; i < q.stars; i++) {
      const z = rng.range(-1, 1), t = rng.range(0, Math.PI * 2), r = Math.sqrt(1 - z * z);
      const d = rng.range(30, 60);
      pts.push(r * Math.cos(t) * d, z * d, r * Math.sin(t) * d);
      const warm = rng.next();
      const b = rng.range(0.4, 1);
      cols.push(b, b * (0.85 + warm * 0.15), b * (0.8 + (1 - warm) * 0.2));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    this.stars = new THREE.Points(g, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.9 }));
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
    if (!QUALITY[this.options.quality].clouds || this.options.reducedEffects) return;
    const w = this.options.quality === 'high' ? 1024 : 512, h = w / 2;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(w, h);
    const noise = new Noise3(new Rng(seedRng(`${seed}:clouds`)));
    for (let y = 0; y < h; y++) {
      const lat = (0.5 - y / h) * Math.PI;
      const band = 0.55 + 0.45 * Math.cos(lat * 3.2) ** 2;
      for (let x = 0; x < w; x++) {
        const lon = (x / w) * Math.PI * 2;
        const vx = Math.cos(lat) * Math.cos(lon), vy = Math.sin(lat), vz = Math.cos(lat) * Math.sin(lon);
        const n = noise.fbm(vx * 2.6, vy * 2.6, vz * 2.6, 5);
        const v = Math.max(0, Math.min(1, (n * band - 0.05) * 2.2));
        const i = (y * w + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v * 255;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    this.cloudTexture = new THREE.CanvasTexture(canvas);
    this.cloudTexture.colorSpace = THREE.NoColorSpace;
    const mat = new THREE.ShaderMaterial({
      vertexShader: cloudVertex, fragmentShader: cloudFragment, transparent: true, depthWrite: false,
      uniforms: { map: { value: this.cloudTexture }, sunDir: { value: new THREE.Vector3(1, 0, 0) }, opacity: { value: 0.42 } },
    });
    this.clouds = new THREE.Mesh(new THREE.SphereGeometry(1.03, 96, 64), mat);
    this.clouds.renderOrder = 7;
    this.scene.add(this.clouds);
  }

  /** Hide clouds while an overlay is shown so data stays readable. */
  setCloudsVisible(v: boolean): void {
    if (this.clouds) this.clouds.visible = v;
  }

  resize(): void {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
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
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
