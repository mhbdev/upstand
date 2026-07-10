import { s3Destination } from "@upstand/db";
import type {
  CreateS3DestinationDTO,
  IS3DestinationRepository,
  S3Destination,
} from "@upstand/domain";
import { eq } from "drizzle-orm";
import { BaseRepository } from "../shared/base.repository";
import type { Executor } from "../shared/types";

export class DrizzleS3DestinationRepository
  extends BaseRepository<
    typeof s3Destination,
    S3Destination,
    CreateS3DestinationDTO
  >
  implements IS3DestinationRepository
{
  constructor(executor: Executor) {
    super(executor, s3Destination);
  }

  async findByOrganizationId(organizationId: string): Promise<S3Destination[]> {
    return this.findMany({
      where: eq(s3Destination.organizationId, organizationId),
    });
  }
}
