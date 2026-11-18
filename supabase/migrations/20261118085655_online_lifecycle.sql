-- Only invalidation messages are broadcast: hands never leave the private schema.
create function maison_domino_private.is_room_member(p_topic text) returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists (
    select 1 from maison_domino_private.players
    where room = substring(p_topic from 15) and uid = auth.uid()
      and p_topic = 'maison-domino:' || room
  )
$$;
revoke all on function maison_domino_private.is_room_member(text) from public, anon;
grant execute on function maison_domino_private.is_room_member(text) to authenticated;
create policy maison_domino_receive on realtime.messages for select to authenticated
using (extension = 'broadcast' and maison_domino_private.is_room_member((select realtime.topic())));

create function maison_domino_private.notify_change() returns trigger
language plpgsql security definer set search_path='' as $$
declare c text;
begin
  if tg_table_name='players' then
    if tg_op='DELETE' then c:=old.room; else c:=new.room; end if;
  else
    if tg_op='DELETE' then c:=old.code; else c:=new.code; end if;
  end if;
  perform realtime.send('{}'::jsonb,'changed','maison-domino:'||c,true);
  return null;
end $$;
revoke all on function maison_domino_private.notify_change() from public, anon, authenticated;
create trigger maison_domino_rooms_changed after insert or update or delete on maison_domino_private.rooms for each row execute function maison_domino_private.notify_change();
create trigger maison_domino_players_changed after insert or update or delete on maison_domino_private.players for each row execute function maison_domino_private.notify_change();

-- Starting a finished room deals a new round, retaining accumulated scores.
create or replace function maison_domino_private.start_game(p_code text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r maison_domino_private.rooms; n integer; per_player integer; deck jsonb; t jsonb; i integer; owner_seat integer; open_id text;
begin
  select * into r from maison_domino_private.rooms where code=p_code for update;
  if auth.uid() is null or not found or r.host <> auth.uid() then raise exception 'Seul le créateur peut lancer la partie'; end if;
  if r.status not in ('waiting','finished') then raise exception 'Partie déjà commencée'; end if;
  select count(*) into n from maison_domino_private.players where room=p_code;
  if n < 2 then raise exception 'Il faut au moins deux joueurs'; end if;
  update maison_domino_private.players set hand='[]'::jsonb where room=p_code;
  per_player := case n when 2 then 7 when 3 then 6 else 7 end;
  select jsonb_agg(jsonb_build_object('id',a||'-'||b,'a',a,'b',b) order by random()) into deck
  from generate_series(0,6) a cross join lateral generate_series(a,6) b;
  for i in 0..(n*per_player-1) loop
    t:=deck->i;
    update maison_domino_private.players set hand=hand||jsonb_build_array(t) where room=p_code and seat=(i % n);
  end loop;
  select p.seat, tile->>'id' into owner_seat,open_id from maison_domino_private.players p
  cross join lateral jsonb_array_elements(p.hand) tile where p.room=p_code
  order by ((tile->>'a')::int=(tile->>'b')::int) desc, ((tile->>'a')::int+(tile->>'b')::int) desc limit 1;
  update maison_domino_private.rooms set status='playing',chain='[]',passes=0,turn=owner_seat,opening=open_id,message='La manche commence !' where code=p_code;
  return maison_domino_private.snapshot(p_code);
end $$;

-- Explicit departure ends an active round; remaining seats are compacted under the room lock.
create function maison_domino_private.leave_room(p_code text) returns boolean
language plpgsql security definer set search_path='' as $$
declare r maison_domino_private.rooms; p maison_domino_private.players; q record; next_host uuid;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  select * into r from maison_domino_private.rooms where code=p_code for update;
  select * into p from maison_domino_private.players where room=p_code and uid=auth.uid();
  if p.uid is null then raise exception 'Accès au salon refusé'; end if;
  delete from maison_domino_private.players where room=p_code and uid=auth.uid();
  for q in select uid,seat from maison_domino_private.players where room=p_code and seat>p.seat order by seat loop
    update maison_domino_private.players set seat=q.seat-1 where room=p_code and uid=q.uid;
  end loop;
  select uid into next_host from maison_domino_private.players where room=p_code order by seat limit 1;
  if next_host is null then delete from maison_domino_private.rooms where code=p_code;
  else
    update maison_domino_private.rooms set host=case when host=auth.uid() then next_host else host end,
      status=case when status='playing' then 'finished' else status end,
      message=p.name||' a quitté le salon.'||case when status='playing' then ' La manche est annulée.' else '' end,
      turn=case when status='playing' then null else turn end where code=p_code;
  end if;
  return true;
end $$;
revoke all on function maison_domino_private.leave_room(text) from public, anon;
grant execute on function maison_domino_private.leave_room(text) to authenticated;
create function public.domino_leave(p_code text) returns boolean language sql security invoker set search_path='' as $$ select maison_domino_private.leave_room(p_code) $$;
revoke all on function public.domino_leave(text) from public, anon;
grant execute on function public.domino_leave(text) to authenticated;
