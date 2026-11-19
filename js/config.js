// Configuração do app. Preencha depois de criar o projeto no Supabase e o app no Strava.
// Sem SUPABASE_URL o app funciona em "modo local": salva tudo só neste aparelho.
export const CONFIG = {
  SUPABASE_URL: '',        // ex: 'https://abcdxyz.supabase.co'
  SUPABASE_ANON_KEY: '',   // chave "anon public" (pode ficar no código, é pública)
  STRAVA_CLIENT_ID: '',    // Client ID do app criado em strava.com/settings/api
  VAPID_PUBLIC_KEY: '',    // chave pública para notificações push (veja README)
  APP_NAME: 'Foco Total',
};
