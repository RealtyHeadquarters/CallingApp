// ProCallAi logo mark — gradient rounded square, white chat bubble with AI
// sparkles. Matches the app launcher icon.
export default function BrandMark({ size = 36, radius = 11 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block', flexShrink: 0 }}>
      <defs>
        <linearGradient id="pcaBg" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#5B60F0" /><stop offset="0.55" stopColor="#8B5CF6" /><stop offset="1" stopColor="#10C5C0" />
        </linearGradient>
        <linearGradient id="pcaSpark" x1="14" y1="0" x2="34" y2="0" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7C5CF6" /><stop offset="1" stopColor="#10C5C0" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx={radius} fill="url(#pcaBg)" />
      <path d="M14 9.5a4 4 0 0 1 4-4h12a4 4 0 0 1 4 4v9a4 4 0 0 1-4 4H21l-5.5 5v-5H18a4 4 0 0 1-4-4z" fill="#fff" />
      <g fill="url(#pcaSpark)">
        <path d="M21 8 L22.6 12.4 L27 14 L22.6 15.6 L21 20 L19.4 15.6 L15 14 L19.4 12.4 Z" />
        <path d="M29.5 8.5 L30.4 10.6 L32.5 11.5 L30.4 12.4 L29.5 14.5 L28.6 12.4 L26.5 11.5 L28.6 10.6 Z" />
      </g>
    </svg>
  );
}
