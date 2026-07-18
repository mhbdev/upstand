import type { z } from "zod";
import {
  type UpGalExecutableTool,
  type UpGalToolFactoryContext,
  upGalReadTool,
} from "./factory";
import type { UpGalUIActionPlan } from "./ui-schemas";
import { guideUpstandSchema, upGalUiActionPlanSchema } from "./ui-schemas";

export type { UpGalUIActionPlan, UpGalUiStep } from "./ui-schemas";
export {
  guideUpstandSchema,
  upGalUiActionPlanSchema,
  upGalUiStepSchema,
} from "./ui-schemas";
export type UpGalUiTools = {
  guide_upstand: UpGalExecutableTool<
    z.infer<typeof guideUpstandSchema>,
    UpGalUIActionPlan
  >;
};

export function createUpGalUiTools(
  _context: UpGalToolFactoryContext,
): UpGalUiTools {
  return {
    guide_upstand: upGalReadTool(
      "Return one bounded, ordered UI walkthrough. Use navigate for an internal page, spotlight for a visible target, focus for an input, and open_dialog only for a target explicitly registered as safe to open. Never include submit or destructive clicks.",
      guideUpstandSchema,
      upGalUiActionPlanSchema,
      async (input) => ({
        kind: "ui_action_plan" as const,
        steps: input.steps,
      }),
    ),
  };
}
