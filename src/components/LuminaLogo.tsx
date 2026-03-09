import luminaLogo from '@/assets/lumina-logo.jpeg';

interface LuminaLogoProps {
  size?: number;
  className?: string;
}

export function LuminaLogo({ size = 32, className = '' }: LuminaLogoProps) {
  return (
    <img
      src={luminaLogo}
      alt="Lumina"
      width={size}
      height={size}
      className={`object-cover rounded-lg ${className}`}
    />
  );
}
