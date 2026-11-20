create or replace function faritany_private.snapshot(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r faritany_private.rooms; result jsonb;
begin
  if auth.uid() is null or not exists (select 1 from faritany_private.players where room=p_code and uid=auth.uid()) then
    raise exception 'Accès au salon refusé';
  end if;
  select * into r from faritany_private.rooms where code=p_code;
  if r.status='playing' and (r.game->>'turn') is not null then
    perform kopaka_presence_private.start_turn('faritany',p_code,
      (select uid from faritany_private.players where room=p_code and seat=case when r.game->>'turn'='blue' then 0 else 1 end));
  end if;
  select jsonb_build_object('code',r.code,'host',r.host,'status',r.status,'target',r.target,'game',r.game,'version',r.version,'me',auth.uid(),
    'turn_deadline',(select deadline from kopaka_presence_private.turn_clock where game='faritany' and room=p_code and is_active),
    'players',coalesce(jsonb_agg(jsonb_build_object('uid',p.uid,'name',p.name,'seat',p.seat) order by p.seat),'[]'::jsonb))
  into result from faritany_private.players p where p.room=p_code;
  return result;
end $$;

-- Faritany's trusted move function also claims the shared turn clock.
create or replace function public.faritany_commit_move(p_code text,p_uid uuid,p_version bigint,p_game jsonb) returns boolean
language plpgsql security definer set search_path = '' as $$
declare r faritany_private.rooms; player_seat integer;
begin
  select * into r from faritany_private.rooms where code=p_code for update;
  select seat into player_seat from faritany_private.players where room=p_code and uid=p_uid;
  if r.code is null or r.status<>'playing' or r.version<>p_version or player_seat is null
     or (r.game->>'turn') <> (case player_seat when 0 then 'blue' else 'red' end) then return false; end if;
  if not kopaka_presence_private.claim_turn('faritany',p_code,p_uid) then return false; end if;
  update faritany_private.rooms set game=p_game,version=version+1,
    status=case when (p_game->>'finished')::boolean then 'finished' else 'playing' end where code=p_code;
  if not (p_game->>'finished')::boolean then
    perform kopaka_presence_private.start_turn('faritany',p_code,
      (select uid from faritany_private.players where room=p_code and seat=case when player_seat=0 then 1 else 0 end),10,true);
  end if;
  return true;
end $$;
revoke all on function public.faritany_commit_move(text,uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.faritany_commit_move(text,uuid,bigint,jsonb) to service_role;

create or replace function faritany_private.apply_expired_turn(
  p_code text,
  p_uid uuid,
  p_misses integer
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r faritany_private.rooms; leaving faritany_private.players; survivor faritany_private.players; winner text; next_uid uuid; next_seat integer;
begin
  select * into r from faritany_private.rooms where code=p_code for update;
  if not found or r.status<>'playing' then return faritany_private.snapshot(p_code); end if;
  select * into leaving from faritany_private.players where room=p_code and uid=p_uid;
  if leaving.uid is null then return faritany_private.snapshot(p_code); end if;
  if p_misses >= 3 then
    delete from faritany_private.players where room=p_code and uid=p_uid;
    perform kopaka_presence_private.clear_player('faritany',p_code,p_uid);
    select * into survivor from faritany_private.players where room=p_code;
    if survivor.uid is null then
      delete from faritany_private.rooms where code=p_code;
      return faritany_private.snapshot(p_code);
    end if;
    winner:=case when survivor.seat=0 then 'blue' else 'red' end;
    update faritany_private.rooms set status='finished',host=survivor.uid,version=version+1,
      game=jsonb_set(coalesce(r.game,'{}'::jsonb),'{finished}',to_jsonb(true))
    where code=p_code;
    return faritany_private.snapshot(p_code);
  end if;
  -- An expired Faritany turn hands the move to the opponent.
  select uid,seat into next_uid,next_seat from faritany_private.players where room=p_code and uid<>p_uid limit 1;
  if next_uid is null then return faritany_private.snapshot(p_code); end if;
  winner:=case when next_seat=0 then 'blue' else 'red' end;
  update faritany_private.rooms set game=jsonb_set(coalesce(r.game,'{}'::jsonb),'{turn}',to_jsonb(winner)),version=version+1 where code=p_code;
  perform kopaka_presence_private.start_turn('faritany',p_code,next_uid,10,true);
  return faritany_private.snapshot(p_code);
end $$;
revoke all on function faritany_private.apply_expired_turn(text,uuid,integer) from public, anon, authenticated;

create or replace function public.faritany_expire(p_code text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare expired record; result jsonb;
begin
  for expired in select * from kopaka_presence_private.expire_turns('faritany',p_code) loop
    result:=faritany_private.apply_expired_turn(p_code,expired.expired_uid,expired.misses);
  end loop;
  return coalesce(result,faritany_private.snapshot(p_code));
end $$;
revoke all on function public.faritany_expire(text) from public, anon;
grant execute on function public.faritany_expire(text) to authenticated;
