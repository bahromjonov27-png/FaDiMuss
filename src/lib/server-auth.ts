import type { NextRequest } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";

export async function verifiedUid(request: NextRequest): Promise<string | null> {
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return null;
  try {
    return (await adminAuth.verifyIdToken(token)).uid;
  } catch {
    return null;
  }
}