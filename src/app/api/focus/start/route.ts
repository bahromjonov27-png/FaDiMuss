import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { verifiedUid } from "@/lib/server-auth";

const bodySchema = z.object({ sessionType: z.enum(["focus", "break"]) });

export async function POST(request: NextRequest) {
  const uid = await verifiedUid(request);
  if (!uid) return NextResponse.json({ error: "Tizimga qayta kiring." }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Sessiya turi noto'g'ri." }, { status: 400 });

  try {
    const activeRef = adminDb.collection("activeFocus").doc(uid);
    const sessionRef = adminDb.collection("focusSessions").doc();
    const result = await adminDb.runTransaction(async (transaction) => {
      const active = await transaction.get(activeRef);
      if (active.exists) {
        const activeSessionId = active.data()?.sessionId;
        if (typeof activeSessionId === "string" && activeSessionId) {
          const existingRef = adminDb.collection("focusSessions").doc(activeSessionId);
          const existingSession = await transaction.get(existingRef);
          if (existingSession.exists && !existingSession.data()?.completed) {
            return { sessionId: existingRef.id, reused: true };
          }
        }
      }
      transaction.create(sessionRef, {
        userId: uid,
        plannedMinutes: parsed.data.sessionType === "focus" ? 25 : 5,
        actualMinutes: 0,
        sessionType: parsed.data.sessionType,
        startedAt: FieldValue.serverTimestamp(),
        completed: false,
        pointsAwarded: 0,
      });
      transaction.set(activeRef, { sessionId: sessionRef.id, startedAt: FieldValue.serverTimestamp() });
      return { sessionId: sessionRef.id, reused: false };
    });
    const session = await adminDb.collection("focusSessions").doc(result.sessionId).get();
    const startedAt = session.data()?.startedAt;
    const sessionData = session.data();
    if (!session.exists || !sessionData || !startedAt || typeof startedAt.toMillis !== "function") {
      console.error("[focus:start] Session was not readable after transaction", { uid });
      return NextResponse.json({ error: "Sessiya yaratildi, lekin taymer ma'lumotini olishda xatolik bo'ldi. Fokus sahifasini yangilab ko'ring." }, { status: 503 });
    }
    return NextResponse.json({
      sessionId: result.sessionId,
      sessionType: sessionData.sessionType,
      plannedMinutes: sessionData.plannedMinutes,
      startedAt: startedAt.toMillis(),
      reused: result.reused,
    });
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : "unknown";
    console.error("[focus:start] Failed to create session", { code });
    return NextResponse.json({
      error: "Fokus sessiyasini serverda boshlab bo'lmadi. Firebase Admin credential va server ulanishini tekshiring.",
    }, { status: 503 });
  }
}