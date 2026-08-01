import { Suspense, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Sparkles, Stars, Float } from '@react-three/drei';
import * as THREE from 'three';
import { useCalmMotion } from '@/lib/motion';

/* The iced-ion signature colour, matched to the CSS --glow token. */
const ION = '#4fd8ee';
const ION_DIM = '#1d6f7d';
const BONE = '#f4f6f7';

/* ────────────────────────────────────────────────
   One orbital shell: a hairline ring + electrons
   travelling along it, tilted in true 3D space.
   ──────────────────────────────────────────────── */
function OrbitShell({
  radius,
  tube = 0.008,
  tilt,
  speed,
  electrons = 2,
  calm,
}: {
  radius: number;
  tube?: number;
  tilt: [number, number, number];
  speed: number;
  electrons?: number;
  calm: boolean;
}) {
  const electronGroup = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (calm || !electronGroup.current) return;
    electronGroup.current.rotation.y += speed * delta;
  });

  const offsets = useMemo(
    () => Array.from({ length: electrons }, (_, i) => (i / electrons) * Math.PI * 2),
    [electrons],
  );

  return (
    <group rotation={tilt}>
      {/* The shell itself */}
      <mesh>
        <torusGeometry args={[radius, tube, 20, 160]} />
        <meshStandardMaterial
          color={ION}
          emissive={ION}
          emissiveIntensity={1.4}
          transparent
          opacity={0.32}
          roughness={0.3}
          metalness={0.6}
        />
      </mesh>

      {/* Electrons riding the shell */}
      <group ref={electronGroup}>
        {offsets.map((angle, i) => (
          <group key={i} rotation={[0, angle, 0]}>
            <mesh position={[radius, 0, 0]}>
              <sphereGeometry args={[0.055, 24, 24]} />
              <meshStandardMaterial
                color={BONE}
                emissive={ION}
                emissiveIntensity={2.4}
                roughness={0.15}
                metalness={0.4}
              />
            </mesh>
            {/* soft halo around each electron */}
            <mesh position={[radius, 0, 0]}>
              <sphereGeometry args={[0.13, 16, 16]} />
              <meshBasicMaterial color={ION} transparent opacity={0.12} depthWrite={false} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

/* ────────────────────────────────────────────────
   The nucleus: a metallic bone core wrapped in
   layered additive halos, like the mark's centre.
   ──────────────────────────────────────────────── */
function Nucleus({ calm }: { calm: boolean }) {
  const core = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (calm || !core.current) return;
    const t = state.clock.elapsedTime;
    const s = 1 + Math.sin(t * 1.4) * 0.05;
    core.current.scale.setScalar(s);
  });

  return (
    <group>
      <mesh ref={core}>
        <sphereGeometry args={[0.62, 64, 64]} />
        <meshStandardMaterial
          color={BONE}
          emissive={ION}
          emissiveIntensity={0.45}
          roughness={0.18}
          metalness={0.9}
        />
      </mesh>
      {/* Halos */}
      <mesh>
        <sphereGeometry args={[0.82, 32, 32]} />
        <meshBasicMaterial color={ION} transparent opacity={0.1} depthWrite={false} />
      </mesh>
      <mesh>
        <sphereGeometry args={[1.05, 32, 32]} />
        <meshBasicMaterial color={ION} transparent opacity={0.05} depthWrite={false} />
      </mesh>
      <pointLight color={ION} intensity={6} distance={9} position={[0, 0, 0]} />
    </group>
  );
}

/* ────────────────────────────────────────────────
   The signature atom, centred and slowly turning.
   ──────────────────────────────────────────────── */
function CentralAtom({ calm }: { calm: boolean }) {
  const group = useRef<THREE.Group>(null);
  useFrame((state, delta) => {
    if (calm || !group.current) return;
    group.current.rotation.y += delta * 0.08;
    group.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.15) * 0.08;
  });

  return (
    <group ref={group} scale={1.15}>
      <Nucleus calm={calm} />
      <OrbitShell radius={1.5} tilt={[1.2, 0, 0.3]} speed={0.9} electrons={2} calm={calm} />
      <OrbitShell radius={2.05} tilt={[0.5, 0.9, -0.4]} speed={-0.6} electrons={3} calm={calm} />
      <OrbitShell radius={2.55} tilt={[1.7, 0.4, 0.8]} speed={0.42} electrons={2} calm={calm} />
    </group>
  );
}

/* A smaller atom drifting in the background depth. */
function DriftAtom({
  position,
  scale,
  calm,
}: {
  position: [number, number, number];
  scale: number;
  calm: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (calm || !group.current) return;
    group.current.rotation.y += delta * 0.25;
    group.current.rotation.x += delta * 0.1;
  });

  return (
    <Float speed={calm ? 0 : 1.2} rotationIntensity={0.4} floatIntensity={0.8}>
      <group ref={group} position={position} scale={scale}>
        <mesh>
          <sphereGeometry args={[0.22, 32, 32]} />
          <meshStandardMaterial
            color={BONE}
            emissive={ION}
            emissiveIntensity={0.6}
            roughness={0.2}
            metalness={0.85}
          />
        </mesh>
        <mesh rotation={[1.1, 0.3, 0]}>
          <torusGeometry args={[0.55, 0.006, 16, 120]} />
          <meshStandardMaterial color={ION} emissive={ION} emissiveIntensity={1.2} transparent opacity={0.28} />
        </mesh>
        <mesh rotation={[0.4, 1.1, 0.5]}>
          <torusGeometry args={[0.72, 0.006, 16, 120]} />
          <meshStandardMaterial color={ION} emissive={ION} emissiveIntensity={1.2} transparent opacity={0.2} />
        </mesh>
      </group>
    </Float>
  );
}

