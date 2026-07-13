import { TRPCError } from "@trpc/server";
import { auth } from "@upstand/auth";
import { createDb } from "@upstand/db";
import { member, organization, user } from "@upstand/db/schema/auth";
import { notificationChannel } from "@upstand/db/schema/notification";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { ensureOrganizationAccess } from "../access-control";
import { protectedProcedure, router } from "../index";
import { type PermissionAction, ROLE_PERMISSIONS } from "../permissions";

const permissionActions = Object.keys(ROLE_PERMISSIONS.owner ?? []) as [
  PermissionAction,
  ...PermissionAction[],
];
const permissionsSchema = z.array(z.enum(permissionActions)).max(100);
const baseInput = z.object({ organizationId: z.string().min(1) });

function assertManager(actorRole: string, targetRole?: string) {
  if (actorRole === "owner") return;
  if (actorRole === "admin" && (!targetRole || targetRole === "member")) return;
  throw new TRPCError({
    code: "FORBIDDEN",
    message: "Only workspace owners and admins can manage members",
  });
}

function validatePermissions(role: string, permissions: PermissionAction[]) {
  const allowed = new Set(ROLE_PERMISSIONS[role] || []);
  if (permissions.some((permission) => !allowed.has(permission))) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Permissions exceed the selected ${role} role`,
    });
  }
}

export const memberRouter = router({
  list: protectedProcedure.input(baseInput).query(async ({ ctx, input }) => {
    await ensureOrganizationAccess(ctx.session.user.id, input.organizationId);
    const db = createDb();
    const rows = await db
      .select({ member, user })
      .from(member)
      .innerJoin(user, eq(member.userId, user.id))
      .where(eq(member.organizationId, input.organizationId));
    return {
      members: rows.map(({ member: membership, user: memberUser }) => ({
        ...membership,
        permissions: membership.permissions
          ? (JSON.parse(membership.permissions) as PermissionAction[])
          : null,
        user: memberUser,
      })),
    };
  }),

  create: protectedProcedure
    .input(
      baseInput.extend({
        name: z.string().trim().min(1).max(120),
        email: z.string().email(),
        password: z.string().min(8).max(200),
        role: z.enum(["member", "admin"]),
        permissions: permissionsSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const actor = await ensureOrganizationAccess(
        ctx.session.user.id,
        input.organizationId,
      );
      assertManager(actor.role);
      if (actor.role === "admin" && input.role !== "member") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Admins can only create members",
        });
      }
      validatePermissions(input.role, input.permissions);
      const db = createDb();
      const existing = await db
        .select({ id: member.id })
        .from(member)
        .innerJoin(user, eq(member.userId, user.id))
        .where(
          and(
            eq(member.organizationId, input.organizationId),
            eq(user.email, input.email.toLowerCase()),
          ),
        )
        .limit(1);
      if (existing.length)
        throw new TRPCError({
          code: "CONFLICT",
          message: "This user is already a workspace member",
        });

      const created = await auth.api.createUser({
        body: {
          email: input.email,
          name: input.name,
          password: input.password,
          role: "user",
        },
      });
      await db.insert(member).values({
        id: crypto.randomUUID(),
        organizationId: input.organizationId,
        userId: created.user.id,
        role: input.role,
        permissions: JSON.stringify(input.permissions),
        createdAt: new Date(),
      });
      // Better Auth's user-create hook provisions a personal workspace for a
      // standalone signup. This flow provisions the user into an existing
      // workspace, so remove that empty bootstrap workspace if it was created.
      const personalWorkspaces = await db
        .select({ id: organization.id, metadata: organization.metadata })
        .from(member)
        .innerJoin(organization, eq(member.organizationId, organization.id))
        .where(eq(member.userId, created.user.id));
      for (const workspace of personalWorkspaces) {
        if (workspace.metadata === JSON.stringify({ isPersonal: true })) {
          await db
            .delete(organization)
            .where(eq(organization.id, workspace.id));
        }
      }
      return { user: created.user };
    }),

  invite: protectedProcedure
    .input(
      baseInput.extend({
        email: z.string().email(),
        role: z.enum(["member", "admin"]),
        permissions: permissionsSchema,
        emailChannelId: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const actor = await ensureOrganizationAccess(
        ctx.session.user.id,
        input.organizationId,
      );
      assertManager(actor.role);
      if (actor.role === "admin" && input.role !== "member")
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Admins can only invite members",
        });
      validatePermissions(input.role, input.permissions);
      const db = createDb();
      const channel = await db
        .select({
          id: notificationChannel.id,
          provider: notificationChannel.provider,
          organizationId: notificationChannel.organizationId,
        })
        .from(notificationChannel)
        .where(eq(notificationChannel.id, input.emailChannelId))
        .limit(1)
        .then((rows) => rows[0]);
      if (
        !channel ||
        channel.organizationId !== input.organizationId ||
        !["email", "resend"].includes(channel.provider)
      )
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Choose an Email or Resend notification channel from this workspace",
        });
      return auth.api.createInvitation({
        body: {
          email: input.email,
          role: input.role,
          organizationId: input.organizationId,
          permissions: JSON.stringify(input.permissions),
          emailChannelId: input.emailChannelId,
        },
        headers: ctx.honoContext.req.raw.headers,
      });
    }),

  update: protectedProcedure
    .input(
      baseInput.extend({
        memberId: z.string().min(1),
        role: z.enum(["member", "admin"]),
        permissions: permissionsSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const actor = await ensureOrganizationAccess(
        ctx.session.user.id,
        input.organizationId,
      );
      const db = createDb();
      const target = await db
        .select()
        .from(member)
        .where(
          and(
            eq(member.id, input.memberId),
            eq(member.organizationId, input.organizationId),
          ),
        )
        .limit(1)
        .then((rows) => rows[0]);
      if (!target)
        throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });
      assertManager(actor.role, target.role);
      if (actor.role === "admin" && input.role !== "member")
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Admins can only manage members",
        });
      validatePermissions(input.role, input.permissions);
      await db
        .update(member)
        .set({
          role: input.role,
          permissions: JSON.stringify(input.permissions),
        })
        .where(eq(member.id, input.memberId));
      return { success: true };
    }),

  remove: protectedProcedure
    .input(baseInput.extend({ memberId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const actor = await ensureOrganizationAccess(
        ctx.session.user.id,
        input.organizationId,
      );
      const db = createDb();
      const target = await db
        .select()
        .from(member)
        .where(
          and(
            eq(member.id, input.memberId),
            eq(member.organizationId, input.organizationId),
          ),
        )
        .limit(1)
        .then((rows) => rows[0]);
      if (!target)
        throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });
      assertManager(actor.role, target.role);
      await db.delete(member).where(eq(member.id, input.memberId));
      return { success: true };
    }),
});
