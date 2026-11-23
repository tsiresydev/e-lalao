-- Reveal hands only to room members after a blocked round or a normal win.
create or replace function maison_domino_private.snapshot(p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r maison_domino_private.rooms; result jsonb;
begin
  if auth.uid() is null or not exists (select 1 from maison_domino_private.players where room=p_code and uid=auth.uid()) then
    raise exception 'Accès au salon refusé';
  end if;
  select * into r from maison_domino_private.rooms where code=p_code for update;
  if r.status='playing' and r.turn is not null then
    perform kopaka_presence_private.start_turn('domino',p_code,
      (select uid from maison_domino_private.players where room=p_code and seat=r.turn));
  end if;
  select jsonb_build_object('code',r.code,'host',r.host,'status',r.status,'chain',r.chain,'turn',r.turn,
    'opening',case when r.last_starter is null then r.opening else null end,
    'message',r.message,'me',auth.uid(),'target_score',r.target_score,'player_limit',r.player_limit,
    'champion_name',r.champion_name,'round_finished_at',r.round_finished_at,
    'turn_deadline',(select deadline from kopaka_presence_private.turn_clock where game='domino' and room=p_code and is_active),
    'players',coalesce(jsonb_agg(jsonb_build_object('uid',p.uid,'name',p.name,'seat',p.seat,
      'count',jsonb_array_length(p.hand),'score',p.score,
      'hand',case when p.uid=auth.uid() or (r.status='finished' and (
        r.message like 'Partie bloquée :%' or exists (
          select 1 from maison_domino_private.players winner
          where winner.room=p_code and winner.seat=r.turn
            and jsonb_array_length(winner.hand)=0
            and jsonb_array_length(r.chain)>0
            and r.message=winner.name||' remporte la manche !'
        ))) then p.hand else null end) order by p.seat),'[]'::jsonb))
  into result from maison_domino_private.players p where p.room=p_code;
  return result;
end $$;
