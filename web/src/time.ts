/** When a game starts, the way a fan says it: "Today 1:00 PM", "Tomorrow 8:15 PM", "Sun 1:00 PM". */
export function startTime(iso: string, now = new Date()): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const time = at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(at) - day(now)) / 86_400_000);
  if (days === 0) return `Today ${time}`;
  if (days === 1) return `Tomorrow ${time}`;
  return `${at.toLocaleDateString(undefined, { weekday: "short" })} ${time}`;
}
