"use client";

import {
  AnalyticsUpIcon,
  ArrowRight01Icon,
  BookmarkIcon,
  Certificate01Icon,
  CloudIcon,
  CloudServerIcon,
  ContainerIcon,
  FileSecurityIcon,
  Folder01Icon,
  Key01Icon,
  Layers01Icon,
  Notification01Icon,
  Rocket01Icon,
  ServerStack01Icon,
  Shield01Icon,
  SourceCodeIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { getUpGalNavigationTarget } from "@upstand/api/ai/upgal-ui-targets";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@upstand/ui/components/breadcrumb";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@upstand/ui/components/collapsible";
import { Separator } from "@upstand/ui/components/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@upstand/ui/components/sidebar";
import { Spinner } from "@upstand/ui/components/spinner";
import type { Route } from "next";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CreateOrganizationDialog } from "@/components/auth/organization/create-organization-dialog";
import { OrganizationSwitcher } from "@/components/auth/organization/organization-switcher";
import { UserButton } from "@/components/auth/user/user-button";
import { GlobalSearch } from "@/components/global-search";
import { ModeToggle } from "@/components/mode-toggle";
import { ProjectsBreadcrumb } from "@/components/projects-breadcrumb";
import { UpGalChat } from "@/components/upgal-chat";
import { UpGalGuideOverlay } from "@/components/upgal-guide-overlay";
import { UpGalTarget } from "@/components/upgal-target";
import { SettingsDialog } from "@/features/settings";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/utils/trpc";

const NAVIGATION_GROUPS = [
  {
    title: "Workloads",
    items: [
      { title: "Projects", href: "/projects", icon: Folder01Icon },
      { title: "Deployments", href: "/deployments", icon: Rocket01Icon },
      { title: "Templates", href: "/templates", icon: Layers01Icon },
      { title: "Requests", href: "/requests", icon: Rocket01Icon },
    ],
  },
  {
    title: "Infrastructure",
    items: [
      {
        title: "Remote Servers",
        href: "/remote-servers",
        icon: CloudServerIcon,
      },
      { title: "SSH Keys", href: "/ssh-keys", icon: Key01Icon },
      { title: "Docker Swarm", href: "/docker-swarm", icon: Layers01Icon },
      { title: "Docker Inventory", href: "/docker", icon: ContainerIcon },
      {
        title: "Docker Registry",
        href: "/docker-registry",
        icon: ContainerIcon,
      },
      { title: "Web Server", href: "/web-server", icon: ServerStack01Icon },
      { title: "Certificates", href: "/certificates", icon: Certificate01Icon },
    ],
  },
  {
    title: "Integrations",
    items: [
      { title: "Git Providers", href: "/git-providers", icon: SourceCodeIcon },
      { title: "S3 Storage", href: "/s3-destinations", icon: CloudIcon },
      { title: "SCIM", href: "/settings/scim", icon: Key01Icon },
      { title: "Single Sign-On", href: "/settings/sso", icon: Shield01Icon },
    ],
  },
  {
    title: "Management",
    items: [
      { title: "Monitoring", href: "/monitoring", icon: AnalyticsUpIcon },
      {
        title: "Notifications",
        href: "/notifications",
        icon: Notification01Icon,
      },
      { title: "Audit Logs", href: "/audit-logs", icon: FileSecurityIcon },
      { title: "Tags", href: "/tags", icon: BookmarkIcon },
    ],
  },
];

