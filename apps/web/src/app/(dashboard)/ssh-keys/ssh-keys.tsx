"use client";

import {
  Alert02Icon,
  CheckmarkCircle02Icon,
  Copy01Icon,
  Delete02Icon,
  Edit02Icon,
  Key01Icon,
  PlusSignIcon,
  ShieldKeyIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { getUpGalTargetDefinition } from "@upstand/api/ai/upgal-ui-targets";
import { Button } from "@upstand/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@upstand/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@upstand/ui/components/dialog";
import { Input } from "@upstand/ui/components/input";
import { Label } from "@upstand/ui/components/label";
import { Spinner } from "@upstand/ui/components/spinner";
import { Textarea } from "@upstand/ui/components/textarea";
import { cn } from "@upstand/ui/lib/utils";
import { useState } from "react";
import { toast } from "sonner";
import {
  DashboardPage,
  DashboardPageHeader,
} from "@/components/dashboard/dashboard-page";
import { UpGalTarget } from "@/components/upgal-target";
import { authClient } from "@/lib/auth-client";
import { copyText } from "@/lib/browser";
import { trpc } from "@/utils/trpc";

const createSshKeyTarget = getUpGalTargetDefinition("create-ssh-key");
const generateNewSshKeyTarget = getUpGalTargetDefinition(
  "generate-new-ssh-key",
);
const useExistingSshKeyTarget = getUpGalTargetDefinition(
  "use-existing-ssh-key",
);
const sshKeyNameTarget = getUpGalTargetDefinition("ssh-key-name");
const sshKeyDescriptionTarget = getUpGalTargetDefinition("ssh-key-description");
const sshKeyPrivateKeyTarget = getUpGalTargetDefinition("ssh-key-private-key");
const sshKeyPublicKeyTarget = getUpGalTargetDefinition("ssh-key-public-key");
const generateSshKeySubmitTarget = getUpGalTargetDefinition(
  "generate-ssh-key-submit",
);
const importSshKeySubmitTarget = getUpGalTargetDefinition(
  "import-ssh-key-submit",
);

type AddKeyMode = "generate" | "import";

interface RevealedKey {
  id: string;
  name: string;
  publicKey: string;
  fingerprint: string;
  privateKey: string;
}

export default function SSHKeys(_props: {
  session: typeof authClient.$Infer.Session;
}) {
  const { data: activeOrg } = authClient.useActiveOrganization();
  const [addKeyOpen, setAddKeyOpen] = useState(false);
  const [addKeyMode, setAddKeyMode] = useState<AddKeyMode>("generate");
  const [deleteKeyOpen, setDeleteKeyOpen] = useState(false);
  const [editKeyOpen, setEditKeyOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [selectedKey, setSelectedKey] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [revealedKey, setRevealedKey] = useState<RevealedKey | null>(null);
  const [privateKeyCopied, setPrivateKeyCopied] = useState(false);

  // Form State
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [publicKey, setPublicKey] = useState("");
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [rotationPrivateKey, setRotationPrivateKey] = useState("");
  const [rotationPublicKey, setRotationPublicKey] = useState("");

  const orgId = activeOrg?.id;

  const resetForm = () => {
    setName("");
    setDescription("");
    setPrivateKey("");
    setPublicKey("");
  };

  const resetEditForm = () => {
    setEditingKey(null);
    setEditName("");
    setEditDescription("");
    setRotationPrivateKey("");
    setRotationPublicKey("");
  };

  // List SSH Keys
  const {
    data: keys,
    isLoading: loadingKeys,
    refetch,
  } = useQuery({
    ...trpc.sshKey.list.queryOptions({ organizationId: orgId || "" }),
    enabled: !!orgId,
  });

  // Generate SSH Key mutation (server generates a real ED25519 key pair)
  const generateMutation = useMutation({
    ...trpc.sshKey.generate.mutationOptions(),
    onSuccess: (result) => {
      setAddKeyOpen(false);
      resetForm();
      setRevealedKey(result);
      setPrivateKeyCopied(false);
      refetch();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to generate SSH Key");
    },
  });

  // Import (bring your own) SSH Key mutation
  const createMutation = useMutation({
    ...trpc.sshKey.create.mutationOptions(),
    onSuccess: () => {
      toast.success("SSH Key added successfully");
      setAddKeyOpen(false);
      resetForm();
      refetch();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to add SSH Key");
    },
  });

  // Delete SSH Key mutation
  const deleteMutation = useMutation({
    ...trpc.sshKey.delete.mutationOptions(),
    onSuccess: () => {
      toast.success("SSH Key deleted successfully");
      setDeleteKeyOpen(false);
      setSelectedKey(null);
      refetch();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to delete SSH Key");
    },
  });

  const updateMutation = useMutation({
    ...trpc.sshKey.update.mutationOptions(),
    onSuccess: () => {
      toast.success("SSH Key updated successfully");
      setEditKeyOpen(false);
      resetEditForm();
      refetch();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to update SSH Key");
    },
  });

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId) {
      toast.error("No active organization found");
      return;
    }
    if (!name.trim()) {
      toast.error("Please give the key a name");
      return;
    }
    generateMutation.mutate({
      organizationId: orgId,
      name: name.trim(),
      description: description.trim() || undefined,
    });
  };

  const handleImport = (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId) {
      toast.error("No active organization found");
      return;
    }
    if (!name.trim() || !privateKey.trim() || !publicKey.trim()) {
      toast.error("Please fill in all required fields");
      return;
    }

    createMutation.mutate({
      organizationId: orgId,
      name: name.trim(),
      description: description.trim() || undefined,
      privateKey: privateKey.trim(),
      publicKey: publicKey.trim(),
    });
  };

  const handleCopyPrivateKey = async () => {
    if (!revealedKey) return;
    try {
      await copyText(revealedKey.privateKey);
      setPrivateKeyCopied(true);
      toast.success("Private key copied to clipboard");
    } catch {
      toast.error(
        "Couldn't copy automatically — please select and copy manually",
      );
    }
  };

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId || !editingKey) return;
    const hasPrivate = Boolean(rotationPrivateKey.trim());
    const hasPublic = Boolean(rotationPublicKey.trim());
    if (hasPrivate !== hasPublic) {
      toast.error("Provide both private and public keys to rotate the key");
      return;
    }
    updateMutation.mutate({
      id: editingKey.id,
      organizationId: orgId,
      name: editName.trim(),
      description: editDescription.trim() || null,
      ...(hasPrivate && hasPublic
        ? {
            privateKey: rotationPrivateKey.trim(),
            publicKey: rotationPublicKey.trim(),
          }
        : {}),
    });
  };

  const isSubmitting = generateMutation.isPending || createMutation.isPending;

  return (
    <DashboardPage>
      {/* Header */}
      <DashboardPageHeader
        title="SSH Keys"
        description="Create and manage SSH Keys to securely access your servers and Git repositories."
        icon={
          <HugeiconsIcon icon={Key01Icon} className="size-6 text-primary" />
        }
        actions={
          <UpGalTarget definition={createSshKeyTarget}>
            <Button
              onClick={() => {
                resetForm();
                setAddKeyMode("generate");
                setAddKeyOpen(true);
              }}
              className="gap-2 font-medium"
            >
              <HugeiconsIcon icon={PlusSignIcon} className="size-4" />
              Add SSH Key
            </Button>
          </UpGalTarget>
        }
      />

      {/* Main List */}
      {loadingKeys ? (
        <div className="flex min-h-60 items-center justify-center">
          <Spinner className="size-8" />
        </div>
      ) : !orgId ? (
        <div className="py-12 text-center text-muted-foreground">
          Please select an organization to view SSH keys.
        </div>
      ) : keys && keys.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {keys.map((key, index) => (
            <Card
              key={key.id}
              className="border border-border/40 bg-card/30 transition-all duration-300 hover:border-primary/45"
            >
              <CardHeader className="flex flex-row items-start justify-between pb-3">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2 font-bold text-base">
                    <span className="font-mono text-muted-foreground text-xs">
                      {index + 1}.
                    </span>
                    {key.name}
                    <span className="rounded-full border border-border/50 px-2 py-0.5 font-mono text-[9px] text-muted-foreground uppercase tracking-wider">
                      {key.algorithm}
                    </span>
                  </CardTitle>
                  {key.description && (
                    <CardDescription className="line-clamp-2 text-muted-foreground text-xs">
                      {key.description}
                    </CardDescription>
                  )}
                  <p className="pt-1 font-semibold text-[10px] text-muted-foreground/70 uppercase tracking-wider">
                    Created: {new Date(key.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingKey({ id: key.id, name: key.name });
                      setEditName(key.name);
                      setEditDescription(key.description ?? "");
                      setEditKeyOpen(true);
                    }}
                    className="p-1.5 text-muted-foreground transition-all hover:bg-muted/50 hover:text-foreground"
                    aria-label={`Edit ${key.name}`}
                  >
                    <HugeiconsIcon icon={Edit02Icon} className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedKey({ id: key.id, name: key.name });
                      setDeleteKeyOpen(true);
                    }}
                    className="p-1.5 text-muted-foreground transition-all hover:bg-destructive/10 hover:text-destructive"
                    aria-label={`Delete ${key.name}`}
                  >
                    <HugeiconsIcon icon={Delete02Icon} className="size-4" />
                  </button>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="mt-1 border border-border/30 p-3">
                  <Label className="font-bold text-[9px] text-muted-foreground uppercase tracking-widest">
                    Fingerprint
                  </Label>
                  <p className="select-all break-all pt-1 font-mono text-[10px] text-zinc-300">
                    {key.fingerprint ?? `${key.publicKey.substring(0, 60)}...`}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-border/40 border-dashed bg-card/10 p-12 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center bg-primary/10 text-primary">
            <HugeiconsIcon icon={Key01Icon} className="size-6" />
          </div>
          <h3 className="mb-1 font-semibold text-foreground text-lg">
            No SSH Keys Found
          </h3>
          <p className="mb-6 max-w-sm text-muted-foreground text-sm">
            Add an SSH Key to reuse it across different git providers,
            deployments, and servers.
          </p>
          <UpGalTarget definition={createSshKeyTarget}>
            <Button
              variant="outline"
              onClick={() => {
                resetForm();
                setAddKeyMode("generate");
                setAddKeyOpen(true);
              }}
            >
              Create first key
            </Button>
          </UpGalTarget>
        </div>
      )}

      <Dialog
        open={editKeyOpen}
        onOpenChange={(open) => {
          setEditKeyOpen(open);
          if (!open) resetEditForm();
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-bold text-xl">
              <HugeiconsIcon
                icon={Edit02Icon}
                className="size-5 text-primary"
              />
              Edit SSH Key
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-sm">
              Update metadata or rotate the key pair for {editingKey?.name}.
              Rotation replaces the stored encrypted private key.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-key-name">Name</Label>
              <Input
                id="edit-key-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-key-description">Description</Label>
              <Input
                id="edit-key-description"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
              />
            </div>
            <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-muted-foreground text-xs">
              Leave the rotation fields empty to keep the current key. If you
              rotate, both key halves are required and will be verified.
            </div>
            <div className="space-y-2">
              <Label htmlFor="rotate-private-key">
                Replacement private key
              </Label>
              <Textarea
                id="rotate-private-key"
                value={rotationPrivateKey}
                onChange={(e) => setRotationPrivateKey(e.target.value)}
                rows={4}
                className="resize-none break-all font-mono text-xs"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rotate-public-key">Replacement public key</Label>
              <Textarea
                id="rotate-public-key"
                value={rotationPublicKey}
                onChange={(e) => setRotationPublicKey(e.target.value)}
                rows={2}
                className="resize-none break-all font-mono text-xs"
              />
            </div>
            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setEditKeyOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending && <Spinner className="size-4" />}
                {updateMutation.isPending ? "Saving..." : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add SSH Key Dialog */}
      <Dialog
        open={addKeyOpen}
        onOpenChange={(open) => {
          setAddKeyOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-bold text-xl">
              <HugeiconsIcon icon={Key01Icon} className="size-5 text-primary" />
              Add SSH Key
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-sm">
              Generate a new key pair, or bring one you already have.
            </DialogDescription>
          </DialogHeader>

          {/* Mode toggle */}
          <div className="flex gap-1.5 rounded-lg border border-border/40 bg-muted/20 p-1">
            <UpGalTarget definition={generateNewSshKeyTarget}>
              <button
                type="button"
                onClick={() => setAddKeyMode("generate")}
                className={cn(
                  "flex-1 rounded-md py-1.5 font-medium text-xs transition-colors",
                  addKeyMode === "generate"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Generate new key
              </button>
            </UpGalTarget>
            <UpGalTarget definition={useExistingSshKeyTarget}>
              <button
                type="button"
                onClick={() => setAddKeyMode("import")}
                className={cn(
                  "flex-1 rounded-md py-1.5 font-medium text-xs transition-colors",
                  addKeyMode === "import"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Use existing key
              </button>
            </UpGalTarget>
          </div>

          {addKeyMode === "generate" ? (
            <form onSubmit={handleGenerate} className="space-y-4 pt-1">
              <div className="space-y-2">
                <Label htmlFor="gen-key-name">Name</Label>
                <UpGalTarget definition={sshKeyNameTarget}>
                  <Input
                    id="gen-key-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Hetzner Production VPS"
                    autoComplete="off"
                    required
                  />
                </UpGalTarget>
              </div>

              <div className="space-y-2">
                <Label htmlFor="gen-key-desc">Description</Label>
                <UpGalTarget definition={sshKeyDescriptionTarget}>
                  <Input
                    id="gen-key-desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Used for private git access"
                    autoComplete="off"
                  />
                </UpGalTarget>
              </div>

              <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs">
                <HugeiconsIcon
                  icon={ShieldKeyIcon}
                  className="mt-0.5 size-4 shrink-0 text-primary"
                />
                <p className="text-muted-foreground">
                  We'll generate a real ED25519 key pair on the server. The
                  private key is shown to you once, immediately after generation
                  — save it somewhere safe, since we can't show it to you again.
                </p>
              </div>

              <DialogFooter className="gap-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setAddKeyOpen(false)}
                >
                  Cancel
                </Button>
                <UpGalTarget definition={generateSshKeySubmitTarget}>
                  <Button
                    type="submit"
                    className="gap-2 font-medium"
                    disabled={isSubmitting}
                  >
                    {generateMutation.isPending && (
                      <Spinner className="size-4" />
                    )}
                    {generateMutation.isPending
                      ? "Generating..."
                      : "Generate Key"}
                  </Button>
                </UpGalTarget>
              </DialogFooter>
            </form>
          ) : (
            <form onSubmit={handleImport} className="space-y-4 pt-1">
              <div className="space-y-2">
                <Label htmlFor="key-name">Name</Label>
                <UpGalTarget definition={sshKeyNameTarget}>
                  <Input
                    id="key-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Hetzner Production VPS"
                    autoComplete="off"
                    required
                  />
                </UpGalTarget>
              </div>

              <div className="space-y-2">
                <Label htmlFor="key-desc">Description</Label>
                <UpGalTarget definition={sshKeyDescriptionTarget}>
                  <Input
                    id="key-desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Used for private git access"
                    autoComplete="off"
                  />
                </UpGalTarget>
              </div>

              <div className="space-y-2">
                <Label htmlFor="private-key">Private Key</Label>
                <UpGalTarget definition={sshKeyPrivateKeyTarget}>
                  <Textarea
                    id="private-key"
                    value={privateKey}
                    onChange={(e) => setPrivateKey(e.target.value)}
                    rows={4}
                    placeholder="-----BEGIN OPENSSH PRIVATE KEY-----…"
                    className="resize-none break-all border border-border/40 p-3 font-mono text-xs focus:border-primary focus:outline-none"
                    required
                  />
                </UpGalTarget>
              </div>

              <div className="space-y-2">
                <Label htmlFor="public-key">Public Key</Label>
                <UpGalTarget definition={sshKeyPublicKeyTarget}>
                  <Textarea
                    id="public-key"
                    value={publicKey}
                    onChange={(e) => setPublicKey(e.target.value)}
                    rows={2}
                    placeholder="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5…"
                    className="resize-none break-all border border-border/40 p-3 font-mono text-xs focus:border-primary focus:outline-none"
                    required
                  />
                </UpGalTarget>
                <p className="text-[11px] text-muted-foreground">
                  We verify the private and public key actually match before
                  storing them.
                </p>
              </div>

              <DialogFooter className="gap-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setAddKeyOpen(false)}
                >
                  Cancel
                </Button>
                <UpGalTarget definition={importSshKeySubmitTarget}>
                  <Button
                    type="submit"
                    className="gap-2 font-medium"
                    disabled={isSubmitting}
                  >
                    {createMutation.isPending && <Spinner className="size-4" />}
                    {createMutation.isPending ? "Adding…" : "Add Key"}
                  </Button>
                </UpGalTarget>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Reveal generated private key Dialog (shown exactly once) */}
      <Dialog
        open={!!revealedKey}
        onOpenChange={(open) => {
          if (!open) {
            setRevealedKey(null);
            setPrivateKeyCopied(false);
          }
        }}
      >
        <DialogContent className="max-w-lg rounded-2xl border border-primary/30 bg-card shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-bold text-xl">
              <HugeiconsIcon
                icon={ShieldKeyIcon}
                className="size-5 text-primary"
              />
              Save your private key
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-sm">
              This is the only time we'll show you the private key for{" "}
              <span className="font-semibold text-foreground">
                {revealedKey?.name}
              </span>
              . Copy it now and store it somewhere safe — we only keep an
              encrypted copy and can't display it again.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="font-bold text-[9px] text-muted-foreground uppercase tracking-widest">
                Private Key
              </Label>
              <Textarea
                readOnly
                value={revealedKey?.privateKey ?? ""}
                rows={6}
                className="select-all resize-none break-all border border-border/40 p-3 font-mono text-[10px]"
                onFocus={(e) => e.target.select()}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="font-bold text-[9px] text-muted-foreground uppercase tracking-widest">
                Public Key
              </Label>
              <Textarea
                readOnly
                value={revealedKey?.publicKey ?? ""}
                rows={2}
                className="select-all resize-none break-all border border-border/40 p-3 font-mono text-[10px]"
                onFocus={(e) => e.target.select()}
              />
            </div>

            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs">
              <HugeiconsIcon
                icon={Alert02Icon}
                className="mt-0.5 size-4 shrink-0 text-destructive"
              />
              <p className="text-muted-foreground">
                Closing this dialog without saving the private key means it's
                gone for good — you'd need to generate a new key pair.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              className="gap-2"
              onClick={handleCopyPrivateKey}
            >
              <HugeiconsIcon
                icon={privateKeyCopied ? CheckmarkCircle02Icon : Copy01Icon}
                className="size-4"
              />
              {privateKeyCopied ? "Copied" : "Copy Private Key"}
            </Button>
            <Button
              type="button"
              className="font-medium"
              disabled={!privateKeyCopied}
              onClick={() => {
                setRevealedKey(null);
                setPrivateKeyCopied(false);
                toast.success("SSH Key generated successfully");
              }}
            >
              I've saved it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete SSH Key Dialog */}
      <Dialog open={deleteKeyOpen} onOpenChange={setDeleteKeyOpen}>
        <DialogContent className="rounded-2xl border border-destructive/30 bg-card shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-bold text-destructive text-xl">
              <HugeiconsIcon icon={Alert02Icon} className="size-5" />
              Delete SSH Key
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-sm">
              Are you sure you want to delete{" "}
              <span className="font-semibold text-foreground">
                {selectedKey?.name}
              </span>
              ? This action is permanent and cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDeleteKeyOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteMutation.isPending}
              className="gap-2"
              onClick={() => {
                if (selectedKey) {
                  deleteMutation.mutate({ id: selectedKey.id });
                }
              }}
            >
              {deleteMutation.isPending && <Spinner className="size-4" />}
              Delete Key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardPage>
  );
}
