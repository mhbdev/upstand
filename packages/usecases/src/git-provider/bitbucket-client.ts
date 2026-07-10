export function getBitbucketHeaders(
  username: string,
  appPassword: string,
): Record<string, string> {
  const credentials = `${username}:${appPassword}`;
  const base64 = Buffer.from(credentials).toString("base64");
  return {
    Authorization: `Basic ${base64}`,
  };
}

export async function getBitbucketRepositories(
  username: string,
  appPassword: string,
  workspaceName?: string,
): Promise<{ id: string; name: string; fullName: string; owner: string }[]> {
  const owner = workspaceName || username;
  let url = `https://api.bitbucket.org/2.0/repositories/${owner}?pagelen=100`;
  let repositories: any[] = [];

  const headers = getBitbucketHeaders(username, appPassword);

  while (url) {
    const response = await fetch(url, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch Bitbucket repositories: ${response.statusText}`,
      );
    }

    const data = (await response.json()) as { values: any[]; next?: string };
    repositories = repositories.concat(data.values);
    url = data.next || "";
  }

  return repositories.map((repo) => ({
    id: repo.slug, // Bitbucket API references by repo slug
    name: repo.name,
    fullName: `${repo.workspace.slug}/${repo.slug}`,
    owner: repo.workspace.slug,
  }));
}

export async function getBitbucketBranches(
  username: string,
  appPassword: string,
  owner: string,
  repoSlug: string,
): Promise<string[]> {
  let url = `https://api.bitbucket.org/2.0/repositories/${owner}/${repoSlug}/refs/branches?pagelen=100`;
  let branches: string[] = [];

  const headers = getBitbucketHeaders(username, appPassword);

  while (url) {
    const response = await fetch(url, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch Bitbucket branches: ${response.statusText}`,
      );
    }

    const data = (await response.json()) as { values: any[]; next?: string };
    branches = branches.concat(data.values.map((b) => b.name));
    url = data.next || "";
  }

  return branches;
}
