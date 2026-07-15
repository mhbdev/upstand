export async function requestJson<T>(
  input: string | URL | Request,
  init: RequestInit | undefined,
  createError: (response: Response) => string | Promise<string>,
): Promise<T> {
  const result = await requestJsonWithResponse<T>(input, init, createError);
  return result.data;
}

export async function requestJsonWithResponse<T>(
  input: string | URL | Request,
  init: RequestInit | undefined,
  createError: (response: Response) => string | Promise<string>,
): Promise<{ data: T; response: Response }> {
  const response = await fetch(input, init);

  if (!response.ok) {
    throw new Error(await createError(response));
  }

  return { data: (await response.json()) as T, response };
}
