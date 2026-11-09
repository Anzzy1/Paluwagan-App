-- 0015: members watch the same draw game the admin picked.
--
-- The admin's game choice used to live only on the admin's phone, so members watching
-- live saw the default game instead. It's now saved on the paluwagan in the same step
-- that runs the draw, and every member's screen plays that game.
--
-- Safe to run on top of 0001–0014.

alter table public.circles
  add column if not exists draw_style text
  check (draw_style is null or draw_style in ('wheel', 'envelopes', 'slots', 'plinko', 'claw'));

-- Save the game, then run the usual verifiable draw (run_draw from 0001), all at once.
create or replace function public.run_draw_with_style(p_circle uuid, p_style text)
returns uuid[] language plpgsql security definer set search_path = public as $$
begin
  if not is_admin(p_circle) then raise exception 'Admin only'; end if;
  if p_style is not null and p_style not in ('wheel', 'envelopes', 'slots', 'plinko', 'claw') then
    raise exception 'Unknown draw game';
  end if;
  update circles set draw_style = p_style where id = p_circle;
  return run_draw(p_circle);
end $$;

revoke all on function public.run_draw_with_style(uuid, text) from public, anon;
grant execute on function public.run_draw_with_style(uuid, text) to authenticated;
