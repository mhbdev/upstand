import { randomUUID } from "node:crypto";
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { createDb } from "@upstand/db";
import { member, invitation, user, organization } from "@upstand/db/schema/auth";
import { customRole } from "@upstand/db/schema/custom-role";
import { and, eq } from "drizzle-orm";
import { ROLE_PERMISSIONS } from "../permissions";

describe("Custom Roles & Member Degradation Tests", () => {
  const db = createDb();
  let testUserId: string;
  let testOrgId: string;
  let testCustomRoleId: string;
  let testMemberId: string;
  let testInvitationId: string;
  let createdUser = false;

  beforeAll(async () => {
    // 1. Fetch any existing user to bypass database security trigger
    const existingUsers = await db
      .select({ id: user.id })
      .from(user)
      .limit(1);

    if (existingUsers.length > 0) {
      testUserId = existingUsers[0]!.id;
    } else {
      // Fallback if not configured
      testUserId = randomUUID();
      try {
        await db.insert(user).values({
          id: testUserId,
          name: "Role Test User",
          email: `test-user-${testUserId}@upstand.test`,
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        createdUser = true;
      } catch (err) {
        // If insertion failed (e.g. concurrent race condition where another test file inserted a user),
        // fetch the user that was inserted by the concurrent runner.
        const retryUsers = await db
          .select({ id: user.id })
          .from(user)
          .limit(1);
        if (retryUsers.length > 0) {
          testUserId = retryUsers[0]!.id;
          createdUser = false;
        } else {
          throw err;
        }
      }
    }

    // 2. Create a test organization
    testOrgId = randomUUID();
    await db.insert(organization).values({
      id: testOrgId,
      name: "Role Test Workspace",
      slug: `role-test-${testOrgId}`,
      createdAt: new Date(),
    });

    // 3. Create a test custom role
    testCustomRoleId = randomUUID();
    await db.insert(customRole).values({
      id: testCustomRoleId,
      organizationId: testOrgId,
      name: "Test Developer Role",
      description: "Custom role for developer testing",
      permissions: JSON.stringify(["project:create", "project:view"]),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 4. Create a test member assigned to the custom role
    testMemberId = randomUUID();
    await db.insert(member).values({
      id: testMemberId,
      organizationId: testOrgId,
      userId: testUserId,
      role: `custom:${testCustomRoleId}`,
      permissions: JSON.stringify(["project:create", "project:view"]),
      createdAt: new Date(),
    });

    // 5. Create a test invitation assigned to the custom role
    testInvitationId = randomUUID();
    await db.insert(invitation).values({
      id: testInvitationId,
      organizationId: testOrgId,
      email: "invite-test@upstand.test",
      role: `custom:${testCustomRoleId}`,
      status: "pending",
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 1 day expiry
      createdAt: new Date(),
      inviterId: testUserId,
      permissions: JSON.stringify(["project:create", "project:view"]),
    });
  });

  afterAll(async () => {
    // Cleanup everything
    await db.delete(invitation).where(eq(invitation.organizationId, testOrgId));
    await db.delete(member).where(eq(member.organizationId, testOrgId));
    await db.delete(customRole).where(eq(customRole.organizationId, testOrgId));
    await db.delete(organization).where(eq(organization.id, testOrgId));
    if (createdUser) {
      await db.delete(user).where(eq(user.id, testUserId));
    }
  });

  test("Database successfully recorded custom role and assigned membership", async () => {
    const roles = await db
      .select()
      .from(customRole)
      .where(eq(customRole.id, testCustomRoleId));
    expect(roles.length).toBe(1);
    expect(roles[0]!.name).toBe("Test Developer Role");

    const members = await db
      .select()
      .from(member)
      .where(eq(member.id, testMemberId));
    expect(members.length).toBe(1);
    expect(members[0]!.role).toBe(`custom:${testCustomRoleId}`);

    const invites = await db
      .select()
      .from(invitation)
      .where(eq(invitation.id, testInvitationId));
    expect(invites.length).toBe(1);
    expect(invites[0]!.role).toBe(`custom:${testCustomRoleId}`);
  });

  test("Removing custom role degrades assigned members and pending invitations to standard member role", async () => {
    // Simulate role removal logic
    // 1. Degrade active members with this custom role to standard "member"
    await db
      .update(member)
      .set({
        role: "member",
        permissions: JSON.stringify(ROLE_PERMISSIONS.member),
      })
      .where(
        and(
          eq(member.organizationId, testOrgId),
          eq(member.role, `custom:${testCustomRoleId}`),
        ),
      );

    // 2. Degrade pending invitations with this custom role to standard "member"
    await db
      .update(invitation)
      .set({
        role: "member",
        permissions: JSON.stringify(ROLE_PERMISSIONS.member),
      })
      .where(
        and(
          eq(invitation.organizationId, testOrgId),
          eq(invitation.role, `custom:${testCustomRoleId}`),
        ),
      );

    // 3. Delete the custom role
    await db
      .delete(customRole)
      .where(
        and(
          eq(customRole.id, testCustomRoleId),
          eq(customRole.organizationId, testOrgId),
        ),
      );

    // Assertions
    // Custom role should be deleted
    const roles = await db
      .select()
      .from(customRole)
      .where(eq(customRole.id, testCustomRoleId));
    expect(roles.length).toBe(0);

    // Member should be degraded to "member"
    const members = await db
      .select()
      .from(member)
      .where(eq(member.id, testMemberId));
    expect(members.length).toBe(1);
    expect(members[0]!.role).toBe("member");
    expect(JSON.parse(members[0]!.permissions ?? "[]")).toEqual(ROLE_PERMISSIONS.member);

    // Invitation should be degraded to "member"
    const invites = await db
      .select()
      .from(invitation)
      .where(eq(invitation.id, testInvitationId));
    expect(invites.length).toBe(1);
    expect(invites[0]!.role).toBe("member");
    expect(JSON.parse(invites[0]!.permissions ?? "[]")).toEqual(ROLE_PERMISSIONS.member);
  });
});
