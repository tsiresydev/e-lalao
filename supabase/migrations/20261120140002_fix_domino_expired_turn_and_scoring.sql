create or replace function maison_domino_private.move(p_code text,p_tile text,p_side text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r maison_domino_private.rooms; p maison_domino_private.players; t jsonb; placed jsonb; l integer; rr integer; a integer; b integer; n integer; total integer; min_total integer; winner_seat integer; ties integer;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  select * into r from maison_domino_private.rooms where code=p_code for update;
  select * into p from maison_domino_private.players where room=p_code and uid=auth.uid();
  if p.uid is null or r.status <> 'playing' or p.seat <> r.turn then raise exception 'Ce n’est pas votre tour'; end if;
  if not kopaka_presence_private.claim_turn('domino',p_code,auth.uid()) then
    -- Process the expired clock through the authoritative timer path.
    return public.domino_expire(p_code);
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
      select min(points) into min_total from (select coalesce(sum((tile.value->>'a')::int+(tile.value->>'b')::int),0) points from maison_domino_private.players q left join lateral jsonb_array_elements(q.hand) as tile(value) on true where q.room=p_code group by q.seat) totals;
      select count(*),min(seat) into ties,winner_seat from (select q.seat,coalesce(sum((tile.value->>'a')::int+(tile.value->>'b')::int),0) points from maison_domino_private.players q left join lateral jsonb_array_elements(q.hand) as tile(value) on true where q.room=p_code group by q.seat) totals where points=min_total;
      if ties=1 then
        select coalesce(sum((tile.value->>'a')::int+(tile.value->>'b')::int),0) into total from maison_domino_private.players q cross join lateral jsonb_array_elements(q.hand) as tile(value) where q.room=p_code and q.seat<>winner_seat;
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

