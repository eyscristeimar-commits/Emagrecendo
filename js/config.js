// Configuração do app. Preencha depois de criar o projeto no Supabase e o app no Strava.
// Sem SUPABASE_URL o app funciona em "modo local": salva tudo só neste aparelho.
export const CONFIG = {
  SUPABASE_URL: 'https://faosaflcrbreuonqvbne.supabase.co',        // ex: 'https://abcdxyz.supabase.co'
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhb3NhZmxjcmJyZXVvbnF2Ym5lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUwNjU3MjUsImV4cCI6MjExMDY0MTcyNX0.Akt2PETK0yBNW2Ma80XbVV5CYQGdOY5Sj9apt8qQbsY',   // chave "anon public" (pode ficar no código, é pública)
  STRAVA_CLIENT_ID: '',    // Client ID do app criado em strava.com/settings/api
  VAPID_PUBLIC_KEY: 'BLhI7WpU490yePQYX8kzBCmneQ7miG7h2zH9HKCx1cgtAz9dkkN4KPlXvYpYeWe2Q8VZGVqOZhVb7AJZQIcecf0',    // chave pública para notificações push (veja README)
  APP_NAME: 'Foco Total',
};
