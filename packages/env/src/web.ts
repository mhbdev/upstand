import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  client: {
    NEXT_PUBLIC_SERVER_URL: z.url(),
    NEXT_PUBLIC_UPSTAND_VERSION: z.string().min(1).optional(),
    NEXT_PUBLIC_IS_CLOUD: z
      .preprocess(
        (val) => val === "true" || val === "1" || val === true,
        z.boolean(),
      )
      .default(false),
  },
  runtimeEnv: {
    NEXT_PUBLIC_SERVER_URL: process.env.NEXT_PUBLIC_SERVER_URL,
    NEXT_PUBLIC_UPSTAND_VERSION: process.env.NEXT_PUBLIC_UPSTAND_VERSION,
    NEXT_PUBLIC_IS_CLOUD: process.env.NEXT_PUBLIC_IS_CLOUD,
  },
  skipValidation:
    !!process.env.SKIP_ENV_VALIDATION ||
    process.env.NODE_ENV === "test" ||
    process.env.NEXT_PHASE === "phase-production-build",
  emptyStringAsUndefined: true,
});
