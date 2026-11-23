import { describe, expect, it, vi } from 'vitest';
import { createDominoRefresh } from './domino-refresh';

const flush = async () => { for (let i=0;i<8;i++) await Promise.resolve(); };

describe('synchronisation Domino', () => {
  it('regroupe les notifications reçues pendant une requête et actualise à nouveau', async () => {
    let finish!: () => void;
    const refresh=vi.fn().mockImplementationOnce(()=>new Promise<void>(resolve=>{finish=resolve;})).mockResolvedValue(undefined);
    const sync=createDominoRefresh(refresh);
    sync.request(); await flush();
    sync.request(); sync.request(); sync.request();
    expect(refresh).toHaveBeenCalledTimes(1);
    finish(); await flush();
    expect(refresh).toHaveBeenCalledTimes(2);
  });
  it('ne relance pas de requête après fermeture', async () => {
    let finish!: () => void;
    const refresh=vi.fn(()=>new Promise<void>(resolve=>{finish=resolve;}));
    const sync=createDominoRefresh(refresh);
    sync.request(); await flush(); sync.request(); sync.stop(); finish(); await flush(); sync.request();
    expect(refresh).toHaveBeenCalledTimes(1);
  });
  it('reste utilisable après une erreur de réseau', async () => {
    const refresh=vi.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValue(undefined);
    const sync=createDominoRefresh(refresh);
    sync.request(); await flush(); sync.request(); await flush();
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});
