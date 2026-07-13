"use client";

import {
  AiBrain01Icon,
  InformationCircleIcon,
  Menu01Icon,
  MoreHorizontalCircle01Icon,
  Settings01Icon,
  Shield01Icon,
  UserIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@upstand/ui/components/breadcrumb";
import { Button } from "@upstand/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@upstand/ui/components/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@upstand/ui/components/sheet";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@upstand/ui/components/sidebar";
import { cn } from "@upstand/ui/lib/utils";
import { useEffect, useState } from "react";
import { UpGalSettingsPanel } from "@/app/(dashboard)/settings/ai/page";
import { authClient } from "@/lib/auth-client";
import { AppInfoPanel } from "./components/app-info-panel";
import { MembersPanel } from "./components/members-panel";
import { OrganizationPanel } from "./components/organization-panel";
import { ProfilePanel } from "./components/profile-panel";
import { SecurityPanel } from "./components/security-panel";
import { SessionsPanel } from "./components/sessions-panel";

export function SettingsDialog() {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("profile");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const { data: activeOrg } = authClient.useActiveOrganization();

  useEffect(() => {
    const handleOpen = (e: Event) => {
      const customEvent = e as CustomEvent<{ page?: string }>;
      if (customEvent.detail?.page) {
        setActiveTab(customEvent.detail.page);
      }
      setOpen(true);
    };
    window.addEventListener("open-settings-dialog", handleOpen);
    return () => window.removeEventListener("open-settings-dialog", handleOpen);
  }, []);

  const navItems = [
    { name: "profile", label: "Profile", icon: UserIcon },
    { name: "sessions", label: "Sessions", icon: InformationCircleIcon },
    ...(activeOrg
      ? [
          { name: "members", label: "Members", icon: UserIcon },
          {
            name: "organization",
            label: "Workspace",
            icon: Settings01Icon,
          },
        ]
      : []),
    { name: "security", label: "Security & 2FA", icon: Shield01Icon },
    { name: "upgal", label: "UpGal Settings", icon: AiBrain01Icon },
    { name: "app", label: "About", icon: MoreHorizontalCircle01Icon },
  ];

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          className="h-dvh max-h-dvh w-screen max-w-none overflow-hidden rounded-none border-0 p-0 md:h-[min(90dvh,620px)] md:max-h-none md:w-[min(90vw,860px)] md:max-w-none md:border"
        >
          <DialogTitle className="sr-only">Settings</DialogTitle>
          <DialogDescription className="sr-only">
            Manage your profile, sessions, workspace, and security settings.
          </DialogDescription>

          <SidebarProvider
            className="h-full items-start overflow-hidden"
            style={{ minHeight: 0 }}
          >
            {/* Desktop sidebar nav */}
            <Sidebar
              collapsible="none"
              className="hidden w-48 shrink-0 border-r md:flex"
            >
              <SidebarContent className="py-2">
                <SidebarGroup>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {navItems.map((item) => (
                        <SidebarMenuItem key={item.name}>
                          <SidebarMenuButton
                            render={
                              <button
                                type="button"
                                onClick={() => setActiveTab(item.name)}
                              />
                            }
                            isActive={activeTab === item.name}
                          >
                            <HugeiconsIcon icon={item.icon} />
                            <span>{item.label}</span>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      ))}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              </SidebarContent>
            </Sidebar>

            {/* Main content area */}
            <main className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
              <header className="flex h-12 shrink-0 items-center border-b px-4">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="md:hidden"
                  onClick={() => setMobileMenuOpen(true)}
                >
                  <HugeiconsIcon icon={Menu01Icon} />
                </Button>

                <Breadcrumb>
                  <BreadcrumbList>
                    <BreadcrumbItem>
                      <BreadcrumbLink
                        href="#"
                        className="text-muted-foreground"
                      >
                        Settings
                      </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      <BreadcrumbPage>
                        {navItems.find((n) => n.name === activeTab)?.label ??
                          activeTab}
                      </BreadcrumbPage>
                    </BreadcrumbItem>
                  </BreadcrumbList>
                </Breadcrumb>
              </header>

              <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
                {activeTab === "profile" && <ProfilePanel />}
                {activeTab === "sessions" && <SessionsPanel />}
                {activeTab === "members" && <MembersPanel />}
                {activeTab === "organization" && <OrganizationPanel />}
                {activeTab === "security" && <SecurityPanel />}
                {activeTab === "upgal" && <UpGalSettingsPanel embedded />}
                {activeTab === "app" && <AppInfoPanel />}
              </div>
            </main>
          </SidebarProvider>
        </DialogContent>
      </Dialog>

      {/* Mobile sheet nav */}
      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent side="left" className="w-72 p-0">
          <SheetHeader className="border-b px-4 py-4">
            <SheetTitle>Settings</SheetTitle>
            <SheetDescription>Choose a section to manage.</SheetDescription>
          </SheetHeader>
          <nav className="p-2">
            {navItems.map((item) => (
              <button
                key={item.name}
                type="button"
                onClick={() => {
                  setActiveTab(item.name);
                  setMobileMenuOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                  activeTab === item.name
                    ? "bg-accent font-medium text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                )}
              >
                <HugeiconsIcon icon={item.icon} className="size-4 shrink-0" />
                {item.label}
              </button>
            ))}
          </nav>
        </SheetContent>
      </Sheet>
    </>
  );
}
