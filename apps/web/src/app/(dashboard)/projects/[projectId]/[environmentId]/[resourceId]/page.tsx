import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/server-session";
import ResourceDetail from "./resource-detail";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{
    projectId: string;
    environmentId: string;
    resourceId: string;
  }>;
}

export default async function ResourcePage({ params }: PageProps) {
  const { projectId, environmentId, resourceId } = await params;
  let session = null;
  try {
    session = await getServerSession();
  } catch (error) {
    console.error("Failed to fetch session on server side:", error);
  }

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <ResourceDetail
      projectId={projectId}
      environmentId={environmentId}
      resourceId={resourceId}
      session={session}
    />
  );
}
