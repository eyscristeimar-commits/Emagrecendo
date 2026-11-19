import { FOODS, UNITS } from './foods.js';
import { callFunction, hasBackend } from './db.js';

export const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9.,\s%]/g, ' ').replace(/\s+/g, ' ').trim();

// Índice de apelidos, do mais longo para o mais curto (casa "arroz integral" antes de "arroz").
const ALIASES = FOODS.flatMap((f) => [norm(f.n), ...f.a.map(norm)].map((a) => ({ a, f })))
  .sort((x, y) => y.a.length - x.a.length);

const NUM_WORDS = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, meia: 0.5, meio: 0.5 };
const r1 = (n) => Math.round(n * 10) / 10;

function findFood(text) {
  for (const { a, f } of ALIASES) {
    const re = new RegExp(`(^|\\s)${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`);
    if (re.test(text)) return f;
  }
  return null;
}

function parsePart(raw) {
  let t = norm(raw);
  if (!t) return null;
  // "arroz cru" troca para a versão crua
  let grams = null; let count = null; let unitG = null;

  let m = t.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|gr|gramas?|ml|l)\b/);
  if (m) {
    const v = parseFloat(m[1].replace(',', '.'));
    grams = m[2] === 'kg' || m[2] === 'l' ? v * 1000 : v;
    t = t.replace(m[0], ' ');
  } else {
    m = t.match(/^(\d+(?:[.,]\d+)?|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|meia|meio)\s+/);
    if (m) {
      count = NUM_WORDS[m[1]] ?? parseFloat(m[1].replace(',', '.'));
      t = t.slice(m[0].length);
      for (const u of Object.keys(UNITS).sort((a, b) => b.length - a.length)) {
        if (t.startsWith(u + ' ') || t === u) { unitG = UNITS[u]; t = t.slice(u.length); break; }
      }
    }
  }
  t = t.replace(/^\s*(de|do|da|com)\s+/, ' ').trim();
  const food = findFood(t) || findFood(norm(raw));
  if (!food) return { raw: raw.trim(), unknown: true };
  if (grams == null) {
    if (count != null) grams = count * (unitG ?? food.u ?? 100);
    else grams = food.u ?? 100;
  }
  const k = grams / 100;
  return {
    name: food.n, grams: Math.round(grams), raw: raw.trim(),
    kcal: Math.round(food.k * k), protein: r1(food.p * k), carbs: r1(food.c * k), fat: r1(food.f * k), sugar: r1(food.s * k),
    addedSugar: !!food.sugar,
  };
}

// Divide "160g de acém, 70g de arroz e 3 ovos" em partes.
export function splitFoods(text) {
  return text.split(/[\n;,+]|\s+e\s+|\s+mais\s+/i).map((s) => s.trim()).filter(Boolean);
}

export function parseLocal(text) {
  const parts = splitFoods(text).map(parsePart).filter(Boolean);
  return { items: parts.filter((p) => !p.unknown), unknown: parts.filter((p) => p.unknown).map((p) => p.raw) };
}

export function sumItems(items) {
  const t = { kcal: 0, protein: 0, carbs: 0, fat: 0, sugar: 0 };
  for (const i of items) for (const k of Object.keys(t)) t[k] += Number(i[k]) || 0;
  for (const k of Object.keys(t)) t[k] = k === 'kcal' ? Math.round(t[k]) : r1(t[k]);
  return t;
}

// ---------- IA (Claude) ----------
const LS_KEY = 'emag:anthropicKey';
export const getPersonalKey = () => { try { return localStorage.getItem(LS_KEY) || ''; } catch { return ''; } };
export const setPersonalKey = (k) => { try { k ? localStorage.setItem(LS_KEY, k) : localStorage.removeItem(LS_KEY); } catch {} };
export const aiAvailable = () => hasBackend() || !!getPersonalKey();

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

