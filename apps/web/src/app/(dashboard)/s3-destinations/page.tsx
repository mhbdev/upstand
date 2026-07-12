import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/server-session";
import S3Destinations from "./s3-destinations";

export const dynamic = "force-dynamic";

export default async function S3DestinationsPage() {
  let session = null;
  try {
    session = await getServerSession();
  } catch (error) {
    console.error("Failed to fetch session on server side:", error);
  }

  if (!session?.user) {
    redirect("/login");
  }

  return <S3Destinations session={session} />;
}
