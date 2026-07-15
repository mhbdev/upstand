export const isUnknownRecord = (
  value: unknown,
): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const numberValue = (
  record: Record<string, unknown>,
  key: string,
): number => {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
};

export const stringValue = (
  record: Record<string, unknown>,
  key: string,
): string => {
  const value = record[key];
  return typeof value === "string" ? value : "unknown";
};

export const sumDockerUsage = (value: unknown): number =>
  Array.isArray(value)
    ? value.reduce(
        (total, item) =>
          isUnknownRecord(item) ? total + numberValue(item, "Size") : total,
        0,
      )
    : 0;
