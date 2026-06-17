export function getStoredArray(key) {
  const value = localStorage.getItem(key);
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed;
  } catch (error) {
    console.warn(`Clearing invalid localStorage value for ${key}`, error);
  }

  localStorage.removeItem(key);
  return [];
}
