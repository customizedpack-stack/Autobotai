export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="#1e232b" stroke="#303641" />
      <rect x="7" y="10" width="18" height="13" rx="3" fill="none" stroke="#3B82F6" strokeWidth="2" />
      <circle cx="12.5" cy="16.5" r="1.8" fill="#F1F5F9" />
      <circle cx="19.5" cy="16.5" r="1.8" fill="#F1F5F9" />
      <path d="M16 10V6.5" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" />
      <circle cx="16" cy="5.5" r="1.6" fill="#3B82F6" />
    </svg>
  );
}

export function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark />
      <div className="leading-tight">
        <div className="text-[13px] font-semibold tracking-tight">Auto Robots</div>
        <div className="text-[10.5px] font-medium tracking-wider text-muted uppercase">with AI</div>
      </div>
    </div>
  );
}
