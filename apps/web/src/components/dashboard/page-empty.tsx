import { HugeiconsIcon } from "@hugeicons/react";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@upstand/ui/components/empty";
import { cn } from "@upstand/ui/lib/utils";
import type { ReactNode } from "react";

export function PageEmpty({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: any;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <Empty className={cn(className)}>
      <EmptyHeader>
        {Icon ? (
          <EmptyMedia variant="icon">
            {typeof Icon === "function" ||
            (typeof Icon === "object" &&
              Icon !== null &&
              "$$typeof" in Icon) ? (
              <Icon className="size-6" aria-hidden="true" />
            ) : (
              <HugeiconsIcon icon={Icon} aria-hidden="true" />
            )}
          </EmptyMedia>
        ) : null}
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  );
}
