import { useMemo, useRef, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';

/* ============================================================
   COSMIC BACKGROUND — real WebGL 3D powered by three.js + R3F
   Pure jet-black space with orbiting atoms, glowing nuclei,
   drifting particle fields, energy rings, and a slow nebula glow.
   The whole scene reacts gently to pointer movement.
   ============================================================ */

const ACCENT = new THREE.Color('#e8e8e8'); // silver-white (primary)
const SILVER = new THREE.Color('#b0b0b0'); // dimmer silver
const DEEP = new THREE.Color('#0a0a0a');   // near-black

/* ---------- Nucleus: glowing core sphere ---------- */
function Nucleus() {
  const mesh = useRef<THREE.Mesh>(null!);
  const halo = useRef<THREE.Mesh>(null!);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const pulse = 1 + Math.sin(t * 1.6) * 0.08;
    mesh.current.scale.setScalar(pulse);
    mesh.current.rotation.y = t * 0.3;
    halo.current.scale.setScalar(1 + Math.sin(t * 0.9) * 0.15);
    (halo.current.material as THREE.MeshBasicMaterial).opacity = 0.12 + Math.sin(t * 0.9) * 0.06;
  });
  return (
    <group>
      <mesh ref={mesh}>
        <icosahedronGeometry args={[0.9, 2]} />
        <meshStandardMaterial
          color={ACCENT}
          emissive={ACCENT}
          emissiveIntensity={2.4}
          roughness={0.2}
          metalness={0.8}
        />
      </mesh>
      <mesh ref={halo}>
        <sphereGeometry args={[1.6, 32, 32]} />
        <meshBasicMaterial color={ACCENT} transparent opacity={0.14} side={THREE.BackSide} />
      </mesh>
      <pointLight color={ACCENT} intensity={3} distance={12} />
    </group>
  );
}

/* ---------- Electron shells (orbiting atom rings) ---------- */
function AtomShell({ tilt, speed, radius, color }: { tilt: number; speed: number; radius: number; color: THREE.Color }) {
  const group = useRef<THREE.Group>(null!);
  const electron = useRef<THREE.Mesh>(null!);
  const trail = useRef<THREE.Mesh>(null!);
  useFrame((state) => {
    const t = state.clock.elapsedTime * speed;
    group.current.rotation.z = t;
    const ePos = electron.current.position;
    ePos.set(Math.cos(t * 3) * radius, Math.sin(t * 3) * radius, 0);
    trail.current.rotation.z = t;
  });
  return (
    <group ref={group} rotation={[tilt, 0, 0]}>
      {/* ring */}
      <mesh>
        <torusGeometry args={[radius, 0.012, 8, 128]} />
        <meshBasicMaterial color={color} transparent opacity={0.28} />
      </mesh>
      {/* electron */}
      <mesh ref={electron}>
        <sphereGeometry args={[0.08, 16, 16]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={3} />
      </mesh>
    </group>
  );
}

/* ---------- Particle starfield ---------- */
function StarField({ count = 1800 }: { count?: number }) {
  const points = useRef<THREE.Points>(null!);
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 8 + Math.random() * 22;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      arr[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      arr[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      arr[i * 3 + 2] = r * Math.cos(phi);
    }
    return arr;
  }, [count]);
  useFrame((state) => {
    points.current.rotation.y = state.clock.elapsedTime * 0.015;
    points.current.rotation.x = state.clock.elapsedTime * 0.008;
  });
  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial size={0.035} color={SILVER} transparent opacity={0.7} sizeAttenuation depthWrite={false} />
    </points>
  );
}

/* ---------- Drifting particle cloud (energy dust) ---------- */
function DustCloud({ count = 400 }: { count?: number }) {
  const points = useRef<THREE.Points>(null!);
  const { positions, speeds } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const spd = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 14;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 14;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 14;
      spd[i] = 0.1 + Math.random() * 0.3;
    }
    return { positions: pos, speeds: spd };
  }, [count]);
  useFrame((state, delta) => {
    const geom = points.current.geometry as THREE.BufferGeometry;
    const attr = geom.attributes.position as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    for (let i = 0; i < count; i++) {
      arr[i * 3 + 1] += speeds[i] * delta * 0.3;
      if (arr[i * 3 + 1] > 7) arr[i * 3 + 1] = -7;
    }
    attr.needsUpdate = true;
    points.current.rotation.y = state.clock.elapsedTime * 0.02;
  });
  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial size={0.06} color={ACCENT} transparent opacity={0.35} sizeAttenuation depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  );
}

