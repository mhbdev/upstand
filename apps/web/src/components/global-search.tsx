"use client";

import {
  CloudServerIcon,
  Folder01Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@upstand/ui/components/command";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/utils/trpc";

export function GlobalSearch() {
  const router = useRouter();
  const { data: organization } = authClient.useActiveOrganization();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(input.trim()), 180);
    return () => window.clearTimeout(timer);
  }, [input]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const results = useQuery({
    ...trpc.search.global.queryOptions({
      organizationId: organization?.id ?? "",
      query: query || "_",
      limit: 30,
    }),
    enabled: open && Boolean(organization?.id) && query.length > 1,
  });

  const groupedResults = (results.data ?? []).reduce<
    Record<string, NonNullable<typeof results.data>>
  >((groups, result) => {
    const group = groups[result.type] ?? [];
    group.push(result);
    groups[result.type] = group;
    return groups;
  }, {});

  const resultLabels = {
    project: "Projects",
    environment: "Environments",
    resource: "Resources",
  } as const;

  return (
    <>
      <button
        type="button"
        className="flex size-9 shrink-0 items-center justify-center gap-2 rounded-3xl border bg-input/40 px-0 text-muted-foreground text-sm hover:bg-accent sm:h-9 sm:w-52 sm:justify-start sm:px-3"
        onClick={() => setOpen(true)}
        aria-label="Open global search"
        aria-keyshortcuts="Control+K Meta+K"
      >
        <HugeiconsIcon icon={Search01Icon} className="size-4 shrink-0" />
        <span className="hidden flex-1 truncate text-left sm:block">
          Search anything…
        </span>
        <kbd className="hidden rounded border bg-background px-1.5 py-0.5 font-mono text-[10px] sm:block">
          ⌘K
        </kbd>
      </button>
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Global search"
        description="Search projects, environments, and resources."
      >
        <Command shouldFilter={false}>
          <CommandInput
            value={input}
            onValueChange={setInput}
            placeholder="Search projects, environments, resources…"
          />
          <CommandList className="max-h-[min(60svh,28rem)] p-1 sm:max-h-96">
            <CommandEmpty>
              {query.length > 1
                ? results.isLoading
                  ? "Searching…"
                  : "No matching resources."
                : "Type at least two characters."}
            </CommandEmpty>
            {(
              Object.keys(resultLabels) as Array<keyof typeof resultLabels>
            ).map((type) => {
              const items = groupedResults[type];
              if (!items?.length) return null;
              return (
                <CommandGroup key={type} heading={resultLabels[type]}>
                  {items.map((result) => (
                    <CommandItem
                      key={`${result.type}-${result.id}`}
                      value={`${result.name} ${result.subtitle}`}
                      onSelect={() => {
                        setOpen(false);
                        setInput("");
                        router.push(result.href as Route);
                      }}
                    >
                      <HugeiconsIcon
                        icon={
                          type === "resource" ? CloudServerIcon : Folder01Icon
                        }
                      />
                      <span className="min-w-0 flex-1 truncate">
                        {result.name}
                      </span>
                      <span className="max-w-[45%] truncate text-muted-foreground text-xs">
                        {result.subtitle}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
