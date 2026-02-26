export function formatReleaseWindow(seconds: number): string {
  if (seconds >= 86400) {
    const days = Math.floor(seconds / 86400);
    return `${days} day${days !== 1 ? "s" : ""}`;
  }
  if (seconds >= 3600) {
    const hours = Math.floor(seconds / 3600);
    return `${hours} hour${hours !== 1 ? "s" : ""}`;
  }
  return `${seconds}s`;
}
