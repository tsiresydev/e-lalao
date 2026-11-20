import { useEffect } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

// Advance the shared server clock. The RPC checks room membership and only
// applies changes whose deadline has actually elapsed.
export function useTurnExpiry(client: SupabaseClient | null, game: 'domino' | 'ludo' | 'faritany', code: string | undefined, playing: boolean | undefined) {
  useEffect(() => {
    if (!client || !code || !playing) return;
    const expire = () => { void client.rpc(`${game}_expire`, { p_code: code }); };
    const timer = window.setInterval(expire, 1_000);
    const onVisibility = () => { if (document.visibilityState === 'visible') expire(); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', expire);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', expire);
    };
  }, [client, game, code, playing]);
}
