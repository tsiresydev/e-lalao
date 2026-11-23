-- Limit new Domino rooms and joins without altering games already in progress.
create or replace function maison_domino_private.create_with_limit(p_name text,p_target integer,p_player_limit integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb; c text;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  if p_player_limit is null or p_player_limit not between 2 and 3 then raise exception 'Choisissez 2 ou 3 joueurs'; end if;
  result:=maison_domino_private.create_configured(p_name,p_target);
  c:=result->>'code';
  update maison_domino_private.rooms set player_limit=p_player_limit where code=c and host=auth.uid();
  return maison_domino_private.snapshot(c);
end $$;

create function maison_domino_private.enforce_three_player_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from maison_domino_private.rooms where code=new.room for update;
  if (select count(*) from maison_domino_private.players where room=new.room)>=3 then
    raise exception 'Salon complet : 3 joueurs maximum';
  end if;
  return new;
end $$;
revoke all on function maison_domino_private.enforce_three_player_limit() from public,anon,authenticated;
create trigger domino_three_player_limit before insert on maison_domino_private.players
for each row execute function maison_domino_private.enforce_three_player_limit();
