process.env.SKIP_ENV_VALIDATION = "1";

import { createInterface } from "node:readline";

async function askQuestion(query: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) =>
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer.trim());
    }),
  );
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    printUsage();
    process.exit(1);
  }

  // Dynamically import db dependencies to bypass schema validation checks during boot
  const { db, user, twoFactor, closeDb } = await import("@upstand/db");
  const { eq } = await import("drizzle-orm");

  if (command === "reset-2fa") {
    let email = args.find((a) => a.startsWith("--email="))?.split("=")[1];

    if (!email) {
      // Find all users with 2FA enabled
      const mfaUsers = await db
        .select()
        .from(user)
        .where(eq(user.twoFactorEnabled, true));

      if (mfaUsers.length === 0) {
        console.log("No users found with Two-Factor Authentication enabled.");
        await closeDb();
        process.exit(0);
      }

      console.log("\nUsers with Two-Factor Authentication enabled:");
      mfaUsers.forEach((u, i) => {
        console.log(`  [${i + 1}] ${u.name} (${u.email})`);
      });
      console.log("");

      const input = await askQuestion(
        "Enter the number or email of the user to reset 2FA: ",
      );

      if (!input) {
        console.error("Error: Input cannot be empty.");
        await closeDb();
        process.exit(1);
      }

      const index = Number.parseInt(input, 10) - 1;
      const selectedUser = mfaUsers[index];
      if (!Number.isNaN(index) && selectedUser) {
        email = selectedUser.email;
      } else {
        email = input;
      }
    }

    const targetUser = await db.query.user.findFirst({
      where: eq(user.email, email),
    });

    if (!targetUser) {
      console.error(`\nError: User with email '${email}' not found.`);
      await closeDb();
      process.exit(1);
    }

    console.log(
      `\nResetting Two-Factor Authentication for ${targetUser.name} (${targetUser.email})...`,
    );

    try {
      await db.transaction(async (tx) => {
        // 1. Disable 2FA in user table
        await tx
          .update(user)
          .set({ twoFactorEnabled: false })
          .where(eq(user.id, targetUser.id));

        // 2. Remove two_factor records
        await tx.delete(twoFactor).where(eq(twoFactor.userId, targetUser.id));
      });

      console.log(
        "Success: Two-Factor Authentication has been successfully reset. The user can now log in using only their password.\n",
      );
    } catch (err) {
      console.error("Error: Failed to reset Two-Factor Authentication:", err);
    } finally {
      await closeDb();
    }
  } else {
    printUsage();
    await closeDb();
    process.exit(1);
  }
}

function printUsage() {
  console.log("\nUpstand Administrative CLI Tools");
  console.log("=================================");
  console.log("Usage:");
  console.log("  bun dist/cli.mjs reset-2fa [--email=<email>]\n");
}

main().catch(async (err) => {
  console.error("CLI Execution failed:", err);
  try {
    const { closeDb } = await import("@upstand/db");
    await closeDb();
  } catch {}
  process.exit(1);
});
