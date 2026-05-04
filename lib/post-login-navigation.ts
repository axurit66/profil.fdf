/**
 * Après `onAuthStateChanged` + cookie session (AuthContext), recharge complète vers la cible.
 * Retourne une fonction de cleanup (clearTimeout) pour React Strict Mode / deps qui changent.
 */
export function setupPostLoginReload(postLoginPath: string | null): () => void {
  const path =
    postLoginPath &&
    postLoginPath.startsWith("/") &&
    !postLoginPath.startsWith("//")
      ? postLoginPath
      : "/";
  const href = new URL(path, window.location.origin).href;
  const id = window.setTimeout(() => {
    window.location.replace(href);
  }, 300);
  return () => window.clearTimeout(id);
}
