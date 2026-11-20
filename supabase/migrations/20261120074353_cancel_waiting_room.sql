-- A host can cancel a room while it is still waiting for players.
-- The whole room is removed so every invited player sees it disappear.
create or replace function maison_domino_private.cancel_room(p_code text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare r maison_domino_private.rooms;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  select * into r from maison_domino_private.rooms where code=p_code for update;
  if not found then raise exception 'Salon introuvable'; end if;
  if r.host<>auth.uid() then raise exception 'Seul le créateur peut annuler le salon'; end if;
  if r.status<>'waiting' then raise exception 'La partie a déjà commencé'; end if;
  delete from kopaka_presence_private.turn_clock where game='domino' and room=p_code;
  delete from kopaka_presence_private.presence where game='domino' and room=p_code;
  delete from maison_domino_private.rooms where code=p_code;
  return true;
end $$;
revoke all on function maison_domino_private.cancel_room(text) from public, anon, authenticated;
grant execute on function maison_domino_private.cancel_room(text) to authenticated;
create or replace function public.domino_cancel(p_code text) returns boolean
language sql security invoker set search_path = '' as $$ select maison_domino_private.cancel_room(p_code) $$;
revoke all on function public.domino_cancel(text) from public, anon;
grant execute on function public.domino_cancel(text) to authenticated;

create or replace function maison_ludo_private.cancel_room(p_code text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare r maison_ludo_private.rooms;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  select * into r from maison_ludo_private.rooms where code=p_code for update;
  if not found then raise exception 'Salon introuvable'; end if;
  if r.host<>auth.uid() then raise exception 'Seul le créateur peut annuler le salon'; end if;
  if r.status<>'waiting' then raise exception 'La partie a déjà commencé'; end if;
  delete from kopaka_presence_private.turn_clock where game='ludo' and room=p_code;
  delete from kopaka_presence_private.presence where game='ludo' and room=p_code;
  delete from maison_ludo_private.rooms where code=p_code;
  return true;
end $$;
revoke all on function maison_ludo_private.cancel_room(text) from public, anon, authenticated;
grant execute on function maison_ludo_private.cancel_room(text) to authenticated;
create or replace function public.ludo_cancel(p_code text) returns boolean
language sql security invoker set search_path = '' as $$ select maison_ludo_private.cancel_room(p_code) $$;
revoke all on function public.ludo_cancel(text) from public, anon;
grant execute on function public.ludo_cancel(text) to authenticated;

create or replace function faritany_private.cancel_room(p_code text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare r faritany_private.rooms;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  select * into r from faritany_private.rooms where code=p_code for update;
  if not found then raise exception 'Salon introuvable'; end if;
  if r.host<>auth.uid() then raise exception 'Seul le créateur peut annuler le salon'; end if;
  if r.status<>'waiting' then raise exception 'La partie a déjà commencé'; end if;
  delete from kopaka_presence_private.turn_clock where game='faritany' and room=p_code;
  delete from kopaka_presence_private.presence where game='faritany' and room=p_code;
  delete from faritany_private.rooms where code=p_code;
  return true;
end $$;
revoke all on function faritany_private.cancel_room(text) from public, anon, authenticated;
grant execute on function faritany_private.cancel_room(text) to authenticated;
create or replace function public.faritany_cancel(p_code text) returns boolean
language sql security invoker set search_path = '' as $$ select faritany_private.cancel_room(p_code) $$;
revoke all on function public.faritany_cancel(text) from public, anon;
grant execute on function public.faritany_cancel(text) to authenticated;
