-- Domino turn clock: reading state starts the current player's timer, and every
-- mutation first claims that timer. Expired turns advance the room under lock.
alter table maison_domino_private.rooms add column if not exists last_starter integer;
create or replace function maison_domino_private.snapshot(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r maison_domino_private.rooms; result jsonb;
begin
  if auth.uid() is null or not exists (select 1 from maison_domino_private.players where room=p_code and uid=auth.uid()) then
    raise exception 'Accès au salon refusé';
  end if;
  select * into r from maison_domino_private.rooms where code=p_code for update;
  if r.status='playing' and r.turn is not null then
    perform kopaka_presence_private.start_turn('domino',p_code,
      (select uid from maison_domino_private.players where room=p_code and seat=r.turn));
  end if;
  select jsonb_build_object('code',r.code,'host',r.host,'status',r.status,'chain',r.chain,'turn',r.turn,
    'opening',case when r.last_starter is null then r.opening else null end,
    'message',r.message,'me',auth.uid(),'target_score',r.target_score,'player_limit',r.player_limit,
    'champion_name',r.champion_name,'round_finished_at',r.round_finished_at,
    'turn_deadline',(select deadline from kopaka_presence_private.turn_clock where game='domino' and room=p_code and is_active),
    'players',coalesce(jsonb_agg(jsonb_build_object('uid',p.uid,'name',p.name,'seat',p.seat,
      'count',jsonb_array_length(p.hand),'score',p.score,
      'hand',case when p.uid=auth.uid() then p.hand else null end) order by p.seat),'[]'::jsonb))
  into result from maison_domino_private.players p where p.room=p_code;
  return result;
end $$;

create or replace function maison_domino_private.move(p_code text,p_tile text,p_side text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r maison_domino_private.rooms; p maison_domino_private.players; t jsonb; placed jsonb; l integer; rr integer; a integer; b integer; n integer; total integer; min_total integer; winner_seat integer; ties integer;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  select * into r from maison_domino_private.rooms where code=p_code for update;
  select * into p from maison_domino_private.players where room=p_code and uid=auth.uid();
  if p.uid is null or r.status <> 'playing' or p.seat <> r.turn then raise exception 'Ce n’est pas votre tour'; end if;
  if not kopaka_presence_private.claim_turn('domino',p_code,auth.uid()) then
    r.passes := r.passes + 1;
    r.message := p.name || ' a dépassé le temps imparti.';
    select count(*) into n from maison_domino_private.players where room=p_code;
    if r.passes >= n then
      select min(points) into min_total from (select coalesce(sum((t->>'a')::int+(t->>'b')::int),0) points from maison_domino_private.players q left join lateral jsonb_array_elements(q.hand) t on true where q.room=p_code group by q.seat) totals;
      select count(*),min(seat) into ties,winner_seat from (select q.seat,coalesce(sum((t->>'a')::int+(t->>'b')::int),0) points from maison_domino_private.players q left join lateral jsonb_array_elements(q.hand) t on true where q.room=p_code group by q.seat) totals where points=min_total;
      if ties=1 then
        select coalesce(sum((t->>'a')::int+(t->>'b')::int),0) into total from maison_domino_private.players q cross join lateral jsonb_array_elements(q.hand) t where q.room=p_code and q.seat<>winner_seat;
        update maison_domino_private.players set score=score+total where room=p_code and seat=winner_seat;
        select 'Partie bloquée : '||name||' remporte la manche.' into r.message from maison_domino_private.players where room=p_code and seat=winner_seat;
      else r.message := 'Partie bloquée : égalité.'; end if;
      r.status := 'finished';
    end if;
    if r.status='playing' then r.turn:=(r.turn+1)%n; end if;
    update maison_domino_private.rooms set chain=r.chain,passes=r.passes,status=r.status,turn=r.turn,message=r.message where code=p_code;
    return maison_domino_private.snapshot(p_code);
  end if;
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
        select 'Partie bloquée : '||name||' remporte la manche.' into r.message from maison_domino_private.players where room=p_code and seat=winner_seat;
      else r.message := 'Partie bloquée : égalité.'; end if;
      r.status := 'finished';
    end if;
  else
    if p_side not in ('left','right') or p_side is null then raise exception 'Côté invalide'; end if;
    select x into t from jsonb_array_elements(p.hand) x where x->>'id'=p_tile;
    if t is null then raise exception 'Domino absent de votre main'; end if;
    a := (t->>'a')::int; b := (t->>'b')::int;
    if jsonb_array_length(r.chain)=0 then
      if r.last_starter is null and p_tile<>r.opening then raise exception 'Vous devez poser le domino d’ouverture'; end if;
      placed := t || jsonb_build_object('left',a,'right',b);
    elsif p_side='left' and (a=l or b=l) then
      placed := t || jsonb_build_object('left',case when a=l then b else a end,'right',l);
    elsif p_side='right' and (a=rr or b=rr) then
      placed := t || jsonb_build_object('left',rr,'right',case when a=rr then b else a end);
    else raise exception 'Ce domino ne correspond pas à cette extrémité'; end if;
    if p_side='left' then r.chain:=jsonb_build_array(placed)||r.chain; else r.chain:=r.chain||jsonb_build_array(placed); end if;
    select coalesce(jsonb_agg(x),'[]'::jsonb) into p.hand from jsonb_array_elements(p.hand) x where x->>'id'<>p_tile;
    update maison_domino_private.players set hand=p.hand where room=p_code and uid=auth.uid();
    r.passes:=0; r.message:=p.name||' a joué '||a||' · '||b||'.';
    if jsonb_array_length(p.hand)=0 then
      select coalesce(sum((x->>'a')::int+(x->>'b')::int),0) into total from maison_domino_private.players q cross join lateral jsonb_array_elements(q.hand) x where q.room=p_code and q.uid<>auth.uid();
      update maison_domino_private.players set score=score+total where room=p_code and uid=auth.uid();
      r.status:='finished'; r.message:=p.name||' remporte la manche !';
    end if;
  end if;
  if r.status='playing' then r.turn:=(r.turn+1)%n; end if;
  update maison_domino_private.rooms set chain=r.chain,passes=r.passes,status=r.status,turn=r.turn,message=r.message where code=p_code;
  if r.status='playing' and r.turn is not null then
    perform kopaka_presence_private.start_turn('domino',p_code,
      (select uid from maison_domino_private.players where room=p_code and seat=r.turn),10,true);
  end if;
  return maison_domino_private.snapshot(p_code);
end $$;

create or replace function maison_domino_private.apply_expired_turn(
  p_code text,
  p_uid uuid,
  p_misses integer
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r maison_domino_private.rooms; p maison_domino_private.players;
begin
  if p_misses < 3 then
    select * into r from maison_domino_private.rooms where code=p_code for update;
    if not found or r.status<>'playing' then return maison_domino_private.snapshot(p_code); end if;
    select * into p from maison_domino_private.players where room=p_code and uid=p_uid;
    if p.uid is null or p.seat<>r.turn then return maison_domino_private.snapshot(p_code); end if;
    r.passes:=r.passes+1;
    if r.passes >= (select count(*) from maison_domino_private.players where room=p_code) then
      r.status:='finished';
    else
      r.turn:=(r.turn+1)%(select count(*) from maison_domino_private.players where room=p_code);
    end if;
    r.message:=p.name||' a dépassé le temps imparti.';
    update maison_domino_private.rooms set passes=r.passes,turn=r.turn,status=r.status,message=r.message where code=p_code;
    if r.status='playing' and r.turn is not null then
      perform kopaka_presence_private.start_turn('domino',p_code,
        (select uid from maison_domino_private.players where room=p_code and seat=r.turn),10,true);
    end if;
    return maison_domino_private.snapshot(p_code);
  end if;
  perform maison_domino_private.eliminate_player(p_code,p_uid);
  return maison_domino_private.snapshot(p_code);
end $$;
revoke all on function maison_domino_private.apply_expired_turn(text,uuid,integer) from public, anon, authenticated;

create or replace function public.domino_expire(p_code text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare expired record; result jsonb;
begin
  for expired in select * from kopaka_presence_private.expire_turns('domino',p_code) loop
    result:=maison_domino_private.apply_expired_turn(p_code,expired.expired_uid,expired.misses);
  end loop;
  return coalesce(result,maison_domino_private.snapshot(p_code));
end $$;
revoke all on function public.domino_expire(text) from public, anon;
grant execute on function public.domino_expire(text) to authenticated;
