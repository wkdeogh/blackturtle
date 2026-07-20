function isTimeoutError(error: unknown): boolean {
  if (error instanceof DOMException) return error.name === "TimeoutError" || error.name === "AbortError";
  if (error instanceof Error) return error.name === "TimeoutError" || error.name === "AbortError";
  if (error && typeof error === "object") {
    const name = (error as Record<string, unknown>).name;
    return name === "TimeoutError" || name === "AbortError";
  }
  return false;
}

export async function fetchWithTimeout(
  input: string | URL,
  init: RequestInit,
  timeoutMs: number,
  label: string,
): Promise<Response> {
  try {
    return await fetch(input, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (isTimeoutError(error)) {
      throw new Error(`${label} 응답 제한시간(${Math.round(timeoutMs / 1000)}초)을 초과했습니다.`);
    }
    throw error;
  }
}
