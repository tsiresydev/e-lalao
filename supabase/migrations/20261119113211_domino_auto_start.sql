-- Existing salons retain manual start; new salons specify their capacity.
alter table maison_domino_private.rooms add column player_limit integer check (player_limit between 2 and 4);

create or replace function maison_domino_private.snapshot(p_code text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r maison_domino_private.rooms; result jsonb;
begin
  if auth.uid() is null or not exists(select 1 from maison_domino_private.players p where p.room=p_code and p.uid=auth.uid()) then raise exception 'Accès au salon refusé'; end if;
  select * into r from maison_domino_private.rooms where code=p_code;
  select jsonb_build_object('code',r.code,'host',r.host,'status',r.status,'chain',r.chain,'turn',r.turn,
    'opening',r.opening,'message',r.message,'me',auth.uid(),'target_score',r.target_score,'champion_name',r.champion_name,'round_finished_at',r.round_finished_at,'player_limit',r.player_limit,
    'players',coalesce(jsonb_agg(jsonb_build_object('uid',p.uid,'name',p.name,'seat',p.seat,
      'count',jsonb_array_length(p.hand),'score',p.score,'hand',case when p.uid=auth.uid() then p.hand else null end) order by p.seat),'[]'::jsonb))
  into result from maison_domino_private.players p where p.room=p_code;
  return result;
end $$;

create function maison_domino_private.create_with_limit(p_name text,p_target integer,p_player_limit integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; c text;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  if p_player_limit is null or p_player_limit not between 2 and 4 then raise exception 'Choisissez 2, 3 ou 4 joueurs'; end if;
  result:=maison_domino_private.create_configured(p_name,p_target);
  c:=result->>'code';
  update maison_domino_private.rooms set player_limit=p_player_limit where code=c and host=auth.uid();
  return maison_domino_private.snapshot(c);
end $$;
revoke all on function maison_domino_private.create_with_limit(text,integer,integer) from public,anon,authenticated;
grant execute on function maison_domino_private.create_with_limit(text,integer,integer) to authenticated;
create function public.domino_create_with_limit(p_name text,p_target integer,p_player_limit integer) returns jsonb
language sql security invoker set search_path='' as $$ select maison_domino_private.create_with_limit(p_name,p_target,p_player_limit) $$;
revoke all on function public.domino_create_with_limit(text,integer,integer) from public,anon;
grant execute on function public.domino_create_with_limit(text,integer,integer) to authenticated;

create function maison_domino_private.auto_start_when_full() returns trigger
language plpgsql security definer set search_path='' as $$
declare r maison_domino_private.rooms; n integer; per_player integer; deck jsonb; t jsonb; i integer; owner_seat integer; open_id text;
begin
  select * into r from maison_domino_private.rooms where code=new.room for update;
  if r.status<>'waiting' or r.player_limit is null then return null; end if;
  select count(*) into n from maison_domino_private.players where room=new.room;
  if n>r.player_limit then raise exception 'Salon complet'; end if;
  if n<r.player_limit then return null; end if;
  update maison_domino_private.players set hand='[]'::jsonb where room=new.room;
  per_player:=case n when 2 then 7 when 3 then 6 else 7 end;
  select jsonb_agg(jsonb_build_object('id',a||'-'||b,'a',a,'b',b) order by random()) into deck from generate_series(0,6) a cross join lateral generate_series(a,6) b;
  for i in 0..(n*per_player-1) loop
    t:=deck->i;
    update maison_domino_private.players set hand=hand||jsonb_build_array(t) where room=new.room and seat=(i % n);
  end loop;
  select p.seat,tile->>'id' into owner_seat,open_id from maison_domino_private.players p cross join lateral jsonb_array_elements(p.hand) tile where p.room=new.room order by ((tile->>'a')::int=(tile->>'b')::int) desc,((tile->>'a')::int+(tile->>'b')::int) desc limit 1;
  update maison_domino_private.rooms set status='playing',chain='[]',passes=0,turn=owner_seat,opening=open_id,message='La manche commence !' where code=new.room;
  return null;
end $$;
revoke all on function maison_domino_private.auto_start_when_full() from public,anon,authenticated;
create trigger domino_auto_start_when_full after insert on maison_domino_private.players for each row execute function maison_domino_private.auto_start_when_full();

create function maison_domino_private.enforce_start_count() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if old.status='waiting' and new.status='playing' and new.player_limit is not null and
     (select count(*) from maison_domino_private.players where room=new.code)<>new.player_limit then
    raise exception 'Attendez que tous les joueurs aient rejoint le salon';
  end if;
  return new;
end $$;
revoke all on function maison_domino_private.enforce_start_count() from public,anon,authenticated;
create trigger domino_enforce_start_count before update of status on maison_domino_private.rooms for each row execute function maison_domino_private.enforce_start_count();
