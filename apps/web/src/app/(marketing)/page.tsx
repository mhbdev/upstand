"use client";

import {
  Alert02Icon,
  CheckmarkCircle02Icon,
  CloudServerIcon,
  Folder01Icon,
  LockPasswordIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@upstand/ui/components/badge";
import { Button } from "@upstand/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@upstand/ui/components/card";
import { Separator } from "@upstand/ui/components/separator";
import { Skeleton } from "@upstand/ui/components/skeleton";
import { cn } from "@upstand/ui/lib/utils";
import Link from "next/link";
import { PageBackdrop } from "@/components/marketing/page-backdrop";
import { trpc } from "@/utils/trpc";

const FEATURES = [
  {
    icon: CloudServerIcon,
    title: "Server & Apps Manager",
    description:
      "Deploy PostgreSQL, Redis, Node.js, Go, or any Dockerized app on your VPS with a single click — managed under isolated project namespaces.",
  },
  {
    icon: Folder01Icon,
    title: "Multi-Tenant Projects",
    description:
      "Organize deployments into workspaces with full team collaboration, role-based access, and invitation management.",
  },
  {
    icon: LockPasswordIcon,
    title: "Enterprise-Grade Security",
    description:
      "Two-factor authentication, secure Google OAuth, and session management built on Better Auth.",
  },
];

export default function Home() {
  const healthCheck = useQuery(trpc.healthCheck.queryOptions());

  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden px-6 py-16 md:py-24">
      <PageBackdrop />

      <div className="relative z-10 w-full max-w-4xl text-center">
        {/* Status badge */}
        <Badge variant="outline" className="mb-6 gap-1.5">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-primary" />
          </span>
          Open-source · Self-hosted · v0.1.0
        </Badge>

        {/* Hero heading */}
        <h1 className="mb-4 text-balance font-bold text-4xl tracking-tight sm:text-6xl">
          The Open-Source
          <br className="hidden sm:block" /> Self-Hosted PaaS
        </h1>

        <p className="mx-auto mb-8 max-w-2xl text-balance text-lg text-muted-foreground">
          Upstand is a modern Coolify and Dokploy alternative. Deploy apps,
          databases and services on your own servers — with automatic SSL,
          multi-tenant workspaces and end-to-end 2FA.
        </p>

        {/* CTAs — Base UI Button uses render prop, not asChild */}
        <div className="mb-12 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button
            size="lg"
            render={<Link href="/dashboard" />}
            nativeButton={false}
          >
            Open Dashboard
          </Button>
          <Button
            size="lg"
            variant="outline"
            render={
              <a
                href="https://github.com/upstand-dev/upstand"
                target="_blank"
                rel="noreferrer"
              />
            }
            nativeButton={false}
          >
            View on GitHub
          </Button>
        </div>

        <Separator className="mb-12" />

        {/* Status + Features */}
        <div className="grid gap-4 text-left sm:grid-cols-2 lg:grid-cols-4">
          {/* API Health */}
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>API Server</CardDescription>
              <CardTitle className="flex items-center gap-2 text-base">
                {healthCheck.isPending ? (
                  <Skeleton className="h-4 w-24" />
                ) : (
                  <>
                    <HugeiconsIcon
                      icon={
                        healthCheck.data ? CheckmarkCircle02Icon : Alert02Icon
                      }
                      className={cn(
                        "size-4",
                        healthCheck.data
                          ? "text-emerald-500"
                          : "text-destructive",
                      )}
                    />
                    {healthCheck.data ? "Healthy" : "Unreachable"}
                  </>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-xs">
                {healthCheck.data
                  ? "Connected to database & API"
                  : "Check local docker services"}
              </p>
            </CardContent>
          </Card>

          {/* Feature cards */}
          {FEATURES.map((feature) => (
            <Card key={feature.title}>
              <CardHeader className="pb-2">
                <div className="mb-1 flex size-8 items-center justify-center rounded-md bg-primary/10">
                  <HugeiconsIcon
                    icon={feature.icon}
                    className="size-4 text-primary"
                  />
                </div>
                <CardTitle className="text-base">{feature.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>{feature.description}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
