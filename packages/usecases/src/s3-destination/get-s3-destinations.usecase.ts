import type { IUnitOfWork, S3Destination } from "@upstand/domain";
import {
  decryptSecret,
  type EncryptedPayload,
} from "@upstand/platform/crypto/secret-box";
import { z } from "zod";

export const GetS3DestinationsInputSchema = z.object({
  organizationId: z.string().min(1, "Organization ID is required"),
});

export type GetS3DestinationsInput = z.infer<
  typeof GetS3DestinationsInputSchema
>;

export class GetS3DestinationsUseCase {
  constructor(private readonly uow: IUnitOfWork) {}

  async execute(input: GetS3DestinationsInput): Promise<S3Destination[]> {
    const list = await this.uow.s3DestinationRepository.findByOrganizationId(
      input.organizationId,
    );

    return list.map((dest) => {
      let accessKeyId = dest.accessKeyId;
      let secretAccessKey = dest.secretAccessKey;

      try {
        const parsedAccessKey = JSON.parse(
          dest.accessKeyId,
        ) as EncryptedPayload;
        if (parsedAccessKey?.ciphertext && parsedAccessKey.iv) {
          accessKeyId = decryptSecret(parsedAccessKey);
        }
      } catch {}

      try {
        const parsedSecret = JSON.parse(
          dest.secretAccessKey,
        ) as EncryptedPayload;
        if (parsedSecret?.ciphertext && parsedSecret.iv) {
          secretAccessKey = decryptSecret(parsedSecret);
        }
      } catch {}

      return {
        ...dest,
        accessKeyId,
        secretAccessKey,
      };
    });
  }
}
