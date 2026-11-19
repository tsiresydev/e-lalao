-- New configured rooms start atomically on the last join. Legacy rooms keep
-- their existing manual start because they have no chosen player limit.
create function maison_ludo_private.auto_start_when_full() returns trigger
language plpgsql security definer set search_path='' as $$
declare r maison_ludo_private.rooms; n integer; first_seat integer;
begin
  select * into r from maison_ludo_private.rooms where code=new.room for update;
  if r.status='waiting' and r.player_limit is not null then
    select count(*),min(seat) into n,first_seat from maison_ludo_private.players where room=new.room;
    if n=r.player_limit then
      update maison_ludo_private.rooms set status='playing',turn=first_seat,die=null,sixes=0,message='La partie commence !' where code=new.room;
    end if;
  end if;
  return null;
end $$;
revoke all on function maison_ludo_private.auto_start_when_full() from public,anon,authenticated;
create trigger ludo_auto_start_when_full after insert on maison_ludo_private.players for each row execute function maison_ludo_private.auto_start_when_full();
