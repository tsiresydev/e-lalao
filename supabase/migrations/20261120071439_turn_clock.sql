-- Shared server-authoritative turn clocks. Three consecutive expirations remove the player.
create table if not exists kopaka_presence_private.turn_clock (
  game text not null check (game in ('domino', 'ludo', 'faritany')),
  room text not null,
  player_uid uuid not null,
  deadline timestamptz not null,
  consecutive_misses integer not null default 0 check (consecutive_misses between 0 and 3),
  is_active boolean not null default false,
  primary key (game, room, player_uid)
);
revoke all on kopaka_presence_private.turn_clock from public, anon, authenticated;

drop function if exists kopaka_presence_private.start_turn(text,text,uuid,integer);
create or replace function kopaka_presence_private.start_turn(
  p_game text,
  p_code text,
  p_uid uuid,
  p_seconds integer default 10,
  p_reset boolean default false
) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare deadline timestamptz := clock_timestamp() + make_interval(secs => p_seconds);
begin
  -- Only the active player's deadline runs; miss counts stay with each player.
  -- Reading state must not extend a deadline: p_reset is true only on a real move.
  update kopaka_presence_private.turn_clock
    set is_active=false
    where game=p_game and room=p_code and player_uid<>p_uid;
  insert into kopaka_presence_private.turn_clock(game, room, player_uid, deadline, is_active)
  values (p_game, p_code, p_uid, deadline, true)
  on conflict (game, room, player_uid) do update
    set deadline=case when p_reset then excluded.deadline else kopaka_presence_private.turn_clock.deadline end,
        is_active=true;
  return deadline;
end $$;
revoke all on function kopaka_presence_private.start_turn(text,text,uuid,integer,boolean) from public, anon, authenticated;

create or replace function kopaka_presence_private.claim_turn(
  p_game text,
  p_code text,
  p_uid uuid
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare c kopaka_presence_private.turn_clock;
begin
  select * into c from kopaka_presence_private.turn_clock
    where game=p_game and room=p_code and player_uid=p_uid for update;
  if not found or not c.is_active then return true; end if;
  if clock_timestamp() <= c.deadline then
    update kopaka_presence_private.turn_clock set consecutive_misses=0
      where game=p_game and room=p_code and player_uid=p_uid;
    return true;
  end if;
  return false;
end $$;
revoke all on function kopaka_presence_private.claim_turn(text,text,uuid) from public, anon, authenticated;

create or replace function kopaka_presence_private.clear_player(
  p_game text,
  p_code text,
  p_uid uuid
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from kopaka_presence_private.turn_clock where game=p_game and room=p_code and player_uid=p_uid;
  delete from kopaka_presence_private.presence where game=p_game and room=p_code and uid=p_uid;
end $$;
revoke all on function kopaka_presence_private.clear_player(text,text,uuid) from public, anon, authenticated;

create or replace function kopaka_presence_private.expire_turns(
  p_game text,
  p_code text
) returns table (expired_uid uuid, misses integer)
language plpgsql security definer set search_path = '' as $$
declare allowed boolean;
begin
  if p_game='domino' then
    select auth.uid() is not null and exists(select 1 from maison_domino_private.players pl where pl.room=p_code and pl.uid=auth.uid()) into allowed;
  elsif p_game='ludo' then
    select auth.uid() is not null and exists(select 1 from maison_ludo_private.players pl where pl.room=p_code and pl.uid=auth.uid()) into allowed;
  elsif p_game='faritany' then
    select auth.uid() is not null and exists(select 1 from faritany_private.players pl where pl.room=p_code and pl.uid=auth.uid()) into allowed;
  else allowed:=false; end if;
  if not allowed then raise exception 'Accès au salon refusé'; end if;

  return query
  with expired as (
    select c.*
    from kopaka_presence_private.turn_clock c
    where c.game=p_game and c.room=p_code and c.is_active and c.deadline<=clock_timestamp()
    for update skip locked
  ), updated as (
    update kopaka_presence_private.turn_clock c
    set consecutive_misses=least(c.consecutive_misses+1,3),
        deadline=clock_timestamp() + interval '10 seconds',
        is_active=false
    from expired e
    where c.game=e.game and c.room=e.room and c.player_uid=e.player_uid
    returning c.player_uid as expired_uid, c.consecutive_misses as misses
  )
  select updated.expired_uid, updated.misses from updated;
end $$;
revoke all on function kopaka_presence_private.expire_turns(text,text) from public, anon, authenticated;

create or replace function public.kopaka_expire_turns(p_game text, p_code text)
returns table (expired_uid uuid, misses integer)
language sql security invoker set search_path = '' as $$
  select * from kopaka_presence_private.expire_turns(p_game, p_code)
$$;
revoke all on function public.kopaka_expire_turns(text,text) from public, anon;
grant execute on function public.kopaka_expire_turns(text,text) to authenticated;
