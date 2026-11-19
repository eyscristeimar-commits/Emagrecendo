create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule('lembretes', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://faosaflcrbreuonqvbne.supabase.co/functions/v1/push',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"action": "tick"}'::jsonb
  );
$$);
