import {
  ValidateDomainInputSchema,
  ValidateDomainUseCaseToken,
} from "@upstand/usecases";
import { router, twoFactorVerifiedProcedure } from "../index";
import { checkPermission } from "../permissions";

export const domainRouter = router({
  validate: twoFactorVerifiedProcedure
    .input(ValidateDomainInputSchema)
    .mutation(async ({ ctx, input }) => {
      await checkPermission(
        ctx.session.user.id,
        input.organizationId,
        "resource:view",
      );
      return ctx.scope.resolve(ValidateDomainUseCaseToken).execute(input);
    }),
});
