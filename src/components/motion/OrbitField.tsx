import { useEffect, useRef } from 'react';
import { useCalmMotion } from '@/lib/motion';

interface OrbitFieldProps {
  /** How many electrons travel the field. */
  density?: number;
  /** 0–1. How strongly the field reacts to the pointer. */
  reactivity?: number;
  className?: string;
}

interface Orbit {
  radius: number;
  tilt: number;
  yaw: number;
  speed: number;
  phase: number;
  weight: number;
}

interface Electron {
  orbit: number;
  angle: number;
  speed: number;
  size: number;
}

/**
 * The signature background of Lumina: nested orbital shells drawn in true 3D
 * (projected to 2D canvas) with electrons tracing them and a luminous nucleus
 * at the centre of gravity. It is the logo, alive and breathing behind the app.
 */
export function OrbitField({ density = 14, reactivity = 0.6, className = '' }: OrbitFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const calm = useCalmMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let dpr = 1;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener('resize', resize);

    const base = Math.min(width, height);
    const orbits: Orbit[] = Array.from({ length: 5 }, (_, i) => ({
      radius: base * (0.22 + i * 0.11),
      tilt: 0.5 + i * 0.28,
      yaw: (i * Math.PI) / 3.1,
      speed: 0.00018 - i * 0.000018,
      phase: i * 1.4,
      weight: 1 - i * 0.13,
    }));

    const electrons: Electron[] = Array.from({ length: density }, (_, i) => ({
      orbit: i % orbits.length,
      angle: Math.random() * Math.PI * 2,
      speed: 0.0006 + Math.random() * 0.0009,
      size: 1.1 + Math.random() * 2.1,
    }));

    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    const onPointer = (event: PointerEvent) => {
      pointer.tx = (event.clientX / window.innerWidth - 0.5) * reactivity;
      pointer.ty = (event.clientY / window.innerHeight - 0.5) * reactivity;
    };
    window.addEventListener('pointermove', onPointer, { passive: true });

    let isDark = !document.documentElement.classList.contains('light');
    const themeObserver = new MutationObserver(() => {
      isDark = !document.documentElement.classList.contains('light');
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    /** Project a point on an orbit into screen space with depth. */
    const project = (orbit: Orbit, angle: number, driftX: number, driftY: number) => {
      const x = Math.cos(angle) * orbit.radius;
      const z = Math.sin(angle) * orbit.radius;
      const tilt = orbit.tilt + driftY;
      const yaw = orbit.yaw + driftX;

      const x1 = x * Math.cos(yaw) - z * Math.sin(yaw);
      const z1 = x * Math.sin(yaw) + z * Math.cos(yaw);
      const y2 = z1 * Math.sin(tilt);
      const z2 = z1 * Math.cos(tilt);

      const perspective = 900 / (900 + z2);
      return {
        x: width / 2 + x1 * perspective,
        y: height / 2 + y2 * perspective,
        depth: perspective,
      };
    };

    let raf = 0;
    let last = performance.now();

    const render = (now: number) => {
      const dt = Math.min(now - last, 48);
      last = now;

      pointer.x += (pointer.tx - pointer.x) * 0.045;
      pointer.y += (pointer.ty - pointer.y) * 0.045;

      ctx.clearRect(0, 0, width, height);
      const ink = isDark ? '245, 245, 243' : '18, 18, 22';

      // Nucleus halo
      const halo = ctx.createRadialGradient(
        width / 2 + pointer.x * 40,
        height / 2 + pointer.y * 40,
        0,
        width / 2,
        height / 2,
        base * 0.55,
      );
      halo.addColorStop(0, `rgba(${ink}, ${isDark ? 0.07 : 0.05})`);
      halo.addColorStop(1, `rgba(${ink}, 0)`);
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, width, height);

      // Orbital shells
      orbits.forEach((orbit) => {
        orbit.phase += orbit.speed * dt;
        ctx.beginPath();
        const steps = 96;
        for (let i = 0; i <= steps; i++) {
          const angle = orbit.phase + (i / steps) * Math.PI * 2;
          const p = project(orbit, angle, pointer.x, pointer.y);
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
        ctx.closePath();
        ctx.strokeStyle = `rgba(${ink}, ${(isDark ? 0.075 : 0.06) * orbit.weight})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      });

      // Electrons tracing the shells
      electrons.forEach((electron) => {
        const orbit = orbits[electron.orbit];
        electron.angle += electron.speed * dt;
        const p = project(orbit, electron.angle + orbit.phase, pointer.x, pointer.y);
        const alpha = (isDark ? 0.42 : 0.32) * p.depth * p.depth;

        // Trailing arc, the way the logo's arrows sweep
        ctx.beginPath();
        for (let t = 0; t < 14; t++) {
          const q = project(orbit, electron.angle + orbit.phase - t * 0.045, pointer.x, pointer.y);
          if (t === 0) ctx.moveTo(q.x, q.y);
          else ctx.lineTo(q.x, q.y);
        }
        ctx.strokeStyle = `rgba(${ink}, ${alpha * 0.28})`;
        ctx.lineWidth = electron.size * 0.6;
        ctx.lineCap = 'round';
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(p.x, p.y, electron.size * p.depth, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${ink}, ${alpha})`;
        ctx.fill();
      });

      // Nucleus
      const pulse = 1 + Math.sin(now / 1400) * 0.06;
      ctx.beginPath();
      ctx.arc(width / 2 + pointer.x * 18, height / 2 + pointer.y * 18, base * 0.045 * pulse, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${ink}, ${isDark ? 0.16 : 0.12})`;
      ctx.fill();

      raf = requestAnimationFrame(render);
    };

    if (!calm) {
      raf = requestAnimationFrame(render);
    } else {
      // Static single frame so the composition still reads.
      render(performance.now());
      cancelAnimationFrame(raf);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointer);
      themeObserver.disconnect();
    };
  }, [calm, density, reactivity]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`orbit-field pointer-events-none absolute inset-0 h-full w-full ${className}`}
    />
  );
}
