"use client";

import {
  Delete02Icon,
  Edit02Icon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@upstand/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@upstand/ui/components/card";
import { Input } from "@upstand/ui/components/input";
import { Label } from "@upstand/ui/components/label";
import { Textarea } from "@upstand/ui/components/textarea";
import { useState } from "react";
import { toast } from "sonner";
import {
  DashboardPage,
  DashboardPageHeader,
} from "@/components/dashboard/dashboard-page";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/utils/trpc";

export default function CertificatesPage() {
  const { data: activeOrganization } = authClient.useActiveOrganization();
  const organizationId = activeOrganization?.id || "";
  const [name, setName] = useState("");
  const [certificatePem, setCertificatePem] = useState("");
  const [privateKeyPem, setPrivateKeyPem] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const certificatesQuery = useQuery({
    ...trpc.certificate.list.queryOptions({ organizationId }),
    enabled: Boolean(organizationId),
  });
  const createMutation = useMutation({
    ...trpc.certificate.create.mutationOptions(),
    onSuccess: () => {
      toast.success("Certificate stored securely");
      setName("");
      setCertificatePem("");
      setPrivateKeyPem("");
      void certificatesQuery.refetch();
    },
    onError: (error) => toast.error(error.message),
  });
  const deleteMutation = useMutation({
    ...trpc.certificate.delete.mutationOptions(),
    onSuccess: () => {
      toast.success("Certificate removed");
      void certificatesQuery.refetch();
    },
    onError: (error) => toast.error(error.message),
  });
  const updateMutation = useMutation({
    ...trpc.certificate.update.mutationOptions(),
    onSuccess: () => {
      toast.success("Certificate updated");
      setEditingId(null);
      setName("");
      setCertificatePem("");
      setPrivateKeyPem("");
      void certificatesQuery.refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <DashboardPage>
      <DashboardPageHeader
        title="Certificates"
        description="Manage encrypted custom TLS certificates for HTTPS resource domains. Private keys are never returned to the browser after creation."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>
              {editingId ? "Edit custom certificate" : "Add custom certificate"}
            </CardTitle>
            <CardDescription>
              Paste PEM-encoded certificate and private key material.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (!organizationId) return;
                if (editingId) {
                  updateMutation.mutate({
                    id: editingId,
                    name,
                    ...(certificatePem ? { certificatePem } : {}),
                    ...(privateKeyPem ? { privateKeyPem } : {}),
                  });
                } else {
                  createMutation.mutate({
                    organizationId,
                    name,
                    certificatePem,
                    privateKeyPem,
                  });
                }
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="certificate-name">Name</Label>
                <Input
                  id="certificate-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required={!editingId}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="certificate-pem">Certificate PEM</Label>
                <Textarea
                  id="certificate-pem"
                  value={certificatePem}
                  onChange={(event) => setCertificatePem(event.target.value)}
                  required={!editingId}
                  rows={7}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="private-key-pem">Private key PEM</Label>
                <Textarea
                  id="private-key-pem"
                  value={privateKeyPem}
                  onChange={(event) => setPrivateKeyPem(event.target.value)}
                  required
                  rows={7}
                />
              </div>
              <Button
                type="submit"
                disabled={
                  createMutation.isPending ||
                  updateMutation.isPending ||
                  !organizationId
                }
                className="gap-2"
              >
                <HugeiconsIcon icon={PlusSignIcon} className="size-4" />
                {createMutation.isPending || updateMutation.isPending
                  ? "Encrypting…"
                  : editingId
                    ? "Save changes"
                    : "Store certificate"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Stored certificates</CardTitle>
            <CardDescription>
              Only configuration status is displayed.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(certificatesQuery.data ?? []).map((certificate) => (
              <div
                key={certificate.id}
                className="flex items-center justify-between rounded-md border p-3"
              >
                <div>
                  <p className="font-medium">{certificate.name}</p>
                  <p className="text-muted-foreground text-xs">
                    Certificate and private key configured
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Edit ${certificate.name}`}
                    onClick={() => {
                      setEditingId(certificate.id);
                      setName(certificate.name);
                      setCertificatePem("");
                      setPrivateKeyPem("");
                    }}
                  >
                    <HugeiconsIcon icon={Edit02Icon} className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete ${certificate.name}`}
                    onClick={() => {
                      if (confirm(`Delete ${certificate.name}?`))
                        deleteMutation.mutate({ id: certificate.id });
                    }}
                  >
                    <HugeiconsIcon
                      icon={Delete02Icon}
                      className="size-4 text-destructive"
                    />
                  </Button>
                </div>
              </div>
            ))}
            {certificatesQuery.data?.length === 0 && (
              <p className="text-muted-foreground text-sm">
                No custom certificates stored.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardPage>
  );
}
