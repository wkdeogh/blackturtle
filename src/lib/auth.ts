import { cookies } from "next/headers";
import { sessionConfig, verifySessionToken } from "@/lib/session";

export async function isAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  return verifySessionToken(cookieStore.get(sessionConfig.cookieName)?.value, process.env.AUTH_SECRET);
}
