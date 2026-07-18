"use client";

import type { UpGalUIAction } from "@upstand/api/ai/upgal";
import type { UpGalPageContext } from "@upstand/api/ai/upgal-page-context";

export type UpGalUiTarget = NonNullable<UpGalPageContext["uiTargets"]>[number];
const inMemoryPlans = new Map<string, UpGalUIAction>();
const consumedActionIds = new Set<string>();

export function upGalPlanUrl(path: string, planId: string) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}upgal_plan=${encodeURIComponent(planId)}`;
}

export function isUpGalUIAction(value: unknown): value is UpGalUIAction {
  if (!value || typeof value !== "object") return false;
  const action = value as Partial<UpGalUIAction>;
  if (
    action.kind !== "ui_action_plan" ||
    !Array.isArray(action.steps) ||
    action.steps.length < 1 ||
    action.steps.length > 8
  ) {
    return false;
  }
  return action.steps.every((step) => {
    if (!step || typeof step !== "object") return false;
    const candidate = step as Record<string, unknown>;
    if (
      typeof candidate.description !== "string" ||
      candidate.description.trim().length === 0
    ) {
      return false;
    }
    if (candidate.type === "navigate") {
      return (
        typeof candidate.path === "string" &&
        /^\/[a-zA-Z0-9_./-]*(?:\?[a-zA-Z0-9_./=&%-]*)?$/.test(candidate.path)
      );
    }
    return (
      (candidate.type === "spotlight" ||
        candidate.type === "focus" ||
        candidate.type === "open_dialog") &&
      typeof candidate.target === "string" &&
      /^[a-z0-9][a-z0-9-]{0,119}$/.test(candidate.target)
    );
  });
}

export function collectUpGalUiTargets(): UpGalUiTarget[] {
  if (typeof document === "undefined") return [];
  const seen = new Set<string>();
  const targets: UpGalUiTarget[] = [];
  for (const element of document.querySelectorAll<HTMLElement>(
    "[data-upgal-target]",
  )) {
    const id = element.dataset.upgalTarget?.trim();
    const label = element.dataset.upgalLabel?.trim();
    if (!id || !label || seen.has(id)) continue;
    seen.add(id);
    const kind =
      element.dataset.upgalKind &&
      ["button", "field", "dialog", "navigation", "other"].includes(
        element.dataset.upgalKind,
      )
        ? (element.dataset.upgalKind as UpGalUiTarget["kind"])
        : "other";
    const action =
      element.dataset.upgalAction &&
      ["spotlight", "focus", "open_dialog", "submit"].includes(
        element.dataset.upgalAction,
      )
        ? (element.dataset.upgalAction as UpGalUiTarget["action"])
        : undefined;
    const href = element.getAttribute("href");
    const path =
      element.dataset.upgalPath ||
      (href?.startsWith("/") ? href.split("#", 1)[0] : undefined);
    targets.push({
      id,
      label,
      kind,
      ...(path ? { path } : {}),
      ...(element.dataset.upgalDescription
        ? { description: element.dataset.upgalDescription.slice(0, 400) }
        : {}),
      ...(action ? { action } : {}),
    });
    if (targets.length >= 100) break;
  }
  return targets;
}

export function consumeUpGalAction(actionId: string): boolean {
  if (typeof window === "undefined") return false;
  if (consumedActionIds.has(actionId)) return false;
  consumedActionIds.add(actionId);
  const storageKey = `upgal:ui-action:${actionId}`;
  try {
    if (window.sessionStorage.getItem(storageKey)) return false;
    window.sessionStorage.setItem(storageKey, "1");
  } catch {
    // Navigation remains safe even when storage is disabled. The message id
    // still prevents duplicate work during the current render lifecycle.
  }
  return true;
}

export function storeUpGalPlan(planId: string, plan: UpGalUIAction): void {
  inMemoryPlans.set(planId, plan);
  try {
    window.sessionStorage.setItem(
      `upgal:ui-plan:${planId}`,
      JSON.stringify(plan),
    );
  } catch {
    // The in-memory copy is sufficient for a same-tab route transition.
  }
}

export function removeUpGalPlan(planId: string): void {
  inMemoryPlans.delete(planId);
  try {
    window.sessionStorage.removeItem(`upgal:ui-plan:${planId}`);
  } catch {
    // Best-effort cleanup only.
  }
}

export function readUpGalPlan(planId: string): UpGalUIAction | null {
  const inMemory = inMemoryPlans.get(planId);
  if (inMemory) return inMemory;
  try {
    const stored = window.sessionStorage.getItem(`upgal:ui-plan:${planId}`);
    if (!stored) return null;
    const parsed: unknown = JSON.parse(stored);
    return isUpGalUIAction(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function spotlightUpGalTarget(target: string): boolean {
  const element = document.querySelector<HTMLElement>(
    `[data-upgal-target="${CSS.escape(target)}"]`,
  );
  if (!element) return false;
  element.scrollIntoView({ behavior: "smooth", block: "center" });
  element.classList.add("upgal-spotlight");
  window.setTimeout(() => element.classList.remove("upgal-spotlight"), 2600);
  return true;
}
