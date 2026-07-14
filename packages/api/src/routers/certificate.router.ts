import { TRPCError } from "@trpc/server";
import {
  CreateCertificateInputSchema,
  CreateCertificateUseCaseToken,
  DeleteCertificateInputSchema,
  DeleteCertificateUseCaseToken,
  ListCertificatesInputSchema,
  ListCertificatesUseCaseToken,
  UpdateCertificateInputSchema,
  UpdateCertificateUseCaseToken,
} from "@upstand/usecases";
import { UnitOfWorkToken } from "@upstand/usecases/tokens";
import { handleUseCaseError } from "../errors";
import { router, twoFactorVerifiedProcedure } from "../index";
import { checkPermission } from "../permissions";

function publicCertificate(certificate: {
  id: string;
  organizationId: string;
  name: string;
  certificatePem: string;
  privateKeyPem: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: certificate.id,
    organizationId: certificate.organizationId,
    name: certificate.name,
    certificateConfigured: Boolean(certificate.certificatePem),
    privateKeyConfigured: Boolean(certificate.privateKeyPem),
    createdAt: certificate.createdAt,
    updatedAt: certificate.updatedAt,
  };
}

export const certificateRouter = router({
  list: twoFactorVerifiedProcedure
    .input(ListCertificatesInputSchema)
    .query(async ({ ctx, input }) => {
      await checkPermission(
        ctx.session.user.id,
        input.organizationId,
        "certificate:view",
      );
      try {
        const certificates = await ctx.scope
          .resolve(ListCertificatesUseCaseToken)
          .execute(input);
        return certificates.map(publicCertificate);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  create: twoFactorVerifiedProcedure
    .input(CreateCertificateInputSchema)
    .mutation(async ({ ctx, input }) => {
      await checkPermission(
        ctx.session.user.id,
        input.organizationId,
        "certificate:create",
      );
      try {
        const certificate = await ctx.scope
          .resolve(CreateCertificateUseCaseToken)
          .execute(input);
        return publicCertificate(certificate);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  update: twoFactorVerifiedProcedure
    .input(UpdateCertificateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const uow = ctx.scope.resolve(UnitOfWorkToken);
      const existing = await uow.certificateRepository.findById(input.id);
      if (!existing)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Certificate not found",
        });
      await checkPermission(
        ctx.session.user.id,
        existing.organizationId,
        "certificate:update",
      );
      try {
        const certificate = await ctx.scope
          .resolve(UpdateCertificateUseCaseToken)
          .execute(input);
        if (!certificate)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Certificate not found",
          });
        return publicCertificate(certificate);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  delete: twoFactorVerifiedProcedure
    .input(DeleteCertificateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const uow = ctx.scope.resolve(UnitOfWorkToken);
      const existing = await uow.certificateRepository.findById(input.id);
      if (!existing)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Certificate not found",
        });
      await checkPermission(
        ctx.session.user.id,
        existing.organizationId,
        "certificate:delete",
      );
      try {
        return await ctx.scope
          .resolve(DeleteCertificateUseCaseToken)
          .execute(input);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),
});
