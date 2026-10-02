import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { env } from "@/lib/env";
import { one } from "@/lib/db";
import { HttpError } from "@/lib/http";

export type Role = "student" | "researcher" | "institution_admin" | "specialist" | "platform_admin";
export interface SessionUser {
  id: string;
  role: Role;
  display_name_en: string;
  display_name_ar: string;
  title_en: string | null;
  title_ar: string | null;
  institution_id: string | null;
  institution_name_en: string | null;
  institution_name_ar: string | null;
  avatar_hue: number;
  points: number;
  is_demo: boolean;
}

const COOKIE = "say_session";
const key = () => new TextEncoder().encode(env.sessionSecret);

export async function createSession(userId: string) {
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(key());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && !process.env.INSECURE_COOKIES,
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

export async function getUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    if (!payload.sub) return null;
    return await loadUser(payload.sub);
  } catch {
    return null;
  }
}

export async function loadUser(id: string): Promise<SessionUser | null> {
  return one<SessionUser>(
    `select u.id, u.role, u.display_name_en, u.display_name_ar, u.title_en, u.title_ar, u.institution_id,
            i.name_en as institution_name_en, i.name_ar as institution_name_ar, u.avatar_hue, u.points, u.is_demo
       from users u left join institutions i on i.id = u.institution_id where u.id = $1`,
    [id],
  );
}

/** Require a signed-in portal user, optionally with one of the given roles. platform_admin passes every check. */
export async function requireUser(roles?: Role[]): Promise<SessionUser> {
  const u = await getUser();
  if (!u) throw new HttpError(401, "unauthenticated", "Please sign in to the portal.");
  if (roles && !roles.includes(u.role) && u.role !== "platform_admin")
    throw new HttpError(403, "forbidden", "Your role can't do this action.");
  return u;
}
