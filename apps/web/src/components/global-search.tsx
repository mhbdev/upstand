"use client";

import { Folder01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import {
  Command,
  CommandDialog,
  CommandEmpty,
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

  return (
    <>
      <button
        type="button"
        className="flex h-9 min-w-40 items-center gap-2 rounded-3xl border bg-input/40 px-3 text-muted-foreground text-sm hover:bg-accent"
        onClick={() => setOpen(true)}
        aria-label="Open global search"
      >
        <span className="flex-1 text-left">Search projects and resources…</span>
        <kbd className="rounded border bg-background px-1.5 py-0.5 font-mono text-[10px]">
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
          <CommandList>
            <CommandEmpty>
              {query.length > 1
                ? results.isLoading
                  ? "Searching…"
                  : "No matching resources."
                : "Type at least two characters."}
            </CommandEmpty>
            {results.data?.map((result) => (
              <CommandItem
                key={`${result.type}-${result.id}`}
                value={result.id}
                onSelect={() => {
                  setOpen(false);
                  setInput("");
                  router.push(result.href as Route);
                }}
              >
                <HugeiconsIcon icon={Folder01Icon} />
                <span className="truncate">{result.name}</span>
                <span className="ml-auto truncate text-muted-foreground text-xs">
                  {result.subtitle}
                </span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
