import type { IUnitOfWork, S3Destination } from "@upstand/domain";
import { encryptSecret } from "@upstand/platform/crypto/secret-box";
import { z } from "zod";

export const UpdateS3DestinationInputSchema = z.object({
  id: z.string().min(1, "ID is required"),
  organizationId: z.string().min(1, "Organization ID is required"),
  name: z.string().min(1, "Name is required"),
  provider: z.string().min(1, "Provider is required"),
  accessKeyId: z.string().min(1, "Access Key Id is required"),
  secretAccessKey: z.string().min(1, "Secret Access Key is required"),
  bucket: z.string().min(1, "Bucket is required"),
  region: z.string(),
  endpoint: z.string().min(1, "Endpoint is required"),
  additionalFlags: z.array(z.string()).optional(),
});

export type UpdateS3DestinationInput = z.infer<
  typeof UpdateS3DestinationInputSchema
>;

export class UpdateS3DestinationUseCase {
  constructor(private readonly uow: IUnitOfWork) {}

  async execute(
    input: UpdateS3DestinationInput,
  ): Promise<S3Destination | null> {
    return this.uow.transaction(async (tx) => {
      const encryptedAccessKeyId = JSON.stringify(
        encryptSecret(input.accessKeyId),
      );
      const encryptedSecretAccessKey = JSON.stringify(
        encryptSecret(input.secretAccessKey),
      );

      const updated = await tx.s3DestinationRepository.updateById(input.id, {
        organizationId: input.organizationId,
        name: input.name,
        provider: input.provider,
        accessKeyId: encryptedAccessKeyId,
        secretAccessKey: encryptedSecretAccessKey,
        bucket: input.bucket,
        region: input.region,
        endpoint: input.endpoint,
        additionalFlags: JSON.stringify(input.additionalFlags || []),
      });

      if (!updated) return null;

      return {
        ...updated,
        accessKeyId: input.accessKeyId,
        secretAccessKey: input.secretAccessKey,
      };
    });
  }
}
