/**
 * Procedural GLB generator. Takes a topic-driven ThreeDObjectSpec (from the AI)
 * and builds a real three.js scene, then exports it as a .glb binary that we
 * embed inside the PPTX via the morph patcher.
 *
 * NO hardcoded subjects. Every "if topic === Mitochondria" pattern is forbidden:
 * the AI returns an abstract spec (geometry family + color scheme + params) and
 * this file maps the spec into procedural geometry. New subjects are supported
 * by the AI returning a different geometry family, not by editing this file.
 *
 * Fallback chain: if the spec is malformed or three.js export fails, we throw
 * and the caller falls back to the 2D figure for that slide.
 */
import {
  Scene, Group, Color, Mesh, MeshStandardMaterial,
  SphereGeometry, TorusGeometry, BoxGeometry, CylinderGeometry, ConeGeometry,
  PlaneGeometry, BufferGeometry, BufferAttribute,
  AmbientLight, DirectionalLight, Object3D,
} from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import type { ThreeDObjectSpec } from './types';

function pickColor(scheme: string[], i: number): string {
  if (!scheme || scheme.length === 0) return '#cccccc';
  return scheme[i % scheme.length];
}

function makeMat(color: string, metalness = 0.25, roughness = 0.45): MeshStandardMaterial {
  return new MeshStandardMaterial({ color: new Color(color), metalness, roughness });
}

// --- geometry builders ---

function buildSphereCluster(spec: ThreeDObjectSpec): Group {
  const g = new Group();
  const count = Math.max(2, Math.min(40, Number(spec.structureParams?.count ?? 7)));
  const radius = Number(spec.structureParams?.radius ?? 0.45);
  for (let i = 0; i < count; i++) {
    const m = new Mesh(new SphereGeometry(radius, 24, 24), makeMat(pickColor(spec.colorScheme, i)));
    const angle = (i / count) * Math.PI * 2;
    m.position.set(Math.cos(angle) * 1.4, Math.sin(angle * 1.7) * 0.4, Math.sin(angle) * 1.4);
    g.add(m);
  }
  return g;
}

function buildHelix(spec: ThreeDObjectSpec): Group {
  const g = new Group();
  const turns = Number(spec.structureParams?.turns ?? 4);
  const beadsPerTurn = 24;
  const total = turns * beadsPerTurn;
  const radius = 0.9;
  const height = 3.5;
  for (let strand = 0; strand < 2; strand++) {
    for (let i = 0; i < total; i++) {
      const t = i / total;
      const angle = t * turns * Math.PI * 2 + (strand ? Math.PI : 0);
      const m = new Mesh(new SphereGeometry(0.12, 16, 16), makeMat(pickColor(spec.colorScheme, strand)));
      m.position.set(Math.cos(angle) * radius, t * height - height / 2, Math.sin(angle) * radius);
      g.add(m);
    }
  }
  // Rungs
  for (let i = 0; i < total; i += 4) {
    const t = i / total;
    const angle = t * turns * Math.PI * 2;
    const rung = new Mesh(new CylinderGeometry(0.04, 0.04, radius * 2, 8), makeMat(pickColor(spec.colorScheme, 2)));
    rung.position.set(0, t * height - height / 2, 0);
    rung.rotation.z = Math.PI / 2;
    rung.rotation.y = angle;
    g.add(rung);
  }
  return g;
}

function buildWaveMesh(spec: ThreeDObjectSpec): Group {
  const g = new Group();
  const segs = 80;
  const geo = new PlaneGeometry(4, 4, segs, segs);
  const pos = geo.attributes.position as BufferAttribute;
  const amp = Number(spec.structureParams?.amplitude ?? 0.4);
  const freq = Number(spec.structureParams?.frequency ?? 1.6);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    pos.setZ(i, Math.sin(x * freq) * amp + Math.cos(y * freq) * amp * 0.6);
  }
  geo.computeVertexNormals();
  const m = new Mesh(geo, makeMat(pickColor(spec.colorScheme, 0), 0.1, 0.6));
  m.rotation.x = -Math.PI / 2.4;
  g.add(m);
  return g;
}

function buildTorusRing(spec: ThreeDObjectSpec): Group {
  const g = new Group();
  const count = Math.max(1, Math.min(6, Number(spec.structureParams?.rings ?? 3)));
  for (let i = 0; i < count; i++) {
    const m = new Mesh(new TorusGeometry(1 + i * 0.35, 0.06, 16, 96), makeMat(pickColor(spec.colorScheme, i), 0.6, 0.25));
    m.rotation.x = (i * Math.PI) / 6;
    m.rotation.y = (i * Math.PI) / 4;
    g.add(m);
  }
  return g;
}

