-- Internal building block for a future server-side forfeiture worker.
-- This function does not decide whether the two-minute deadline has elapsed.
create or replace function maison_domino_private.eliminate_player(p_code text, p_uid uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  r maison_domino_private.rooms;
  leaving maison_domino_private.players;
  next_player uuid;
  next_host uuid;
  survivor_count integer;
  remaining_player maison_domino_private.players;
  q record;
  new_opening text;
  opening_seat integer;
begin
  select * into r from maison_domino_private.rooms where code=p_code for update;
  if not found or r.status <> 'playing' then raise exception 'Partie active introuvable'; end if;
  select * into leaving from maison_domino_private.players where room=p_code and uid=p_uid;
  if not found then raise exception 'Joueur introuvable'; end if;

  -- Preserve the identity of the player whose turn it is, or select the
  -- following player in the old order if the eliminated player had the turn.
  if r.turn=leaving.seat then
    select uid into next_player from maison_domino_private.players
      where room=p_code and uid<>p_uid order by (seat<=leaving.seat),seat limit 1;
  else
    select uid into next_player from maison_domino_private.players where room=p_code and seat=r.turn;
  end if;

  delete from maison_domino_private.players where room=p_code and uid=p_uid;
  delete from kopaka_presence_private.presence where game='domino' and room=p_code and uid=p_uid;
  -- Sequential updates avoid collisions with the unique (room, seat) index.
  for q in select uid,seat from maison_domino_private.players where room=p_code and seat>leaving.seat order by seat loop
    update maison_domino_private.players set seat=q.seat-1 where room=p_code and uid=q.uid;
  end loop;
  select count(*) into survivor_count from maison_domino_private.players where room=p_code;
  if survivor_count=0 then
    delete from maison_domino_private.rooms where code=p_code;
    return;
  end if;
  select uid into next_host from maison_domino_private.players where room=p_code order by seat limit 1;
  if survivor_count=1 then
    select * into remaining_player from maison_domino_private.players where room=p_code;
    update maison_domino_private.rooms set host=next_host,status='finished',turn=null,
      champion_name=remaining_player.name,round_finished_at=null,
      message=remaining_player.name||' remporte la partie par forfait.' where code=p_code;
    return;
  end if;

  if jsonb_array_length(r.chain)=0 and r.turn=leaving.seat then
    select p.seat,tile->>'id' into opening_seat,new_opening
      from maison_domino_private.players p cross join lateral jsonb_array_elements(p.hand) tile
      where p.room=p_code and p.uid=next_player
      order by ((tile->>'a')::integer=(tile->>'b')::integer) desc,
        ((tile->>'a')::integer+(tile->>'b')::integer) desc,tile->>'id' limit 1;
    if new_opening is null then raise exception 'Aucun domino disponible pour commencer'; end if;
  else
    select seat into opening_seat from maison_domino_private.players where room=p_code and uid=next_player;
    new_opening:=r.opening;
  end if;
  if opening_seat is null then raise exception 'Tour suivant introuvable'; end if;
  update maison_domino_private.rooms set host=case when host=p_uid then next_host else host end,
    turn=opening_seat,opening=new_opening,passes=0,message=leaving.name||' est éliminé par forfait.' where code=p_code;
end $$;
revoke all on function maison_domino_private.eliminate_player(text, uuid) from public, anon, authenticated;
