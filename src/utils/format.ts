export function formatRelativeTime(iso: string | null, now = Date.now()): string {
  if (!iso) return 'Never';
  const diff = Math.max(0, now - new Date(iso).getTime());
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} d ago`;
  return new Date(iso).toLocaleDateString();
}

export function formatClock(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour12: false });
}
