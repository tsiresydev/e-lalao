alter table maison_domino_private.rooms add column round_finished_at timestamptz;
update maison_domino_private.rooms set round_finished_at=clock_timestamp() where status='finished';

create function maison_domino_private.set_round_finished_at() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.status='finished' and old.status is distinct from 'finished' then new.round_finished_at:=clock_timestamp();
  elsif new.status='playing' then new.round_finished_at:=null;
  end if;
  return new;
end $$;

create function maison_domino_private.auto_next_round(p_code text,p_finished_at timestamptz) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r maison_domino_private.rooms; n integer;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  select * into r from maison_domino_private.rooms where code=p_code for update;
  if not found or not exists(select 1 from maison_domino_private.players where room=p_code and uid=auth.uid()) then raise exception 'Acces refuse'; end if;
  select count(*) into n from maison_domino_private.players where room=p_code;
  if r.status='finished' and r.champion_name is null and n>=2 and r.round_finished_at=p_finished_at and clock_timestamp()>=r.round_finished_at+interval '5 seconds' then
    return maison_domino_private.start_game(p_code);
  end if;
  return maison_domino_private.snapshot(p_code);
end $$;
revoke all on function maison_domino_private.auto_next_round(text,timestamptz) from public, anon;
grant execute on function maison_domino_private.auto_next_round(text,timestamptz) to authenticated;
create function public.domino_auto_next(p_code text,p_finished_at timestamptz) returns jsonb language sql security invoker set search_path='' as $$ select maison_domino_private.auto_next_round(p_code,p_finished_at) $$;
revoke all on function public.domino_auto_next(text,timestamptz) from public, anon;
grant execute on function public.domino_auto_next(text,timestamptz) to authenticated;
revoke all on function maison_domino_private.set_round_finished_at() from public, anon, authenticated;
create trigger maison_domino_round_finished before update of status on maison_domino_private.rooms for each row execute function maison_domino_private.set_round_finished_at();

create or replace function maison_domino_private.snapshot(p_code text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r maison_domino_private.rooms; result jsonb;
begin
  if auth.uid() is null or not exists(select 1 from maison_domino_private.players where room=p_code and uid=auth.uid()) then raise exception 'Accès au salon refusé'; end if;
  select * into r from maison_domino_private.rooms where code=p_code;
  select jsonb_build_object('code',r.code,'host',r.host,'status',r.status,'chain',r.chain,'turn',r.turn,
    'opening',r.opening,'message',r.message,'me',auth.uid(),'target_score',r.target_score,'champion_name',r.champion_name,'round_finished_at',r.round_finished_at,
    'players',coalesce(jsonb_agg(jsonb_build_object('uid',p.uid,'name',p.name,'seat',p.seat,
      'count',jsonb_array_length(p.hand),'score',p.score,
      'hand',case when p.uid=auth.uid() then p.hand else null end) order by p.seat),'[]'::jsonb))
  into result from maison_domino_private.players p where p.room=p_code;
  return result;
end $$;

create or replace function maison_domino_private.start_game(p_code text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r maison_domino_private.rooms; n integer; per_player integer; deck jsonb; t jsonb; i integer; owner_seat integer; open_id text;
begin
  select * into r from maison_domino_private.rooms where code=p_code for update;
  if auth.uid() is null or not found or not exists(select 1 from maison_domino_private.players where room=p_code and uid=auth.uid()) then raise exception 'Acces refuse'; end if;
  if r.status='waiting' and r.host<>auth.uid() then raise exception 'Seul le createur peut lancer la partie'; end if;
  if r.status='finished' and (r.round_finished_at is null or clock_timestamp()<r.round_finished_at+interval '5 seconds') then raise exception 'La prochaine manche commence dans 5 secondes'; end if;
  if r.status not in ('waiting','finished') then raise exception 'Partie déjà commencée'; end if;
  if r.champion_name is not null or exists(select 1 from maison_domino_private.players where room=p_code and score>=r.target_score) then raise exception 'Le score cible est atteint : la partie est terminée'; end if;
  select count(*) into n from maison_domino_private.players where room=p_code;
  if n<2 then raise exception 'Il faut au moins deux joueurs'; end if;
  update maison_domino_private.players set hand='[]'::jsonb where room=p_code;
  per_player:=case n when 2 then 7 when 3 then 6 else 7 end;
  select jsonb_agg(jsonb_build_object('id',a||'-'||b,'a',a,'b',b) order by random()) into deck from generate_series(0,6) a cross join lateral generate_series(a,6) b;
  for i in 0..(n*per_player-1) loop
    t:=deck->i;
    update maison_domino_private.players set hand=hand||jsonb_build_array(t) where room=p_code and seat=(i % n);
  end loop;
  select p.seat,tile->>'id' into owner_seat,open_id from maison_domino_private.players p cross join lateral jsonb_array_elements(p.hand) tile where p.room=p_code order by ((tile->>'a')::int=(tile->>'b')::int) desc,((tile->>'a')::int+(tile->>'b')::int) desc limit 1;
  update maison_domino_private.rooms set status='playing',chain='[]',passes=0,turn=owner_seat,opening=open_id,message='La manche commence !' where code=p_code;
  return maison_domino_private.snapshot(p_code);
end $$;
