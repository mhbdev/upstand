"use client";

import {
  useCancelInvitation,
  useChangePassword,
  useInviteMember,
  useListOrganizationInvitations,
  useListOrganizationMembers,
  useListSessions,
  useRevokeSession,
  useUpdateUser,
} from "@better-auth-ui/react";
import {
  InformationCircleIcon,
  Menu01Icon,
  MoreHorizontalCircle01Icon,
  Settings01Icon,
  Shield01Icon,
  UserIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@upstand/ui/components/avatar";
import { Badge } from "@upstand/ui/components/badge";
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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@upstand/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@upstand/ui/components/dialog";
import { Field, FieldLabel } from "@upstand/ui/components/field";
import { Input } from "@upstand/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@upstand/ui/components/select";
import { Separator } from "@upstand/ui/components/separator";
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
import { Spinner } from "@upstand/ui/components/spinner";
import { useMutation, useQuery } from "@tanstack/react-query";
import { cn } from "@upstand/ui/lib/utils";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/utils/trpc";
import { authClient } from "@/lib/auth-client";

/* ─────────────────────────────────────────────────────────────
   Root Dialog
   ───────────────────────────────────────────────────────────── */

export function SettingsDialog() {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("profile");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const { data: activeOrg } = authClient.useActiveOrganization();

  useEffect(() => {
    const handleOpen = (e: Event) => {
      const customEvent = e as CustomEvent<{ page?: string }>;
      if (customEvent.detail?.page) setActiveTab(customEvent.detail.page);
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
    { name: "app", label: "About", icon: MoreHorizontalCircle01Icon },
  ];

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          className="h-dvh max-h-dvh w-screen max-w-none overflow-hidden rounded-none border-0 p-0 md:h-[min(90dvh,620px)] md:max-h-none md:w-[min(90vw,860px)] md:max-w-none md:md:border"
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

/* ─────────────────────────────────────────────────────────────
   1. Profile Panel
   ───────────────────────────────────────────────────────────── */

function ProfilePanel() {
  const { data: session } = authClient.useSession();
  const [name, setName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const { mutate: updateUser, isPending: updating } = useUpdateUser(
    authClient,
    {
      onSuccess: () => toast.success("Profile updated"),
      onError: (err) => toast.error(err.message || "Failed to update profile"),
    },
  );

  const { mutate: changePassword, isPending: changingPassword } =
    useChangePassword(authClient, {
      onSuccess: () => {
        toast.success("Password updated");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      },
      onError: (err) => toast.error(err.message || "Failed to update password"),
    });

  useEffect(() => {
    if (session?.user?.name) setName(session.user.name);
  }, [session]);

  if (!session)
    return (
      <p className="text-muted-foreground text-sm">Please sign in first.</p>
    );

  const initials = session.user.name?.slice(0, 2).toUpperCase() || "US";

  const handleUpdateProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) updateUser({ name: name.trim() });
  };

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword) return;
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match");
      return;
    }
    changePassword({
      currentPassword,
      newPassword,
      revokeOtherSessions: true,
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Identity */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Account Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUpdateProfile} className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <Avatar className="size-10">
                <AvatarImage src={session.user.image || undefined} />
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              <div className="grid text-sm">
                <span className="font-medium">{session.user.name}</span>
                <span className="text-muted-foreground text-xs">
                  {session.user.email}
                </span>
              </div>
            </div>

            <Field>
              <FieldLabel htmlFor="profile-name">Display Name</FieldLabel>
              <Input
                id="profile-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
              />
            </Field>

            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={updating}>
                {updating && <Spinner data-icon="inline-start" />}
                Save Changes
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Change Password */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Change Password</CardTitle>
          <CardDescription>
            Only applicable if you signed up with email & password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="flex flex-col gap-4">
            <Field>
              <FieldLabel htmlFor="curr-pass">Current Password</FieldLabel>
              <Input
                id="curr-pass"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="••••••••"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="new-pass">New Password</FieldLabel>
              <Input
                id="new-pass"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min. 8 characters"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="conf-pass">Confirm Password</FieldLabel>
              <Input
                id="conf-pass"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat new password"
              />
            </Field>

            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={changingPassword}>
                {changingPassword && <Spinner data-icon="inline-start" />}
                Update Password
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   2. Sessions Panel
   ───────────────────────────────────────────────────────────── */

function parseUA(ua: string): string {
  if (!ua) return "Unknown Browser";
  let browser = "Unknown";
  if (ua.includes("Firefox/")) browser = "Firefox";
  else if (
    ua.includes("Chrome/") &&
    !ua.includes("Chromium/") &&
    !ua.includes("Edg/")
  )
    browser = "Chrome";
  else if (ua.includes("Safari/") && !ua.includes("Chrome/"))
    browser = "Safari";
  else if (ua.includes("Edg/")) browser = "Edge";
  else if (ua.includes("OPR/") || ua.includes("Opera/")) browser = "Opera";

  let os = "Unknown OS";
  if (ua.includes("Windows NT 10.0")) os = "Windows 10/11";
  else if (ua.includes("Macintosh; Intel Mac OS X")) os = "macOS";
  else if (ua.includes("Android")) os = "Android";
  else if (ua.includes("iPhone OS") || ua.includes("iPad; CPU OS")) os = "iOS";
  else if (ua.includes("Linux")) os = "Linux";

  return `${browser} on ${os}`;
}

function SessionsPanel() {
  const { data: sessions, refetch } = useListSessions(authClient);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const { mutate: revokeSession } = useRevokeSession(authClient, {
    onSuccess: () => {
      toast.success("Session revoked");
      refetch();
    },
    onError: (err) => toast.error(err.message || "Failed to revoke session"),
    onSettled: () => setRevokingId(null),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Active Sessions</CardTitle>
        <CardDescription>
          Devices currently signed in to your account.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!sessions || sessions.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No active sessions found.
          </p>
        ) : (
          <div className="flex flex-col divide-y">
            {/* biome-ignore lint/suspicious/noExplicitAny: sessions typed as any from better-auth-ui */}
            {sessions.map((s: any) => {
              const ip =
                !s.ipAddress ||
                ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(s.ipAddress)
                  ? "Localhost"
                  : s.ipAddress;
              return (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                >
                  <div className="grid min-w-0 flex-1 gap-0.5 text-sm">
                    <span className="truncate font-medium">
                      {parseUA(s.userAgent)}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {ip} · Last active{" "}
                      {new Date(s.updatedAt).toLocaleString()}
                    </span>
                  </div>
                  {s.active ? (
                    <Badge variant="outline">Current</Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={revokingId === s.id}
                      onClick={() => {
                        setRevokingId(s.id);
                        revokeSession({ token: s.token || s.id });
                      }}
                    >
                      {revokingId === s.id ? (
                        <Spinner data-icon="inline-start" />
                      ) : null}
                      Revoke
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ─────────────────────────────────────────────────────────────
   3. Members Panel
   ───────────────────────────────────────────────────────────── */

function MembersPanel() {
  const { data: activeOrg } = authClient.useActiveOrganization();
  const { data: members } = useListOrganizationMembers(authClient, {
    query: { organizationId: activeOrg?.id ?? "" },
  });
  const { data: invites, refetch: refetchInvites } =
    useListOrganizationInvitations(authClient, {
      query: { organizationId: activeOrg?.id ?? "" },
    });

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [cancelingId, setCancelingId] = useState<string | null>(null);

  const { mutate: inviteMember, isPending: inviting } = useInviteMember(
    authClient,
    {
      onSuccess: () => {
        toast.success("Invitation sent");
        setInviteEmail("");
        refetchInvites();
      },
      onError: (err) => toast.error(err.message || "Failed to invite"),
    },
  );

  const { mutate: cancelInvitation } = useCancelInvitation(authClient, {
    onSuccess: () => {
      toast.success("Invitation cancelled");
      refetchInvites();
    },
    onError: (err) => toast.error(err.message || "Failed to cancel"),
    onSettled: () => setCancelingId(null),
  });

  if (!activeOrg)
    return (
      <p className="text-muted-foreground text-sm">
        Select a workspace to manage members.
      </p>
    );

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    // biome-ignore lint/suspicious/noExplicitAny: role typed strictly by better-auth-ui
    inviteMember({
      email: inviteEmail.trim(),
      role: inviteRole as any,
      organizationId: activeOrg.id,
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Invite */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Invite Member</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handleInvite}
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
          >
            <Field className="flex-1">
              <FieldLabel htmlFor="invite-email">Email address</FieldLabel>
              <Input
                id="invite-email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@company.com"
                autoComplete="off"
              />
            </Field>

            <div className="w-full sm:w-32">
              <Select
                items={[
                  { value: "member", label: "Member" },
                  { value: "admin", label: "Admin" },
                ]}
                value={inviteRole}
                onValueChange={(val) => setInviteRole(String(val) || "member")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button type="submit" disabled={inviting} className="shrink-0">
              {inviting && <Spinner data-icon="inline-start" />}
              Invite
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Members list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Team Roster</CardTitle>
        </CardHeader>
        <CardContent>
          {!members?.members?.length ? (
            <p className="text-muted-foreground text-sm">No members found.</p>
          ) : (
            <div className="flex flex-col divide-y">
              {members.members.map((m: (typeof members.members)[number]) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                >
                  <div className="grid text-sm">
                    <span className="font-medium">
                      {m.user.name || m.user.email}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {m.user.email}
                    </span>
                  </div>
                  <Badge variant="outline" className="capitalize">
                    {m.role}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pending invites */}
      {!!invites?.length && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Pending Invitations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col divide-y">
              {invites.map((inv: (typeof invites)[number]) => (
                <div
                  key={inv.id}
                  className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                >
                  <div className="grid text-sm">
                    <span className="font-medium">{inv.email}</span>
                    <span className="text-muted-foreground text-xs">
                      Sent {new Date(inv.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={cancelingId === inv.id}
                    onClick={() => {
                      setCancelingId(inv.id);
                      cancelInvitation({ invitationId: inv.id });
                    }}
                  >
                    {cancelingId === inv.id && (
                      <Spinner data-icon="inline-start" />
                    )}
                    Cancel
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   4. Organization Panel
   ───────────────────────────────────────────────────────────── */

function OrganizationPanel() {
  const { data: activeOrg } = authClient.useActiveOrganization();
  const [name, setName] = useState("");
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (activeOrg?.name) setName(activeOrg.name);
  }, [activeOrg]);

  if (!activeOrg)
    return (
      <p className="text-muted-foreground text-sm">
        Select an organization first.
      </p>
    );

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setUpdating(true);
    try {
      await authClient.organization.update({
        organizationId: activeOrg.id,
        data: { name: name.trim() },
      });
      toast.success("Organization updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setUpdating(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Workspace Settings</CardTitle>
        <CardDescription>
          Slug: <code className="font-mono text-xs">/{activeOrg.slug}</code>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleUpdate} className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor="org-name-settings">
              Organization Name
            </FieldLabel>
            <Input
              id="org-name-settings"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Acme Inc."
            />
          </Field>

          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={updating}>
              {updating && <Spinner data-icon="inline-start" />}
              Save Changes
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

/* ─────────────────────────────────────────────────────────────
   5. Security & 2FA Panel
   ───────────────────────────────────────────────────────────── */

function SecurityPanel() {
  const { data: session } = authClient.useSession();
  const [loading, setLoading] = useState(false);
  const [totpURI, setTotpURI] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [verifyCode, setVerifyCode] = useState("");
  const [showBackupCodes, setShowBackupCodes] = useState(false);

  if (!session)
    return (
      <p className="text-muted-foreground text-sm">Please sign in first.</p>
    );

  const extractSecret = (uri: string | null) => {
    if (!uri) return "";
    try {
      return new URL(uri).searchParams.get("secret") || "";
    } catch {
      return "";
    }
  };

  const handleEnable = async () => {
    setLoading(true);
    try {
      const { data, error } = await authClient.twoFactor.enable({});
      if (error) toast.error(error.message || "Failed to start 2FA setup");
      else if (data) {
        setTotpURI(data.totpURI);
        setBackupCodes(data.backupCodes);
      }
    } catch {
      toast.error("An error occurred.");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyCode.trim()) return;
    setLoading(true);
    try {
      const { error } = await authClient.twoFactor.verifyTotp({
        code: verifyCode.trim(),
      });
      if (error) toast.error(error.message || "Invalid code");
      else {
        toast.success("2FA enabled successfully!");
        setTotpURI(null);
        setVerifyCode("");
        setShowBackupCodes(true);
      }
    } catch {
      toast.error("Failed to verify code.");
    } finally {
      setLoading(false);
    }
  };

  const handleDisable = async () => {
    if (!confirm("Are you sure? Disabling 2FA makes your account less secure."))
      return;
    setLoading(true);
    try {
      const { error } = await authClient.twoFactor.disable({});
      if (error) toast.error(error.message || "Failed to disable 2FA");
      else {
        toast.success("2FA disabled.");
        setShowBackupCodes(false);
      }
    } catch {
      toast.error("An error occurred.");
    } finally {
      setLoading(false);
    }
  };

  const secret = extractSecret(totpURI);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm">
                Two-Factor Authentication
              </CardTitle>
              <CardDescription>
                Add an extra verification step for every sign-in.
              </CardDescription>
            </div>
            <Badge
              variant={session.user.twoFactorEnabled ? "default" : "outline"}
            >
              {session.user.twoFactorEnabled ? "Enabled" : "Disabled"}
            </Badge>
          </div>
        </CardHeader>

        <CardContent>
          {session.user.twoFactorEnabled ? (
            <div className="flex flex-col gap-3">
              <p className="text-muted-foreground text-sm">
                Your account is protected. You'll be prompted for a code from
                your authenticator app on each sign-in.
              </p>
              <div className="flex justify-end">
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={loading}
                  onClick={handleDisable}
                >
                  {loading && <Spinner data-icon="inline-start" />}
                  Disable 2FA
                </Button>
              </div>
            </div>
          ) : totpURI ? (
            <form onSubmit={handleConfirm} className="flex flex-col gap-4">
              <p className="text-muted-foreground text-sm">
                1. Scan this QR code in your authenticator app (Google
                Authenticator, Authy, or 1Password):
              </p>
              <div className="flex justify-center">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(totpURI)}`}
                  alt="2FA QR Code"
                  className="rounded-md border bg-white p-2"
                />
              </div>
              {secret && (
                <p className="text-center text-muted-foreground text-xs">
                  Can't scan?{" "}
                  <code className="select-all rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">
                    {secret}
                  </code>
                </p>
              )}
              <Separator />
              <p className="text-muted-foreground text-sm">
                2. Enter the 6-digit code from your app to activate:
              </p>
              <Field>
                <FieldLabel htmlFor="mfa-confirm-code">
                  Verification Code
                </FieldLabel>
                <Input
                  id="mfa-confirm-code"
                  value={verifyCode}
                  onChange={(e) =>
                    setVerifyCode(e.target.value.replace(/\D/g, ""))
                  }
                  placeholder="000000"
                  maxLength={6}
                  className="text-center font-mono tracking-widest"
                  autoFocus
                />
              </Field>
              <div className="flex justify-between">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setTotpURI(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={loading || verifyCode.length !== 6}
                >
                  {loading && <Spinner data-icon="inline-start" />}
                  Verify & Enable
                </Button>
              </div>
            </form>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-muted-foreground text-sm">
                Protect your account with a time-based one-time password from
                your phone.
              </p>
              <div className="flex justify-end">
                <Button size="sm" disabled={loading} onClick={handleEnable}>
                  {loading && <Spinner data-icon="inline-start" />}
                  Set Up Authenticator
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Backup codes */}
      {showBackupCodes && backupCodes.length > 0 && (
        <Card className="border-green-600/20 bg-green-500/5 dark:border-green-500/20">
          <CardHeader>
            <CardTitle className="text-sm">Recovery Codes</CardTitle>
            <CardDescription>
              Save these codes somewhere safe. Each can only be used once.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-1.5 rounded-md border bg-muted/50 p-3 font-mono text-xs">
              {backupCodes.map((code, i) => (
                <span key={i} className="select-all">
                  {i + 1}. {code}
                </span>
              ))}
            </div>
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setShowBackupCodes(false)}>
                I've saved these codes
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   6. App Info Panel
   ───────────────────────────────────────────────────────────── */

function AppInfoPanel() {
  const { data, isFetching, refetch } = useQuery({
    ...trpc.webServer.getUpdateData.queryOptions(),
  });
  const update = useMutation({
    ...trpc.webServer.triggerUpdate.mutationOptions(),
    onSuccess: () => {
      toast.success("Update started; services will roll forward safely.");
      void refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const handleCheck = async () => {
    const result = await refetch();
    if (result.data?.updateAvailable) {
      toast.info(`Upstand ${result.data.latestVersion} is available.`);
    } else if (result.data?.channel === "source") {
      toast.info(
        "This source installation is updated by rerunning the installer.",
      );
    } else {
      toast.success(
        `Upstand is up to date (${result.data?.currentVersion ?? "unknown"}).`,
      );
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Upstand Platform</CardTitle>
        <CardDescription>System and version information.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col divide-y text-sm">
          {[
            { label: "Version", value: data?.currentVersion ?? "Loading…" },
            { label: "Channel", value: data?.channel ?? "unknown" },
            { label: "Database", value: "Connected" },
          ].map(({ label, value }) => (
            <div
              key={label}
              className="flex items-center justify-between py-2 first:pt-0 last:pb-0"
            >
              <span className="text-muted-foreground">{label}</span>
              <span className="font-medium font-mono text-xs">{value}</span>
            </div>
          ))}
        </div>
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="outline"
            disabled={isFetching}
            onClick={handleCheck}
          >
            {isFetching && <Spinner data-icon="inline-start" />}
            Check for Updates
          </Button>
          {data?.updateAvailable && data.canUpdate ? (
            <Button
              size="sm"
              disabled={update.isPending}
              onClick={() => update.mutate({ version: data.latestVersion })}
            >
              {update.isPending
                ? "Updating…"
                : `Update to ${data.latestVersion}`}
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
