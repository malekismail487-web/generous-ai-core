import luminaMark from '@/assets/lumina-mark.png';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';

interface LuminaLogoProps {
  size?: number;
  className?: string;
}

/**
 * The Lumina mark — a transparent-background PNG (white line art, no plate).
 * In the Bone (light) palette we invert it so the mark reads black on light.
 * No mix-blend-mode: blending broke against the liquid-glass surfaces.
 */
export function LuminaLogo({ size = 32, className = '' }: LuminaLogoProps) {
  const { theme } = useThemeLanguage();
  const isLight = theme === 'light';

  return (
    <img
      src={luminaMark}
      alt="Lumina"
      width={size}
      height={size}
      loading="eager"
      decoding="async"
      className={`object-contain select-none pointer-events-none ${className}`}
      style={{
        filter: isLight ? 'invert(1)' : 'none',
      }}
    />
  );
}
