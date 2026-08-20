// ProCallAi logo mark — Midnight Neon: dark rounded square with a glowing
// cyan→violet "P" monogram + accent spark. Matches the app launcher icon.
export default function BrandMark({ size = 36, radius = 11 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block', flexShrink: 0 }}>
      <defs>
        <linearGradient id="pcaBg" x1="0" y1="0" x2="0" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#173a7a" /><stop offset="1" stopColor="#0a1533" />
        </linearGradient>
        <linearGradient id="pcaP" x1="0" y1="10" x2="0" y2="38" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffb24d" /><stop offset="1" stopColor="#f97316" />
        </linearGradient>
        <filter id="pcaGlow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="1.4" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <rect width="48" height="48" rx={radius} fill="url(#pcaBg)" />
      <text x="18" y="35" filter="url(#pcaGlow)" fill="url(#pcaP)"
        style={{ font: '800 27px "Sora", system-ui, sans-serif', letterSpacing: '-1px' }}>P</text>
      <circle cx="32.5" cy="15" r="3" fill="#5b8cff" />
    </svg>
  );
}
