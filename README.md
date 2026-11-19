# Foco Total

App (PWA) de reeducação alimentar, hidratação, treinos e evolução corporal em grupo.
Feito para celular: abre pelo link e pode ser instalado na tela de início.

**Link do app:** https://eyscristeimar-commits.github.io/Emagrecendo/

## O que tem

- **Hoje:** peso em jejum com foto da balança, água (+250/+500/+1.000 mL), refeições por foto (IA) ou por texto com gramas (tabela TACO), semáforo de calorias (verde/amarelo/vermelho), proteína, açúcar, sono, xixi e cocô.
- **Previsão da meta:** data estimada para chegar no peso meta, quilos que faltam, IMC, gasto calórico do dia e déficit.
- **Treino:** fichas em rotação contínua, barra fixa, bloco de abdômen alternado (com/sem carga), cardio indoor e de rua (Strava, link ou print).
- **Fichas:** ficha da Eyshilla, 2 fichas padrão, criar a própria ficha, publicar para o grupo ou pedir para a IA montar.
- **Galeria:** frente, perfil e costas, visão diária e semanal, comparador antes e depois, foto privada ou para o grupo.
- **Relatórios:** placar da semana e gráficos diários e semanais.
- **Grupo:** placar ao vivo de todo mundo e chat em tempo real com fotos.
- **Lembretes:** pesagem, água, refeições, treino, fechamento do dia, foto semanal e chat.

## Como funciona sem configurar nada

Sem o servidor, o app funciona em **modo local**: tudo fica salvo só no celular de cada pessoa
(sem chat entre aparelhos e sem IA por foto). O cálculo de refeições por texto funciona normalmente.

## Ligar o servidor (Supabase), uma vez só

Precisa ser feito pela conta dona do repositório no GitHub.

1. Crie o projeto em [supabase.com](https://supabase.com) (região São Paulo) e guarde a **senha do banco**.
2. No Supabase, copie o **Reference ID** do projeto (Project Settings → General).
3. Crie um **Access Token** em [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens).
4. No GitHub, abra o repositório → **Settings → Secrets and variables → Actions → New repository secret** e crie:
   - `SUPABASE_PROJECT_REF` = o Reference ID
   - `SUPABASE_DB_PASSWORD` = a senha do banco
   - `SUPABASE_ACCESS_TOKEN` = o token
   - opcional `ANTHROPIC_API_KEY` = chave da IA (foto do prato, prints e fichas)
   - opcional `STRAVA_CLIENT_ID` e `STRAVA_CLIENT_SECRET` (app criado em strava.com/settings/api, com "Authorization Callback Domain" = `eyscristeimar-commits.github.io`)
5. Em **Settings → Pages**, escolha **Source: GitHub Actions**.
6. Em **Actions → Publicar app → Run workflow**.

O processo cria o banco, o login por e-mail com código, as funções de IA, Strava e notificações,
o agendador de lembretes (a cada 5 minutos) e preenche o `js/config.js` sozinho.

## Estrutura

```
index.html, manifest.json, sw.js   app instalável (PWA), funciona offline
css/app.css                        visual (claro e escuro)
js/                                telas, cálculos, dados (local ou Supabase), IA, Strava, lembretes
supabase/migrations/               banco, regras de privacidade e perfil pré-cadastrado da Eyshilla
supabase/functions/                nutrition (IA), strava, push (notificações)
.github/workflows/deploy.yml       publicação automática
```

Diretriz de conteúdo: o app trata só de alimentação, hidratação, treinos e hábitos naturais.
