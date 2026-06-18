export async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      ...options.headers,
    },
    ...options,
  });

  const contentType = response.headers.get("content-type");

  if (!response.ok) {
    if (contentType && contentType.includes("application/json")) {
      try {
        const errJson = await response.json();
        throw new Error(formatErrorPayload(errJson.error) || `Request failed with status ${response.status}`);
      } catch (error) {
        if (error instanceof Error && error.message) {
          throw error;
        }
        throw new Error(`Request failed with status ${response.status}`);
      }
    }
    throw new Error(
      `Request failed with status ${response.status}: ${formatNonJsonResponse(
        await response.text().catch(() => "Unknown error"),
      )}`,
    );
  }

  if (contentType && contentType.includes("application/json")) {
    return response.json();
  }

  throw new Error(
    `Expected JSON from ${url}, but received ${contentType || "an unknown content type"}: ${formatNonJsonResponse(
      await response.text().catch(() => "Unknown response"),
    )}`,
  );
}

function formatNonJsonResponse(text) {
  return text.replace(/\s+/g, " ").trim().slice(0, 180) || "Empty response";
}

function formatErrorPayload(error) {
  if (!error) return "";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (typeof error.message === "string") return error.message;

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}
