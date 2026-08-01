import luminaAtom from '@/assets/lumina-atom.jpeg.asset.json';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';

interface LuminaLogoProps {
  size?: number;
  className?: string;
}

/**
 * The Lumina mark. The source art is white-on-onyx, so in the Bone (light)
 * palette we invert it — the two-tone system stays exactly two tones.
 */
export function LuminaLogo({ size = 32, className = '' }: LuminaLogoProps) {
  const { theme } = useThemeLanguage();
  const isLight = theme === 'light';

  return (
    <img
      src={luminaAtom.url}
      alt="Lumina"
      width={size}
      height={size}
      className={`object-contain select-none ${className}`}
      style={{
        filter: isLight ? 'invert(1) contrast(1.05)' : 'none',
        mixBlendMode: isLight ? 'multiply' : 'screen',
      }}
    />
  );
}
