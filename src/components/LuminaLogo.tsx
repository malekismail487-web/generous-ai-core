import luminaLogoDark from '@/assets/lumina-logo-dark.jpeg';
import luminaLogoLight from '@/assets/lumina-logo-light.jpeg';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';

interface LuminaLogoProps {
  size?: number;
  className?: string;
}

export function LuminaLogo({ size = 32, className = '' }: LuminaLogoProps) {
  const { theme } = useThemeLanguage();
  const src = theme === 'light' ? luminaLogoDark : luminaLogoLight;

  return (
    <img
      src={src}
      alt="Lumina"
      width={size}
      height={size}
      className={`object-cover rounded-lg ${className}`}
    />
  );
}
