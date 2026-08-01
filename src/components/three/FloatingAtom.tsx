import { Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';

const ACCENT = new THREE.Color('#e8e8e8'); // silver-white
const SILVER = new THREE.Color('#b0b0b0'); // dimmer silver

function AtomCore() {
  const group = useRef<THREE.Group>(null!);
  const nucleus = useRef<THREE.Mesh>(null!);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    group.current.rotation.y = t * 0.4;
    group.current.rotation.x = Math.sin(t * 0.3) * 0.2;
    nucleus.current.scale.setScalar(1 + Math.sin(t * 2) * 0.06);
  });
  const shells = [
    { tilt: 1.2, radius: 1.5, speed: 1.8, color: ACCENT },
    { tilt: 2.1, radius: 1.9, speed: -1.3, color: SILVER },
    { tilt: 0.5, radius: 2.3, speed: 0.9, color: ACCENT },
  ];
  return (
    <group ref={group}>
      <mesh ref={nucleus}>
        <icosahedronGeometry args={[0.5, 2]} />
        <meshStandardMaterial color={ACCENT} emissive={ACCENT} emissiveIntensity={2.5} roughness={0.2} metalness={0.8} />
      </mesh>
      <pointLight color={ACCENT} intensity={2} distance={6} />
      {shells.map((s, i) => (
        <ElectronShell key={i} tilt={s.tilt} radius={s.radius} speed={s.speed} color={s.color} />
      ))}
    </group>
  );
}

function ElectronShell({ tilt, radius, speed, color }: { tilt: number; radius: number; speed: number; color: THREE.Color }) {
  const grp = useRef<THREE.Group>(null!);
  const el = useRef<THREE.Mesh>(null!);
  useFrame((state) => {
    const t = state.clock.elapsedTime * speed;
    grp.current.rotation.z = t;
    el.current.position.set(Math.cos(t * 2) * radius, Math.sin(t * 2) * radius, 0);
  });
  return (
    <group ref={grp} rotation={[tilt, 0, 0]}>
      <mesh>
        <torusGeometry args={[radius, 0.01, 8, 100]} />
        <meshBasicMaterial color={color} transparent opacity={0.3} />
      </mesh>
      <mesh ref={el}>
        <sphereGeometry args={[0.06, 12, 12]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={3} />
      </mesh>
    </group>
  );
}

/** A small floating atom — use in hero headers or empty states. */
export function FloatingAtom({ size = 120 }: { size?: number }) {
  return (
    <div style={{ width: size, height: size }} className="pointer-events-none">
      <Canvas camera={{ position: [0, 0, 5], fov: 50 }} dpr={[1, 1.5]} gl={{ alpha: true }}>
        <ambientLight intensity={0.2} />
        <Suspense fallback={null}>
          <AtomCore />
        </Suspense>
      </Canvas>
    </div>
  );
}

export default FloatingAtom;
