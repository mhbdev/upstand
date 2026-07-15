"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Badge } from "@upstand/ui/components/badge";
import { Button } from "@upstand/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@upstand/ui/components/card";
import { Spinner } from "@upstand/ui/components/spinner";
import { toast } from "sonner";
import { trpc } from "@/utils/trpc";

export function TagsTab({
  resourceId,
  organizationId,
}: {
  resourceId: string;
  organizationId: string;
}) {
  const allTags = useQuery({
    ...trpc.tag.list.queryOptions({ organizationId }),
    enabled: Boolean(organizationId),
  });
  const assigned = useQuery({
    ...trpc.tag.forResource.queryOptions({ resourceId }),
    enabled: Boolean(resourceId),
  });
  const assign = useMutation({
    ...trpc.tag.assign.mutationOptions(),
    onSuccess: () => assigned.refetch(),
    onError: (error) => toast.error(error.message),
  });
  const remove = useMutation({
    ...trpc.tag.removeFromResource.mutationOptions(),
    onSuccess: () => assigned.refetch(),
    onError: (error) => toast.error(error.message),
  });
  const assignedIds = new Set(assigned.data?.map((tag) => tag.id));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Resource tags</CardTitle>
        <CardDescription>
          Apply organization tags for filtering and operations.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {allTags.isLoading || assigned.isLoading ? (
          <Spinner />
        ) : allTags.data?.length ? (
          allTags.data.map((tag) => {
            const active = assignedIds.has(tag.id);
            return (
              <Button
                key={tag.id}
                variant={active ? "default" : "outline"}
                size="sm"
                onClick={() =>
                  active
                    ? remove.mutate({ resourceId, tagId: tag.id })
                    : assign.mutate({ resourceId, tagId: tag.id })
                }
                aria-pressed={active}
              >
                <Badge variant={active ? "secondary" : "outline"}>
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: tag.color }}
                    aria-hidden="true"
                  />
                  {tag.name}
                </Badge>
              </Button>
            );
          })
        ) : (
          <p className="text-muted-foreground text-sm">
            Create a tag first from the Tags page.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
