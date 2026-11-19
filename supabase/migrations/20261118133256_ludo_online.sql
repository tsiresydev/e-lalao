-- Ludo data is isolated from the existing domino tables and is never exposed directly.
create schema if not exists maison_ludo_private;
revoke all on schema maison_ludo_private from public, anon, authenticated;
grant usage on schema maison_ludo_private to authenticated;

create table maison_ludo_private.rooms (
  code text primary key,
  host uuid not null,
  status text not null default 'waiting' check (status in ('waiting','playing','finished')),
  turn integer,
  die integer check (die between 1 and 6),
  sixes integer not null default 0 check (sixes between 0 and 2),
  winner integer,
  message text not null default 'En attente des joueurs.',
  created_at timestamptz not null default now()
);
create table maison_ludo_private.players (
  room text not null references maison_ludo_private.rooms(code) on delete cascade,
  uid uuid not null,
  name text not null check (char_length(name) between 1 and 20),
  seat integer not null check (seat between 0 and 3),
  pawns integer[] not null default array[-1,-1,-1,-1],
  primary key (room,uid), unique(room,seat)
);
create table maison_ludo_private.join_limits (uid uuid primary key, window_start timestamptz not null default now(), attempts integer not null default 0);
alter table maison_ludo_private.rooms enable row level security;
alter table maison_ludo_private.players enable row level security;
alter table maison_ludo_private.join_limits enable row level security;
revoke all on all tables in schema maison_ludo_private from public, anon, authenticated;

