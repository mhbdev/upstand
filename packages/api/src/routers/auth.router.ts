import { redis } from "@upstand/redis";
import { protectedProcedure, router } from "../index";

export const authRouter = router({
  isSession2faVerified: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.session.user.twoFactorEnabled) {
      return { verified: true };
    }
    const verified = await redis.get(`2fa-verified:${ctx.session.session.id}`);
    return { verified: verified === "true" };
  }),
});
