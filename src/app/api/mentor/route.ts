import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifiedUid } from "@/lib/server-auth";

const bodySchema = z.object({
  action: z.enum(["plan", "prioritize", "behind"]).optional(),
  message: z.string().trim().min(1).max(2000).optional(),
  history: z.array(z.object({
    role: z.enum(["user", "model"]),
    text: z.string().min(1).max(2000),
  })).max(10).default([]),
  goal: z.string().max(300).default(""),
  availableMinutes: z.number().int().min(0).max(1440),
  tasks: z.array(z.object({
    title: z.string().max(160),
    estimatedMinutes: z.number().int().min(1).max(1440),
    dueLabel: z.string().max(60).optional(),
    importance: z.number().int().min(1).max(5),
    status: z.enum(["todo", "completed"]),
  })).max(30),
  completedRecently: z.number().int().min(0).max(100),
  focusMinutesRecently: z.number().int().min(0).max(10000),
}).refine((body) => body.message || body.action, {
  message: "A message or quick action is required.",
});

const actions: Record<string, string> = {
  plan: "Bugungi 1-3 asosiy harakatni taklif qil",
  prioritize: "Mavjud vazifalarni ustuvorligi bo'yicha izohla",
  behind: "Ortda qolayotgan bo'lishimning ehtimoliy amaliy sabablarini bahola",
};

const requestTimes = new Map<string, number[]>();
const maxRequestsPerMinute = 6;
const geminiModel = "gemini-3.6-flash";
const geminiFallbackModel = "gemini-3.5-flash-lite";

function providerErrorMessage(provider: string, status: number): string {
  if (status === 400 || status === 401) {
    return provider === "gemini"
      ? "Gemini API kaliti yaroqsiz yoki so'rov rad etildi. Google AI Studio'da yangi API kalitni tekshiring va serverni qayta ishga tushiring."
      : "AI API kaliti yaroqsiz yoki so'rov rad etildi. Server sozlamalarini tekshiring.";
  }
  if (status === 403) {
    return provider === "gemini"
      ? "Gemini API ruxsati rad etildi. Google AI Studio'da kalit cheklovlari va loyiha uchun Gemini API yoqilganini tekshiring."
      : "AI API ruxsati rad etildi. Kalit ruxsatlarini tekshiring.";
  }
  if (status === 404) return "Tanlangan AI modeli topilmadi. Serverdagi model sozlamasini tekshirish kerak.";
  if (status === 429) return "AI xizmati limiti tugadi. Biroz kutib qayta urinib ko'ring yoki loyiha kvotasini tekshiring.";
  if (status === 503 && provider === "gemini") return "Gemini hozir band, asosiy va zaxira modeli ham javob bermadi. Birozdan keyin qayta urinib ko'ring.";
  if (status >= 500) return "AI provayderida vaqtinchalik nosozlik bor. Birozdan keyin qayta urinib ko'ring.";
  return `AI provayderi so'rovni rad etdi (HTTP ${status}). Server logini tekshiring.`;
}

function isWithinRateLimit(uid: string): boolean {
  const now = Date.now();
  const recent = (requestTimes.get(uid) ?? []).filter((time) => now - time < 60_000);
  if (recent.length >= maxRequestsPerMinute) return false;
  recent.push(now);
  requestTimes.set(uid, recent);
  return true;
}

