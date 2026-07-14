"use client";

import { TerminalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@upstand/ui/components/dialog";
import type { ReactNode } from "react";
import { TerminalEmulator } from "./terminal-emulator";

export function TerminalDialogShell({
  open,
  onOpenChange,
  title,
  description,
  controls,
  token,
  connecting = false,
  emptyMessage,
  onTerminalClose,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  controls: ReactNode;
  token: string | null;
  connecting?: boolean;
  emptyMessage: string;
  onTerminalClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(92svh,820px)] w-[calc(100%-1rem)] max-w-[min(96vw,70rem)] flex-col gap-0 overflow-hidden border-border/60 bg-background p-0 sm:w-[calc(100%-2rem)]">
        <DialogHeader className="shrink-0 border-border/60 border-b bg-muted/20 px-4 py-4 sm:px-6 sm:py-5">
          <DialogTitle className="flex min-w-0 items-center gap-2">
            <HugeiconsIcon
              icon={TerminalIcon}
              className="size-5 shrink-0 text-primary"
            />
            <span className="truncate">{title}</span>
          </DialogTitle>
          <DialogDescription className="break-words">
            {description}
          </DialogDescription>
        </DialogHeader>
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-border/60 border-b bg-background p-3 sm:p-4">
          {controls}
        </div>
        <div className="min-h-0 flex-1 overflow-hidden bg-[#080c0a] p-1">
          {token ? (
            <TerminalEmulator token={token} onClose={onTerminalClose} />
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-center text-muted-foreground text-sm">
              {connecting ? "Initializing terminal session…" : emptyMessage}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
