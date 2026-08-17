// ProCallAi logo mark — gradient rounded square with a voice-chat bubble and a
// gradient waveform. Matches the app launcher icon.
export default function BrandMark({ size = 36, radius = 11 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block', flexShrink: 0 }}>
      <defs>
        <linearGradient id="pcaBg" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#5B60F0" /><stop offset="0.55" stopColor="#8B5CF6" /><stop offset="1" stopColor="#10C5C0" />
        </linearGradient>
        <linearGradient id="pcaBars" x1="16" y1="0" x2="32" y2="0" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7C5CF6" /><stop offset="1" stopColor="#10C5C0" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx={radius} fill="url(#pcaBg)" />
      <path d="M12 12.5a4 4 0 0 1 4-4h16a4 4 0 0 1 4 4v9a4 4 0 0 1-4 4H21l-5 5v-5h-0a4 4 0 0 1-4-4z" fill="#fff" />
      <g fill="url(#pcaBars)">
        <rect x="17.6" y="15.4" width="1.8" height="5" rx="0.9" />
        <rect x="20.6" y="13.4" width="1.8" height="9" rx="0.9" />
        <rect x="23.6" y="11.8" width="1.8" height="12.2" rx="0.9" />
        <rect x="26.6" y="13.4" width="1.8" height="9" rx="0.9" />
        <rect x="29.6" y="15.4" width="1.8" height="5" rx="0.9" />
      </g>
    </svg>
  );
}
