import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import S3Destinations from "./s3-destinations";

export const dynamic = "force-dynamic";

export default async function S3DestinationsPage() {
  let session = null;
  try {
    session = await authClient.getSession({
      fetchOptions: {
        headers: await headers(),
        throw: true,
      },
    });
  } catch (error) {
    console.error("Failed to fetch session on server side:", error);
  }

  if (!session?.user) {
    redirect("/login");
  }

  return <S3Destinations session={session} />;
}
