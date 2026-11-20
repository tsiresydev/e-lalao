-- Presence records are private and may only be refreshed by their owner.
-- This is a building block only: it does not declare forfeits or remove rooms.
create schema if not exists kopaka_presence_private;
revoke all on schema kopaka_presence_private from public, anon, authenticated;
grant usage on schema kopaka_presence_private to authenticated;

create table kopaka_presence_private.presence (
  game text not null check (game in ('domino', 'ludo', 'faritany')),
  room text not null,
  uid uuid not null,
  last_seen timestamptz not null default now(),
  primary key (game, room, uid)
);
alter table kopaka_presence_private.presence enable row level security;
revoke all on kopaka_presence_private.presence from public, anon, authenticated;

create function kopaka_presence_private.heartbeat(p_game text, p_code text)
returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  player_id uuid := auth.uid();
  observed_at timestamptz := clock_timestamp();
  member boolean := false;
begin
  if player_id is null then raise exception 'Connexion requise'; end if;
  if p_game = 'domino' then
    select exists(select 1 from maison_domino_private.players where room = p_code and uid = player_id) into member;
  elsif p_game = 'ludo' then
    select exists(select 1 from maison_ludo_private.players where room = p_code and uid = player_id) into member;
  elsif p_game = 'faritany' then
    select exists(select 1 from faritany_private.players where room = p_code and uid = player_id) into member;
  end if;
  if not member then raise exception 'Accès au salon refusé'; end if;
  insert into kopaka_presence_private.presence(game, room, uid, last_seen)
  values (p_game, p_code, player_id, observed_at)
  on conflict (game, room, uid) do update set last_seen = excluded.last_seen;
  return observed_at;
end $$;
revoke all on function kopaka_presence_private.heartbeat(text, text) from public, anon, authenticated;
grant execute on function kopaka_presence_private.heartbeat(text, text) to authenticated;

create function public.kopaka_heartbeat(p_game text, p_code text)
returns timestamptz language sql security invoker set search_path = '' as $$
  select kopaka_presence_private.heartbeat(p_game, p_code)
$$;
revoke all on function public.kopaka_heartbeat(text, text) from public, anon, authenticated;
grant execute on function public.kopaka_heartbeat(text, text) to authenticated;
