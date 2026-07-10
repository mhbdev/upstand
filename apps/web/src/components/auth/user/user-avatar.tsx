"use client";

import { useAuth, useSession } from "@better-auth-ui/react";
import { UserIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@upstand/ui/components/avatar";
import { Skeleton } from "@upstand/ui/components/skeleton";
import { cn } from "@upstand/ui/lib/utils";
import type { User } from "better-auth";
import type { ReactNode } from "react";

export type UserAvatarProps = {
  className?: string;
  fallback?: ReactNode;
  isPending?: boolean;
  user?: User & { username?: string | null; displayUsername?: string | null };
};

export function UserAvatar({
  className,
  user,
  isPending,
  fallback,
}: UserAvatarProps) {
  const { authClient } = useAuth();
  const { data: session, isPending: sessionPending } = useSession(authClient, {
    enabled: !user && !isPending,
  });

  if ((isPending || sessionPending) && !user) {
    return <Skeleton className={cn("size-8", className)} />;
  }

  const resolvedUser = user ?? session?.user;

  const initials = (resolvedUser?.name || resolvedUser?.email)
    ?.slice(0, 2)
    .toUpperCase();

  return (
    <Avatar
      className={cn("size-8 bg-muted text-foreground text-sm", className)}
    >
      <AvatarImage src={resolvedUser?.image ?? undefined} alt="" />

      <AvatarFallback className="text-muted-foreground!">
        {fallback || initials || (
          <HugeiconsIcon icon={UserIcon} className="size-4" />
        )}
      </AvatarFallback>
    </Avatar>
  );
}
