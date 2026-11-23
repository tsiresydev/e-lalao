-- Public RPC wrappers are SECURITY INVOKER and therefore require these
-- explicitly authorized private functions to be executable by signed-in users.
-- Both functions still validate auth.uid(), room membership, turn and action.
grant execute on function maison_ludo_private.roll(text), maison_ludo_private.move(text, integer) to authenticated;