function buildLattice(spec: ThreeDObjectSpec): Group {
  const g = new Group();
  const n = Math.max(2, Math.min(5, Number(spec.structureParams?.size ?? 3)));
  const spacing = 0.7;
  for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) for (let z = 0; z < n; z++) {
    const m = new Mesh(new SphereGeometry(0.15, 16, 16), makeMat(pickColor(spec.colorScheme, (x + y + z) % spec.colorScheme.length)));
    m.position.set((x - (n - 1) / 2) * spacing, (y - (n - 1) / 2) * spacing, (z - (n - 1) / 2) * spacing);
    g.add(m);
  }
  return g;
}

function buildColumnStack(spec: ThreeDObjectSpec): Group {
  const g = new Group();
  const cols = Math.max(2, Math.min(10, Number(spec.structureParams?.columns ?? 5)));
  for (let i = 0; i < cols; i++) {
    const h = 0.6 + Math.abs(Math.sin(i * 1.3)) * 2.2;
    const m = new Mesh(new BoxGeometry(0.45, h, 0.45), makeMat(pickColor(spec.colorScheme, i)));
    m.position.set((i - (cols - 1) / 2) * 0.6, h / 2, 0);
    g.add(m);
  }
  return g;
}

function buildOrbitSystem(spec: ThreeDObjectSpec): Group {
  const g = new Group();
  const nucleus = new Mesh(new SphereGeometry(0.45, 32, 32), makeMat(pickColor(spec.colorScheme, 0), 0.5, 0.3));
  g.add(nucleus);
  const shells = Math.max(1, Math.min(5, Number(spec.structureParams?.shells ?? 3)));
  for (let s = 0; s < shells; s++) {
    const r = 0.9 + s * 0.55;
    const ring = new Mesh(new TorusGeometry(r, 0.018, 8, 96), makeMat(pickColor(spec.colorScheme, 1 + s), 0.8, 0.2));
    ring.rotation.x = (s * Math.PI) / 5;
    ring.rotation.y = (s * Math.PI) / 3;
    g.add(ring);
    const electrons = 2 + s;
    for (let e = 0; e < electrons; e++) {
      const angle = (e / electrons) * Math.PI * 2;
      const m = new Mesh(new SphereGeometry(0.09, 12, 12), makeMat(pickColor(spec.colorScheme, 2)));
      m.position.set(Math.cos(angle) * r, Math.sin(angle) * r * Math.sin(s), Math.sin(angle) * r * Math.cos(s));
      g.add(m);
    }
  }
  return g;
}

function buildArch(spec: ThreeDObjectSpec): Group {
  const g = new Group();
  const colA = makeMat(pickColor(spec.colorScheme, 0));
  const left = new Mesh(new CylinderGeometry(0.25, 0.3, 2.4, 16), colA);
  left.position.set(-1.0, 0, 0);
  const right = left.clone();
  right.position.set(1.0, 0, 0);
  g.add(left, right);
  const top = new Mesh(new TorusGeometry(1.0, 0.2, 12, 32, Math.PI), makeMat(pickColor(spec.colorScheme, 1)));
  top.position.set(0, 1.2, 0);
  g.add(top);
  return g;
}

function buildBustProxy(spec: ThreeDObjectSpec): Group {
  const g = new Group();
  const head = new Mesh(new SphereGeometry(0.8, 32, 32), makeMat(pickColor(spec.colorScheme, 0), 0.05, 0.95));
  head.position.set(0, 1.2, 0);
  const neck = new Mesh(new CylinderGeometry(0.32, 0.45, 0.6, 16), makeMat(pickColor(spec.colorScheme, 0), 0.05, 0.95));
  neck.position.set(0, 0.45, 0);
  const base = new Mesh(new BoxGeometry(1.4, 0.4, 0.9), makeMat(pickColor(spec.colorScheme, 1), 0.1, 0.7));
  base.position.set(0, -0.1, 0);
  g.add(head, neck, base);
  return g;
}

