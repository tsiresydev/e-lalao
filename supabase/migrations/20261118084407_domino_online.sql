-- Game state is deliberately kept outside the exposed API schema.
create schema if not exists maison_domino_private;
revoke all on schema maison_domino_private from public, anon, authenticated;
grant usage on schema maison_domino_private to authenticated;

create table maison_domino_private.rooms (
  code text primary key,
  host uuid not null,
  status text not null default 'waiting' check (status in ('waiting','playing','finished')),
  chain jsonb not null default '[]',
  turn integer,
  passes integer not null default 0,
  opening text,
  message text not null default 'En attente des joueurs.',
  created_at timestamptz not null default now()
);
create table maison_domino_private.players (
  room text not null references maison_domino_private.rooms(code) on delete cascade,
  uid uuid not null,
  name text not null check (char_length(name) between 1 and 20),
  seat integer not null check (seat between 0 and 3),
  hand jsonb not null default '[]',
  score integer not null default 0,
  primary key(room, uid), unique(room,seat)
);
alter table maison_domino_private.rooms enable row level security;
alter table maison_domino_private.players enable row level security;
revoke all on all tables in schema maison_domino_private from public, anon, authenticated;

create function maison_domino_private.snapshot(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r maison_domino_private.rooms; result jsonb;
begin
  if auth.uid() is null or not exists (select 1 from maison_domino_private.players where room=p_code and uid=auth.uid()) then
    raise exception 'AccÃ¨s au salon refusÃ©';
  end if;
  select * into r from maison_domino_private.rooms where code=p_code;
  select jsonb_build_object('code',r.code,'host',r.host,'status',r.status,'chain',r.chain,'turn',r.turn,
    'opening',r.opening,'message',r.message,'me',auth.uid(),
    'players',coalesce(jsonb_agg(jsonb_build_object('uid',p.uid,'name',p.name,'seat',p.seat,
      'count',jsonb_array_length(p.hand),'score',p.score,
      'hand',case when p.uid=auth.uid() then p.hand else null end) order by p.seat),'[]'::jsonb))
  into result from maison_domino_private.players p where p.room=p_code;
  return result;
end $$;

create function maison_domino_private.create_room(p_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c text; tries integer := 0;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  p_name := trim(p_name);
  if p_name is null or char_length(p_name) not between 1 and 20 then raise exception 'Pseudo invalide (1 Ã  20 caractÃ¨res)'; end if;
  loop
    c := upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
    begin
      insert into maison_domino_private.rooms(code,host) values(c,auth.uid());
      exit;
    exception when unique_violation then
      tries := tries + 1; if tries >= 5 then raise; end if;
    end;
  end loop;
  insert into maison_domino_private.players(room,uid,name,seat) values(c,auth.uid(),p_name,0);
  return maison_domino_private.snapshot(c);
end $$;

create function maison_domino_private.join_room(p_code text,p_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r maison_domino_private.rooms; n integer;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  p_code := upper(trim(p_code)); p_name := trim(p_name);
  if p_name is null or char_length(p_name) not between 1 and 20 then raise exception 'Pseudo invalide (1 Ã  20 caractÃ¨res)'; end if;
  select * into r from maison_domino_private.rooms where code=p_code for update;
  if not found then raise exception 'Salon introuvable'; end if;
  if exists (select 1 from maison_domino_private.players where room=p_code and uid=auth.uid()) then return maison_domino_private.snapshot(p_code); end if;
  if r.status <> 'waiting' then raise exception 'Cette partie a dÃ©jÃ  commencÃ©'; end if;
  select count(*) into n from maison_domino_private.players where room=p_code;
  if n >= 4 then raise exception 'Ce salon est complet'; end if;
  insert into maison_domino_private.players(room,uid,name,seat) values(p_code,auth.uid(),p_name,n);
  return maison_domino_private.snapshot(p_code);
end $$;

create function maison_domino_private.start_game(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r maison_domino_private.rooms; n integer; per_player integer; deck jsonb; t jsonb; i integer; owner_seat integer; open_id text;
begin
  select * into r from maison_domino_private.rooms where code=p_code for update;
  if auth.uid() is null or not found or r.host <> auth.uid() then raise exception 'Seul le crÃ©ateur peut lancer la partie'; end if;
  if r.status <> 'waiting' then raise exception 'Partie dÃ©jÃ  commencÃ©e'; end if;
  select count(*) into n from maison_domino_private.players where room=p_code;
  if n < 2 then raise exception 'Il faut au moins deux joueurs'; end if;
  per_player := case n when 2 then 7 when 3 then 6 else 7 end;
  select jsonb_agg(jsonb_build_object('id',a||'-'||b,'a',a,'b',b) order by random()) into deck
  from generate_series(0,6) a cross join lateral generate_series(a,6) b;
  for i in 0..(n*per_player-1) loop
    t := deck->i;
    update maison_domino_private.players set hand=hand || jsonb_build_array(t) where room=p_code and seat=(i % n);
  end loop;
  select p.seat, tile->>'id' into owner_seat,open_id
  from maison_domino_private.players p cross join lateral jsonb_array_elements(p.hand) tile
  where p.room=p_code
  order by ((tile->>'a')::int=(tile->>'b')::int) desc, ((tile->>'a')::int+(tile->>'b')::int) desc limit 1;
  update maison_domino_private.rooms set status='playing',turn=owner_seat,opening=open_id,message='La partie commence !' where code=p_code;
  return maison_domino_private.snapshot(p_code);
end $$;

create function maison_domino_private.move(p_code text,p_tile text,p_side text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r maison_domino_private.rooms; p maison_domino_private.players; t jsonb; placed jsonb; l integer; rr integer; a integer; b integer; n integer; total integer; min_total integer; winner_seat integer; ties integer;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  select * into r from maison_domino_private.rooms where code=p_code for update;
  select * into p from maison_domino_private.players where room=p_code and uid=auth.uid();
  if p.uid is null or r.status <> 'playing' or p.seat <> r.turn then raise exception 'Ce nâ€™est pas votre tour'; end if;
  select count(*) into n from maison_domino_private.players where room=p_code;
  if jsonb_array_length(r.chain)>0 then l := (r.chain->0->>'left')::integer; rr := (r.chain->-1->>'right')::integer; end if;
  if p_tile is null then
    if exists(select 1 from jsonb_array_elements(p.hand) x where (x->>'a')::int in (l,rr) or (x->>'b')::int in (l,rr)) or jsonb_array_length(r.chain)=0 then
      raise exception 'Vous pouvez encore jouer';
    end if;
    r.passes := r.passes + 1;
    r.message := p.name || ' passe son tour.';
    if r.passes >= n then
      select min(points) into min_total from (select coalesce(sum((t->>'a')::int+(t->>'b')::int),0) points from maison_domino_private.players q left join lateral jsonb_array_elements(q.hand) t on true where q.room=p_code group by q.seat) totals;
      select count(*),min(seat) into ties,winner_seat from (select q.seat,coalesce(sum((t->>'a')::int+(t->>'b')::int),0) points from maison_domino_private.players q left join lateral jsonb_array_elements(q.hand) t on true where q.room=p_code group by q.seat) totals where points=min_total;
      if ties=1 then
        select coalesce(sum((t->>'a')::int+(t->>'b')::int),0) into total from maison_domino_private.players q cross join lateral jsonb_array_elements(q.hand) t where q.room=p_code and q.seat<>winner_seat;
        update maison_domino_private.players set score=score+total where room=p_code and seat=winner_seat;
        select 'Partie bloquÃ©e : '||name||' remporte la manche.' into r.message from maison_domino_private.players where room=p_code and seat=winner_seat;
      else r.message := 'Partie bloquÃ©e : Ã©galitÃ©.'; end if;
      r.status := 'finished';
    end if;
  else
    if p_side not in ('left','right') or p_side is null then raise exception 'CÃ´tÃ© invalide'; end if;
    select x into t from jsonb_array_elements(p.hand) x where x->>'id'=p_tile;
    if t is null then raise exception 'Domino absent de votre main'; end if;
    a := (t->>'a')::int; b := (t->>'b')::int;
    if jsonb_array_length(r.chain)=0 then
      if p_tile<>r.opening then raise exception 'Vous devez poser le domino dâ€™ouverture'; end if;
      placed := t || jsonb_build_object('left',a,'right',b);
    elsif p_side='left' and (a=l or b=l) then
      placed := t || jsonb_build_object('left',case when a=l then b else a end,'right',l);
    elsif p_side='right' and (a=rr or b=rr) then
      placed := t || jsonb_build_object('left',rr,'right',case when a=rr then b else a end);
    else raise exception 'Ce domino ne correspond pas Ã  cette extrÃ©mitÃ©'; end if;
    if p_side='left' then r.chain:=jsonb_build_array(placed)||r.chain; else r.chain:=r.chain||jsonb_build_array(placed); end if;
    select coalesce(jsonb_agg(x),'[]'::jsonb) into p.hand from jsonb_array_elements(p.hand) x where x->>'id'<>p_tile;
    update maison_domino_private.players set hand=p.hand where room=p_code and uid=auth.uid();
    r.passes:=0; r.message:=p.name||' a jouÃ© '||a||' Â· '||b||'.';
    if jsonb_array_length(p.hand)=0 then
      select coalesce(sum((x->>'a')::int+(x->>'b')::int),0) into total from maison_domino_private.players q cross join lateral jsonb_array_elements(q.hand) x where q.room=p_code and q.uid<>auth.uid();
      update maison_domino_private.players set score=score+total where room=p_code and uid=auth.uid();
      r.status:='finished'; r.message:=p.name||' remporte la manche !';
    end if;
  end if;
  if r.status='playing' then r.turn:=(r.turn+1)%n; end if;
  update maison_domino_private.rooms set chain=r.chain,passes=r.passes,status=r.status,turn=r.turn,message=r.message where code=p_code;
  return maison_domino_private.snapshot(p_code);
end $$;

revoke all on all functions in schema maison_domino_private from public, anon, authenticated;
grant execute on function maison_domino_private.snapshot(text), maison_domino_private.create_room(text), maison_domino_private.join_room(text,text), maison_domino_private.start_game(text), maison_domino_private.move(text,text,text) to authenticated;
-- Invoker wrappers expose only the guarded functions, never the underlying tables.
create function public.domino_create(p_name text) returns jsonb language sql security invoker set search_path='' as $$ select maison_domino_private.create_room(p_name) $$;
create function public.domino_join(p_code text,p_name text) returns jsonb language sql security invoker set search_path='' as $$ select maison_domino_private.join_room(p_code,p_name) $$;
create function public.domino_state(p_code text) returns jsonb language sql security invoker set search_path='' as $$ select maison_domino_private.snapshot(p_code) $$;
create function public.domino_start(p_code text) returns jsonb language sql security invoker set search_path='' as $$ select maison_domino_private.start_game(p_code) $$;
create function public.domino_move(p_code text,p_tile text,p_side text) returns jsonb language sql security invoker set search_path='' as $$ select maison_domino_private.move(p_code,p_tile,p_side) $$;
revoke all on function public.domino_create(text),public.domino_join(text,text),public.domino_state(text),public.domino_start(text),public.domino_move(text,text,text) from public, anon;
grant execute on function public.domino_create(text),public.domino_join(text,text),public.domino_state(text),public.domino_start(text),public.domino_move(text,text,text) to authenticated;
