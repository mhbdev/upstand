import { isStepUpAuthenticationSatisfied } from "@upstand/auth/step-up-auth";
import { protectedProcedure, router } from "../index";

export const authRouter = router({
  isSession2faVerified: protectedProcedure.query(async ({ ctx }) => {
    return {
      verified: await isStepUpAuthenticationSatisfied(ctx.session),
    };
  }),
});
