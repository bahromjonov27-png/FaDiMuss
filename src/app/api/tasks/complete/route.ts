import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { verifiedUid } from "@/lib/server-auth";
import { dateKeyInTimezone, nextStreak } from "@/lib/date";
import { buildDailyPlan } from "@/features/planner/priority";
import { dailyPlanCompletionRatio } from "@/features/gamification/points";

const bodySchema = z.object({ taskId: z.string().min(1).max(128) });

export async function POST(request: NextRequest) {
  const uid = await verifiedUid(request);
  if (!uid) return NextResponse.json({ error: "Tizimga qayta kiring." }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Vazifa aniqlanmadi." }, { status: 400 });

  const taskRef = adminDb.collection("tasks").doc(parsed.data.taskId);
  const userRef = adminDb.collection("users").doc(uid);
  const eventRef = adminDb.collection("pointEvents").doc(`${uid}_task_${parsed.data.taskId}`);
  try {
    const result = await adminDb.runTransaction(async (transaction) => {
      const [taskSnapshot, eventSnapshot, userSnapshot, tasksSnapshot, goalsSnapshot] = await Promise.all([
        transaction.get(taskRef), transaction.get(eventRef), transaction.get(userRef),
        transaction.get(adminDb.collection("tasks").where("userId", "==", uid)),
        transaction.get(adminDb.collection("goals").where("userId", "==", uid).where("status", "==", "active")),
      ]);
      if (!taskSnapshot.exists || taskSnapshot.data()?.userId !== uid) throw new Error("TASK_NOT_FOUND");
      if (taskSnapshot.data()?.status !== "completed") throw new Error("TASK_NOT_COMPLETED");
      if (eventSnapshot.exists) return { pointsAwarded: 0, alreadyAwarded: true };
      const userData = userSnapshot.data() ?? {};
      const timezone = userData.timezone ?? "UTC";
      const today = dateKeyInTimezone(new Date(), timezone);
      const completedToday = (task: typeof tasksSnapshot.docs[number]) => {
        const taskData = task.data();
        const completedAt = taskData.completedAt as Timestamp | undefined;
        return taskData.status === "completed" && completedAt instanceof Timestamp
          && dateKeyInTimezone(completedAt.toDate(), timezone) === today;
      };
      const plannerTasks = tasksSnapshot.docs
        .filter((task) => task.data().status === "todo" || completedToday(task))
        .map((task) => ({
          id: task.id, title: task.data().title, estimatedMinutes: task.data().estimatedMinutes,
          importance: task.data().importance, dueAt: task.data().dueAt?.toMillis?.(),
          goalId: task.data().goalId,
          goalIsActive: goalsSnapshot.docs.some((goal) => goal.id === task.data().goalId),
        }));
      const scheduledIds = [...new Set(buildDailyPlan(plannerTasks, userData.dailyAvailableMinutes ?? 90).scheduled.map((item) => item.taskId))];
      const completedScheduled = scheduledIds.filter((id) => {
        const scheduledTask = tasksSnapshot.docs.find((item) => item.id === id);
        return scheduledTask ? completedToday(scheduledTask) : false;
      }).length;
      const dailyEventRef = adminDb.collection("pointEvents").doc(`${uid}_daily_${today}`);
      const dailyEvent = await transaction.get(dailyEventRef);
      const dailyBonus = !dailyEvent.exists && scheduledIds.length > 0
        && completedScheduled >= Math.ceil(scheduledIds.length * dailyPlanCompletionRatio) ? 15 : 0;
      transaction.create(eventRef, {
        userId: uid,
        eventKey: `task_${parsed.data.taskId}`,
        eventType: "task",
        points: 10,
        createdAt: FieldValue.serverTimestamp(),
      });
      if (dailyBonus) transaction.create(dailyEventRef, {
        userId: uid, eventKey: `daily_${today}`, eventType: "daily_plan", points: 15,
        dayKey: today, createdAt: FieldValue.serverTimestamp(),
      });
      transaction.set(userRef, {
        xp: (userData.xp ?? 0) + 10 + dailyBonus,
        streak: nextStreak(userData.streak ?? 0, userData.lastActiveDate, today),
        lastActiveDate: today,
      }, { merge: true });
      return { pointsAwarded: 10 + dailyBonus, dailyBonus, alreadyAwarded: false };
    });
    return NextResponse.json(result);
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    return NextResponse.json({ error: code === "TASK_NOT_FOUND" ? "Vazifa topilmadi." : "Vazifani avval bajarildi deb belgilang." }, { status: 400 });
  }
}