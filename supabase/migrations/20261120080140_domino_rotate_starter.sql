-- The highest double opens only the first round of a room. Later rounds rotate
-- the starting player in seat order; that player opens with their best tile.
create or replace function maison_domino_private.start_game(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r maison_domino_private.rooms; n integer; per_player integer; deck jsonb; t jsonb; i integer; owner_seat integer; open_id text; starter_seat integer;
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
  if r.last_starter is null then
    select p.seat,tile->>'id' into owner_seat,open_id
      from maison_domino_private.players p cross join lateral jsonb_array_elements(p.hand) tile
      where p.room=p_code
      order by ((tile->>'a')::int=(tile->>'b')::int) desc,((tile->>'a')::int+(tile->>'b')::int) desc,p.seat,tile->>'id' limit 1;
    starter_seat:=owner_seat;
  else
    starter_seat:=(r.last_starter+1)%n;
    select tile->>'id' into open_id
      from maison_domino_private.players p cross join lateral jsonb_array_elements(p.hand) tile
      where p.room=p_code and p.seat=starter_seat
      order by ((tile->>'a')::int=(tile->>'b')::int) desc,((tile->>'a')::int+(tile->>'b')::int) desc,tile->>'id' limit 1;
    owner_seat:=starter_seat;
  end if;
  if open_id is null then raise exception 'Aucun domino disponible pour commencer'; end if;
  update maison_domino_private.rooms set status='playing',chain='[]',passes=0,turn=owner_seat,opening=open_id,
    last_starter=owner_seat,message='La manche commence !' where code=p_code;
  perform kopaka_presence_private.start_turn('domino',p_code,
    (select uid from maison_domino_private.players where room=p_code and seat=owner_seat),10,true);
  return maison_domino_private.snapshot(p_code);
end $$;

create or replace function maison_domino_private.auto_start_when_full() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r maison_domino_private.rooms; n integer; per_player integer; deck jsonb; t jsonb; i integer; owner_seat integer; open_id text; starter_seat integer;
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
  if r.last_starter is null then
    select p.seat,tile->>'id' into owner_seat,open_id
      from maison_domino_private.players p cross join lateral jsonb_array_elements(p.hand) tile
      where p.room=new.room
      order by ((tile->>'a')::int=(tile->>'b')::int) desc,((tile->>'a')::int+(tile->>'b')::int) desc,p.seat,tile->>'id' limit 1;
  else
    owner_seat:=(r.last_starter+1)%n;
    select tile->>'id' into open_id
      from maison_domino_private.players p cross join lateral jsonb_array_elements(p.hand) tile
      where p.room=new.room and p.seat=owner_seat
      order by ((tile->>'a')::int=(tile->>'b')::int) desc,((tile->>'a')::int+(tile->>'b')::int) desc,tile->>'id' limit 1;
  end if;
  if open_id is null then raise exception 'Aucun domino disponible pour commencer'; end if;
  update maison_domino_private.rooms set status='playing',chain='[]',passes=0,turn=owner_seat,opening=open_id,
    last_starter=owner_seat,message='La manche commence !' where code=new.room;
  perform kopaka_presence_private.start_turn('domino',new.room,
    (select uid from maison_domino_private.players where room=new.room and seat=owner_seat),10,true);
  return null;
end $$;
