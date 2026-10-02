import { z } from "zod";
import { body, handler, HttpError, ok } from "@/lib/http";
import { createSession, destroySession, getUser, loadUser } from "@/lib/auth";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export const GET = handler(async () => ok({ user: await getUser() }));

export const POST = handler(async (req: Request) => {
  const { userId, pin } = await body(req, z.object({ userId: z.string(), pin: z.string() }));
  if (pin !== env.demoPin) throw new HttpError(401, "bad_pin", "That PIN isn't right. The demo PIN is shown on the sign-in page.");
  const user = await loadUser(userId);
  if (!user) throw new HttpError(404, "no_user", "This persona doesn't exist.");
  await createSession(user.id);
  return ok({ user });
});

export const DELETE = handler(async () => {
  await destroySession();
  return ok({});
});