export async function POST(request: NextRequest) {
  const uid = await verifiedUid(request);
  if (!uid) return NextResponse.json({ error: "Tizimga qayta kiring." }, { status: 401 });
  if (!isWithinRateLimit(uid)) return NextResponse.json({ error: "Bir daqiqada 6 ta maslahat so'rovi yuborish mumkin. Birozdan keyin qayta urinib ko'ring." }, { status: 429 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Mentor so'rovi tekshiruvdan o'tmadi." }, { status: 400 });

  const provider = process.env.AI_PROVIDER ?? "openai";
  const apiKey = provider === "gemini" ? process.env.GEMINI_API_KEY : process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI Mentor sozlanmagan. Hozircha rejangizni Planner bo'limida ko'rishingiz mumkin." }, { status: 503 });

  const context = parsed.data;
  const userMessage = context.message ?? actions[context.action!];
  const history = context.history.slice(-10).reduce<typeof context.history>((turns, turn) => {
    if (turns.at(-1)?.role === turn.role) turns[turns.length - 1] = turn;
    else turns.push(turn);
    return turns;
  }, []);
  while (history[0]?.role === "model") history.shift();
  while (history.length && history.at(-1)?.role !== "model") history.pop();
  const instructions = `Sen FaDiMuss o'quv mentorisan. Foydalanuvchi bilan tabiiy, foydali chat olib bor va u ishlatgan tilda javob ber; odatda o'zbek lotin tilidan foydalan. Savolga bevosita javob ber, fikrni tugallangan holda bayon qil va kerak bo'lsa sarlavha hamda punktlardan foydalan. Faqat berilgan hisob kontekstiga tayan; vazifalar holatini o'zgartirma, yangi muddat yoki fakt to'qima. Tashxis, kafolat yoki ayblov bo'lmasin. Savol kontekstda bo'lmasa, aniqlashtiruvchi savol ber.\nHisob konteksti: ${JSON.stringify({
    goal: context.goal,
    availableMinutes: context.availableMinutes,
    tasks: context.tasks,
    completedRecently: context.completedRecently,
    focusMinutesRecently: context.focusMinutesRecently,
  })}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 50_000);

  try {
    let response: Response;
    if (provider === "gemini") {
      const body = JSON.stringify({
        systemInstruction: { parts: [{ text: instructions }] },
        contents: [
          ...history.map((turn) => ({ role: turn.role, parts: [{ text: turn.text }] })),
          { role: "user", parts: [{ text: userMessage }] },
        ],
        generationConfig: { maxOutputTokens: 4096 },
      });
      const generate = (model: string) => fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        { method: "POST", headers: { "content-type": "application/json" }, signal: controller.signal, body },
      );
      response = await generate(geminiModel);
      if (response.status === 503 && !controller.signal.aborted) {
        console.warn("[mentor] Primary Gemini model unavailable; trying fallback", { model: geminiFallbackModel });
        response = await generate(geminiFallbackModel);
      }
    } else {
      response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST", headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: instructions },
            ...history.map((turn) => ({ role: turn.role === "model" ? "assistant" : "user", content: turn.text })),
            { role: "user", content: userMessage },
          ],
          max_tokens: 4096,
        }),
      });
    }
    if (!response.ok) {
      console.error("[mentor] Provider request failed", { provider, status: response.status });
      return NextResponse.json({ error: providerErrorMessage(provider, response.status) }, { status: 502 });
    }
    const payload = await response.json() as {
      choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
    };
    const answer = provider === "gemini"
      ? payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("\n").trim()
      : payload.choices?.[0]?.message?.content;
    if (!answer) return NextResponse.json({ error: "AI javobi bo'sh qaytdi. Planner rejangizdan foydalaning." }, { status: 502 });
    const truncated = provider === "gemini"
      ? payload.candidates?.[0]?.finishReason === "MAX_TOKENS"
      : payload.choices?.[0]?.finish_reason === "length";
    if (truncated) {
      console.warn("[mentor] Provider response reached output limit", { provider });
      return NextResponse.json({ error: "Javob uzunligi sabab to'liq yakunlanmadi. Savolni qisqaroq qismlarga bo'lib qayta yuboring." }, { status: 502 });
    }
    return NextResponse.json({ answer });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    console.error("[mentor] Provider request error", { provider, kind: timedOut ? "timeout" : "network" });
    return NextResponse.json({
      error: timedOut
        ? "AI xizmati 50 soniyada javob bermadi. Birozdan keyin qayta urinib ko'ring."
        : "AI xizmatiga ulanib bo'lmadi. Server internet aloqasini tekshiring.",
    }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}