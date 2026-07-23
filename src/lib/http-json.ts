function responseStatus(response: Response): string {
  const text = response.statusText.trim();
  return text ? `HTTP ${response.status} ${text}` : `HTTP ${response.status}`;
}

export async function readJsonResponse<T>(response: Response, label: string): Promise<T> {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  const raw = await response.text();

  if (!raw.trim()) {
    throw new Error(`${label}: 서버가 빈 응답을 반환했습니다 (${responseStatus(response)}).`);
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    const isHtml = /^\s*(?:<!doctype\s+html|<html[\s>])/i.test(raw) || contentType.includes("text/html");
    const responseKind = isHtml ? "JSON 대신 HTML 오류 페이지" : "올바르지 않은 JSON 응답";
    throw new Error(`${label}: 서버가 ${responseKind}를 반환했습니다 (${responseStatus(response)}).`);
  }
}
