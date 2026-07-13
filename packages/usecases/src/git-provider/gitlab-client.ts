export async function refreshGitlabToken(
  gitlabUrl: string,
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<{ accessToken: string; refreshToken: string; expiresAt: number }> {
  const response = await fetch(`${gitlabUrl}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to refresh GitLab token: ${response.statusText}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Math.floor(Date.now() / 1000) + data.expires_in,
  };
}

export async function getGitlabRepositories(
  gitlabUrl: string,
  accessToken: string,
  groupName?: string,
): Promise<{ id: number; name: string; fullName: string; owner: string }[]> {
  const allProjects: any[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const response = await fetch(
      `${gitlabUrl}/api/v4/projects?membership=true&page=${page}&per_page=${perPage}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    if (!response.ok) {
      throw new Error(
        `Failed to fetch GitLab projects: ${response.statusText}`,
      );
    }

    const projects = (await response.json()) as any[];
    if (projects.length === 0) {
      break;
    }

    allProjects.push(...projects);
    page++;

    const total = response.headers.get("x-total");
    if (total && allProjects.length >= Number.parseInt(total, 10)) {
      break;
    }
  }

  const filtered = allProjects.filter((repo) => {
    const { full_path, kind } = repo.namespace;
    if (groupName) {
      return groupName
        .split(",")
        .some((name) =>
          full_path.toLowerCase().startsWith(name.trim().toLowerCase()),
        );
    }
    return kind === "user";
  });

  return filtered.map((repo) => ({
    id: repo.id,
    name: repo.name,
    fullName: repo.path_with_namespace,
    owner: repo.namespace.path,
  }));
}

export async function getGitlabBranches(
  gitlabUrl: string,
  accessToken: string,
  projectId: number | string,
): Promise<string[]> {
  const encodedId =
    typeof projectId === "string" ? encodeURIComponent(projectId) : projectId;
  const allBranches: string[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const response = await fetch(
      `${gitlabUrl}/api/v4/projects/${encodedId}/repository/branches?page=${page}&per_page=${perPage}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    if (!response.ok) {
      throw new Error(
        `Failed to fetch GitLab branches: ${response.statusText}`,
      );
    }

    const branches = (await response.json()) as { name: string }[];
    if (branches.length === 0) {
      break;
    }

    allBranches.push(...branches.map((b) => b.name));
    page++;

    const total = response.headers.get("x-total");
    if (total && allBranches.length >= Number.parseInt(total, 10)) {
      break;
    }
  }

  return allBranches;
}
