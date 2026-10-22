export const levelThresholds = [
  { name: "Beginner", minXp: 0 },
  { name: "Learner", minXp: 100 },
  { name: "Achiever", minXp: 350 },
  { name: "Expert", minXp: 800 },
  { name: "FaDiMuss", minXp: 1600 },
] as const;

export const dailyFocusXpCap = 40;
export const dailyPlanCompletionRatio = 0.6;

export function levelForXp(xp: number) {
  const safeXp = Number.isFinite(xp) ? Math.max(0, xp) : 0;
  const current = [...levelThresholds].reverse().find((level) => safeXp >= level.minXp) ?? levelThresholds[0];
  const next = levelThresholds.find((level) => level.minXp > current.minXp);
  return { current: current.name, next: next?.name ?? null, remaining: next ? next.minXp - safeXp : 0 };
}

export function uniquePointEvents<T extends { eventKey: string }>(events: T[]): T[] {
  return [...new Map(events.map((event) => [event.eventKey, event])).values()];
}