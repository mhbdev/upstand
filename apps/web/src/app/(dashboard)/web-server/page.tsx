import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/server-session";
import WebServerDashboard from "./web-server";

export const dynamic = "force-dynamic";

export default async function WebServerPage() {
  let session = null;
  try {
    session = await getServerSession();
  } catch (error) {
    console.error("Failed to fetch session on server side:", error);
  }

  if (!session?.user) {
    redirect("/login");
  }

  return <WebServerDashboard session={session} />;
}
