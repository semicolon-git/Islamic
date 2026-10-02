import "server-only";
import { getUser, type Role, type SessionUser } from "@/lib/auth";

export const ITEM_ROLES: Role[] = ["student", "researcher", "institution_admin", "platform_admin"];

/** The signed-in portal user if their role works on heritage items, else null (pages show a friendly state). */
export async function itemsUser(): Promise<SessionUser | null> {
  const u = await getUser();
  return u && ITEM_ROLES.includes(u.role) ? u : null;
}
