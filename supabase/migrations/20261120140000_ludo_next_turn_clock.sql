-- Corrige l'horloge Ludo : le chrono doit redémarrer pour le joueur réellement
-- désigné par l'UPDATE (pion choisi, dé sans coup jouable, trois 6, capture).
-- Le comportement de jeu reste identique ; seul le destinataire du chrono change.

create or replace function maison_ludo_private.roll(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r maison_ludo_private.rooms; p maison_ludo_private.players; d integer; legal boolean; v_turn integer;
begin
  select * into r from maison_ludo_private.rooms where code=p_code for update;
  select * into p from maison_ludo_private.players where room=p_code and uid=auth.uid();
  if auth.uid() is null or p.uid is null or r.status<>'playing' or p.seat<>r.turn or r.die is not null then raise exception 'Vous ne pouvez pas lancer maintenant'; end if;
  if not kopaka_presence_private.claim_turn('ludo',p_code,auth.uid()) then
    update maison_ludo_private.rooms set turn=maison_ludo_private.next_seat(p_code,p.seat),die=null,sixes=0,
      message=p.name||' a dépassé le temps imparti.' where code=p_code;
    perform kopaka_presence_private.start_turn('ludo',p_code,
      (select uid from maison_ludo_private.players where room=p_code and seat=maison_ludo_private.next_seat(p_code,p.seat)),10,true);
    return maison_ludo_private.snapshot(p_code);
  end if;
  d:=floor(random()*6)::integer+1;
  if d=6 then r.sixes:=r.sixes+1; else r.sixes:=0; end if;
  if r.sixes=3 then
    update maison_ludo_private.rooms set turn=maison_ludo_private.next_seat(p_code,p.seat),die=null,sixes=0,
      message=p.name||' obtient trois 6 et passe son tour.' where code=p_code returning turn into v_turn;
  else
    select exists(select 1 from unnest(p.pawns) x where (x=-1 and d=6) or (x>=0 and x<56 and x+d<=56)) into legal;
    update maison_ludo_private.rooms set die=case when legal then d else null end,
      turn=case when legal or d=6 then p.seat else maison_ludo_private.next_seat(p_code,p.seat) end,
      sixes=case when legal or d=6 then r.sixes else 0 end,
      message=p.name||' obtient '||d||case when not legal and d=6 then ' et relance.' when not legal then ' et passe son tour.' else '.' end
      where code=p_code returning turn into v_turn;
  end if;
  if r.status='playing' and v_turn is not null then
    perform kopaka_presence_private.start_turn('ludo',p_code,
      (select uid from maison_ludo_private.players where room=p_code and seat=v_turn),10,true);
  end if;
  return maison_ludo_private.snapshot(p_code);
end $$;

create or replace function maison_ludo_private.move(p_code text,p_pawn integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r maison_ludo_private.rooms; p maison_ludo_private.players; other maison_ludo_private.players;
  pos integer; dest integer; square integer; i integer; captured boolean:=false; finished boolean; v_turn integer;
begin
  select * into r from maison_ludo_private.rooms where code=p_code for update;
  select * into p from maison_ludo_private.players where room=p_code and uid=auth.uid();
  if auth.uid() is null or p.uid is null or r.status<>'playing' or p.seat<>r.turn or r.die is null then raise exception 'Ce n’est pas votre tour'; end if;
  if not kopaka_presence_private.claim_turn('ludo',p_code,auth.uid()) then
    update maison_ludo_private.rooms set turn=maison_ludo_private.next_seat(p_code,p.seat),die=null,sixes=0,
      message=p.name||' a dépassé le temps imparti.' where code=p_code;
    perform kopaka_presence_private.start_turn('ludo',p_code,
      (select uid from maison_ludo_private.players where room=p_code and seat=maison_ludo_private.next_seat(p_code,p.seat)),10,true);
    return maison_ludo_private.snapshot(p_code);
  end if;
  if p_pawn is null or p_pawn not between 0 and 3 then raise exception 'Pion invalide'; end if;
  pos:=p.pawns[p_pawn+1];
  if pos=-1 and r.die=6 then dest:=0;
  elsif pos>=0 and pos<56 and pos+r.die<=56 then dest:=pos+r.die;
  else raise exception 'Ce pion ne peut pas avancer'; end if;
  p.pawns[p_pawn+1]:=dest;
  update maison_ludo_private.players set pawns=p.pawns where room=p_code and uid=p.uid;
  if dest<=50 then
    square:=(p.seat*13+dest)%52;
    if square<>all(array[0,8,13,21,26,34,39,47]) then
      for other in select * from maison_ludo_private.players where room=p_code and uid<>p.uid loop
        for i in 1..4 loop
          if other.pawns[i] between 0 and 50 and (other.seat*13+other.pawns[i])%52=square then other.pawns[i]:=-1; captured:=true; end if;
        end loop;
        update maison_ludo_private.players set pawns=other.pawns where room=p_code and uid=other.uid;
      end loop;
    end if;
  end if;
  finished:=p.pawns=array[56,56,56,56];
  update maison_ludo_private.rooms set status=case when finished then 'finished' else 'playing' end,
    winner=case when finished then p.seat else null end, die=null,
    turn=case when finished or r.die=6 or captured then p.seat else maison_ludo_private.next_seat(p_code,p.seat) end,
    sixes=case when finished or r.die=6 or captured then r.sixes else 0 end,
    message=case when finished then p.name||' remporte la partie !' when captured then p.name||' capture un pion et rejoue !' else p.name||' avance un pion.' end
    where code=p_code returning turn into v_turn;
  if not finished and v_turn is not null then
    perform kopaka_presence_private.start_turn('ludo',p_code,
      (select uid from maison_ludo_private.players where room=p_code and seat=v_turn),10,true);
  end if;
  return maison_ludo_private.snapshot(p_code);
end $$;

revoke all on function maison_ludo_private.roll(text),maison_ludo_private.move(text,integer) from public, anon, authenticated;