/* Gentle parallax: the whole system leans toward the pointer. */
function ParallaxRig({ children, calm }: { children: React.ReactNode; calm: boolean }) {
  const group = useRef<THREE.Group>(null);
  const { pointer } = useThree();
  useFrame(() => {
    if (calm || !group.current) return;
    group.current.rotation.y += (pointer.x * 0.35 - group.current.rotation.y) * 0.04;
    group.current.rotation.x += (-pointer.y * 0.25 - group.current.rotation.x) * 0.04;
  });
  return <group ref={group}>{children}</group>;
}

function SceneContents({ calm }: { calm: boolean }) {
  return (
    <>
      <color attach="background" args={['#050507']} />
      <fog attach="fog" args={['#050507', 9, 30]} />

      <ambientLight intensity={0.25} />
      <directionalLight position={[6, 8, 6]} intensity={0.6} color={BONE} />
      <pointLight position={[-8, -4, -6]} intensity={2} color={ION_DIM} />

      <Stars radius={70} depth={45} count={calm ? 900 : 2600} factor={3.2} saturation={0} fade speed={calm ? 0 : 0.6} />

      <ParallaxRig calm={calm}>
        <CentralAtom calm={calm} />
        <DriftAtom position={[-6.2, 2.6, -5]} scale={0.9} calm={calm} />
        <DriftAtom position={[6.4, -2.2, -6]} scale={1.1} calm={calm} />
        <DriftAtom position={[4.8, 3.4, -8]} scale={0.7} calm={calm} />
        <DriftAtom position={[-5.6, -3.1, -7]} scale={0.8} calm={calm} />
      </ParallaxRig>

      {!calm && <Sparkles count={70} scale={[18, 12, 10]} size={2.4} speed={0.3} color={ION} opacity={0.5} />}
    </>
  );
}

/**
 * The living atmosphere of the whole product: a real WebGL field of orbiting
 * atoms, a glowing ion nucleus, drifting satellites and a deep starfield, fixed
 * behind every screen. Degrades to a calm, near-static frame for reduced-motion
 * and Lite-Mode devices.
 */
export default function AtomScene() {
  const calm = useCalmMotion();

  return (
    <div aria-hidden="true" className="fixed inset-0 -z-10" style={{ pointerEvents: 'none' }}>
      <Canvas
        dpr={[1, 1.75]}
        camera={{ position: [0, 0, 8.5], fov: 52 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        frameloop={calm ? 'demand' : 'always'}
      >
        <Suspense fallback={null}>
          <SceneContents calm={calm} />
        </Suspense>
      </Canvas>
      {/* Vignette + grain wash so UI panels always stay legible over the field */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(120% 90% at 50% 0%, transparent 40%, hsl(240 6% 2.5% / 0.55) 100%)',
        }}
      />
    </div>
  );
}
