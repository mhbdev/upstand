import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@upstand/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@upstand/ui/components/card";
import { Spinner } from "@upstand/ui/components/spinner";
import { useState } from "react";
import { toast } from "sonner";
import { SelfUpdateDialog } from "@/components/self-update-dialog";
import { trpc } from "@/utils/trpc";

export function AppInfoPanel() {
  const queryClient = useQueryClient();
  const [updateDialogVersion, setUpdateDialogVersion] = useState<string>();

  const { data, isFetching, refetch } = useQuery({
    ...trpc.webServer.getUpdateData.queryOptions(),
  });

  const checkUpdates = useMutation({
    ...trpc.webServer.checkForUpdates.mutationOptions(),
    onSuccess: (result) => {
      queryClient.setQueryData(trpc.webServer.getUpdateData.queryKey(), result);
    },
    onError: (error) => toast.error(error.message),
  });

  const update = useMutation({
    ...trpc.webServer.triggerUpdate.mutationOptions(),
    onSuccess: (_, variables) => {
      setUpdateDialogVersion(variables.version);
      void refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const handleCheck = async () => {
    const result = await checkUpdates.mutateAsync();
    if (result.updateAvailable) {
      toast.info(`Upstand ${result.latestVersion} is available.`);
    } else if (result.channel === "source" && !result.updateAvailable) {
      toast.info(
        "This source installation is updated by rerunning the installer.",
      );
    } else if (result.channel === "source") {
      toast.info(
        `Upstand ${result.latestVersion} is available. Re-run the installer to update.`,
      );
    } else {
      toast.success(
        `Upstand is up to date (${result.currentVersion ?? "unknown"}).`,
      );
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Upstand Platform</CardTitle>
          <CardDescription>System and version information.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col divide-y text-sm">
            {[
              { label: "Version", value: data?.currentVersion ?? "Loading…" },
              { label: "Channel", value: data?.channel ?? "unknown" },
              { label: "Database", value: "Connected" },
            ].map(({ label, value }) => (
              <div
                key={label}
                className="flex items-center justify-between py-2 first:pt-0 last:pb-0"
              >
                <span className="text-muted-foreground">{label}</span>
                <span className="font-medium font-mono text-xs">{value}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={isFetching || checkUpdates.isPending}
              onClick={handleCheck}
            >
              {(isFetching || checkUpdates.isPending) && (
                <Spinner data-icon="inline-start" />
              )}
              {checkUpdates.isPending ? "Checking…" : "Check for Updates"}
            </Button>
            {data?.updateAvailable && data.canUpdate ? (
              <Button
                size="sm"
                disabled={update.isPending}
                onClick={() =>
                  data.images &&
                  update.mutate({
                    version: data.latestVersion,
                    images: data.images,
                  })
                }
              >
                {update.isPending
                  ? "Updating…"
                  : `Update to ${data.latestVersion}`}
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
      {updateDialogVersion ? (
        <SelfUpdateDialog open version={updateDialogVersion} />
      ) : null}
    </>
  );
}
