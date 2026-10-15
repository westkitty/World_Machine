import * as THREE from 'three';
import { glowFragment, glowVertex, rippleFragment, rippleVertex } from './shaders';

/**
 * Pooled in-world feedback: expanding surface ripples and short-lived glowing
 * particles. Both pools have fixed capacity and reuse slots, so effects never
 * accumulate GPU objects; when a pool is full the oldest effect is recycled.
 */
const MAX_RIPPLES = 64;
const MAX_PARTICLES = 900;

interface Ripple { active: boolean; pos: THREE.Vector3; normal: THREE.Vector3; color: THREE.Color; size: number; age: number; life: number; delay: number; }
interface Particle { active: boolean; pos: THREE.Vector3; vel: THREE.Vector3; color: THREE.Color; size: number; age: number; life: number; drag: number; lift: number; }

export interface BurstOptions {
  count: number;
  color: number;
  speed: number;
  life: number;
  size: number;
  /** Outward (radial) bias of initial velocity, 0 = flat spread, 1 = straight up. */
  rise: number;
  /** Continuous radial acceleration (positive floats upward, negative settles). */
  lift?: number;
  spread?: number;
}

export class EffectsLayer {
  readonly group = new THREE.Group();
  private ripples: Ripple[] = [];
  private particles: Particle[] = [];
  private rippleMesh: THREE.InstancedMesh;
  private ageAttr: THREE.InstancedBufferAttribute;
  private colorAttr: THREE.InstancedBufferAttribute;
  private points: THREE.Points;
  private pGeo: THREE.BufferGeometry;
  private pMat: THREE.ShaderMaterial;
  private nextRipple = 0;
  private nextParticle = 0;
  private dummy = new THREE.Object3D();
  private up = new THREE.Vector3(0, 1, 0);
  private tmp = new THREE.Vector3();
  /** Scales particle counts (reduced effects, adaptive quality). */
  intensity = 1;

