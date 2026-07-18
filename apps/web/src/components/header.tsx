"use client";

import { Cancel01Icon, Menu01Icon, UserIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { UserAvatar } from "./auth/user/user-avatar";
import { ModeToggle } from "./mode-toggle";

const NAV_LINKS = [
  { href: "/", label: "Home", external: false },
  { href: "/dashboard", label: "Dashboard", external: false },
  { href: "/docs", label: "Docs", external: true },
] as const;

export default function Header() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (pathname) {
      setMobileMenuOpen(false);
    }
  }, [pathname]);

  useEffect(() => {
    if (!mobileMenuOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      setMobileMenuOpen(false);
      mobileMenuButtonRef.current?.focus();
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !mobileMenuRef.current?.contains(event.target)
      ) {
        setMobileMenuOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [mobileMenuOpen]);

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
            {NAV_LINKS.map(({ href, label, external }) => {
              const isActive = pathname === href;
              return external ? (
                <a
                  key={href}
                  href={href}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
                    isActive
                      ? "font-medium text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {label}
                </a>
              ) : (
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
          <div ref={mobileMenuRef} className="relative sm:hidden">
            <button
              ref={mobileMenuButtonRef}
              type="button"
              aria-controls="mobile-main-navigation"
              aria-expanded={mobileMenuOpen}
              aria-label={
                mobileMenuOpen
                  ? "Close navigation menu"
                  : "Open navigation menu"
              }
              className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              onClick={() => setMobileMenuOpen((open) => !open)}
            >
              <HugeiconsIcon
                aria-hidden="true"
                className="size-5"
                icon={mobileMenuOpen ? Cancel01Icon : Menu01Icon}
              />
            </button>
            {mobileMenuOpen ? (
              <nav
                id="mobile-main-navigation"
                aria-label="Mobile main navigation"
                className="absolute top-full right-0 mt-2 flex min-w-44 flex-col gap-1 rounded-lg border bg-popover p-2 shadow-lg"
              >
                {NAV_LINKS.map(({ href, label, external }) => {
                  const isActive = pathname === href;
                  const className = cn(
                    "rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
                    isActive
                      ? "font-medium text-foreground"
                      : "text-muted-foreground",
                  );

                  return external ? (
                    <a
                      key={href}
                      href={href}
                      className={className}
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      {label}
                    </a>
                  ) : (
                    <Link
                      key={href}
                      href={href}
                      aria-current={isActive ? "page" : undefined}
                      className={className}
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      {label}
                    </Link>
                  );
                })}
              </nav>
            ) : null}
          </div>
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
