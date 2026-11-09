-- 0013: mark an ipon goal as completed once it's reached.
-- Null = still saving. Set by the owner from the goal screen; clearing it reopens the goal.
-- Safe to run on top of 0001–0012.

alter table public.goals add column if not exists completed_at timestamptz;
