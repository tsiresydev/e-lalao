-- Per-account throttling is a first layer only; anonymous sign-up also needs CAPTCHA / IP limits.
create table maison_domino_private.join_limits (
  uid uuid primary key,
  window_start timestamptz not null default now(),
  attempts integer not null default 0
);
alter table maison_domino_private.join_limits enable row level security;
revoke all on maison_domino_private.join_limits from public, anon, authenticated;

create or replace function maison_domino_private.join_room(p_code text,p_name text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r maison_domino_private.rooms; n integer; attempts_now integer;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  p_code:=upper(trim(p_code)); p_name:=trim(p_name);
  if p_name is null or char_length(p_name) not between 1 and 20 then return jsonb_build_object('error','Pseudo invalide (1 à 20 caractères)'); end if;
  insert into maison_domino_private.join_limits(uid,window_start,attempts) values(auth.uid(),now(),1)
  on conflict(uid) do update set
    window_start=case when maison_domino_private.join_limits.window_start < now()-interval '10 minutes' then now() else maison_domino_private.join_limits.window_start end,
    attempts=case when maison_domino_private.join_limits.window_start < now()-interval '10 minutes' then 1 else maison_domino_private.join_limits.attempts+1 end
  returning attempts into attempts_now;
  if attempts_now>20 then return jsonb_build_object('error','Trop de tentatives. Réessayez dans quelques minutes.'); end if;
  select * into r from maison_domino_private.rooms where code=p_code for update;
  if not found then return jsonb_build_object('error','Salon introuvable'); end if;
  if exists(select 1 from maison_domino_private.players where room=p_code and uid=auth.uid()) then return maison_domino_private.snapshot(p_code); end if;
  if r.status<>'waiting' then return jsonb_build_object('error','Cette partie a déjà commencé'); end if;
  select count(*) into n from maison_domino_private.players where room=p_code;
  if n>=4 then return jsonb_build_object('error','Ce salon est complet'); end if;
  insert into maison_domino_private.players(room,uid,name,seat) values(p_code,auth.uid(),p_name,n);
  return maison_domino_private.snapshot(p_code);
end $$;