create function maison_ludo_private.snapshot(p_code text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r maison_ludo_private.rooms; result jsonb;
begin
  if auth.uid() is null or not exists(select 1 from maison_ludo_private.players p where p.room=p_code and p.uid=auth.uid()) then raise exception 'Accès au salon refusé'; end if;
  select * into r from maison_ludo_private.rooms where code=p_code;
  select jsonb_build_object('code',r.code,'host',r.host,'status',r.status,'turn',r.turn,'die',r.die,'winner',r.winner,'message',r.message,'me',auth.uid(),
    'players',coalesce(jsonb_agg(jsonb_build_object('uid',p.uid,'name',p.name,'seat',p.seat,'pawns',p.pawns) order by p.seat),'[]'::jsonb))
    into result from maison_ludo_private.players p where p.room=p_code;
  return result;
end $$;

create function maison_ludo_private.create_room(p_name text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c text; attempts integer:=0;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  p_name:=trim(p_name);
  if p_name is null or char_length(p_name) not between 1 and 20 then raise exception 'Pseudo invalide'; end if;
  loop
    c:=upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
    begin insert into maison_ludo_private.rooms(code,host) values(c,auth.uid()); exit;
    exception when unique_violation then attempts:=attempts+1; if attempts>=5 then raise; end if; end;
  end loop;
  insert into maison_ludo_private.players(room,uid,name,seat) values(c,auth.uid(),p_name,0);
  return maison_ludo_private.snapshot(c);
end $$;

create function maison_ludo_private.join_room(p_code text,p_name text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r maison_ludo_private.rooms; seat_number integer; attempts_now integer;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  p_code:=upper(trim(p_code)); p_name:=trim(p_name);
  if p_name is null or char_length(p_name) not between 1 and 20 then raise exception 'Pseudo invalide'; end if;
  insert into maison_ludo_private.join_limits(uid,window_start,attempts) values(auth.uid(),now(),1)
  on conflict(uid) do update set
    window_start=case when maison_ludo_private.join_limits.window_start < now()-interval '10 minutes' then now() else maison_ludo_private.join_limits.window_start end,
    attempts=case when maison_ludo_private.join_limits.window_start < now()-interval '10 minutes' then 1 else maison_ludo_private.join_limits.attempts+1 end
  returning attempts into attempts_now;
  if attempts_now>20 then return jsonb_build_object('error','Trop de tentatives. Réessayez dans quelques minutes.'); end if;
  select * into r from maison_ludo_private.rooms where code=p_code for update;
  if not found then return jsonb_build_object('error','Salon introuvable'); end if;
  if exists(select 1 from maison_ludo_private.players where room=p_code and uid=auth.uid()) then return maison_ludo_private.snapshot(p_code); end if;
  if r.status<>'waiting' then return jsonb_build_object('error','La partie a déjà commencé'); end if;
  select s into seat_number from generate_series(0,3) s where not exists(select 1 from maison_ludo_private.players p where p.room=p_code and p.seat=s) order by s limit 1;
  if seat_number is null then return jsonb_build_object('error','Salon complet'); end if;
  insert into maison_ludo_private.players(room,uid,name,seat) values(p_code,auth.uid(),p_name,seat_number);
  return maison_ludo_private.snapshot(p_code);
end $$;

create function maison_ludo_private.start_game(p_code text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r maison_ludo_private.rooms; first_seat integer;
begin
  select * into r from maison_ludo_private.rooms where code=p_code for update;
  if auth.uid() is null or not found or r.host<>auth.uid() then raise exception 'Seul le créateur peut lancer la partie'; end if;
  if r.status<>'waiting' then raise exception 'Partie déjà commencée'; end if;
  if (select count(*) from maison_ludo_private.players where room=p_code)<2 then raise exception 'Il faut au moins deux joueurs'; end if;
  select min(seat) into first_seat from maison_ludo_private.players where room=p_code;
  update maison_ludo_private.rooms set status='playing',turn=first_seat,die=null,sixes=0,message='La partie commence !' where code=p_code;
  return maison_ludo_private.snapshot(p_code);
end $$;

create function maison_ludo_private.next_seat(p_code text,p_seat integer) returns integer
language sql stable set search_path='' as $$
  select coalesce((select min(seat) from maison_ludo_private.players where room=p_code and seat>p_seat),(select min(seat) from maison_ludo_private.players where room=p_code))
$$;

create function maison_ludo_private.roll(p_code text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r maison_ludo_private.rooms; p maison_ludo_private.players; d integer; legal boolean;
begin
  select * into r from maison_ludo_private.rooms where code=p_code for update;
  select * into p from maison_ludo_private.players where room=p_code and uid=auth.uid();
  if auth.uid() is null or p.uid is null or r.status<>'playing' or p.seat<>r.turn or r.die is not null then raise exception 'Vous ne pouvez pas lancer maintenant'; end if;
  d:=floor(random()*6)::integer+1;
  if d=6 then r.sixes:=r.sixes+1; else r.sixes:=0; end if;
  if r.sixes=3 then
    update maison_ludo_private.rooms set turn=maison_ludo_private.next_seat(p_code,p.seat),die=null,sixes=0,message=p.name||' obtient trois 6 et passe son tour.' where code=p_code;
  else
    select exists(select 1 from unnest(p.pawns) x where (x=-1 and d=6) or (x>=0 and x<56 and x+d<=56)) into legal;
    update maison_ludo_private.rooms set die=case when legal then d else null end,
      turn=case when legal or d=6 then p.seat else maison_ludo_private.next_seat(p_code,p.seat) end,
      sixes=case when legal or d=6 then r.sixes else 0 end,
      message=p.name||' obtient '||d||case when not legal and d=6 then ' et relance.' when not legal then ' et passe son tour.' else '.' end
      where code=p_code;
  end if;
  return maison_ludo_private.snapshot(p_code);
end $$;

create function maison_ludo_private.move(p_code text,p_pawn integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r maison_ludo_private.rooms; p maison_ludo_private.players; other maison_ludo_private.players; pos integer; dest integer; square integer; i integer; captured boolean:=false; finished boolean;
begin
  select * into r from maison_ludo_private.rooms where code=p_code for update;
  select * into p from maison_ludo_private.players where room=p_code and uid=auth.uid();
  if auth.uid() is null or p.uid is null or r.status<>'playing' or p.seat<>r.turn or r.die is null then raise exception 'Ce n’est pas votre tour'; end if;
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
    where code=p_code;
  return maison_ludo_private.snapshot(p_code);
end $$;

create function maison_ludo_private.leave_room(p_code text) returns void
language plpgsql security definer set search_path='' as $$
declare r maison_ludo_private.rooms; new_host uuid;
begin
  select * into r from maison_ludo_private.rooms where code=p_code for update;
  if auth.uid() is null or not exists(select 1 from maison_ludo_private.players where room=p_code and uid=auth.uid()) then raise exception 'Accès refusé'; end if;
  delete from maison_ludo_private.players where room=p_code and uid=auth.uid();
  select uid into new_host from maison_ludo_private.players where room=p_code order by seat limit 1;
  if new_host is null then delete from maison_ludo_private.rooms where code=p_code;
  else
    update maison_ludo_private.players set pawns=array[-1,-1,-1,-1] where room=p_code;
    update maison_ludo_private.rooms set host=case when host=auth.uid() then new_host else host end,status='waiting',turn=null,die=null,sixes=0,winner=null,message='Un joueur est parti. Partie annulée.' where code=p_code;
  end if;
end $$;

revoke all on all functions in schema maison_ludo_private from public, anon, authenticated;
grant execute on function maison_ludo_private.snapshot(text),maison_ludo_private.create_room(text),maison_ludo_private.join_room(text,text),maison_ludo_private.start_game(text),maison_ludo_private.roll(text),maison_ludo_private.move(text,integer),maison_ludo_private.leave_room(text) to authenticated;
create function public.ludo_create(p_name text) returns jsonb language sql security invoker set search_path='' as $$select maison_ludo_private.create_room(p_name)$$;
create function public.ludo_join(p_code text,p_name text) returns jsonb language sql security invoker set search_path='' as $$select maison_ludo_private.join_room(p_code,p_name)$$;
create function public.ludo_state(p_code text) returns jsonb language sql security invoker set search_path='' as $$select maison_ludo_private.snapshot(p_code)$$;
create function public.ludo_start(p_code text) returns jsonb language sql security invoker set search_path='' as $$select maison_ludo_private.start_game(p_code)$$;
create function public.ludo_roll(p_code text) returns jsonb language sql security invoker set search_path='' as $$select maison_ludo_private.roll(p_code)$$;
create function public.ludo_move(p_code text,p_pawn integer) returns jsonb language sql security invoker set search_path='' as $$select maison_ludo_private.move(p_code,p_pawn)$$;
create function public.ludo_leave(p_code text) returns void language sql security invoker set search_path='' as $$select maison_ludo_private.leave_room(p_code)$$;
revoke all on function public.ludo_create(text),public.ludo_join(text,text),public.ludo_state(text),public.ludo_start(text),public.ludo_roll(text),public.ludo_move(text,integer),public.ludo_leave(text) from public, anon;
grant execute on function public.ludo_create(text),public.ludo_join(text,text),public.ludo_state(text),public.ludo_start(text),public.ludo_roll(text),public.ludo_move(text,integer),public.ludo_leave(text) to authenticated;

-- Private realtime messages contain only invalidations, never game data.
create function maison_ludo_private.is_room_member(p_topic text) returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists(select 1 from maison_ludo_private.players p where p.uid=auth.uid() and p_topic='maison-ludo:'||p.room)
$$;
revoke all on function maison_ludo_private.is_room_member(text) from public, anon;
grant execute on function maison_ludo_private.is_room_member(text) to authenticated;
create policy maison_ludo_receive on realtime.messages for select to authenticated
using (extension='broadcast' and maison_ludo_private.is_room_member((select realtime.topic())));
create function maison_ludo_private.notify_change() returns trigger
language plpgsql security definer set search_path='' as $$
declare c text;
begin
  if tg_table_name='players' then if tg_op='DELETE' then c:=old.room; else c:=new.room; end if;
  else if tg_op='DELETE' then c:=old.code; else c:=new.code; end if; end if;
  perform realtime.send('{}'::jsonb,'changed','maison-ludo:'||c,true);
  return null;
end $$;
revoke all on function maison_ludo_private.notify_change() from public, anon, authenticated;
create trigger maison_ludo_rooms_changed after insert or update or delete on maison_ludo_private.rooms for each row execute function maison_ludo_private.notify_change();
create trigger maison_ludo_players_changed after insert or update or delete on maison_ludo_private.players for each row execute function maison_ludo_private.notify_change();
