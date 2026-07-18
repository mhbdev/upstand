import { describe, expect, test } from "bun:test";
import { guideUpstandSchema, upGalUiStepSchema } from "./ui-tools";

describe("UpGal UI action schemas", () => {
  test("accepts a generic multi-step walkthrough", () => {
    const plan = guideUpstandSchema.parse({
      steps: [
        {
          type: "navigate",
          path: "/projects",
          description: "Open the Projects page.",
        },
        {
          type: "spotlight",
          target: "create-project",
          description: "Select New Project.",
        },
        {
          type: "focus",
          target: "project-name",
          description: "Enter the project name.",
        },
      ],
    });

    expect(plan.steps).toHaveLength(3);
  });

  test("rejects external navigation and arbitrary selectors", () => {
    expect(() =>
      upGalUiStepSchema.parse({
        type: "navigate",
        path: "https://example.com",
        description: "Leave Upstand.",
      }),
    ).toThrow();
    expect(() =>
      upGalUiStepSchema.parse({
        type: "spotlight",
        target: "button[data-secret]",
        description: "Inspect a control.",
      }),
    ).toThrow();
  });

  test("bounds a plan and requires descriptions", () => {
    expect(() => guideUpstandSchema.parse({ steps: [] })).toThrow();
    expect(() =>
      guideUpstandSchema.parse({
        steps: Array.from({ length: 9 }, (_, index) => ({
          type: "spotlight",
          target: `target-${index}`,
          description: "Target",
        })),
      }),
    ).toThrow();
  });
});