function DashboardSidebarGroup({
  group,
  pathname,
  isCollapsed,
}: {
  group: (typeof NAVIGATION_GROUPS)[number];
  pathname: string;
  isCollapsed: boolean;
}) {
  const content = (
    <SidebarGroupContent className={isCollapsed ? undefined : "mt-1"}>
      <SidebarMenu>
        {group.items.map((item) => (
          <SidebarMenuItem key={item.title}>
            <SidebarMenuButton
              render={(props) => {
                const { children, ...linkProps } = props;
                return (
                  <UpGalTarget
                    definition={getUpGalNavigationTarget(
                      item.href as `/${string}`,
                    )}
                  >
                    <Link {...linkProps} href={item.href as Route}>
                      {children}
                    </Link>
                  </UpGalTarget>
                );
              }}
              isActive={
                pathname === item.href || pathname.startsWith(`${item.href}/`)
              }
              tooltip={item.title}
              className="text-xs"
            >
              <HugeiconsIcon icon={item.icon} className="size-5!" />
              <span>{item.title}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroupContent>
  );

  if (isCollapsed) {
    return <SidebarGroup className="p-0">{content}</SidebarGroup>;
  }

  return (
    <Collapsible defaultOpen className="group">
      <SidebarGroup className="p-0">
        <CollapsibleTrigger className="flex w-full cursor-pointer items-center justify-between px-3 py-1.5 font-bold text-[10px] text-muted-foreground/60 uppercase tracking-wider transition-colors hover:text-foreground">
          <span>{group.title}</span>
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            className="size-3.5 transition-transform duration-200 group-data-open:rotate-90"
          />
        </CollapsibleTrigger>
        <CollapsibleContent>{content}</CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}

function DashboardSidebar({ pathname }: { pathname: string }) {
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  return (
    <Sidebar collapsible="icon">
      <OrganizationSwitcher className="min-h-13.75 w-full border-none p-[11.5px]" />

      <Separator />

      <SidebarContent className="group-data-[collapsible=icon]:overflow-auto! flex flex-col gap-4 px-2 py-2">
        {NAVIGATION_GROUPS.map((group) => (
          <DashboardSidebarGroup
            key={group.title}
            group={group}
            isCollapsed={isCollapsed}
            pathname={pathname}
          />
        ))}
      </SidebarContent>

      <SidebarFooter>
        <UserButton className="w-full" />
      </SidebarFooter>
    </Sidebar>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const {
    data: activeOrg,
    isPending: activeOrgPending,
    refetch: refetchActiveOrg,
  } = authClient.useActiveOrganization();
  const { data: organizations, isPending: organizationsPending } =
    authClient.useListOrganizations();
  const [createOrgOpen, setCreateOrgOpen] = useState(false);

  useEffect(() => {
    const handler = () => setCreateOrgOpen(true);
    window.addEventListener("open-create-org-dialog", handler);
    return () => window.removeEventListener("open-create-org-dialog", handler);
  }, []);

  const { data: mfaData, isPending: mfaPending } = useQuery({
    ...trpc.auth.isSession2faVerified.queryOptions(),
    enabled: !!session,
    // Don't use stale data for security checks
    staleTime: 0,
  });

  useEffect(() => {
    if (sessionPending || organizationsPending || activeOrgPending) return;
    if (session && organizations && organizations.length > 0 && !activeOrg) {
      const personal = organizations.find(
        (o) => o.metadata?.isPersonal || o.name.toLowerCase() === "personal",
      );
      const targetOrg = personal || organizations[0];
      authClient.organization
        .setActive({
          organizationId: targetOrg.id,
        })
        .then(() => {
          void refetchActiveOrg();
        });
    }
  }, [
    session,
    sessionPending,
    organizations,
    organizationsPending,
    activeOrg,
    activeOrgPending,
    refetchActiveOrg,
  ]);

  useEffect(() => {
    if (sessionPending || mfaPending) return;
    if (!session && pathname !== "/2fa-verify") {
      router.push("/login");
      return;
    }
    if (session && mfaData && !mfaData.verified && pathname !== "/2fa-verify") {
      router.push("/2fa-verify");
    }
  }, [session, sessionPending, mfaData, mfaPending, pathname, router]);

  if (sessionPending || (session && mfaPending)) {
    return (
      <div className="flex h-svh items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground text-sm">
          <Spinner />
          <span className="text-sm">Checking authorization…</span>
        </div>
      </div>
    );
  }

  // 2FA challenge page — render without the sidebar shell
  if (pathname === "/2fa-verify") return <>{children}</>;

  const flatNavItems = NAVIGATION_GROUPS.flatMap((group) => group.items);
  const currentNav = flatNavItems.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );

  return (
    <SidebarProvider>
      <div className="flex h-svh w-full overflow-hidden">
        <DashboardSidebar pathname={pathname} />

        <SidebarInset className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <header className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-2 border-b px-3 py-2 sm:flex-nowrap sm:px-4 sm:py-0">
            <div className="flex min-w-0 items-center gap-2">
              <SidebarTrigger />
              <Breadcrumb className="min-w-0">
                <BreadcrumbList>
                  <BreadcrumbItem className="hidden sm:inline-flex">
                    <BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink>
                  </BreadcrumbItem>
                  {activeOrg && (
                    <>
                      <BreadcrumbSeparator />
                      {pathname === "/projects" ||
                      pathname.startsWith("/projects/") ? (
                        <ProjectsBreadcrumb
                          activeOrg={activeOrg}
                          pathname={pathname}
                        />
                      ) : (
                        <BreadcrumbItem>
                          <BreadcrumbPage className="max-w-[min(48vw,16rem)] truncate">
                            {currentNav?.title ?? activeOrg.name}
                          </BreadcrumbPage>
                        </BreadcrumbItem>
                      )}
                    </>
                  )}
                </BreadcrumbList>
              </Breadcrumb>
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
              <GlobalSearch />
              <ModeToggle />
            </div>
          </header>

          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
            {children}
          </div>
        </SidebarInset>
      </div>
      <CreateOrganizationDialog
        open={createOrgOpen}
        onOpenChange={setCreateOrgOpen}
      />
      <SettingsDialog />
      <UpGalChat organizationId={activeOrg?.id} pageTitle={currentNav?.title} />
      <UpGalGuideOverlay />
    </SidebarProvider>
  );
}
