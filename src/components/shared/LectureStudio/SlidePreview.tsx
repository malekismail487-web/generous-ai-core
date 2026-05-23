import { useEffect, useMemo, useRef, useState, useLayoutEffect } from 'react';
import { ChevronLeft, ChevronRight, Maximize2, Minimize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Outline, ImageState, Paragraph, HeroMotion, SlideLayout } from './types';
import { AESTHETIC_THEMES } from './types';

const SLIDE_W = 1280;
const SLIDE_H = 720;

interface PreviewSlide {
  kind: 'cover' | 'chapter' | 'content' | 'takeaways';
  paragraph?: Paragraph;
  index?: number;
  layout?: SlideLayout;
}

interface Props {
  outline: Outline;
  images: ImageState[];
  heroUrl: string | null;
}

function buildSlides(outline: Outline): PreviewSlide[] {
  const slides: PreviewSlide[] = [
    { kind: 'cover' },
    { kind: 'chapter' },
    ...outline.paragraphs.map((p, i) => ({
      kind: 'content' as const, paragraph: p, index: i,
      layout: p.slide_layout || 'ring_portrait',
    })),
  ];
  if (outline.key_takeaways?.length) slides.push({ kind: 'takeaways' });
  return slides;
}

function heroStyle(motion: HeroMotion | undefined, fallback: HeroMotion, subtle = false) {
  const m = motion || fallback;
  const heightPct = subtle ? Math.max(14, Math.min(24, m.scale * 22)) : Math.max(20, Math.min(140, m.scale * 100));
  return {
    left: `${m.x * 100}%`,
    top: `${m.y * 100}%`,
    height: `${heightPct}%`,
    width: `${heightPct}%`,
    transform: `translate(-50%, -50%) rotate(${m.rotate}deg)`,
    opacity: subtle ? Math.min(0.22, typeof m.opacity === 'number' ? m.opacity : 0.18) : (typeof m.opacity === 'number' ? m.opacity : 1),
  } as React.CSSProperties;
}

function figureStyle(layout: SlideLayout | undefined) {
  const base: React.CSSProperties = { position: 'absolute', objectFit: 'contain', filter: 'drop-shadow(0 36px 50px rgba(0,0,0,0.45))' };
  if (layout === 'quadrant') return { ...base, left: '50%', top: '51%', width: '34%', height: '48%', transform: 'translate(-50%, -50%) rotate(2deg)' };
  if (layout === 'half_bleed_left') return { ...base, left: '5%', top: '13%', width: '44%', height: '74%', transform: 'rotate(2deg)' };
  if (layout === 'half_bleed_right') return { ...base, right: '5%', top: '13%', width: '44%', height: '74%', transform: 'rotate(-2deg)' };
  if (layout === 'stat_callout') return { ...base, right: '8%', top: '18%', width: '30%', height: '52%', transform: 'rotate(-3deg)' };
  if (layout === 'iso_cube') return { ...base, right: '11%', top: '14%', width: '34%', height: '54%' };
  return { ...base, left: '9%', top: '18%', width: '42%', height: '68%', transform: 'rotate(-1deg)' };
}

