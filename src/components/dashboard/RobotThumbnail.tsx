import type { RobotCategory } from '../../types/project';

/**
 * Lightweight vector schematic for template and project cards.
 * Cards deliberately avoid live 3D canvases: browsers allow only a few WebGL
 * contexts at once, and the real 3D view lives in the workspace.
 */
export function RobotThumbnail({ category, templateId }: { category: RobotCategory; templateId?: string }) {
  const accent = '#3B82F6';
  const line = '#475569';
  const dim = '#1E293B';
  const kind = templateId === 'blank' ? 'blank' : category;

  return (
    <svg viewBox="0 0 160 96" preserveAspectRatio="xMidYMid slice" className="h-full w-full" aria-hidden="true">
      <defs>
        <pattern id="thumb-grid" width="12" height="12" patternUnits="userSpaceOnUse">
          <path d="M12 0H0V12" fill="none" stroke="#232831" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="160" height="96" fill="#14171d" />
      <rect width="160" height="96" fill="url(#thumb-grid)" />
      <line x1="10" y1="82" x2="150" y2="82" stroke="#2b313b" />
      {kind === 'mobile' && (
        <g>
          <rect x="44" y="46" width="72" height="22" rx="4" fill={accent} fillOpacity="0.18" stroke={accent} strokeWidth="1.5" />
          <rect x="50" y="40" width="58" height="6" rx="2" fill="#334155" />
          <circle cx="62" cy="70" r="12" fill={dim} stroke={line} strokeWidth="1.5" />
          <circle cx="62" cy="70" r="3" fill={line} />
          <circle cx="104" cy="76" r="6" fill="#94A3B8" fillOpacity="0.4" stroke={line} />
          <rect x="116" y="50" width="8" height="8" rx="1.5" fill="#22C55E" />
          <path d="M126 54 L146 48 M126 54 L146 60" stroke="#22C55E" strokeOpacity="0.5" strokeDasharray="2 3" />
        </g>
      )}
      {kind === 'arm' && (
        <g>
          <rect x="50" y="72" width="36" height="10" rx="2" fill="#334155" stroke={line} />
          <circle cx="68" cy="66" r="6" fill="#A855F7" fillOpacity="0.5" stroke="#A855F7" />
          <rect x="64" y="30" width="8" height="36" rx="2" fill={accent} fillOpacity="0.25" stroke={accent} strokeWidth="1.5" />
          <circle cx="68" cy="28" r="5" fill="#A855F7" fillOpacity="0.5" stroke="#A855F7" />
          <rect x="68" y="24" width="40" height="8" rx="2" fill={accent} fillOpacity="0.25" stroke={accent} strokeWidth="1.5" />
          <path d="M108 30 v14 M116 30 v14 M106 30 h12" stroke="#E2E8F0" strokeWidth="2.5" strokeLinecap="round" />
        </g>
      )}
      {kind === 'humanoid' && (
        <g>
          <circle cx="80" cy="18" r="8" fill="#CBD5E1" fillOpacity="0.25" stroke="#CBD5E1" />
          <rect x="68" y="28" width="24" height="26" rx="3" fill={accent} fillOpacity="0.2" stroke={accent} strokeWidth="1.5" />
          <rect x="70" y="54" width="20" height="7" rx="2" fill="#334155" />
          <path d="M66 32 v22 M94 32 v22" stroke={line} strokeWidth="5" strokeLinecap="round" />
          <path d="M75 62 v18 M85 62 v18" stroke={line} strokeWidth="6" strokeLinecap="round" />
        </g>
      )}
      {kind === 'drone' && (
        <g>
          <path d="M52 34 L108 70 M108 34 L52 70" stroke="#334155" strokeWidth="4" strokeLinecap="round" />
          <rect x="70" y="42" width="20" height="20" rx="3" fill={accent} fillOpacity="0.25" stroke={accent} strokeWidth="1.5" />
          {[
            [52, 34],
            [108, 34],
            [52, 70],
            [108, 70],
          ].map(([cx, cy]) => (
            <g key={`${cx}-${cy}`}>
              <ellipse cx={cx} cy={cy} rx="16" ry="4" fill="#94A3B8" fillOpacity="0.2" stroke="#94A3B8" strokeOpacity="0.6" />
              <circle cx={cx} cy={cy} r="3.5" fill="#F59E0B" />
            </g>
          ))}
        </g>
      )}
      {(kind === 'industrial' || kind === 'quadruped' || kind === 'blank') && (
        <g>
          <rect x="58" y="44" width="44" height="28" rx="4" fill="#64748B" fillOpacity="0.2" stroke="#64748B" strokeWidth="1.5" strokeDasharray={kind === 'blank' ? '4 3' : undefined} />
          <path d="M80 30 v10 M75 35 h10" stroke={accent} strokeWidth="1.5" strokeLinecap="round" />
        </g>
      )}
    </svg>
  );
}
