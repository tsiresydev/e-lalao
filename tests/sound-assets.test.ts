import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('ressources audio locales', () => {
  it('référence des fichiers audio locaux présents et reconnaissables', () => {
    const root = resolve('public/assets/sounds');
    const manifest = JSON.parse(readFileSync(resolve(root, 'manifest.json'), 'utf8')) as {
      sounds: { path: string }[];
    };
    expect(manifest.sounds.length).toBeGreaterThan(0);
    for (const sound of manifest.sounds) {
      expect(sound.path).not.toContain('..');
      const file = readFileSync(resolve(root, sound.path));
      if (sound.path.endsWith('.ogg')) expect(file.subarray(0, 4).toString('ascii')).toBe('OggS');
      else if (sound.path.endsWith('.mp3')) expect(file.subarray(0, 3).toString('ascii') === 'ID3' || (file[0] === 0xff && (file[1] & 0xe0) === 0xe0)).toBe(true);
      else throw new Error(`Format audio non pris en charge : ${sound.path}`);
    }
  });
});
