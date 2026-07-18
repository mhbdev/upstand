import { stepUp } from "@upstand/api/auth";
import {
  isStepUpVerificationValid,
  type StepUpSession,
  stepUpKey,
} from "@upstand/auth/step-up-auth";

export type { StepUpSession };
export { isStepUpVerificationValid, stepUpKey };
export const isStepUpAuthenticationSatisfied =
  stepUp.isStepUpAuthenticationSatisfied;
export const recordStepUpVerification = stepUp.recordStepUpVerification;
export const clearStepUpVerification = stepUp.clearStepUpVerification;
