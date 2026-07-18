"use client";

import {
  Delete02Icon,
  PencilEdit02Icon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { getUpGalTargetDefinition } from "@upstand/api/ai/upgal-ui-targets";
import {
  DEFAULT_TAG_COLOR,
  type TagColor,
  TagColorSchema,
} from "@upstand/domain";
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
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@upstand/ui/components/field";
import { Input } from "@upstand/ui/components/input";
import { Spinner } from "@upstand/ui/components/spinner";
import { useState } from "react";
import { toast } from "sonner";
import {
  DashboardPage,
  DashboardPageHeader,
} from "@/components/dashboard/dashboard-page";
import { UpGalTarget } from "@/components/upgal-target";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/utils/trpc";

const createTagTarget = getUpGalTargetDefinition("create-tag");
const tagNameTarget = getUpGalTargetDefinition("tag-name");
const createTagSubmitTarget = getUpGalTargetDefinition("create-tag-submit");

export default function TagsPage() {
  const { data: organization } = authClient.useActiveOrganization();
  const organizationId = organization?.id ?? "";
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(DEFAULT_TAG_COLOR);
  const [editingTag, setEditingTag] = useState<{
    id: string;
    name: string;
    color: TagColor;
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
      setColor(DEFAULT_TAG_COLOR);
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
      setColor(DEFAULT_TAG_COLOR);
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
  const parsedColor = TagColorSchema.safeParse(color);
  const colorIsValid = parsedColor.success;

  return (
    <DashboardPage>
      <DashboardPageHeader
        title="Tags"
        description="Organize resources with reusable organization-scoped labels."
        actions={
          <UpGalTarget definition={createTagTarget}>
            <Button
              onClick={() => {
                setEditingTag(null);
                setName("");
                setColor(DEFAULT_TAG_COLOR);
                setOpen(true);
              }}
            >
              <HugeiconsIcon icon={PlusSignIcon} data-icon="inline-start" />
              New tag
            </Button>
          </UpGalTarget>
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
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: tag.color }}
                      aria-hidden="true"
                    />
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
              if (!name.trim() || !parsedColor.success) return;
              const validColor = parsedColor.data;
              if (editingTag)
                update.mutate({
                  id: editingTag.id,
                  organizationId,
                  name: name.trim(),
                  color: validColor,
                });
              else
                create.mutate({
                  organizationId,
                  name: name.trim(),
                  color: validColor,
                });
            }}
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="tag-name">Name</FieldLabel>
                <UpGalTarget definition={tagNameTarget}>
                  <Input
                    id="tag-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    autoFocus
                  />
                </UpGalTarget>
              </Field>
              <Field data-invalid={!colorIsValid}>
                <FieldLabel htmlFor="tag-color">Color</FieldLabel>
                <div className="flex items-center gap-2">
                  <input
                    id="tag-color-picker"
                    type="color"
                    value={colorIsValid ? color : DEFAULT_TAG_COLOR}
                    onChange={(event) => setColor(event.target.value)}
                    aria-invalid={!colorIsValid}
                    aria-label="Choose tag color"
                    className="size-10 cursor-pointer rounded-md border border-input bg-background p-1"
                  />
                  <Input
                    id="tag-color"
                    value={color}
                    onChange={(event) => setColor(event.target.value)}
                    placeholder="#6366f1"
                    aria-invalid={!colorIsValid}
                    className="font-mono uppercase"
                  />
                </div>
                {colorIsValid ? (
                  <FieldDescription>
                    Choose a color or enter a 6-digit hex value.
                  </FieldDescription>
                ) : (
                  <FieldError>
                    Enter a valid 6-digit hex color, such as #6366f1.
                  </FieldError>
                )}
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <UpGalTarget definition={createTagSubmitTarget}>
                <Button
                  type="submit"
                  disabled={
                    create.isPending ||
                    update.isPending ||
                    !name.trim() ||
                    !colorIsValid
                  }
                >
                  {(create.isPending || update.isPending) && (
                    <Spinner data-icon="inline-start" />
                  )}
                  {editingTag ? "Save changes" : "Create tag"}
                </Button>
              </UpGalTarget>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </DashboardPage>
  );
}
