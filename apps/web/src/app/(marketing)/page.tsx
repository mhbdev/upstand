"use client";

import {
  CodeIcon,
  Folder01Icon,
  LockPasswordIcon,
  Rocket01Icon,
  ServerStackIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@upstand/ui/components/badge";
import { Button } from "@upstand/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@upstand/ui/components/card";
import Link from "next/link";
import { PageBackdrop } from "@/components/marketing/page-backdrop";
import { cn } from "@/lib/utils";

const FEATURES = [
  {
    icon: Rocket01Icon,
    eyebrow: "01 / Deploy",
    title: "Ship without the busywork",
    description:
      "Connect a server, choose a repository, and get a production-ready deployment with automatic SSL and repeatable releases.",
  },
  {
    icon: Folder01Icon,
    eyebrow: "02 / Organize",
    title: "Keep every project in view",
    description:
      "Workspaces, environments, and team roles give you a clean operational model as your infrastructure grows.",
  },
  {
    icon: LockPasswordIcon,
    eyebrow: "03 / Protect",
    title: "Own your control plane",
    description:
      "Self-hosted by default, with 2FA, secure sessions, and the visibility you need to run critical services confidently.",
  },
];

export default function Home() {
  return (
    <div className="relative overflow-hidden">
      <PageBackdrop />
      <div className="relative z-10 mx-auto w-full max-w-7xl px-6 pt-16 pb-20 md:px-10 md:pt-24 md:pb-28">
        <section className="grid items-center gap-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-20">
          <div className="max-w-2xl">
            <h1 className="text-balance font-bold text-5xl tracking-[-0.04em] sm:text-7xl">
              Your servers.
              <br />
              Your workflow.
              <br />
              <span className="text-primary">Upstand.</span>
            </h1>
            <p className="mt-7 max-w-xl text-balance text-lg text-muted-foreground leading-8">
              A focused control plane for deploying and operating apps on
              infrastructure you own. Less platform overhead, more time
              building.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Button
                size="lg"
                render={<Link href="/dashboard" />}
                nativeButton={false}
              >
                Start deploying{" "}
                <HugeiconsIcon icon={Rocket01Icon} data-icon="inline-end" />
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
                Explore on GitHub
              </Button>
            </div>
          </div>
          <div className="relative rounded-[2rem] border border-border/70 bg-card/70 p-3 shadow-2xl shadow-primary/10 backdrop-blur-sm">
            <div className="overflow-hidden rounded-[1.5rem] border border-border/70 bg-background">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="size-2 rounded-full bg-emerald-500" />
                  <span className="font-medium text-xs">
                    Production / overview
                  </span>
                </div>
                <Badge variant="secondary" className="rounded-full text-[10px]">
                  Live
                </Badge>
              </div>
              <div className="grid gap-3 p-4 sm:grid-cols-2">
                <div className="rounded-2xl border bg-card p-4 sm:col-span-2">
                  <div className="mb-5 flex items-center justify-between">
                    <div>
                      <p className="text-muted-foreground text-xs">
                        Total deployments
                      </p>
                      <p className="mt-1 font-semibold text-2xl">24</p>
                    </div>
                    <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
                      <HugeiconsIcon icon={Rocket01Icon} className="size-5" />
                    </div>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full w-[78%] rounded-full bg-primary" />
                  </div>
                  <p className="mt-2 text-muted-foreground text-xs">
                    +18.4% this month
                  </p>
                </div>
                {[
                  {
                    name: "upstand-web",
                    status: "Healthy",
                    color: "text-emerald-500",
                  },
                  {
                    name: "worker-api",
                    status: "Deploying",
                    color: "text-amber-500",
                  },
                ].map((service) => (
                  <div
                    key={service.name}
                    className="rounded-2xl border bg-card p-4"
                  >
                    <div className="flex items-center justify-between">
                      <HugeiconsIcon
                        icon={ServerStackIcon}
                        className="size-4 text-muted-foreground"
                      />
                      <span className={cn("text-[10px]", service.color)}>
                        ● {service.status}
                      </span>
                    </div>
                    <p className="mt-6 font-medium text-sm">{service.name}</p>
                    <p className="mt-1 text-muted-foreground text-xs">
                      Docker · main
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="mt-24 border-t pt-14 md:mt-32 md:pt-20">
          <div className="mb-10 flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <p className="font-mono text-primary text-xs uppercase tracking-[0.2em]">
                Everything in one place
              </p>
              <h2 className="mt-3 max-w-xl text-balance font-semibold text-3xl tracking-tight md:text-4xl">
                Infrastructure that stays out of your way.
              </h2>
            </div>
            <p className="max-w-sm text-muted-foreground text-sm leading-6">
              The essentials for small teams and independent builders, with the
              control and transparency of self-hosting.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {FEATURES.map((feature) => (
              <Card
                key={feature.title}
                className="border-border/70 bg-card/60 shadow-none"
              >
                <CardHeader>
                  <div className="mb-5 flex items-center justify-between">
                    <div className="flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <HugeiconsIcon icon={feature.icon} className="size-5" />
                    </div>
                    <span className="font-mono text-muted-foreground text-xs">
                      {feature.eyebrow}
                    </span>
                  </div>
                  <CardTitle className="text-xl">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="leading-6">
                    {feature.description}
                  </CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="mt-20 flex flex-col items-start justify-between gap-6 rounded-3xl border border-primary/20 bg-primary/[0.06] p-7 md:flex-row md:items-center md:p-10">
          <div>
            <div className="flex items-center gap-2 text-primary">
              <HugeiconsIcon icon={CodeIcon} className="size-4" />
              <span className="font-mono text-xs uppercase tracking-[0.15em]">
                Built in the open
              </span>
            </div>
            <h2 className="mt-3 font-semibold text-2xl tracking-tight">
              Bring your infrastructure home.
            </h2>
            <p className="mt-2 max-w-xl text-muted-foreground text-sm">
              Read the docs, connect a server, and deploy your first project in
              minutes.
            </p>
          </div>
          <Button
            size="lg"
            variant="outline"
            render={<a href="/docs" />}
            nativeButton={false}
          >
            Read the docs
          </Button>
        </section>
        <footer className="mt-16 flex flex-col gap-3 border-t pt-6 text-muted-foreground text-xs sm:flex-row sm:items-center sm:justify-between">
          <span>Upstand · Open-source infrastructure for teams that ship.</span>
          <div className="flex gap-4">
            <a className="hover:text-foreground" href="/docs">
              Docs
            </a>
            <a
              className="hover:text-foreground"
              href="https://github.com/upstand-dev/upstand"
              target="_blank"
              rel="noreferrer"
            >
              GitHub
            </a>
          </div>
        </footer>
      </div>
    </div>
  );
}
