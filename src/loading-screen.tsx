/** Affiché pendant le chargement d'un jeu (import différé). */
export function LoadingScreen() {
  return <div className="kp-loading" role="status" aria-live="polite">
    <span className="kp-loading-mark" aria-hidden="true">✦</span>
    <span className="kp-loading-label">La table se prépare…</span>
  </div>;
}
