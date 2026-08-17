// ProCallAi logo mark — gradient rounded square with a voice waveform + AI dot.
// Matches the app launcher icon so branding is consistent everywhere.
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
      <g fill="#fff">
        <rect x="9.5" y="20.5" width="3.4" height="7" rx="1.7" />
        <rect x="16" y="16" width="3.4" height="16" rx="1.7" />
        <rect x="22.3" y="11" width="3.4" height="26" rx="1.7" />
        <rect x="28.6" y="16" width="3.4" height="16" rx="1.7" />
        <rect x="35.1" y="20.5" width="3.4" height="7" rx="1.7" />
      </g>
      <circle cx="24" cy="7.4" r="2.2" fill="#54FFEE" />
    </svg>
  );
}