  constructor() {
    const geo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
    this.ageAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAX_RIPPLES).fill(1), 1);
    this.colorAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAX_RIPPLES * 3), 3);
    geo.setAttribute('age', this.ageAttr);
    geo.setAttribute('rippleColor', this.colorAttr);
    const mat = new THREE.ShaderMaterial({
      vertexShader: rippleVertex, fragmentShader: rippleFragment, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    this.rippleMesh = new THREE.InstancedMesh(geo, mat, MAX_RIPPLES);
    this.rippleMesh.count = 0;
    this.rippleMesh.renderOrder = 8;
    this.rippleMesh.frustumCulled = false;
    for (let i = 0; i < MAX_RIPPLES; i++) this.ripples.push({ active: false, pos: new THREE.Vector3(), normal: new THREE.Vector3(), color: new THREE.Color(), size: 0, age: 0, life: 1, delay: 0 });

    this.pGeo = new THREE.BufferGeometry();
    this.pGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3));
    this.pGeo.setAttribute('size', new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES), 1));
    this.pGeo.setAttribute('tint', new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES * 4), 4));
    this.pGeo.setDrawRange(0, 0);
    this.pMat = new THREE.ShaderMaterial({
      vertexShader: glowVertex, fragmentShader: glowFragment, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, uniforms: { pixelScale: { value: 300 } },
    });
    this.points = new THREE.Points(this.pGeo, this.pMat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 9;
    for (let i = 0; i < MAX_PARTICLES; i++) this.particles.push({ active: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), color: new THREE.Color(), size: 0, age: 0, life: 1, drag: 1, lift: 0 });
    this.group.add(this.rippleMesh, this.points);
  }

  setPixelScale(v: number): void {
    this.pMat.uniforms.pixelScale.value = v;
  }

  /** A ring expanding on the surface at `pos` (on-sphere point). Size in world units. */
  ripple(pos: THREE.Vector3, color: number, size: number, life = 1.4, delay = 0): void {
    const r = this.ripples[this.nextRipple];
    this.nextRipple = (this.nextRipple + 1) % MAX_RIPPLES;
    r.active = true;
    r.pos.copy(pos);
    r.normal.copy(pos).normalize();
    r.color.set(color);
    r.size = size;
    r.age = 0;
    r.life = life;
    r.delay = delay;
  }

  burst(pos: THREE.Vector3, o: BurstOptions): void {
    const n = Math.round(o.count * this.intensity);
    const normal = pos.clone().normalize();
    const t1 = new THREE.Vector3().crossVectors(normal, Math.abs(normal.y) < 0.9 ? this.up : new THREE.Vector3(1, 0, 0)).normalize();
    const t2 = new THREE.Vector3().crossVectors(normal, t1);
    for (let i = 0; i < n; i++) {
      const p = this.particles[this.nextParticle];
      this.nextParticle = (this.nextParticle + 1) % MAX_PARTICLES;
      const a = Math.random() * Math.PI * 2;
      const spread = o.spread ?? 1;
      const tangential = t1.clone().multiplyScalar(Math.cos(a)).add(t2.clone().multiplyScalar(Math.sin(a))).multiplyScalar((1 - o.rise) * spread * (0.4 + Math.random() * 0.6));
      p.active = true;
      p.pos.copy(pos).addScaledVector(normal, 0.002);
      p.vel.copy(tangential).addScaledVector(normal, o.rise * (0.5 + Math.random() * 0.5)).multiplyScalar(o.speed);
      p.color.set(o.color).offsetHSL((Math.random() - 0.5) * 0.04, 0, (Math.random() - 0.5) * 0.12);
      p.size = o.size * (0.6 + Math.random() * 0.7);
      p.age = 0;
      p.life = o.life * (0.7 + Math.random() * 0.6);
      p.drag = 2.2;
      p.lift = o.lift ?? 0;
    }
  }

  get active(): boolean {
    return this.ripples.some((r) => r.active) || this.particles.some((p) => p.active);
  }

  update(dt: number): void {
    // Ripples
    let k = 0;
    for (const r of this.ripples) {
      if (!r.active) continue;
      if (r.delay > 0) { r.delay -= dt; continue; }
      r.age += dt / r.life;
      if (r.age >= 1) { r.active = false; continue; }
      const ease = 1 - (1 - r.age) ** 3;
      this.dummy.position.copy(r.pos).addScaledVector(r.normal, 0.003);
      this.dummy.quaternion.setFromUnitVectors(this.up, r.normal);
      this.dummy.scale.setScalar(r.size * (0.15 + 0.85 * ease));
      this.dummy.updateMatrix();
      this.rippleMesh.setMatrixAt(k, this.dummy.matrix);
      this.ageAttr.setX(k, r.age);
      this.colorAttr.setXYZ(k, r.color.r, r.color.g, r.color.b);
      k++;
    }
    this.rippleMesh.count = k;
    this.rippleMesh.instanceMatrix.needsUpdate = true;
    this.ageAttr.needsUpdate = true;
    this.colorAttr.needsUpdate = true;

    // Particles: packed into the front of the buffer each frame.
    const pos = this.pGeo.getAttribute('position') as THREE.BufferAttribute;
    const size = this.pGeo.getAttribute('size') as THREE.BufferAttribute;
    const tint = this.pGeo.getAttribute('tint') as THREE.BufferAttribute;
    let j = 0;
    for (const p of this.particles) {
      if (!p.active) continue;
      p.age += dt / p.life;
      if (p.age >= 1) { p.active = false; continue; }
      const damp = Math.exp(-p.drag * dt);
      p.vel.multiplyScalar(damp);
      if (p.lift) p.vel.addScaledVector(this.tmp.copy(p.pos).normalize(), p.lift * dt);
      p.pos.addScaledVector(p.vel, dt);
      // Never sink below the surface.
      const len = p.pos.length();
      if (len < 1.001) p.pos.setLength(1.001);
      pos.setXYZ(j, p.pos.x, p.pos.y, p.pos.z);
      size.setX(j, p.size * (1 - p.age * 0.5));
      const fade = p.age < 0.15 ? p.age / 0.15 : 1 - (p.age - 0.15) / 0.85;
      tint.setXYZW(j, p.color.r, p.color.g, p.color.b, Math.max(0, fade));
      j++;
    }
    this.pGeo.setDrawRange(0, j);
    pos.needsUpdate = true;
    size.needsUpdate = true;
    tint.needsUpdate = true;
  }

  clear(): void {
    for (const r of this.ripples) r.active = false;
    for (const p of this.particles) p.active = false;
    this.rippleMesh.count = 0;
    this.pGeo.setDrawRange(0, 0);
  }

  dispose(): void {
    this.rippleMesh.geometry.dispose();
    (this.rippleMesh.material as THREE.Material).dispose();
    this.pGeo.dispose();
    this.pMat.dispose();
  }
}
