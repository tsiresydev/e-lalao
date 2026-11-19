-- Private two-player rooms. No game-state write endpoint is exposed here:
-- moves must first be validated by a trusted server implementation.
create schema if not exists faritany_private;
revoke all on schema faritany_private from public, anon, authenticated;
grant usage on schema faritany_private to authenticated;

create table faritany_private.rooms (
  code text primary key,
  host uuid not null,
  status text not null default 'waiting' check (status in ('waiting','playing','finished')),
  target integer not null check (target in (5,10,15,20,30)),
  game jsonb not null,
  version bigint not null default 0,
  created_at timestamptz not null default now()
);
create table faritany_private.players (
  room text not null references faritany_private.rooms(code) on delete cascade,
  uid uuid not null,
  name text not null check (char_length(name) between 1 and 20),
  seat integer not null check (seat in (0,1)),
  primary key (room,uid),
  unique (room,seat)
);
create table faritany_private.join_limits (
  uid uuid primary key,
  window_start timestamptz not null default now(),
  attempts integer not null default 0
);
alter table faritany_private.rooms enable row level security;
alter table faritany_private.players enable row level security;
alter table faritany_private.join_limits enable row level security;
revoke all on all tables in schema faritany_private from public, anon, authenticated;

create function faritany_private.snapshot(p_code text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r faritany_private.rooms; result jsonb;
begin
  if auth.uid() is null or not exists (select 1 from faritany_private.players where room=p_code and uid=auth.uid()) then
    raise exception 'Accès au salon refusé';
  end if;
  select * into r from faritany_private.rooms where code=p_code;
  select jsonb_build_object('code',r.code,'host',r.host,'status',r.status,'target',r.target,'game',r.game,'version',r.version,'me',auth.uid(),
    'players',coalesce(jsonb_agg(jsonb_build_object('uid',p.uid,'name',p.name,'seat',p.seat) order by p.seat),'[]'::jsonb))
  into result from faritany_private.players p where p.room=p_code;
  return result;
end $$;

create function faritany_private.create_room(p_name text,p_target integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c text; attempts integer:=0;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  p_name:=trim(p_name);
  if p_name is null or char_length(p_name) not between 1 and 20 then raise exception 'Pseudo invalide'; end if;
  if p_target is null or p_target not in (5,10,15,20,30) then raise exception 'Objectif invalide'; end if;
  loop
    c:=upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
    begin
      insert into faritany_private.rooms(code,host,target,game) values(c,auth.uid(),p_target,
        jsonb_build_object('size',15,'points','[]'::jsonb,'territories','[]'::jsonb,'turn','blue','finished',false,'target',p_target));
      exit;
    exception when unique_violation then attempts:=attempts+1; if attempts>=5 then raise; end if;
    end;
  end loop;
  insert into faritany_private.players(room,uid,name,seat) values(c,auth.uid(),p_name,0);
  return faritany_private.snapshot(c);
end $$;

create function faritany_private.join_room(p_code text,p_name text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r faritany_private.rooms; attempts_now integer;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  p_code:=upper(trim(p_code)); p_name:=trim(p_name);
  if p_name is null or char_length(p_name) not between 1 and 20 then raise exception 'Pseudo invalide'; end if;
  insert into faritany_private.join_limits(uid,window_start,attempts) values(auth.uid(),now(),1)
  on conflict(uid) do update set
    window_start=case when faritany_private.join_limits.window_start < now()-interval '10 minutes' then now() else faritany_private.join_limits.window_start end,
    attempts=case when faritany_private.join_limits.window_start < now()-interval '10 minutes' then 1 else faritany_private.join_limits.attempts+1 end
  returning attempts into attempts_now;
  if attempts_now>20 then return jsonb_build_object('error','Trop de tentatives. Réessayez plus tard.'); end if;
  select * into r from faritany_private.rooms where code=p_code for update;
  if not found then return jsonb_build_object('error','Salon introuvable'); end if;
  if exists(select 1 from faritany_private.players where room=p_code and uid=auth.uid()) then return faritany_private.snapshot(p_code); end if;
  if r.status<>'waiting' or exists(select 1 from faritany_private.players where room=p_code and seat=1) then
    return jsonb_build_object('error','Salon complet ou partie déjà commencée');
  end if;
  insert into faritany_private.players(room,uid,name,seat) values(p_code,auth.uid(),p_name,1);
  update faritany_private.rooms set status='playing',version=version+1 where code=p_code;
  return faritany_private.snapshot(p_code);
end $$;

create function faritany_private.leave_room(p_code text) returns void
language plpgsql security definer set search_path='' as $$
declare r faritany_private.rooms; remaining uuid;
begin
  select * into r from faritany_private.rooms where code=p_code for update;
  if auth.uid() is null or not exists(select 1 from faritany_private.players where room=p_code and uid=auth.uid()) then raise exception 'Accès refusé'; end if;
  delete from faritany_private.players where room=p_code and uid=auth.uid();
  select uid into remaining from faritany_private.players where room=p_code limit 1;
  if remaining is null then delete from faritany_private.rooms where code=p_code;
  else
    update faritany_private.players set seat=0 where room=p_code and uid=remaining;
    update faritany_private.rooms set host=remaining,status='waiting',version=version+1,game=jsonb_build_object('size',15,'points','[]'::jsonb,'territories','[]'::jsonb,'turn','blue','finished',false,'target',r.target) where code=p_code;
  end if;
end $$;

revoke all on all functions in schema faritany_private from public, anon, authenticated;
grant execute on function faritany_private.snapshot(text),faritany_private.create_room(text,integer),faritany_private.join_room(text,text),faritany_private.leave_room(text) to authenticated;
create function public.faritany_state(p_code text) returns jsonb language sql security invoker set search_path='' as $$select faritany_private.snapshot(p_code)$$;
create function public.faritany_create(p_name text,p_target integer) returns jsonb language sql security invoker set search_path='' as $$select faritany_private.create_room(p_name,p_target)$$;
create function public.faritany_join(p_code text,p_name text) returns jsonb language sql security invoker set search_path='' as $$select faritany_private.join_room(p_code,p_name)$$;
create function public.faritany_leave(p_code text) returns void language sql security invoker set search_path='' as $$select faritany_private.leave_room(p_code)$$;
revoke all on function public.faritany_state(text),public.faritany_create(text,integer),public.faritany_join(text,text),public.faritany_leave(text) from public,anon;
grant execute on function public.faritany_state(text),public.faritany_create(text,integer),public.faritany_join(text,text),public.faritany_leave(text) to authenticated;

-- Only the trusted Edge Function's service role can submit a computed state.
-- The version, membership and turn are checked again under a row lock.
create function public.faritany_commit_move(p_code text,p_uid uuid,p_version bigint,p_game jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare r faritany_private.rooms; player_seat integer;
begin
  select * into r from faritany_private.rooms where code=p_code for update;
  select seat into player_seat from faritany_private.players where room=p_code and uid=p_uid;
  if r.code is null or r.status<>'playing' or r.version<>p_version or player_seat is null
     or (r.game->>'turn') <> (case player_seat when 0 then 'blue' else 'red' end) then return false; end if;
  update faritany_private.rooms set game=p_game,version=version+1,
    status=case when (p_game->>'finished')::boolean then 'finished' else 'playing' end where code=p_code;
  return true;
end $$;
revoke all on function public.faritany_commit_move(text,uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.faritany_commit_move(text,uuid,bigint,jsonb) to service_role;

-- Broadcast only an invalidation; the state RPC checks membership again.
create function faritany_private.is_room_member(p_topic text) returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists(select 1 from faritany_private.players p where p.uid=auth.uid() and p_topic='kopaka-faritany:'||p.room)
$$;
revoke all on function faritany_private.is_room_member(text) from public,anon;
grant execute on function faritany_private.is_room_member(text) to authenticated;
create policy faritany_receive on realtime.messages for select to authenticated
using (extension='broadcast' and faritany_private.is_room_member((select realtime.topic())));
create function faritany_private.notify_change() returns trigger
language plpgsql security definer set search_path='' as $$
declare c text;
begin
  if tg_table_name='players' then if tg_op='DELETE' then c:=old.room; else c:=new.room; end if;
  else if tg_op='DELETE' then c:=old.code; else c:=new.code; end if; end if;
  perform realtime.send('{}'::jsonb,'changed','kopaka-faritany:'||c,true);
  return null;
end $$;
revoke all on function faritany_private.notify_change() from public,anon,authenticated;
create trigger faritany_rooms_changed after insert or update or delete on faritany_private.rooms for each row execute function faritany_private.notify_change();
create trigger faritany_players_changed after insert or update or delete on faritany_private.players for each row execute function faritany_private.notify_change();
