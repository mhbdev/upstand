import {
  CancelCircleIcon,
  CheckmarkCircle02Icon,
  CodeIcon,
  Folder01Icon,
  InformationCircleIcon,
  LockPasswordIcon,
  MinusSignCircleIcon,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@upstand/ui/components/table";
import Link from "next/link";
import { Fragment } from "react";
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

type ComparisonStatus = "yes" | "partial" | "no" | "text";

type ComparisonCell = {
  label: string;
  note?: string;
  status: ComparisonStatus;
};

type ComparisonRow = {
  detail: string;
  feature: string;
  coolify: ComparisonCell;
  dokploy: ComparisonCell;
  upstand: ComparisonCell;
};

type ComparisonGroup = {
  label: string;
  rows: ComparisonRow[];
};

const COMPARISON_GROUPS: ComparisonGroup[] = [
  {
    label: "Core delivery",
    rows: [
      {
        feature: "Self-hosted control plane",
        detail: "Run the dashboard on infrastructure you own",
        upstand: { status: "yes", label: "Yes", note: "Linux + Docker Swarm" },
        dokploy: { status: "yes", label: "Yes", note: "VPS or hardware" },
        coolify: {
          status: "yes",
          label: "Yes",
          note: "VPS, bare metal, or Pi",
        },
      },
      {
        feature: "One-command installation",
        detail: "A maintained install path for a fresh server",
        upstand: { status: "yes", label: "curl | bash", note: "install.sh" },
        dokploy: { status: "yes", label: "curl | bash", note: "install.sh" },
        coolify: { status: "yes", label: "curl | bash", note: "install.sh" },
      },
      {
        feature: "Application deployment",
        detail: "Deploy and operate application resources",
        upstand: {
          status: "yes",
          label: "Included",
          note: "Queued Docker builds",
        },
        dokploy: { status: "yes", label: "Included", note: "Apps + services" },
        coolify: { status: "yes", label: "Included", note: "Apps + services" },
      },
      {
        feature: "Database deployment",
        detail: "Provision databases as managed resources",
        upstand: {
          status: "yes",
          label: "6 engines",
          note: "Postgres, MySQL, MariaDB, MongoDB, libSQL, Redis",
        },
        dokploy: {
          status: "yes",
          label: "6 engines",
          note: "Postgres, MySQL, MongoDB, MariaDB, libSQL, Redis",
        },
        coolify: {
          status: "yes",
          label: "Included",
          note: "Databases + services",
        },
      },
      {
        feature: "Docker Compose applications",
        detail: "Deploy multi-container applications from Compose",
        upstand: {
          status: "yes",
          label: "Compose + Stack",
          note: "Docker Compose and Swarm stacks",
        },
        dokploy: { status: "yes", label: "Native", note: "Compose support" },
        coolify: { status: "yes", label: "Native", note: "Docker Compose" },
      },
      {
        feature: "Custom Docker images",
        detail: "Deploy an image you already built",
        upstand: {
          status: "yes",
          label: "Included",
          note: "Registry-backed resources",
        },
        dokploy: { status: "yes", label: "Included", note: "Custom images" },
        coolify: {
          status: "yes",
          label: "Included",
          note: "Docker image resources",
        },
      },
      {
        feature: "Git-backed deployments",
        detail: "Build and deploy from a repository or webhook",
        upstand: {
          status: "yes",
          label: "Included",
          note: "Git providers + webhooks",
        },
        dokploy: { status: "yes", label: "Included", note: "Git + webhooks" },
        coolify: { status: "yes", label: "Included", note: "Git + webhooks" },
      },
      {
        feature: "Automatic HTTPS and routing",
        detail: "Put deployed resources behind a managed proxy",
        upstand: {
          status: "yes",
          label: "Caddy",
          note: "Managed certificates + routing",
        },
        dokploy: {
          status: "yes",
          label: "Traefik",
          note: "Routing + load balancing",
        },
        coolify: { status: "yes", label: "Traefik", note: "Managed proxy" },
      },
    ],
  },
  {
    label: "Scale & safety",
    rows: [
      {
        feature: "Multi-server deployments",
        detail: "Place workloads on more than one server",
        upstand: {
          status: "yes",
          label: "Included",
          note: "Remote Docker servers",
        },
        dokploy: { status: "yes", label: "Included", note: "Multi-server" },
        coolify: {
          status: "yes",
          label: "Included",
          note: "Multiple destinations",
        },
      },
      {
        feature: "Docker Swarm clustering",
        detail: "Use Swarm for scheduling and multi-node workloads",
        upstand: {
          status: "yes",
          label: "Core runtime",
          note: "Required by production install",
        },
        dokploy: { status: "yes", label: "Included", note: "Multi-node Swarm" },
        coolify: {
          status: "partial",
          label: "Limited",
          note: "Swarm destination support",
        },
      },
      {
        feature: "Deployment rollbacks",
        detail: "Return a resource to a previous deployment",
        upstand: {
          status: "yes",
          label: "Included",
          note: "Rollback use case",
        },
        dokploy: {
          status: "yes",
          label: "Included",
          note: "Rollback service + API",
        },
        coolify: {
          status: "yes",
          label: "Included",
          note: "Application rollback",
        },
      },
      {
        feature: "Preview deployments",
        detail: "Create isolated review environments from changes",
        upstand: {
          status: "yes",
          label: "Included",
          note: "Preview resources + routing",
        },
        dokploy: {
          status: "yes",
          label: "Included",
          note: "Preview deployments",
        },
        coolify: {
          status: "yes",
          label: "Included",
          note: "PR / preview resources",
        },
      },
      {
        feature: "Scheduled automation",
        detail: "Run recurring maintenance or operational jobs",
        upstand: {
          status: "partial",
          label: "Targeted",
          note: "Backup + Docker cleanup schedulers",
        },
        dokploy: {
          status: "partial",
          label: "Enterprise",
          note: "Cron jobs in enterprise paths",
        },
        coolify: { status: "yes", label: "Included", note: "Scheduled tasks" },
      },
      {
        feature: "Resource monitoring",
        detail: "Inspect CPU, memory, storage, and service health",
        upstand: {
          status: "yes",
          label: "Included",
          note: "Server + resource metrics",
        },
        dokploy: {
          status: "yes",
          label: "Included",
          note: "CPU, memory, disk, network",
        },
        coolify: {
          status: "partial",
          label: "Available",
          note: "Server checks and metrics",
        },
      },
      {
        feature: "Automated alerts",
        detail: "Notify when operational thresholds or jobs fail",
        upstand: {
          status: "yes",
          label: "Included",
          note: "Notification channels + delivery worker",
        },
        dokploy: {
          status: "yes",
          label: "Included",
          note: "Threshold + deployment alerts",
        },
        coolify: {
          status: "yes",
          label: "Included",
          note: "Server + deployment notifications",
        },
      },
      {
        feature: "Database backups",
        detail: "Schedule, store, and restore database backups",
        upstand: {
          status: "yes",
          label: "Included",
          note: "Scheduled backup runs",
        },
        dokploy: {
          status: "yes",
          label: "Included",
          note: "Scheduled database backups",
        },
        coolify: {
          status: "yes",
          label: "Included",
          note: "Scheduled database backups",
        },
      },
      {
        feature: "Arbitrary volume backups",
        detail: "Protect application volumes, not only database dumps",
        upstand: {
          status: "yes",
          label: "Included",
          note: "Volume selection + restore",
        },
        dokploy: {
          status: "yes",
          label: "Included",
          note: "Volume backup service",
        },
        coolify: {
          status: "partial",
          label: "Storage-backed",
          note: "Storage destinations, not a full parity claim",
        },
      },
      {
        feature: "S3-compatible destinations",
        detail: "Send backups to external object storage",
        upstand: {
          status: "yes",
          label: "Included",
          note: "S3 destinations via rclone",
        },
        dokploy: {
          status: "yes",
          label: "Included",
          note: "External backup storage",
        },
        coolify: {
          status: "yes",
          label: "Included",
          note: "S3 storage destinations",
        },
      },
    ],
  },
  {
    label: "Automation & integrations",
    rows: [
      {
        feature: "Public API",
        detail: "Automate the control plane from external systems",
        upstand: {
          status: "yes",
          label: "tRPC + Hono",
          note: "Typed API surface",
        },
        dokploy: {
          status: "yes",
          label: "REST / API",
          note: "API app + OpenAPI",
        },
        coolify: {
          status: "yes",
          label: "REST / API",
          note: "OpenAPI + API controllers",
        },
      },
      {
        feature: "First-party CLI",
        detail: "Operate the platform from a dedicated CLI",
        upstand: {
          status: "no",
          label: "Not in repo",
          note: "API and dashboard are the current surfaces",
        },
        dokploy: {
          status: "yes",
          label: "Included",
          note: "CLI auth + API tooling",
        },
        coolify: {
          status: "no",
          label: "Not found",
          note: "No dedicated platform CLI in checked tree",
        },
      },
      {
        feature: "Git providers",
        detail: "Connect repositories from supported hosts",
        upstand: {
          status: "yes",
          label: "4 providers",
          note: "GitHub, GitLab, Bitbucket, Gitea",
        },
        dokploy: {
          status: "yes",
          label: "4+ providers",
          note: "GitHub, GitLab, Bitbucket, Gitea, generic Git",
        },
        coolify: {
          status: "yes",
          label: "4 providers",
          note: "GitHub, GitLab, Bitbucket, Gitea",
        },
      },
      {
        feature: "Notification destinations",
        detail: "Send deployment and operational events out of band",
        upstand: {
          status: "yes",
          label: "Channels",
          note: "Provider adapters + retries",
        },
        dokploy: {
          status: "yes",
          label: "9+ destinations",
          note: "Slack, Telegram, Discord, email, and more",
        },
        coolify: {
          status: "yes",
          label: "Channels",
          note: "Slack, Discord, Telegram, email, and more",
        },
      },
      {
        feature: "One-click templates",
        detail: "Start from reusable application or database definitions",
        upstand: {
          status: "partial",
          label: "Starter set",
          note: "Curated Compose templates",
        },
        dokploy: {
          status: "yes",
          label: "Included",
          note: "Open-source templates",
        },
        coolify: {
          status: "yes",
          label: "280+ services",
          note: "One-click service catalog",
        },
      },
      {
        feature: "AI operator",
        detail: "Use an assistant to inspect or change infrastructure",
        upstand: {
          status: "yes",
          label: "UpGal",
          note: "Approval-gated actions",
        },
        dokploy: {
          status: "yes",
          label: "AI surface",
          note: "AI deployment workspace",
        },
        coolify: {
          status: "partial",
          label: "MCP surface",
          note: "MCP tooling, not a like-for-like operator",
        },
      },
    ],
  },
  {
    label: "Access & implementation",
    rows: [
      {
        feature: "Teams and organizations",
        detail: "Separate people, projects, and permissions",
        upstand: {
          status: "yes",
          label: "Organizations",
          note: "Better Auth organization model",
        },
        dokploy: {
          status: "yes",
          label: "Organizations",
          note: "Organization permissions",
        },
        coolify: {
          status: "yes",
          label: "Teams",
          note: "Team-scoped resources",
        },
      },
      {
        feature: "Project and environment grouping",
        detail: "Keep resources organized as deployments grow",
        upstand: {
          status: "yes",
          label: "Included",
          note: "Projects → environments → resources",
        },
        dokploy: {
          status: "yes",
          label: "Included",
          note: "Projects + environments",
        },
        coolify: {
          status: "yes",
          label: "Included",
          note: "Projects + environments",
        },
      },
      {
        feature: "Two-factor authentication",
        detail: "Protect dashboard access with a second factor",
        upstand: {
          status: "yes",
          label: "Included",
          note: "Better Auth two-factor plugin",
        },
        dokploy: {
          status: "yes",
          label: "Included",
          note: "Security settings",
        },
        coolify: {
          status: "yes",
          label: "Included",
          note: "Fortify two-factor flow",
        },
      },
      {
        feature: "Audit logs",
        detail: "Trace important actions and security events",
        upstand: {
          status: "yes",
          label: "Included",
          note: "Audit log use cases + UI",
        },
        dokploy: {
          status: "partial",
          label: "Enterprise",
          note: "Proprietary audit-log path",
        },
        coolify: {
          status: "yes",
          label: "Included",
          note: "Audit log tests + security UI",
        },
      },
      {
        feature: "Frontend stack",
        detail: "The technology behind the primary dashboard",
        upstand: {
          status: "text",
          label: "Next.js + React",
          note: "TypeScript",
        },
        dokploy: {
          status: "text",
          label: "Next.js + React",
          note: "TypeScript",
        },
        coolify: {
          status: "text",
          label: "Livewire + Blade",
          note: "Laravel + Alpine.js",
        },
      },
      {
        feature: "Control-plane runtime",
        detail: "The server-side architecture the project ships",
        upstand: {
          status: "text",
          label: "Bun + Hono",
          note: "tRPC, Drizzle, PostgreSQL, Redis",
        },
        dokploy: {
          status: "text",
          label: "Node + TypeScript",
          note: "Next.js monorepo",
        },
        coolify: {
          status: "text",
          label: "Laravel 11",
          note: "PHP 8.4, PostgreSQL, Redis",
        },
      },
    ],
  },
];

const PLATFORM_COLUMNS = [
  {
    key: "upstand" as const,
    name: "Upstand",
    description: "Your control plane",
    stack: "Bun · TypeScript · Swarm",
    className:
      "after:absolute after:inset-0 after:bg-primary/[0.06] after:pointer-events-none",
  },
  {
    key: "dokploy" as const,
    name: "Dokploy",
    description: "PaaS for multi-node Docker",
    stack: "Next.js · TypeScript",
    className: "",
  },
  {
    key: "coolify" as const,
    name: "Coolify",
    description: "Broad self-hosted catalog",
    stack: "Laravel · Livewire · PHP",
    className: "",
  },
];

const STATUS_ICON_STYLES: Record<ComparisonStatus, string> = {
  yes: "text-primary",
  partial: "text-muted-foreground",
  no: "text-muted-foreground",
  text: "text-muted-foreground",
};

function ComparisonValue({ value }: { value: ComparisonCell }) {
  const Icon =
    value.status === "yes"
      ? CheckmarkCircle02Icon
      : value.status === "partial"
        ? MinusSignCircleIcon
        : value.status === "no"
          ? CancelCircleIcon
          : InformationCircleIcon;

  return (
    <div className="flex min-w-40 flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <HugeiconsIcon
          aria-hidden="true"
          className={cn("size-4 shrink-0", STATUS_ICON_STYLES[value.status])}
          icon={Icon}
        />
        <span className="font-medium text-sm">{value.label}</span>
      </div>
      {value.note ? (
        <span className="text-muted-foreground text-xs leading-5">
          {value.note}
        </span>
      ) : null}
    </div>
  );
}

function ComparisonSection() {
  return (
    <section id="comparison" className="mt-24 border-t pt-14 md:mt-32 md:pt-20">
      <div className="mb-10 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2 font-mono text-primary text-xs uppercase tracking-[0.2em]">
            <HugeiconsIcon
              aria-hidden="true"
              icon={InformationCircleIcon}
              className="size-4"
            />
            <span>Source-aware comparison</span>
          </div>
          <h2 className="mt-3 text-balance font-semibold text-3xl tracking-tight md:text-5xl">
            Compare the control planes.
            <br />
            <span className="text-muted-foreground">Not the slogans.</span>
          </h2>
          <p className="mt-5 max-w-2xl text-muted-foreground leading-7">
            Every row below is grounded in the current Upstand codebase and the
            default branches of Dokploy and Coolify. Partial means the
            capability exists with a narrower scope; not found means it was not
            present in the checked source tree.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 text-xs">
          <Badge variant="outline" className="h-7 gap-1.5 rounded-full px-3">
            <span className="size-1.5 rounded-full bg-primary" />
            Checked Jul 16, 2026
          </Badge>
          <Badge variant="secondary" className="h-7 rounded-full px-3">
            30+ implementation rows
          </Badge>
        </div>
      </div>

      <Card className="overflow-hidden border-border/70 bg-card/70 shadow-primary/[0.04] shadow-xl">
        <CardHeader className="border-b bg-muted/20 py-5">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <CardTitle className="text-lg">
                Feature-by-feature reality check
              </CardTitle>
              <CardDescription className="mt-1">
                Scroll horizontally on small screens. The first column stays in
                view.
              </CardDescription>
            </div>
            <div className="flex items-center gap-4 text-muted-foreground text-xs">
              <span className="flex items-center gap-1.5">
                <HugeiconsIcon
                  icon={CheckmarkCircle02Icon}
                  className="size-4 text-primary"
                />
                Included
              </span>
              <span className="flex items-center gap-1.5">
                <HugeiconsIcon icon={MinusSignCircleIcon} className="size-4" />
                Partial
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table className="min-w-[1040px] table-fixed">
            <caption className="sr-only">
              Comparison of Upstand, Dokploy, and Coolify capabilities based on
              checked source code.
            </caption>
            <TableHeader className="z-20">
              <TableRow className="hover:bg-card">
                <TableHead className="sticky top-16 left-0 z-30 w-[280px] min-w-[280px] border-r bg-card px-5 py-5 align-bottom">
                  <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.16em]">
                    Capability
                  </span>
                </TableHead>
                {PLATFORM_COLUMNS.map((platform) => (
                  <TableHead
                    key={platform.key}
                    className={cn(
                      "relative sticky top-16 z-20 overflow-hidden bg-card px-5 py-5 align-bottom",
                      platform.className,
                    )}
                  >
                    <div className="relative z-10 flex flex-col gap-1">
                      <span className="font-semibold text-base text-foreground">
                        {platform.name}
                      </span>
                      <span className="font-normal text-muted-foreground text-xs">
                        {platform.description}
                      </span>
                      <span className="mt-2 font-mono text-[10px] text-primary uppercase tracking-[0.12em]">
                        {platform.stack}
                      </span>
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {COMPARISON_GROUPS.map((group) => (
                <Fragment key={group.label}>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableCell
                      colSpan={4}
                      className="border-y px-5 py-2.5 font-mono text-[10px] text-primary uppercase tracking-[0.18em]"
                    >
                      {group.label}
                    </TableCell>
                  </TableRow>
                  {group.rows.map((row) => (
                    <TableRow key={row.feature}>
                      <TableCell className="sticky left-0 z-10 whitespace-normal border-r bg-card px-5 py-4 align-top">
                        <div className="flex flex-col gap-1">
                          <span className="font-medium text-sm">
                            {row.feature}
                          </span>
                          <span className="max-w-[220px] text-muted-foreground text-xs leading-5">
                            {row.detail}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-normal px-5 py-4 align-top">
                        <ComparisonValue value={row.upstand} />
                      </TableCell>
                      <TableCell className="whitespace-normal px-5 py-4 align-top">
                        <ComparisonValue value={row.dokploy} />
                      </TableCell>
                      <TableCell className="whitespace-normal px-5 py-4 align-top">
                        <ComparisonValue value={row.coolify} />
                      </TableCell>
                    </TableRow>
                  ))}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </CardContent>
        <div className="flex flex-col gap-3 border-t bg-muted/20 px-5 py-4 text-muted-foreground text-xs leading-5 md:flex-row md:items-center md:justify-between">
          <p>
            Evidence checked in the repositories, not inferred from pricing
            pages. Feature scope can change upstream.
          </p>
          <div className="flex shrink-0 gap-4">
            <a
              className="font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
              href="https://github.com/mhbdev/upstand"
              target="_blank"
              rel="noreferrer"
            >
              Upstand source
            </a>
            <a
              className="font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
              href="https://github.com/dokploy/dokploy"
              target="_blank"
              rel="noreferrer"
            >
              Dokploy source
            </a>
            <a
              className="font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
              href="https://github.com/coollabsio/coolify"
              target="_blank"
              rel="noreferrer"
            >
              Coolify source
            </a>
          </div>
        </div>
      </Card>
    </section>
  );
}

export default function Home() {
  return (
    <div id="top" className="relative overflow-hidden">
      <PageBackdrop />
      <div className="relative z-10 mx-auto w-full max-w-7xl px-6 pt-16 pb-20 md:px-10 md:pt-24 md:pb-28">
        <section className="grid items-center gap-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-20">
          <div className="max-w-2xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/[0.06] px-3 py-1.5 font-mono text-primary text-xs uppercase tracking-[0.14em]">
              <span className="size-1.5 rounded-full bg-primary" />
              Self-hosted by design
            </div>
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
                    href="https://github.com/mhbdev/upstand"
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

        <section
          id="features"
          className="mt-24 scroll-mt-24 border-t pt-14 md:mt-32 md:pt-20"
        >
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

        <ComparisonSection />

        <section
          id="docs"
          className="mt-20 flex scroll-mt-24 flex-col items-start justify-between gap-6 rounded-3xl border border-primary/20 bg-primary/[0.06] p-7 md:flex-row md:items-center md:p-10"
        >
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
              href="https://github.com/mhbdev/upstand"
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
