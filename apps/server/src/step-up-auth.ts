import { redis } from "@upstand/redis";

export type StepUpSession = {
  user: {
    twoFactorEnabled?: boolean | null;
  };
  session: {
    id: string;
  };
};

export function isStepUpVerificationValid(
  twoFactorEnabled: boolean,
  verificationValue: string | null,
): boolean {
  return !twoFactorEnabled || verificationValue === "true";
}

export async function isStepUpAuthenticationSatisfied(
  session: StepUpSession,
): Promise<boolean> {
  const twoFactorEnabled = session.user.twoFactorEnabled === true;
  if (!twoFactorEnabled) return true;

  const verificationValue = await redis.get(
    `2fa-verified:${session.session.id}`,
  );
  return isStepUpVerificationValid(twoFactorEnabled, verificationValue);
}
