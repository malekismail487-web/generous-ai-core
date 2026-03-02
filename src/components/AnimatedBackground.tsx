import { useEffect, useRef } from 'react';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';
import { useWallpaper } from '@/hooks/useWallpaper';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
  rotation: number;
  rotationSpeed: number;
  shape: 'circle' | 'ring' | 'square';
}

export function AnimatedBackground() {
  const { isLiteMode } = useThemeLanguage();
  const { wallpaper } = useWallpaper();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animFrameRef = useRef<number>(0);

  useEffect(() => {
    if (isLiteMode) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const shapes: ('circle' | 'ring' | 'square')[] = wallpaper.shapeBias ?? ['circle', 'ring', 'square'];
    const maxOpacity = wallpaper.maxOpacity ?? 0.08;

    // Create particles
    const count = Math.min(35, Math.floor((window.innerWidth * window.innerHeight) / 25000));
    particlesRef.current = Array.from({ length: count }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      size: Math.random() * 20 + 8,
      opacity: Math.random() * maxOpacity + 0.03,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.008,
      shape: shapes[Math.floor(Math.random() * shapes.length)],
    }));

    const { primaryH, primaryS, primaryL, accentH, accentS, accentL } = wallpaper;
    const lineAlpha = wallpaper.lineAlpha ?? 0.04;

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particlesRef.current.forEach((p, i) => {
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.rotationSpeed;

        if (p.x < -50) p.x = canvas.width + 50;
        if (p.x > canvas.width + 50) p.x = -50;
        if (p.y < -50) p.y = canvas.height + 50;
        if (p.y > canvas.height + 50) p.y = -50;

        const useAccent = i % 3 === 0;
        const h = useAccent ? accentH : primaryH;
        const s = useAccent ? accentS : primaryS;
        const l = useAccent ? accentL : primaryL;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.globalAlpha = p.opacity;

        if (p.shape === 'circle') {
          ctx.beginPath();
          ctx.arc(0, 0, p.size, 0, Math.PI * 2);
          ctx.fillStyle = `hsl(${h} ${s}% ${l}%)`;
          ctx.fill();
        } else if (p.shape === 'ring') {
          ctx.beginPath();
          ctx.arc(0, 0, p.size, 0, Math.PI * 2);
          ctx.strokeStyle = `hsl(${h} ${s}% ${l}%)`;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        } else {
          const half = p.size * 0.8;
          ctx.strokeStyle = `hsl(${h} ${s}% ${l}%)`;
          ctx.lineWidth = 1.5;
          ctx.strokeRect(-half, -half, half * 2, half * 2);
        }

        ctx.restore();
      });

      // Connection lines
      for (let i = 0; i < particlesRef.current.length; i++) {
        for (let j = i + 1; j < particlesRef.current.length; j++) {
          const a = particlesRef.current[i];
          const b = particlesRef.current[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 180) {
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            const alpha = (1 - dist / 180) * lineAlpha;
            ctx.strokeStyle = `hsla(${primaryH}, ${primaryS}%, ${primaryL}%, ${alpha})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }

      animFrameRef.current = requestAnimationFrame(draw);
    };

    animFrameRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [isLiteMode, wallpaper]);

  if (isLiteMode) return null;

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0"
      aria-hidden="true"
    />
  );
}
