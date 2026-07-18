import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
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
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: IconSvgElement;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <Empty className={cn(className)}>
      <EmptyHeader>
        {icon ? (
          <EmptyMedia variant="icon">
            <HugeiconsIcon icon={icon} aria-hidden="true" />
          </EmptyMedia>
        ) : null}
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  );
}
