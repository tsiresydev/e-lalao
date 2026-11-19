-- Legacy rooms keep their existing 2–4 player behaviour.
alter table maison_ludo_private.rooms add column player_limit integer check (player_limit between 2 and 4);

create or replace function maison_ludo_private.snapshot(p_code text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r maison_ludo_private.rooms; result jsonb;
begin
  if auth.uid() is null or not exists(select 1 from maison_ludo_private.players p where p.room=p_code and p.uid=auth.uid()) then raise exception 'Accès au salon refusé'; end if;
  select * into r from maison_ludo_private.rooms where code=p_code;
  select jsonb_build_object('code',r.code,'host',r.host,'status',r.status,'turn',r.turn,'die',r.die,'winner',r.winner,'message',r.message,'me',auth.uid(),'player_limit',r.player_limit,
    'players',coalesce(jsonb_agg(jsonb_build_object('uid',p.uid,'name',p.name,'seat',p.seat,'pawns',p.pawns) order by p.seat),'[]'::jsonb))
    into result from maison_ludo_private.players p where p.room=p_code;
  return result;
end $$;

create function maison_ludo_private.create_configured(p_name text,p_player_limit integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare state jsonb; c text;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  if p_player_limit is null or p_player_limit not between 2 and 4 then raise exception 'Choisissez 2, 3 ou 4 joueurs'; end if;
  state:=maison_ludo_private.create_room(p_name);
  c:=state->>'code';
  update maison_ludo_private.rooms set player_limit=p_player_limit where code=c and host=auth.uid();
  return maison_ludo_private.snapshot(c);
end $$;
revoke all on function maison_ludo_private.create_configured(text,integer) from public, anon, authenticated;
grant execute on function maison_ludo_private.create_configured(text,integer) to authenticated;
create function public.ludo_create_configured(p_name text,p_player_limit integer) returns jsonb
language sql security invoker set search_path='' as $$ select maison_ludo_private.create_configured(p_name,p_player_limit) $$;
revoke all on function public.ludo_create_configured(text,integer) from public, anon;
grant execute on function public.ludo_create_configured(text,integer) to authenticated;

-- Serialize joins even if another future caller inserts players directly.
create function maison_ludo_private.enforce_capacity() returns trigger
language plpgsql security definer set search_path='' as $$
declare max_players integer;
begin
  select player_limit into max_players from maison_ludo_private.rooms where code=new.room for update;
  if max_players is not null and (select count(*) from maison_ludo_private.players where room=new.room)>=max_players then raise exception 'Salon complet'; end if;
  return new;
end $$;
revoke all on function maison_ludo_private.enforce_capacity() from public, anon, authenticated;
create trigger ludo_enforce_capacity before insert on maison_ludo_private.players for each row execute function maison_ludo_private.enforce_capacity();

create function maison_ludo_private.enforce_start_count() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if old.status='waiting' and new.status='playing' and new.player_limit is not null and
     (select count(*) from maison_ludo_private.players where room=new.code)<>new.player_limit then
    raise exception 'Attendez que les % joueurs aient rejoint le salon',new.player_limit;
  end if;
  return new;
end $$;
revoke all on function maison_ludo_private.enforce_start_count() from public, anon, authenticated;
create trigger ludo_enforce_start_count before update of status on maison_ludo_private.rooms for each row execute function maison_ludo_private.enforce_start_count();
