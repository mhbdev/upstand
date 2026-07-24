export const dockerLogLevels = [
  "error",
  "warning",
  "success",
  "info",
  "debug",
] as const;

export type DockerLogLevel = (typeof dockerLogLevels)[number];

export type DockerLogFilter = {
  search?: string;
  levels?: DockerLogLevel[];
};

/** Docker does not attach severity to ordinary container logs, so use the same conservative text classification as the dashboard. */
export function getDockerLogLevel(message: string): DockerLogLevel {
  const lower = message.toLowerCase();
  if (
    /(?:^|\s)(?:error|err|fatal|critical):?\s/i.test(lower) ||
    /\b(?:exception|failed|failure|crash|uncaught|unhandled)\b/i.test(lower) ||
    /\[(?:error|err|fatal)\]/i.test(lower)
  )
    return "error";
  if (
    /(?:^|\s)(?:warning|warn):?\s/i.test(lower) ||
    /\[(?:warn(?:ing)?|attention)\]/i.test(lower) ||
    /\b(?:deprecated|obsolete|unstable|experimental)\b/i.test(lower) ||
    /⚠|⚠️/i.test(lower)
  )
    return "warning";
  if (
    /\[(?:success|ok|done)\]/i.test(lower) ||
    /\b(?:success(?:ful)?|completed|ready|started|starting|active)\b/i.test(
      lower,
    )
  )
    return "success";
  if (
    /\[(?:info|information|status|state|progress)\]/i.test(lower) ||
    /\b(?:status|state|progress|processing|executing|performing)\b/i.test(lower)
  )
    return "info";
  if (
    /\[(?:debug|trace|server|db|api|http|request|response)\]/i.test(lower) ||
    /\b(?:debug|trace|version|config)\b/i.test(lower)
  )
    return "debug";
  return "info";
}

export function filterDockerLogs(
  logs: string,
  filter?: DockerLogFilter | null,
): string {
  const search = filter?.search?.trim().toLowerCase();
  const levels = new Set(filter?.levels ?? []);
  if (!search && levels.size === 0) return logs;
  return logs
    .split(/\r?\n/)
    .filter((line) => {
      if (!line) return false;
      if (search && !line.toLowerCase().includes(search)) return false;
      return levels.size === 0 || levels.has(getDockerLogLevel(line));
    })
    .join("\n");
}
