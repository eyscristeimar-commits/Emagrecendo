-- Projetos novos do Supabase não liberam as tabelas automaticamente para o app.
-- As regras de quem vê/edita o quê continuam nas políticas (RLS) do arquivo init.
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on public.profiles, public.days, public.photos, public.messages, public.push_subs to authenticated;
grant select on public.profile_owners to authenticated;
grant execute on function public.is_owner(uuid), public.create_profile(jsonb), public.claim_profile(uuid) to authenticated;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;