export function SlidePreview({ outline, images, heroUrl }: Props) {
  const aTheme = AESTHETIC_THEMES[outline.aesthetic] || AESTHETIC_THEMES.cinematic_editorial;
  const bg = `#${aTheme.bgHex}`;
  const fg = `#${aTheme.fgHex}`;
  const slides = useMemo(() => buildSlides(outline), [outline]);

  const [idx, setIdx] = useState(0);
  const [scale, setScale] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Fit-to-container
  useLayoutEffect(() => {
    const fit = () => {
      const el = wrapRef.current;
      if (!el) return;
      const sx = el.clientWidth / SLIDE_W;
      const sy = el.clientHeight / SLIDE_H;
      setScale(Math.min(sx, sy, 1.4));
    };
    fit();
    const ro = new ResizeObserver(fit);
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [fullscreen]);

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') setIdx((i) => Math.min(i + 1, slides.length - 1));
      else if (e.key === 'ArrowLeft') setIdx((i) => Math.max(i - 1, 0));
      else if (e.key === 'Escape' && fullscreen) setFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [slides.length, fullscreen]);

  const slide = slides[idx];
  const total = outline.paragraphs.length;

  // Hero motion for current slide — drives the visible FLIP-style morph
  const currentMotion: HeroMotion = useMemo(() => {
    if (slide.kind === 'cover') return { x: 0.72, y: 0.55, scale: 1.15, rotate: -6, opacity: 1 };
    if (slide.kind === 'chapter') return { x: 0.85, y: 0.5, scale: 1.3, rotate: 8, opacity: 0.6 };
    if (slide.kind === 'takeaways') return { x: 0.85, y: 0.5, scale: 0.9, rotate: -4, opacity: 0.35 };
    return slide.paragraph?.hero_motion || { x: 0.5, y: 0.5, scale: 0.55, rotate: 0, opacity: 1 };
  }, [slide]);

  return (
    <div
      ref={stageRef}
      className={fullscreen ? 'fixed inset-0 z-50 bg-black flex flex-col' : 'rounded-2xl overflow-hidden border border-border bg-black/95'}
      style={{ height: fullscreen ? '100vh' : 520 }}
    >
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 text-white/70 text-xs">
        <div className="flex items-center gap-2">
          <span className="uppercase tracking-widest">{outline.aesthetic.replace(/_/g, ' ')}</span>
          <span className="opacity-50">·</span>
          <span>{idx + 1} / {slides.length}</span>
        </div>
        <Button size="sm" variant="ghost" className="text-white/70 hover:text-white hover:bg-white/10 h-7 px-2"
          onClick={() => setFullscreen((f) => !f)}>
          {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </Button>
      </div>

      {/* Stage */}
      <div ref={wrapRef} className="relative flex-1 overflow-hidden flex items-center justify-center">
        <div
          className="relative shadow-2xl"
          style={{
            width: SLIDE_W, height: SLIDE_H, background: bg, color: fg,
            transform: `scale(${scale})`, transformOrigin: 'center center',
            fontFamily: aTheme.bodyFont,
          }}
        >
          {/* Hairline frame */}
          <div className="absolute inset-[34px] border opacity-30 pointer-events-none" style={{ borderColor: fg }} />

          {/* Hero — animated via CSS transition on left/top/width/height/rotate */}
          {heroUrl && (
            <img
              src={heroUrl}
              alt={outline.hero_subject_label || 'hero'}
              className="absolute object-contain pointer-events-none select-none"
              style={{
                ...heroStyle(currentMotion, { x: 0.5, y: 0.5, scale: 0.55, rotate: 0 }, slide.kind === 'content'),
                transition: 'all 700ms cubic-bezier(0.22, 1, 0.36, 1)',
                filter: aTheme.bgHex === '000000' ? 'drop-shadow(0 0 40px rgba(255,255,255,0.05))' : 'none',
              }}
              draggable={false}
            />
          )}

          {/* Ring for ring_portrait + quadrant */}
          {(slide.layout === 'ring_portrait' || slide.layout === 'quadrant') && (
            <div
              className="absolute rounded-full border pointer-events-none"
              style={{
                left: slide.layout === 'ring_portrait' ? '30%' : '50%',
                top: slide.layout === 'ring_portrait' ? '55%' : '50%',
                width: slide.layout === 'ring_portrait' ? '36%' : '28%',
                aspectRatio: '1 / 1',
                transform: 'translate(-50%, -50%)',
                borderColor: fg,
                opacity: 0.45,
                transition: 'all 700ms cubic-bezier(0.22, 1, 0.36, 1)',
              }}
            />
          )}

          {/* Slide-specific content */}
          <SlideContents slide={slide} outline={outline} images={images} total={total} fg={fg} headingFont={aTheme.headingFont} />

          {/* Footer chip */}
          <div className="absolute bottom-4 left-8 text-[11px] tracking-[0.3em] opacity-50" style={{ color: fg }}>
            LUMINA
          </div>
          <div className="absolute bottom-4 right-8 text-[11px] tracking-[0.2em] opacity-50" style={{ color: fg }}>
            {slide.kind === 'content' ? `${(slide.index ?? 0) + 1} / ${total}` : ''}
          </div>
        </div>

        {/* Nav */}
        <button
          onClick={() => setIdx((i) => Math.max(i - 1, 0))}
          disabled={idx === 0}
          className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center disabled:opacity-20"
        >
          <ChevronLeft size={18} />
        </button>
        <button
          onClick={() => setIdx((i) => Math.min(i + 1, slides.length - 1))}
          disabled={idx === slides.length - 1}
          className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center disabled:opacity-20"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Dots */}
      <div className="flex justify-center gap-1.5 py-2">
        {slides.map((_, i) => (
          <button key={i} onClick={() => setIdx(i)}
            className={`h-1.5 rounded-full transition-all ${i === idx ? 'w-6 bg-white' : 'w-1.5 bg-white/30 hover:bg-white/50'}`} />
        ))}
      </div>
    </div>
  );
}

function SlideContents({ slide, outline, images, total, fg, headingFont }: { slide: PreviewSlide; outline: Outline; images: ImageState[]; total: number; fg: string; headingFont: string }) {
  if (slide.kind === 'cover') {
    return (
      <>
        <div className="absolute top-12 left-12 text-[11px] tracking-[0.4em] opacity-50" style={{ color: fg }}>
          A LUMINA LECTURE
        </div>
        <div className="absolute" style={{ left: 56, top: '38%', maxWidth: '55%', color: fg, fontFamily: headingFont }}>
          <h1 style={{ fontSize: 76, fontWeight: 700, lineHeight: 0.95, letterSpacing: '-0.02em' }}>{outline.title}</h1>
          {outline.theme_tagline && (
            <p className="italic opacity-70 mt-4" style={{ fontSize: 20 }}>{outline.theme_tagline}</p>
          )}
        </div>
      </>
    );
  }

  if (slide.kind === 'chapter') {
    const label = outline.hero_subject_label || outline.title.split(/[:—-]/)[0].trim();
    return (
      <>
        <div className="absolute top-12 left-12 text-[11px] tracking-[0.4em] opacity-50" style={{ color: fg }}>
          {label.toUpperCase()}
        </div>
        <div className="absolute" style={{ left: 56, top: '40%', maxWidth: '60%', color: fg, fontFamily: headingFont }}>
          <h2 style={{ fontSize: 96, fontWeight: 700, lineHeight: 0.9, letterSpacing: '-0.02em' }}>{label}</h2>
        </div>
      </>
    );
  }

  if (slide.kind === 'takeaways') {
    return (
      <>
        <div className="absolute top-12 left-12 text-[11px] tracking-[0.4em] opacity-50" style={{ color: fg }}>
          KEY TAKEAWAYS
        </div>
        <h2 className="absolute" style={{ left: 56, top: 110, fontSize: 56, fontWeight: 700, color: fg, fontFamily: headingFont }}>
          What to remember
        </h2>
        <ul className="absolute" style={{ left: 56, top: 220, right: '40%', color: fg }}>
          {outline.key_takeaways.slice(0, 7).map((t, i) => (
            <li key={i} className="flex gap-3 mb-3" style={{ fontSize: 22, lineHeight: 1.35 }}>
              <span className="opacity-50">■</span><span>{t}</span>
            </li>
          ))}
        </ul>
      </>
    );
  }

  const p = slide.paragraph!;
  const layout = slide.layout;
  const slideFigure = typeof slide.index === 'number' ? images[slide.index]?.url : undefined;

  if (layout === 'iso_cube') {
    return (
      <>
        {slideFigure && <img src={slideFigure} alt="" style={figureStyle(layout)} draggable={false} />}
        <div className="absolute top-12 left-12 text-[11px] tracking-[0.4em] opacity-50" style={{ color: fg }}>CORE CONCEPT</div>
        <div className="absolute" style={{ left: 56, top: 130, maxWidth: '45%', color: fg, fontFamily: headingFont }}>
          <h3 style={{ fontSize: 48, fontWeight: 700, lineHeight: 1, letterSpacing: '-0.02em' }}>{p.heading}</h3>
          <p className="mt-6 opacity-80" style={{ fontSize: 16, lineHeight: 1.5 }}>
            {p.body.split('. ').slice(0, 2).join('. ')}.
          </p>
        </div>
        {/* CSS-3D cube */}
        <div
          className="absolute"
          style={{
            left: '74%', top: '52%',
            width: 260, height: 260,
            transform: 'translate(-50%, -50%)',
            perspective: 900,
          }}
        >
          <div
            style={{
              position: 'relative', width: '100%', height: '100%',
              transformStyle: 'preserve-3d',
              transform: 'rotateX(-22deg) rotateY(35deg)',
              animation: 'lumina-cube-spin 18s linear infinite',
            }}
          >
            {(['front','back','right','left','top','bottom'] as const).map((face) => {
              const t = {
                front:  'translateZ(130px)',
                back:   'rotateY(180deg) translateZ(130px)',
                right:  'rotateY(90deg) translateZ(130px)',
                left:   'rotateY(-90deg) translateZ(130px)',
                top:    'rotateX(90deg) translateZ(130px)',
                bottom: 'rotateX(-90deg) translateZ(130px)',
              }[face];
              return (
                <div key={face} style={{
                  position: 'absolute', inset: 0,
                  border: `1px solid ${fg}`,
                  background: `${fg}10`,
                  transform: t,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: fg, fontFamily: headingFont, fontSize: 20, fontWeight: 600,
                  letterSpacing: '0.04em',
                  backdropFilter: 'blur(2px)',
                }}>
                  {face === 'front' ? (p.concept_keyword || p.heading).slice(0, 18) : ''}
                </div>
              );
            })}
          </div>
        </div>
        <style>{`@keyframes lumina-cube-spin { from { transform: rotateX(-22deg) rotateY(35deg);} to { transform: rotateX(-22deg) rotateY(395deg);} }`}</style>
      </>
    );
  }

  if (layout === 'quadrant') {
    const bullets = (p.bullet_points || []).slice(0, 4);
    while (bullets.length < 4) bullets.push(p.concept_keyword || 'Key idea');
    const pos: React.CSSProperties[] = [
      { left: 56, top: 130, textAlign: 'left' },
      { right: 56, top: 130, textAlign: 'right' },
      { left: 56, bottom: 90, textAlign: 'left' },
      { right: 56, bottom: 90, textAlign: 'right' },
    ];
    return (
      <>
        {slideFigure && <img src={slideFigure} alt="" style={figureStyle(layout)} draggable={false} />}
        <h3 className="absolute left-1/2 -translate-x-1/2 text-center" style={{ top: 50, fontSize: 32, fontWeight: 700, color: fg, fontFamily: headingFont }}>{p.heading}</h3>
        {pos.map((s, i) => (
          <div key={i} className="absolute" style={{ ...s, color: fg, maxWidth: '32%' }}>
            <div className="text-[11px] opacity-50 mb-2 tracking-widest">{`0${i + 1}`}</div>
            <div style={{ fontSize: 18, lineHeight: 1.3 }}>{bullets[i]}</div>
          </div>
        ))}
      </>
    );
  }

  if (layout === 'stat_callout') {
    const supporting = (p.bullet_points && p.bullet_points[0]) || p.body.slice(0, 160);
    return (
      <>
        {slideFigure && <img src={slideFigure} alt="" style={figureStyle(layout)} draggable={false} />}
        <div className="absolute top-24 left-14 text-[11px] tracking-[0.4em] opacity-50" style={{ color: fg }}>
          {(p.concept_keyword || p.heading).toUpperCase()}
        </div>
        <h3 className="absolute" style={{ left: 56, top: 160, maxWidth: '70%', fontSize: 132, fontWeight: 700, lineHeight: 0.92, color: fg, fontFamily: headingFont, letterSpacing: '-0.03em' }}>
          {p.heading}
        </h3>
        <p className="absolute" style={{ left: 56, bottom: 110, maxWidth: '55%', fontSize: 18, color: fg, opacity: 0.85 }}>
          {supporting}
        </p>
      </>
    );
  }

  // half_bleed_left | half_bleed_right | ring_portrait
  const isLeft = layout === 'half_bleed_right' || layout === 'ring_portrait';
  const textStyle: React.CSSProperties = isLeft
    ? { right: 56, top: 110, maxWidth: '42%' }
    : { left: 56, top: 110, maxWidth: '42%' };
  return (
    <>
      {slideFigure && <img src={slideFigure} alt="" style={figureStyle(layout)} draggable={false} />}
      <div className="absolute text-[11px] tracking-[0.4em] opacity-50" style={{ ...textStyle, top: 80, color: fg }}>
        {`0${((slide.index ?? 0) % 9) + 1}`} · {(p.concept_keyword || '').toUpperCase()}
      </div>
      <div className="absolute" style={{ ...textStyle, top: 130, color: fg }}>
        <h3 style={{ fontSize: 44, fontWeight: 700, lineHeight: 1.0, fontFamily: headingFont, letterSpacing: '-0.02em' }}>{p.heading}</h3>
        <ul className="mt-6 space-y-3" style={{ fontSize: 18, lineHeight: 1.45 }}>
          {(p.bullet_points || []).slice(0, 4).map((b, i) => (
            <li key={i} className="flex gap-3"><span className="opacity-50">■</span><span>{b}</span></li>
          ))}
        </ul>
      </div>
    </>
  );
}
