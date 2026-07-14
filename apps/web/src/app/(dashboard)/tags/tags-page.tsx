"use client";

import {
  Delete02Icon,
  PencilEdit02Icon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Badge } from "@upstand/ui/components/badge";
import { Button } from "@upstand/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@upstand/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@upstand/ui/components/dialog";
import { Input } from "@upstand/ui/components/input";
import { Label } from "@upstand/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@upstand/ui/components/select";
import { Spinner } from "@upstand/ui/components/spinner";
import { useState } from "react";
import { toast } from "sonner";
import {
  DashboardPage,
  DashboardPageHeader,
} from "@/components/dashboard/dashboard-page";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/utils/trpc";

const COLORS = [
  "primary",
  "emerald",
  "amber",
  "violet",
  "rose",
  "sky",
  "slate",
] as const;

export default function TagsPage() {
  const { data: organization } = authClient.useActiveOrganization();
  const organizationId = organization?.id ?? "";
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState<(typeof COLORS)[number]>("primary");
  const [editingTag, setEditingTag] = useState<{
    id: string;
    name: string;
    color: (typeof COLORS)[number];
  } | null>(null);
  const tags = useQuery({
    ...trpc.tag.list.queryOptions({ organizationId }),
    enabled: Boolean(organizationId),
  });
  const create = useMutation({
    ...trpc.tag.create.mutationOptions(),
    onSuccess: () => {
      toast.success("Tag created");
      setName("");
      setColor("primary");
      setOpen(false);
      tags.refetch();
    },
    onError: (error) => toast.error(error.message),
  });
  const update = useMutation({
    ...trpc.tag.update.mutationOptions(),
    onSuccess: () => {
      toast.success("Tag updated");
      setEditingTag(null);
      setName("");
      setColor("primary");
      setOpen(false);
      void tags.refetch();
    },
    onError: (error) => toast.error(error.message),
  });
  const remove = useMutation({
    ...trpc.tag.remove.mutationOptions(),
    onSuccess: () => tags.refetch(),
    onError: (error) => toast.error(error.message),
  });

  return (
    <DashboardPage>
      <DashboardPageHeader
        title="Tags"
        description="Organize resources with reusable organization-scoped labels."
        actions={
          <Button
            onClick={() => {
              setEditingTag(null);
              setName("");
              setColor("primary");
              setOpen(true);
            }}
          >
            <HugeiconsIcon icon={PlusSignIcon} data-icon="inline-start" />
            New tag
          </Button>
        }
      />
      <Card>
        <CardHeader>
          <CardTitle>Organization tags</CardTitle>
          <p className="text-muted-foreground text-sm">
            Use tags to create a shared vocabulary across resources,
            environments, and operations.
          </p>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tags.isLoading ? (
            <Spinner />
          ) : tags.data?.length ? (
            tags.data.map((tag) => (
              <div
                key={tag.id}
                className="flex items-center justify-between gap-3 rounded-xl border bg-muted/20 p-3"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <Badge variant="secondary" className="max-w-40 truncate">
                    {tag.name}
                  </Badge>
                  <span className="text-muted-foreground text-xs">
                    {tag.color}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Edit ${tag.name}`}
                    onClick={() => {
                      setEditingTag({
                        id: tag.id,
                        name: tag.name,
                        color: tag.color,
                      });
                      setName(tag.name);
                      setColor(tag.color);
                      setOpen(true);
                    }}
                  >
                    <HugeiconsIcon icon={PencilEdit02Icon} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Delete ${tag.name}`}
                    onClick={() => {
                      if (confirm(`Delete tag ${tag.name}?`))
                        remove.mutate({ id: tag.id, organizationId });
                    }}
                  >
                    <HugeiconsIcon icon={Delete02Icon} />
                  </Button>
                </div>
              </div>
            ))
          ) : (
            <p className="text-muted-foreground text-sm">No tags yet.</p>
          )}
        </CardContent>
      </Card>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingTag ? "Edit tag" : "Create tag"}</DialogTitle>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!name.trim()) return;
              if (editingTag)
                update.mutate({
                  id: editingTag.id,
                  organizationId,
                  name: name.trim(),
                  color,
                });
              else create.mutate({ organizationId, name: name.trim(), color });
            }}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="tag-name">Name</Label>
              <Input
                id="tag-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="tag-color">Color</Label>
              <Select
                value={color}
                onValueChange={(value) =>
                  setColor(value as (typeof COLORS)[number])
                }
              >
                <SelectTrigger id="tag-color">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COLORS.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={create.isPending || update.isPending || !name.trim()}
              >
                {(create.isPending || update.isPending) && (
                  <Spinner data-icon="inline-start" />
                )}
                {editingTag ? "Save changes" : "Create tag"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </DashboardPage>
  );
}
