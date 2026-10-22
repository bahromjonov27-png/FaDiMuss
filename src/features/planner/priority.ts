export type PlannerTask = {
  id: string;
  title: string;
  estimatedMinutes: number;
  importance: number;
  dueAt?: number;
  goalId?: string;
  goalIsActive?: boolean;
  userPreference?: number;
};

export type PriorityBreakdown = {
  urgency: number;
  importance: number;
  goalAlignment: number;
  overdueAge: number;
  userPreference: number;
  score: number;
};

export type PlannedTask = {
  taskId: string;
  title: string;
  minutes: number;
  priorityScore: number;
  reason: string;
};

export type DailyPlan = {
  scheduled: PlannedTask[];
  deferred: Array<{ taskId: string; title: string; reason: string }>;
  availableMinutes: number;
  plannedMinutes: number;
};

const DAY = 24 * 60 * 60 * 1000;

export function getPriorityBreakdown(task: PlannerTask, now = Date.now()): PriorityBreakdown {
  const hoursUntilDue = task.dueAt === undefined ? undefined : (task.dueAt - now) / 3_600_000;
  const urgency = hoursUntilDue === undefined
    ? 20
    : hoursUntilDue < 0 ? 100
      : hoursUntilDue <= 24 ? 95
        : hoursUntilDue <= 72 ? 80
          : hoursUntilDue <= 168 ? 60 : 30;
  const importance = (Math.max(1, Math.min(5, task.importance)) - 1) * 25;
  const goalAlignment = task.goalId ? (task.goalIsActive ? 100 : 60) : 35;
  const overdueAge = hoursUntilDue !== undefined && hoursUntilDue < 0
    ? Math.min(100, Math.ceil((now - task.dueAt!) / DAY) * 10)
    : 0;
  const userPreference = Math.max(0, Math.min(100, task.userPreference ?? 50));
  const score = 0.4 * urgency + 0.25 * importance + 0.2 * goalAlignment
    + 0.1 * overdueAge + 0.05 * userPreference;

  return { urgency, importance, goalAlignment, overdueAge, userPreference, score };
}

export function buildDailyPlan(
  tasks: PlannerTask[],
  availableMinutes: number,
  now = Date.now(),
): DailyPlan {
  let remaining = Math.max(0, Math.floor(availableMinutes));
  const scheduled: PlannedTask[] = [];
  const deferred: DailyPlan["deferred"] = [];
  const ordered = tasks
    .map((task) => ({ task, priority: getPriorityBreakdown(task, now) }))
    .sort((left, right) => right.priority.score - left.priority.score);

  for (const { task, priority } of ordered) {
    const estimate = Math.max(1, Math.floor(task.estimatedMinutes));
    if (remaining <= 0) {
      deferred.push({ taskId: task.id, title: task.title, reason: "Bugungi bo'sh vaqt tugadi." });
      continue;
    }

    let taskRemaining = estimate;
    while (taskRemaining > 0 && remaining > 0) {
      const minutes = Math.min(50, taskRemaining, remaining);
      if (minutes < 25 && taskRemaining > minutes && taskRemaining >= 25) break;
      scheduled.push({
        taskId: task.id,
        title: task.title,
        minutes,
        priorityScore: Math.round(priority.score),
        reason: priority.urgency >= 80 ? "Muddat yaqin yoki o'tgan" : "Ustuvor vazifa",
      });
      taskRemaining -= minutes;
      remaining -= minutes;
    }
    if (taskRemaining > 0) {
      deferred.push({ taskId: task.id, title: task.title, reason: "Vazifaning qolgan qismi keyingi kunga qoldi." });
    }
  }

  const plannedMinutes = scheduled.reduce((total, item) => total + item.minutes, 0);
  return { scheduled, deferred, availableMinutes: Math.max(0, Math.floor(availableMinutes)), plannedMinutes };
}