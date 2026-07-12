"use client";

import {
  AnalyticsUpIcon,
  Certificate01Icon,
  CloudIcon,
  CloudServerIcon,
  ContainerIcon,
  Folder01Icon,
  GitBranchIcon,
  Key01Icon,
  Layers01Icon,
  Notification01Icon,
  Rocket01Icon,
  ServerStack01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@upstand/ui/components/breadcrumb";
import { Separator } from "@upstand/ui/components/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@upstand/ui/components/sidebar";
import { Spinner } from "@upstand/ui/components/spinner";
import type { Route } from "next";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CreateOrganizationDialog } from "@/components/auth/organization/create-organization-dialog";
import { OrganizationSwitcher } from "@/components/auth/organization/organization-switcher";
import { UserButton } from "@/components/auth/user/user-button";
import { ModeToggle } from "@/components/mode-toggle";
import { SettingsDialog } from "@/components/settings-dialog";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/utils/trpc";

const NAV_ITEMS = [
  { title: "Projects", href: "/projects", icon: Folder01Icon },
  { title: "Deployments", href: "/deployments", icon: Rocket01Icon },
  { title: "Notifications", href: "/notifications", icon: Notification01Icon },
  { title: "Monitoring", href: "/monitoring", icon: AnalyticsUpIcon },
  { title: "SSH Keys", href: "/ssh-keys", icon: Key01Icon },
  { title: "Git Providers", href: "/git-providers", icon: GitBranchIcon },
  { title: "S3 Storage", href: "/s3-destinations", icon: CloudIcon },
  { title: "Docker Registry", href: "/docker-registry", icon: ContainerIcon },
  { title: "Remote Servers", href: "/remote-servers", icon: CloudServerIcon },
  { title: "Web Server", href: "/web-server", icon: Certificate01Icon },
  { title: "Docker Swarm", href: "/docker-swarm", icon: Layers01Icon },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const { data: activeOrg, isPending: activeOrgPending } =
    authClient.useActiveOrganization();
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
      authClient.organization.setActive({
        organizationId: targetOrg.id,
      });
    }
  }, [
    session,
    sessionPending,
    organizations,
    organizationsPending,
    activeOrg,
    activeOrgPending,
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
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Spinner />
          <span className="text-sm">Checking authorization…</span>
        </div>
      </div>
    );
  }

  // 2FA challenge page — render without the sidebar shell
  if (pathname === "/2fa-verify") return <>{children}</>;

  const currentNav = NAV_ITEMS.find(
    (item) => pathname === item.href || pathname.startsWith(item.href + "/"),
  );

  return (
    <SidebarProvider>
      <div className="flex h-svh w-full overflow-hidden">
        <Sidebar collapsible="icon">
          <OrganizationSwitcher className="min-h-[55px] w-full border-none p-[11.5px]" />

          <Separator />

          <SidebarContent className="px-2 py-2">
            <SidebarMenu>
              {NAV_ITEMS.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    render={<Link href={item.href as Route} />}
                    isActive={
                      pathname === item.href ||
                      pathname.startsWith(item.href + "/")
                    }
                    tooltip={item.title}
                  >
                    <HugeiconsIcon icon={item.icon} />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter>
            <UserButton className="w-full" />
          </SidebarFooter>
        </Sidebar>

        <SidebarInset className="flex flex-1 flex-col overflow-hidden">
          <header className="flex h-14 shrink-0 items-center justify-between border-b px-4">
            <div className="flex items-center gap-2">
              <SidebarTrigger />
              <Separator orientation="vertical" className="my-auto h-6" />
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink>
                  </BreadcrumbItem>
                  {activeOrg && (
                    <>
                      <BreadcrumbSeparator />
                      <BreadcrumbItem>
                        <BreadcrumbPage>
                          {currentNav?.title ?? activeOrg.name}
                        </BreadcrumbPage>
                      </BreadcrumbItem>
                    </>
                  )}
                </BreadcrumbList>
              </Breadcrumb>
            </div>
            <ModeToggle />
          </header>

          <div className="flex-1 overflow-y-auto">{children}</div>
        </SidebarInset>
      </div>
      <CreateOrganizationDialog
        open={createOrgOpen}
        onOpenChange={setCreateOrgOpen}
      />
      <SettingsDialog />
    </SidebarProvider>
  );
}
