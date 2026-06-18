export function getErrorMessage(error, fallback = "Something went wrong.") {
  if (!error) return fallback;
  if (typeof error === "string") return error;
  if (error instanceof Error && error.message) return error.message;
  if (typeof error.message === "string" && error.message) return error.message;
  if (typeof error.error === "string" && error.error) return error.error;

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}
