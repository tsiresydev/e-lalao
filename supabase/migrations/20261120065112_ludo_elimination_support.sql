-- Internal operation; the caller must establish the forfeiture deadline first.
create function maison_ludo_private.eliminate_player(p_code text, p_uid uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  r maison_ludo_private.rooms;
  leaving maison_ludo_private.players;
  survivor maison_ludo_private.players;
  next_host uuid;
  next_turn integer;
  remaining integer;
begin
  select * into r from maison_ludo_private.rooms where code=p_code for update;
  if not found or r.status <> 'playing' then raise exception 'Partie active introuvable'; end if;
  select * into leaving from maison_ludo_private.players where room=p_code and uid=p_uid;
  if not found then raise exception 'Joueur introuvable'; end if;

  -- Keep the remaining seats unchanged: seat determines pawn colour and track.
  delete from maison_ludo_private.players where room=p_code and uid=p_uid;
  delete from kopaka_presence_private.presence where game='ludo' and room=p_code and uid=p_uid;
  select count(*) into remaining from maison_ludo_private.players where room=p_code;
  if remaining=0 then
    delete from maison_ludo_private.rooms where code=p_code;
    return;
  end if;
  select uid into next_host from maison_ludo_private.players where room=p_code order by seat limit 1;
  if remaining=1 then
    select * into survivor from maison_ludo_private.players where room=p_code;
    update maison_ludo_private.rooms set host=next_host,status='finished',turn=null,die=null,sixes=0,
      winner=survivor.seat,message=survivor.name||' remporte la partie par forfait.' where code=p_code;
    return;
  end if;
  if r.turn=leaving.seat then
    next_turn:=maison_ludo_private.next_seat(p_code,leaving.seat);
    update maison_ludo_private.rooms set host=case when host=p_uid then next_host else host end,
      turn=next_turn,die=null,sixes=0,message=leaving.name||' est éliminé par forfait.' where code=p_code;
  else
    update maison_ludo_private.rooms set host=case when host=p_uid then next_host else host end,
      message=leaving.name||' est éliminé par forfait.' where code=p_code;
  end if;
end $$;
revoke all on function maison_ludo_private.eliminate_player(text,uuid) from public, anon, authenticated;
