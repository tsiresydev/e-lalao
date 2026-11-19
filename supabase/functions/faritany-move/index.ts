import { createClient } from 'npm:@supabase/supabase-js@2.49.0';
import { placePoint } from '../../../src/faritany-game.ts';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  if (request.method !== 'POST') return reply({ error: 'Méthode invalide.' }, 405);
  try {
    const token = request.headers.get('Authorization');
    if (!token?.startsWith('Bearer ')) return reply({ error: 'Connexion requise.' }, 401);
    const url = Deno.env.get('SUPABASE_URL')!;
    const client = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: token } } });
    const { data: identity, error: authError } = await client.auth.getUser(token.slice(7));
    if (authError || !identity.user) return reply({ error: 'Connexion requise.' }, 401);
    const body = await request.json();
    if (typeof body.code !== 'string' || !/^[A-F0-9]{8}$/.test(body.code) || !Number.isInteger(body.x) || !Number.isInteger(body.y))
      return reply({ error: 'Coup invalide.' }, 400);
    const { data: room, error: stateError } = await client.rpc('faritany_state', { p_code: body.code });
    if (stateError || !room) return reply({ error: 'Accès au salon refusé.' }, 403);
    const player = room.players.find((p: { uid: string }) => p.uid === identity.user!.id);
    const color = player?.seat === 0 ? 'blue' : 'red';
    if (!player || room.status !== 'playing' || room.game.finished || room.game.turn !== color)
      return reply({ error: 'Ce n’est pas votre tour.' }, 409);
    const next = placePoint(room.game, body.x, body.y);
    if (next === room.game) return reply({ error: 'Intersection invalide ou occupée.' }, 400);
    const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const { data: committed, error: commitError } = await service.rpc('faritany_commit_move', {
      p_code: room.code, p_uid: identity.user.id, p_version: room.version, p_game: next,
    });
    if (commitError) throw commitError;
    if (!committed) return reply({ error: 'La partie a changé. Réessayez.' }, 409);
    const { data: updated, error: updatedError } = await client.rpc('faritany_state', { p_code: room.code });
    if (updatedError) throw updatedError;
    return reply(updated);
  } catch {
    return reply({ error: 'Impossible de jouer. Réessayez.' }, 500);
  }
});