const PLAN_PROMPT = `Você é um personal trainer brasileiro. Monte uma ficha de musculação em rotação (o aluno faz um treino por dia, na ordem, e recomeça). Cada exercício em uma linha curta no formato "Nome do exercício 4x10" (séries x repetições, ou tempo). De 5 a 7 exercícios por treino. Não inclua abdômen nem cardio (o app já tem esses blocos). Use nomes de exercícios comuns em academias do Brasil. Fale apenas de exercícios. Responda só com o JSON.`;

const MEAL_PROMPT = `Você é um nutricionista brasileiro. Identifique cada alimento da refeição, estime as gramas (use porções brasileiras típicas quando não informado) e calcule kcal, proteína, carboidratos, gorduras e açúcar (g) de cada item, usando valores da Tabela TACO quando possível. Considere arroz, feijão, carnes e massas como cozidos, a menos que esteja escrito "cru". Marque addedSugar=true somente para açúcar adicionado (açúcar, mel, doces, refrigerante comum). Em "notes", escreva uma frase curta em português com a sua confiança na estimativa. Responda só com o JSON.`;

const CARDIO_PROMPT = `Leia este print de uma atividade do Strava (ou app parecido). Extraia: activity (Pedal, Caminhada ou Corrida), minutes (tempo em movimento, em minutos), km (distância), speed_kmh (velocidade média em km/h), kcal (calorias; 0 se não aparecer) e date (AAAA-MM-DD, vazio se não aparecer). Responda só com o JSON.`;

async function callClaudeDirect({ system, content, schema }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': getPersonalKey(),
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-opus-5-5', max_tokens: 4000, system,
      output_config: { effort: 'low', format: { type: 'json_schema', schema } },
      messages: [{ role: 'user', content }],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Erro ${res.status} da IA`);
  if (data.stop_reason === 'refusal') throw new Error('A IA não conseguiu analisar este conteúdo.');
  const txt = data.content.find((b) => b.type === 'text')?.text;
  return JSON.parse(txt);
}

async function runAI(kind, payload) {
  if (hasBackend()) return callFunction('nutrition', { kind, ...payload });
  const content = [];
  if (payload.image) content.push({ type: 'image', source: { type: 'base64', media_type: payload.media_type || 'image/jpeg', data: payload.image } });
  content.push({ type: 'text', text: payload.text || (kind === 'cardio' ? 'Extraia os dados da atividade.' : 'Analise esta refeição.') });
  return callClaudeDirect({
    system: { cardio: CARDIO_PROMPT, plan: PLAN_PROMPT }[kind] || MEAL_PROMPT,
    content, schema: { cardio: CARDIO_SCHEMA, plan: PLAN_SCHEMA }[kind] || MEAL_SCHEMA,
  });
}

export async function analyzeMealText(text, { forceAI = false } = {}) {
  const local = parseLocal(text);
  if (!forceAI && local.unknown.length === 0 && local.items.length) return { ...local, source: 'tabela' };
  if (!aiAvailable()) return { ...local, source: 'tabela' };
  const ai = await runAI('meal', { text: `Refeição: ${text}` });
  return { items: ai.items, unknown: [], notes: ai.notes, source: 'ia' };
}

export async function analyzeMealPhoto(base64, media_type, hint = '') {
  if (!aiAvailable()) throw new Error('Configure a IA em Ajustes para analisar fotos.');
  const ai = await runAI('meal', { image: base64, media_type, text: hint ? `Observação do usuário: ${hint}` : 'Analise esta refeição.' });
  return { items: ai.items, unknown: [], notes: ai.notes, source: 'ia' };
}

export async function readCardioPrint(base64, media_type) {
  if (!aiAvailable()) throw new Error('Configure a IA em Ajustes para ler prints.');
  return runAI('cardio', { image: base64, media_type });
}

export async function generatePlan({ goal, days, level, place, notes }) {
  if (!aiAvailable()) throw new Error('A IA ainda não está configurada.');
  const text = `Objetivo: ${goal}. Treinos diferentes na rotação: ${days}. Nível: ${level}. Local: ${place}.${notes ? ' Observações: ' + notes : ''}`;
  const r = await runAI('plan', { text });
  if (!r.days?.length) throw new Error('A IA não devolveu uma ficha. Tente de novo.');
  return r;
}