function buildTree(spec: ThreeDObjectSpec): Group {
  const g = new Group();
  const depth = Math.max(2, Math.min(5, Number(spec.structureParams?.depth ?? 3)));
  const grow = (x: number, y: number, len: number, level: number, colorIdx: number) => {
    if (level > depth) return;
    const m = new Mesh(new CylinderGeometry(0.04, 0.06, len, 8), makeMat(pickColor(spec.colorScheme, colorIdx)));
    m.position.set(x, y + len / 2, 0);
    g.add(m);
    if (level < depth) {
      grow(x - len * 0.4, y + len, len * 0.7, level + 1, colorIdx + 1);
      grow(x + len * 0.4, y + len, len * 0.7, level + 1, colorIdx + 1);
    }
  };
  grow(0, -1, 1.4, 1, 0);
  return g;
}

function buildGearTrain(spec: ThreeDObjectSpec): Group {
  const g = new Group();
  const gears = Math.max(2, Math.min(5, Number(spec.structureParams?.gears ?? 3)));
  for (let i = 0; i < gears; i++) {
    const r = 0.5 + (i % 2) * 0.25;
    const m = new Mesh(new CylinderGeometry(r, r, 0.18, 24), makeMat(pickColor(spec.colorScheme, i)));
    m.position.set((i - (gears - 1) / 2) * 1.1, 0, 0);
    m.rotation.x = Math.PI / 2;
    g.add(m);
  }
  return g;
}

function buildFlowPipes(spec: ThreeDObjectSpec): Group {
  const g = new Group();
  const segments = Math.max(3, Math.min(8, Number(spec.structureParams?.segments ?? 5)));
  for (let i = 0; i < segments; i++) {
    const m = new Mesh(new CylinderGeometry(0.18, 0.18, 1.0, 16), makeMat(pickColor(spec.colorScheme, i)));
    m.position.set((i - (segments - 1) / 2) * 0.9, Math.sin(i) * 0.4, 0);
    m.rotation.z = Math.PI / 2;
    g.add(m);
    const joint = new Mesh(new SphereGeometry(0.22, 16, 16), makeMat(pickColor(spec.colorScheme, (i + 1) % spec.colorScheme.length)));
    joint.position.set((i - (segments - 1) / 2) * 0.9 + 0.45, Math.sin(i) * 0.4, 0);
    g.add(joint);
  }
  return g;
}

const BUILDERS: Record<ThreeDObjectSpec['geometry'], (s: ThreeDObjectSpec) => Group> = {
  sphere_cluster: buildSphereCluster,
  helix:          buildHelix,
  wave_mesh:      buildWaveMesh,
  torus_ring:     buildTorusRing,
  lattice:        buildLattice,
  column_stack:   buildColumnStack,
  orbit_system:   buildOrbitSystem,
  arch:           buildArch,
  bust:           buildBustProxy,
  tree:           buildTree,
  gear_train:     buildGearTrain,
  flow_pipes:     buildFlowPipes,
};

function buildObjectFromSpec(spec: ThreeDObjectSpec): Group {
  const builder = BUILDERS[spec.geometry];
  if (!builder) throw new Error(`unknown_geometry:${spec.geometry}`);
  const g = builder(spec);
  // Center & normalise scale
  g.updateMatrixWorld(true);
  return g;
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

/** Build a .glb data URL for the given AI-decided spec. Resolves to data:model/gltf-binary;base64,... */
export async function generateGlbDataUrl(spec: ThreeDObjectSpec): Promise<string> {
  if (!spec || !spec.geometry) throw new Error('invalid_spec');
  const scene = new Scene();
  scene.background = null as unknown as Color; // transparent
  scene.add(new AmbientLight(0xffffff, 0.55));
  const key = new DirectionalLight(0xffffff, 1.1);
  key.position.set(3, 4, 5);
  scene.add(key);

  const obj: Object3D = buildObjectFromSpec(spec);
  scene.add(obj);

  const exporter = new GLTFExporter();
  const gltf: ArrayBuffer = await new Promise((resolve, reject) => {
    exporter.parse(scene, (result) => {
      if (result instanceof ArrayBuffer) resolve(result);
      else reject(new Error('glb_not_binary'));
    }, (err) => reject(err), { binary: true });
  });
  return `data:model/gltf-binary;base64,${arrayBufferToBase64(gltf)}`;
}

/** Hard fallback spec — used if the AI endpoint fails completely. */
export function fallbackSpec(colorScheme: string[]): ThreeDObjectSpec {
  return {
    geometry: 'orbit_system',
    colorScheme: colorScheme && colorScheme.length ? colorScheme : ['#cccccc', '#888888', '#444444'],
    structureParams: { shells: 3 },
    educationalBehavior: 'generic continuity object',
    animationParams: { rotateY: 360, loopMs: 6000 },
  };
}
