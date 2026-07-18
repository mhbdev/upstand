"use client";

import type { UpGalUIAction } from "@upstand/api/ai/upgal";
import { Button } from "@upstand/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@upstand/ui/components/card";
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  readUpGalPlan,
  removeUpGalPlan,
  spotlightUpGalTarget,
  upGalPlanUrl,
} from "@/lib/upgal-ui-actions";

type Plan = UpGalUIAction;

function findTarget(target: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    `[data-upgal-target="${CSS.escape(target)}"]`,
  );
}

function cleanPlanQuery(pathname: string, planId: string) {
  const params = new URLSearchParams(window.location.search);
  params.delete("upgal_plan");
  params.delete("upgal_action");
  const query = params.toString();
  window.history.replaceState(
    window.history.state,
    "",
    `${pathname}${query ? `?${query}` : ""}`,
  );
  try {
    removeUpGalPlan(planId);
  } catch {
    // Best-effort cleanup only.
  }
}

export function UpGalGuideOverlay() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const planId = searchParams.get("upgal_plan");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetAvailable, setTargetAvailable] = useState(false);

  useEffect(() => {
    if (!planId) {
      setPlan(null);
      return;
    }
    const candidate = readUpGalPlan(planId);
    if (candidate?.kind !== "ui_action_plan") {
      setPlan(null);
      return;
    }
    setPlan(candidate);
    setStepIndex(0);
  }, [planId]);

  const step = plan?.steps[stepIndex];

  useEffect(() => {
    if (!step) return;
    if (step.type === "navigate") {
      setTargetAvailable(true);
      return;
    }
    setTargetAvailable(false);
    let attempts = 0;
    let timer: number | undefined;
    const locate = () => {
      const found = findTarget(step.target);
      setTargetAvailable(Boolean(found));
      if (found && step.type !== "open_dialog") {
        if (step.type === "focus") found.focus({ preventScroll: true });
        spotlightUpGalTarget(step.target);
        return;
      }
      if (!found && attempts < 50) {
        attempts += 1;
        timer = window.setTimeout(locate, 100);
      }
    };
    locate();
    return () => {
      if (timer) window.clearTimeout(timer);
    };
  }, [step]);

  const finish = useCallback(() => {
    if (planId) cleanPlanQuery(pathname, planId);
    setPlan(null);
    router.replace(pathname as Route, { scroll: false });
  }, [pathname, planId, router]);

  if (!plan || !step) return null;

  const isLast = stepIndex === plan.steps.length - 1;
  const advance = () => {
    if (!targetAvailable) return;
    if (step.type === "navigate") {
      if (pathname !== step.path && planId) {
        router.push(upGalPlanUrl(step.path, planId) as Route, {
          scroll: false,
        });
        return;
      }
      if (isLast) finish();
      else setStepIndex((current) => current + 1);
      return;
    }
    if (step.type === "open_dialog") {
      const element = findTarget(step.target);
      if (element?.dataset.upgalAction !== "open_dialog") return;
      element.click();
    }
    if (isLast) finish();
    else setStepIndex((current) => current + 1);
  };

  return (
    <Card className="fixed bottom-5 left-5 z-50 w-[min(360px,calc(100vw-40px))] border-primary/30 shadow-xl">
      <CardHeader className="gap-1 pb-2">
        <CardTitle className="text-sm">UpGal walkthrough</CardTitle>
        <p className="text-muted-foreground text-xs">
          Step {stepIndex + 1} of {plan.steps.length}
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 pt-0">
        <p className="text-sm">{step.description}</p>
        {!targetAvailable ? (
          <p className="text-muted-foreground text-xs">
            This control is not available on the current page state. Open the
            relevant section and try the walkthrough again.
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button onClick={finish} size="sm" variant="ghost">
            Close
          </Button>
          <Button disabled={!targetAvailable} onClick={advance} size="sm">
            {step.type === "open_dialog" ? "Open" : isLast ? "Finish" : "Next"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
