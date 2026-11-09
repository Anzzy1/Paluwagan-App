-- 0014: split slots (hati) are no longer used.
--
-- The app stopped offering them; people who want to share a slot use one name instead.
-- Turn every split-slot member of a paluwagan that is still forming into a full member
-- with their own slot, so nothing waits for a partner and the admin can lock it.
-- Paluwagan that already started (or are locked) keep their slots as they are.
-- The slot count updates itself (trigger from 0010).
--
-- Safe to run on top of 0001–0013, and safe to run again.

update public.circle_members m
   set share = 1, slot_group = gen_random_uuid()
  from public.circles c
 where c.id = m.circle_id
   and c.status = 'forming'
   and m.share <> 1
   and m.status in ('approved', 'pending');
