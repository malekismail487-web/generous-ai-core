import { useMemo, useRef, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { EffectComposer, Bloom, Vignette, ChromaticAberration, Noise } from '@react-three/postprocessing';
import * as THREE from 'three';

const ACCENT = new THREE.Color('#e8e8e8');
const SILVER = new THREE.Color('#b0b0b0');
const DEEP = new THREE.Color('#050505');
const WARM_SILVER = new THREE.Color('#f0f0f0');

function QuantumCore() {
  
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const pulse = 1 + Math.sin(t * 1.2) * 0.05;
    core.current.scale.setScalar(pulse);
    core.current.rotation.y = t * 0.25;
    core.current.rotation.x = Math.sin(t * 0.3) * 0.15;
    shell1.current.rotation.y = -t * 0.15;
    shell1.current.rotation.z = Math.sin(t * 0.2) * 0.1;
    shell1.current.scale.setScalar(1.4 + Math.sin(t * 0.8) * 0.08);
    shell2.current.rotation.y = t * 0.1;
    shell2.current.rotation.x = Math.cos(t * 0.25) * 0.12;
    shell2.current.scale.setScalar(1.9 + Math.cos(t * 0.6) * 0.1);
    ring1.current.rotation.z = t * 0.3;
    ring1.current.rotation.x = Math.sin(t * 0.15) * 0.2;
    ring2.current.rotation.z = -t * 0.2;
    ring2.current.rotation.y = Math.cos(t * 0.18) * 0.25;
  });
  
  return (
    <group>
      <mesh ref={core}>
        <icosahedronGeometry args={[0.7, 3]} />
        <meshStandardMaterial color={WARM_SILVER} emissive={ACCENT} emissiveIntensity={3} roughness={0.15} metalness={0.95} />
      </mesh>
      <mesh ref={shell1}>
        <icosahedronGeometry args={[1.2, 1]} />
        <meshBasicMaterial color={SILVER} wireframe transparent opacity={0.12} />
      </mesh>
      <mesh ref={shell2}>
        <icosahedronGeometry args={[1.8, 1]} />
        <meshBasicMaterial color={ACCENT} wireframe transparent opacity={0.08} />
      </mesh>
      <mesh ref={ring1} rotation={[Math.PI / 3, 0, 0]}>
        <torusGeometry args={[2.4, 0.015, 16, 100]} />
        <meshBasicMaterial color={ACCENT} transparent opacity={0.2} />
      </mesh>
      <mesh ref={ring2} rotation={[Math.PI / 4, Math.PI / 6, 0]}>
        <torusGeometry args={[2.8, 0.012, 16, 100]} />
        <meshBasicMaterial color={SILVER} transparent opacity={0.15} />
      </mesh>
      <pointLight color={ACCENT} intensity={4} distance={15} />
      <pointLight color={WARM_SILVER} intensity={2} distance={8} />
    </group>
  );
}

export function CosmicBackground({ className = '' }: { className?: string }) {
  return (
    <div className={`fixed inset-0 z-0 ${className}`} aria-hidden="true" style={{ pointerEvents: 'none' }}>
      <Canvas camera={{ position: [0, 0, 10], fov: 50 }} gl={{ antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: true }} dpr={[1, 2]} style={{ background: '#000000' }}>
        <color attach="background" args={['#000000']} />
        <fog attach="fog" args={['#000000', 18, 45]} />
        <ambientLight intensity={0.12} />
        <Suspense fallback={null}>
          <QuantumCore />
          <EffectComposer disableNormalPass>
            <Bloom intensity={0.9} luminanceThreshold={0.12} luminanceSmoothing={0.85} mipmapBlur levels={9} />
            <Vignette eskil={false} offset={0.25} darkness={0.8} />
            <Noise opacity={0.035} />
            <ChromaticAberration offset={[0.0015, 0.0015]} />
          </EffectComposer>
        </Suspense>
      </Canvas>
    </div>
  );
}

export default CosmicBackground;
