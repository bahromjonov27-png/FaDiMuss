import { NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { dailyFocusXpCap } from "@/features/gamification/points";
import { dateKeyInTimezone, nextStreak } from "@/lib/date";
import { verifiedUid } from "@/lib/server-auth";

const bodySchema = z.object({ sessionId: z.string().min(1).max(128) });

export async function POST(request: NextRequest) {
  const uid = await verifiedUid(request);
  if (!uid) return NextResponse.json({ error: "Tizimga qayta kiring." }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Sessiya topilmadi." }, { status: 400 });

  const sessionRef = adminDb.collection("focusSessions").doc(parsed.data.sessionId);
  const activeRef = adminDb.collection("activeFocus").doc(uid);
  try {
    const result = await adminDb.runTransaction(async (transaction) => {
      const userRef = adminDb.collection("users").doc(uid);
      const [sessionSnapshot, activeSnapshot, userSnapshot] = await Promise.all([
        transaction.get(sessionRef), transaction.get(activeRef), transaction.get(userRef),
      ]);
      if (!sessionSnapshot.exists || sessionSnapshot.data()?.userId !== uid) throw new Error("SESSION_NOT_FOUND");
      const session = sessionSnapshot.data()!;
      if (session.completed) return { alreadyFinished: true, pointsAwarded: session.pointsAwarded ?? 0 };
      if (activeSnapshot.data()?.sessionId !== sessionRef.id || !session.startedAt) throw new Error("SESSION_NOT_ACTIVE");

      const startedAt = (session.startedAt as Timestamp).toMillis();
      const actualMinutes = Math.floor((Date.now() - startedAt) / 60_000);
      if (actualMinutes < session.plannedMinutes) throw new Error("SESSION_TOO_EARLY");

      let pointsAwarded = 0;
      const eventKey = `focus_${sessionRef.id}`;
      const eventRef = adminDb.collection("pointEvents").doc(`${uid}_${eventKey}`);
      const eventSnapshot = await transaction.get(eventRef);
      const userData = userSnapshot.data() ?? {};
      const dayKey = dateKeyInTimezone(new Date(), userData.timezone ?? "UTC");
      const isFocusActivity = session.sessionType === "focus";
      const dailyEvents = session.sessionType === "focus" && !eventSnapshot.exists
        ? await transaction.get(adminDb.collection("pointEvents")
          .where("userId", "==", uid).where("eventType", "==", "focus").where("dayKey", "==", dayKey))
        : null;
      if (session.sessionType === "focus" && !eventSnapshot.exists && (dailyEvents?.size ?? dailyFocusXpCap) < dailyFocusXpCap / 5) {
        pointsAwarded = 5;
        transaction.create(eventRef, {
          userId: uid, eventKey, eventType: "focus", points: pointsAwarded,
          dayKey, createdAt: FieldValue.serverTimestamp(),
        });
        transaction.set(adminDb.collection("users").doc(uid), { xp: FieldValue.increment(pointsAwarded) }, { merge: true });
      }
      transaction.update(sessionRef, {
        actualMinutes, completed: true, pointsAwarded,
        endedAt: FieldValue.serverTimestamp(),
      });
      transaction.set(userRef, {
        xp: FieldValue.increment(pointsAwarded),
        ...(isFocusActivity ? {
          streak: nextStreak(userData.streak ?? 0, userData.lastActiveDate, dayKey),
          lastActiveDate: dayKey,
        } : {}),
      }, { merge: true });
      transaction.delete(activeRef);
      return { alreadyFinished: false, pointsAwarded };
    });
    return NextResponse.json(result);
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    const status = code === "SESSION_TOO_EARLY" ? 409 : code === "SESSION_NOT_FOUND" ? 404 : 400;
    const message = code === "SESSION_TOO_EARLY" ? "Rejalashtirilgan vaqt hali tugamadi."
      : code === "SESSION_NOT_FOUND" ? "Sessiya topilmadi."
        : "Faol fokus sessiyasi topilmadi.";
    return NextResponse.json({ error: message }, { status });
  }
}