import crypto from "node:crypto";

export function signJwtRs256(
  payload: object,
  privateKeyPem: string,
  appId: string,
): string {
  const header = {
    alg: "RS256",
    typ: "JWT",
  };

  const base64UrlEncode = (str: string) => {
    return Buffer.from(str)
      .toString("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
  };

  const payloadWithClaims = {
    ...payload,
    iat: Math.floor(Date.now() / 1000) - 60, // clock drift buffer
    exp: Math.floor(Date.now() / 1000) + 10 * 60, // 10 minutes duration
    iss: appId,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payloadWithClaims));

  const sign = crypto.createSign("RSA-SHA256");
  sign.update(`${encodedHeader}.${encodedPayload}`);
  const signature = sign.sign(privateKeyPem, "base64");
  const encodedSignature = signature
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
}

export async function getInstallationToken(
  appId: string,
  privateKeyPem: string,
  installationId: string,
): Promise<string> {
  const jwt = signJwtRs256({}, privateKeyPem, appId);

  const response = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "Upstand",
      },
    },
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to get GitHub installation token: ${errText}`);
  }

  const data = (await response.json()) as { token: string };
  return data.token;
}

export async function getRepositories(
  appId: string,
  privateKeyPem: string,
  installationId: string,
): Promise<{ id: number; name: string; fullName: string; owner: string }[]> {
  const token = await getInstallationToken(
    appId,
    privateKeyPem,
    installationId,
  );

  const response = await fetch(
    "https://api.github.com/installation/repositories?per_page=100",
    {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "Upstand",
      },
    },
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to fetch GitHub repositories: ${errText}`);
  }

  const data = (await response.json()) as {
    repositories: {
      id: number;
      name: string;
      full_name: string;
      owner: { login: string };
    }[];
  };

  return data.repositories.map((repo) => ({
    id: repo.id,
    name: repo.name,
    fullName: repo.full_name,
    owner: repo.owner.login,
  }));
}

export async function getBranches(
  appId: string,
  privateKeyPem: string,
  installationId: string,
  owner: string,
  repo: string,
): Promise<string[]> {
  const token = await getInstallationToken(
    appId,
    privateKeyPem,
    installationId,
  );

  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/branches?per_page=100`,
    {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "Upstand",
      },
    },
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to fetch GitHub branches: ${errText}`);
  }

  const data = (await response.json()) as { name: string }[];
  return data.map((b) => b.name);
}
