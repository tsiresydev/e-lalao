/** Coalesce bursts of invalidations while guaranteeing a refresh after the last one. */
export function createDominoRefresh(refresh: () => Promise<unknown>) {
  let running = false, pending = false, stopped = false;
  const request = () => {
    if (stopped) return;
    if (running) { pending = true; return; }
    running = true;
    void Promise.resolve().then(refresh).catch(() => {}).finally(() => {
      running = false;
      if (pending && !stopped) { pending = false; request(); }
    });
  };
  return { request, stop: () => { stopped = true; pending = false; } };
}
