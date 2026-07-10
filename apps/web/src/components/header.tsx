"use client";

import { UserIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { UserAvatar } from "./auth/user/user-avatar";
import { ModeToggle } from "./mode-toggle";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/dashboard", label: "Dashboard" },
] as const;

export default function Header() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 w-full border-border/40 border-b bg-background/20 backdrop-blur-md supports-backdrop-filter:bg-background/60">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        {/* Brand */}
        <div className="flex items-center gap-6">
          <Link
            href="/"
            aria-label="Upstand home"
            className="bg-linear-to-r from-foreground to-muted-foreground bg-clip-text font-bold text-lg text-transparent tracking-tight transition-opacity hover:opacity-80"
          >
            Upstand
          </Link>

          {/* Desktop nav */}
          <nav
            aria-label="Main navigation"
            className="hidden items-center gap-1 sm:flex"
          >
            {NAV_LINKS.map(({ href, label }) => {
              const isActive = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
                    isActive
                      ? "font-medium text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Controls */}
        <div className="flex shrink-0 items-center gap-2">
          <ModeToggle />
          <UserAvatar
            fallback={
              <Link className="cursor-pointer" href={"/login"}>
                <HugeiconsIcon size={"16"} icon={UserIcon} />
              </Link>
            }
          />
        </div>
      </div>
    </header>
  );
}
