import { describe, expect, it } from "vitest";
import { buildDailyPlan, getPriorityBreakdown } from "./priority";

const now = new Date("2026-10-20T12:00:00Z").getTime();

describe("planner priority and daily plan", () => {
  it("weights urgency, importance, goal alignment, overdue age and preference", () => {
    const score = getPriorityBreakdown({
      id: "task-1", title: "Exam", estimatedMinutes: 30, importance: 5,
      dueAt: now + 12 * 60 * 60 * 1000, goalId: "goal-1", goalIsActive: true,
      userPreference: 80,
    }, now);

    expect(score).toEqual({ urgency: 95, importance: 100, goalAlignment: 100, overdueAge: 0, userPreference: 80, score: 87 });
  });

  it("ranks a nearer deadline above a later one", () => {
    const near = getPriorityBreakdown({ id: "near", title: "Near", estimatedMinutes: 25, importance: 3, dueAt: now + 12 * 60 * 60 * 1000 }, now);
    const later = getPriorityBreakdown({ id: "later", title: "Later", estimatedMinutes: 25, importance: 3, dueAt: now + 9 * 24 * 60 * 60 * 1000 }, now);
    expect(near.score).toBeGreaterThan(later.score);
  });

  it("increases overdue age while keeping it capped", () => {
    const overdue = getPriorityBreakdown({ id: "late", title: "Late", estimatedMinutes: 25, importance: 3, dueAt: now - 2 * 24 * 60 * 60 * 1000 }, now);
    expect(overdue.overdueAge).toBe(20);
    const veryLate = getPriorityBreakdown({ id: "very-late", title: "Very late", estimatedMinutes: 25, importance: 3, dueAt: now - 20 * 24 * 60 * 60 * 1000 }, now);
    expect(veryLate.overdueAge).toBe(100);
  });

  it("never schedules beyond available time and defers overflow", () => {
    const plan = buildDailyPlan([
      { id: "a", title: "First", estimatedMinutes: 80, importance: 5, dueAt: now },
      { id: "b", title: "Second", estimatedMinutes: 40, importance: 2 },
    ], 60, now);

    expect(plan.plannedMinutes).toBeLessThanOrEqual(60);
    expect(plan.plannedMinutes).toBe(50);
    expect(plan.deferred.map(({ taskId }) => taskId)).toContain("a");
    expect(plan.deferred.map(({ taskId }) => taskId)).toContain("b");
  });

  it("schedules short tasks within a short available time", () => {
    const plan = buildDailyPlan([{ id: "a", title: "Quick review", estimatedMinutes: 10, importance: 3 }], 10, now);
    expect(plan.plannedMinutes).toBe(10);
    expect(plan.deferred).toHaveLength(0);
  });
});