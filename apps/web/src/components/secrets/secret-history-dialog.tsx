"use client";

import { Clock01Icon, RotateLeftIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Badge } from "@upstand/ui/components/badge";
import { Button } from "@upstand/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@upstand/ui/components/dialog";
import { Spinner } from "@upstand/ui/components/spinner";
import { toast } from "sonner";
import { trpc } from "@/utils/trpc";

interface SecretHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scopeType: "environment" | "resource";
  scopeId: string;
  onSuccess?: () => void;
}

export function SecretHistoryDialog({
  open,
  onOpenChange,
  scopeType,
  scopeId,
  onSuccess,
}: SecretHistoryDialogProps) {
  const { data: versions, isLoading } = useQuery({
    ...trpc.secret.versions.queryOptions({ scopeType, scopeId }),
    enabled: open,
  });

  const restoreMutation = useMutation({
    ...trpc.secret.restore.mutationOptions(),
    onSuccess: () => {
      toast.success(
        "Secret version restored successfully. Redeployment queued.",
      );
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to restore secret version");
    },
  });

  const handleRestore = (versionNumber: number) => {
    restoreMutation.mutate({
      scopeType,
      scopeId,
      version: versionNumber,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HugeiconsIcon icon={Clock01Icon} className="size-5 text-primary" />
            Secret Version History
          </DialogTitle>
          <DialogDescription>
            Review historical snapshots of secrets for this {scopeType} and
            restore to any previous version.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {isLoading ? (
            <div className="flex h-32 items-center justify-center">
              <Spinner />
            </div>
          ) : !versions || versions.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-muted-foreground text-xs">
              No version history logged for this {scopeType} yet.
            </div>
          ) : (
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {versions.map((ver) => (
                <div
                  key={ver.id}
                  className="flex items-center justify-between rounded-lg border p-3 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground">
                        Version {ver.version}
                      </span>
                      <Badge variant="outline" className="text-[10px]">
                        {ver.source}
                      </Badge>
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Created {new Date(ver.createdAt).toLocaleString()}
                    </div>
                  </div>

                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={restoreMutation.isPending}
                    onClick={() => handleRestore(ver.version)}
                  >
                    {restoreMutation.isPending ? (
                      <Spinner className="size-3" />
                    ) : (
                      <HugeiconsIcon
                        icon={RotateLeftIcon}
                        className="mr-1 size-3.5"
                      />
                    )}
                    Restore
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
