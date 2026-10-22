import { describe, expect, it } from "vitest";
import { nextStreak } from "../../lib/date";
import { levelForXp, uniquePointEvents } from "./points";

describe("gamification points", () => {
  it("deduplicates retries by stable event key", () => {
    const events = uniquePointEvents([{ eventKey: "task-1", points: 10 }, { eventKey: "task-1", points: 10 }]);
    expect(events).toHaveLength(1);
    expect(events[0].points).toBe(10);
  });

  it("reports the next level and XP remaining", () => {
    expect(levelForXp(120)).toEqual({ current: "Learner", next: "Achiever", remaining: 230 });
  });

  it("handles streaks across local calendar days", () => {
    expect(nextStreak(3, "2026-10-20", "2026-10-21")).toBe(4);
    expect(nextStreak(3, "2026-10-18", "2026-10-21")).toBe(1);
  });
});