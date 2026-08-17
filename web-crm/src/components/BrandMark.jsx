// ProCallAi logo mark — gradient rounded square with a bold "P" monogram,
// a teal AI spark, and a small voice waveform. Matches the app launcher icon.
export default function BrandMark({ size = 36, radius = 11 }) {
  const id = 'pcaGrad';
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block', flexShrink: 0 }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#5B60F0" />
          <stop offset="0.55" stopColor="#8B5CF6" />
          <stop offset="1" stopColor="#10C5C0" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx={radius} fill={`url(#${id})`} />
      <text x="21.5" y="35" textAnchor="middle" fill="#fff"
        style={{ font: '800 30px "Sora", system-ui, sans-serif', letterSpacing: '-1px' }}>P</text>
      <circle cx="33" cy="15" r="3.1" fill="#54FFEE" />
      <g fill="#fff" opacity="0.92">
        <rect x="28.5" y="34" width="1.9" height="4.2" rx="0.95" />
        <rect x="31.4" y="32.2" width="1.9" height="7.8" rx="0.95" />
        <rect x="34.3" y="34.5" width="1.9" height="5.2" rx="0.95" />
      </g>
    </svg>
  );
}
