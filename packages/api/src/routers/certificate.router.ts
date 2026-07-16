import { TRPCError } from "@trpc/server";
import type { IUnitOfWork } from "@upstand/domain";
import { parseDomainMappings } from "@upstand/domain";
import {
  CreateCertificateInputSchema,
  DeleteCertificateInputSchema,
  ListCertificatesInputSchema,
  UpdateCertificateInputSchema,
} from "@upstand/usecases";
import type { CaddyServicePort } from "@upstand/usecases/ports/caddy";
import {
  CaddyServiceToken,
  CreateCertificateUseCaseToken,
  DeleteCertificateUseCaseToken,
  ListCertificatesUseCaseToken,
  UnitOfWorkToken,
  UpdateCertificateUseCaseToken,
} from "@upstand/usecases/tokens";
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

async function syncCertificateRoutes(
  uow: IUnitOfWork,
  caddyService: CaddyServicePort,
) {
  const settings = await uow.webServerSettingsRepository.findGlobal();
  if (!settings) return;
  const certificates = (await uow.certificateRepository.findAll?.()) ?? [];
  await caddyService.syncResourceConfigs(
    await uow.resourceRepository.findMany(),
    settings,
    certificates,
  );
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
        await syncCertificateRoutes(
          ctx.scope.resolve(UnitOfWorkToken),
          ctx.scope.resolve(CaddyServiceToken),
        );
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
        await syncCertificateRoutes(
          ctx.scope.resolve(UnitOfWorkToken),
          ctx.scope.resolve(CaddyServiceToken),
        );
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
        const resources = await uow.resourceRepository.findMany();
        const isInUse = resources.some((resource) => {
          try {
            return parseDomainMappings(resource.domains).some(
              (domain) =>
                domain.certificateType === "custom" &&
                domain.certificateId === existing.id,
            );
          } catch {
            return false;
          }
        });
        if (isInUse) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "This certificate is assigned to a resource domain. Remove that assignment before deleting it.",
          });
        }
        const result = await ctx.scope
          .resolve(DeleteCertificateUseCaseToken)
          .execute(input);
        await syncCertificateRoutes(
          ctx.scope.resolve(UnitOfWorkToken),
          ctx.scope.resolve(CaddyServiceToken),
        );
        return result;
      } catch (error) {
        handleUseCaseError(error);
      }
    }),
});
