export function readStorage(key, fallback = null) {
  try {
    const value = localStorage.getItem(key);
    if (value === null) return fallback;
    return JSON.parse(value);
  } catch (error) {
    try {
      const value = sessionStorage.getItem(key);
      if (value === null) return fallback;
      return JSON.parse(value);
    } catch (innerError) {
      return fallback;
    }
  }
}

export function writeStorage(key, value) {
  const serialized = JSON.stringify(value);
  try {
    localStorage.setItem(key, serialized);
  } catch (error) {
    try {
      sessionStorage.setItem(key, serialized);
    } catch (innerError) {
      // Ignore storage quota or unavailable storage.
    }
  }
}

export function removeStorage(key) {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    // Ignore.
  }
  try {
    sessionStorage.removeItem(key);
  } catch (error) {
    // Ignore.
  }
}
