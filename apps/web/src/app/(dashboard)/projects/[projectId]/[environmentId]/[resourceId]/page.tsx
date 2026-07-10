import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authClient } from "@/lib/auth-client";
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

  return (
    <ResourceDetail
      projectId={projectId}
      environmentId={environmentId}
      resourceId={resourceId}
      session={session}
    />
  );
}
