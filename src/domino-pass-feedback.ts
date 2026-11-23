import { useEffect, useRef } from 'react';
import { audio } from './audio';

export const DOMINO_PASS_DELAY_MS = 1000;

/** Signal a blocked hand once, not on every server refresh. */
export function useDominoPassFeedback(mustPass: boolean) {
  const previous = useRef(false);
  useEffect(() => {
    if (mustPass && !previous.current) void audio.playSound('pass');
    previous.current = mustPass;
  }, [mustPass]);
}
