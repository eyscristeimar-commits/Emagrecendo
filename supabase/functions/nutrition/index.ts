// IA do app: refeição (foto ou texto), print de atividade e ficha de treino.
// Segredo necessário: ANTHROPIC_API_KEY. Opcional: CLAUDE_MODEL.
import Anthropic from 'npm:@anthropic-ai/sdk';
import { cors, json } from '../_shared/cors.ts';

const client = new Anthropic(); // lê ANTHROPIC_API_KEY
const MODEL = Deno.env.get('CLAUDE_MODEL') ?? 'claude-opus-5-5';

const MEAL_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' }, grams: { type: 'number' }, kcal: { type: 'number' },
          protein: { type: 'number' }, carbs: { type: 'number' }, fat: { type: 'number' }, sugar: { type: 'number' },
          addedSugar: { type: 'boolean' },
        },
        required: ['name', 'grams', 'kcal', 'protein', 'carbs', 'fat', 'sugar', 'addedSugar'],
        additionalProperties: false,
      },
    },
    notes: { type: 'string' },
  },
  required: ['items', 'notes'],
  additionalProperties: false,
};
const CARDIO_SCHEMA = {
  type: 'object',
  properties: {
    activity: { type: 'string' }, minutes: { type: 'number' }, km: { type: 'number' },
    speed_kmh: { type: 'number' }, kcal: { type: 'number' }, date: { type: 'string' },
  },
  required: ['activity', 'minutes', 'km', 'speed_kmh', 'kcal', 'date'],
  additionalProperties: false,
};
const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    days: {
      type: 'array',
      items: {
        type: 'object',
        properties: { name: { type: 'string' }, exercises: { type: 'array', items: { type: 'string' } } },
        required: ['name', 'exercises'], additionalProperties: false,
      },
    },
  },
  required: ['name', 'days'],
  additionalProperties: false,
};

const PROMPTS: Record<string, string> = {
  meal: 'Você é um nutricionista brasileiro. Identifique cada alimento da refeição, estime as gramas (use porções brasileiras típicas quando não informado) e calcule kcal, proteína, carboidratos, gorduras e açúcar (g) de cada item, usando valores da Tabela TACO quando possível. Considere arroz, feijão, carnes e massas como cozidos, a menos que esteja escrito "cru". Marque addedSugar=true somente para açúcar adicionado (açúcar, mel, doces, refrigerante comum). Em "notes", escreva uma frase curta em português com a sua confiança na estimativa. Responda só com o JSON.',
  cardio: 'Leia este print de uma atividade do Strava (ou app parecido). Extraia: activity (Pedal, Caminhada ou Corrida), minutes (tempo em movimento, em minutos), km (distância), speed_kmh (velocidade média em km/h), kcal (calorias; 0 se não aparecer) e date (AAAA-MM-DD, vazio se não aparecer). Responda só com o JSON.',
  plan: 'Você é um personal trainer brasileiro. Monte uma ficha de musculação em rotação (o aluno faz um treino por dia, na ordem, e recomeça). Cada exercício em uma linha curta no formato "Nome do exercício 4x10" (séries x repetições, ou tempo). De 5 a 7 exercícios por treino. Não inclua abdômen nem cardio (o app já tem esses blocos). Use nomes de exercícios comuns em academias do Brasil. Fale apenas de exercícios. Responda só com o JSON.',
};
const SCHEMAS: Record<string, unknown> = { meal: MEAL_SCHEMA, cardio: CARDIO_SCHEMA, plan: PLAN_SCHEMA };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { kind = 'meal', text, image, media_type } = await req.json();
    if (!PROMPTS[kind]) return json({ error: 'Tipo inválido' }, 400);
    if (image && image.length > 7_000_000) return json({ error: 'Imagem muito grande' }, 400);
    const content: Anthropic.Beta.BetaContentBlockParam[] = [];
    if (image) content.push({ type: 'image', source: { type: 'base64', media_type: media_type || 'image/jpeg', data: image } });
    content.push({ type: 'text', text: String(text || 'Analise.').slice(0, 2000) });

    const msg = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system: PROMPTS[kind],
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMAS[kind] } },
      messages: [{ role: 'user', content }],
    } as any);

    if (msg.stop_reason === 'refusal') return json({ error: 'A IA não conseguiu analisar este conteúdo.' }, 422);
    const block = msg.content.find((b: any) => b.type === 'text') as any;
    return json(JSON.parse(block.text));
  } catch (e) {
    console.error(e);
    if (e instanceof Anthropic.RateLimitError) return json({ error: 'Muitas análises seguidas. Tente de novo em 1 minuto.' }, 429);
    if (e instanceof Anthropic.AuthenticationError) return json({ error: 'Chave da IA inválida no servidor.' }, 500);
    if (e instanceof Anthropic.APIError) return json({ error: 'A IA está indisponível agora. Tente de novo.' }, 502);
    return json({ error: 'Erro ao analisar. Tente de novo.' }, 500);
  }
});