/* ---------- Floating glowing orbs ---------- */
function GlowingOrb({ position, color, size, speed }: { position: [number, number, number]; color: THREE.Color; size: number; speed: number }) {
  const mesh = useRef<THREE.Mesh>(null!);
  const initial = useRef(position);
  useFrame((state) => {
    const t = state.clock.elapsedTime * speed;
    mesh.current.position.y = initial.current[1] + Math.sin(t) * 0.8;
    mesh.current.position.x = initial.current[0] + Math.cos(t * 0.7) * 0.5;
    mesh.current.rotation.y = t * 0.5;
  });
  return (
    <mesh ref={mesh} position={position}>
      <sphereGeometry args={[size, 24, 24]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} roughness={0.3} metalness={0.6} transparent opacity={0.75} />
    </mesh>
  );
}

/* ---------- Energy ring (rotating torus) ---------- */
function EnergyRing({ radius, tilt, color, speed }: { radius: number; tilt: number; color: THREE.Color; speed: number }) {
  const mesh = useRef<THREE.Mesh>(null!);
  useFrame((state) => {
    mesh.current.rotation.z = state.clock.elapsedTime * speed;
  });
  return (
    <mesh ref={mesh} rotation={[tilt, 0, 0]}>
      <torusGeometry args={[radius, 0.02, 12, 200]} />
      <meshBasicMaterial color={color} transparent opacity={0.18} />
    </mesh>
  );
}

/* ---------- Pointer parallax rig ---------- */
function CameraRig() {
  const { camera, pointer } = useThree();
  useFrame(() => {
    camera.position.x += (pointer.x * 1.2 - camera.position.x) * 0.03;
    camera.position.y += (pointer.y * 0.8 - camera.position.y) * 0.03;
    camera.lookAt(0, 0, 0);
  });
  return null;
}

/* ---------- Nebula gradient backdrop (inside Canvas) ---------- */
function NebulaBackdrop() {
  const mesh = useRef<THREE.Mesh>(null!);
  useFrame((state) => {
    mesh.current.rotation.z = state.clock.elapsedTime * 0.01;
  });
  return (
    <mesh ref={mesh} position={[0, 0, -12]}>
      <planeGeometry args={[60, 60]} />
      <shaderMaterial
        uniforms={{
          uColorA: { value: DEEP },
          uColorB: { value: new THREE.Color('#1a1a1a') },
          uColorC: { value: new THREE.Color('#000000') },
          uTime: { value: 0 },
        }}
        vertexShader={`
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={`
          varying vec2 vUv;
          uniform vec3 uColorA;
          uniform vec3 uColorB;
          uniform vec3 uColorC;
          uniform float uTime;
          void main() {
            vec2 p = vUv - 0.5;
            float d = length(p);
            float ang = atan(p.y, p.x);
            float swirl = sin(ang * 3.0 + uTime * 0.3) * 0.08;
            vec3 col = mix(uColorB, uColorA, smoothstep(0.0, 0.35, d + swirl));
            col = mix(col, uColorC, smoothstep(0.35, 0.7, d));
            gl_FragColor = vec4(col, 1.0);
          }
        `}
      />
    </mesh>
  );
}

/* ---------- Main exported scene ---------- */
export function CosmicBackground({ className = '' }: { className?: string }) {
  return (
    <div className={`fixed inset-0 -z-10 ${className}`} aria-hidden="true">
      <Canvas
        camera={{ position: [0, 0, 8], fov: 55 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        dpr={[1, 1.8]}
        style={{ background: 'transparent' }}
      >
        <color attach="background" args={['#000000']} />
        <fog attach="fog" args={['#000000', 14, 30]} />
        <ambientLight intensity={0.15} />
        <Suspense fallback={null}>
          <NebulaBackdrop />
          <StarField />
          <DustCloud />
          <Nucleus />
          <AtomShell tilt={1.2} speed={0.5} radius={2.2} color={ACCENT} />
          <AtomShell tilt={2.1} speed={-0.35} radius={3.0} color={SILVER} />
          <AtomShell tilt={0.6} speed={0.28} radius={3.8} color={ACCENT} />
          <EnergyRing radius={5.5} tilt={1.4} color={ACCENT} speed={0.1} />
          <EnergyRing radius={6.5} tilt={2.3} color={SILVER} speed={-0.06} />
          <GlowingOrb position={[-4, 2, -2]} color={ACCENT} size={0.25} speed={0.4} />
          <GlowingOrb position={[4.5, -1.5, -1]} color={SILVER} size={0.18} speed={0.55} />
          <GlowingOrb position={[3, 3, -3]} color={ACCENT} size={0.15} speed={0.35} />
          <GlowingOrb position={[-3.5, -2.5, -2]} color={SILVER} size={0.2} speed={0.5} />
          <CameraRig />
          <EffectComposer>
            <Bloom intensity={0.85} luminanceThreshold={0.15} luminanceSmoothing={0.9} mipmapBlur />
            <Vignette eskil={false} offset={0.2} darkness={0.85} />
          </EffectComposer>
        </Suspense>
      </Canvas>
    </div>
  );
}

export default CosmicBackground;
