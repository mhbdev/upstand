import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@upstand/ui/components/empty";
import type { ReactNode } from "react";

export function PageEmpty({
  icon,
  title,
  description,
  action,
}: {
  icon?: IconSvgElement;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <Empty>
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
