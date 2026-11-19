// Valores padrão: fichas de treino, lembretes e o perfil pré-configurado da Eyshilla.

// Ficha da Eyshilla: rotação contínua de 1 a 6 + barra fixa na entrada + abdômen alternado.
export const PLAN_EYSHILLA = {
  id: 'plan-eyshilla',
  name: 'Ficha Eyshilla – Rotação 1 a 6',
  author: 'Plano do grupo',
  pullup: true, core: true,
  days: [
    { name: 'Quadríceps', ex: ['Agachamento livre 4x10', 'Leg press 45° 4x12', 'Cadeira extensora 4x12', 'Agachamento búlgaro 3x10 (cada perna)', 'Afundo no smith 3x12', 'Adutora 3x15'] },
    { name: 'Costas', ex: ['Puxada frontal aberta 4x10', 'Remada curvada 4x10', 'Remada baixa no triângulo 3x12', 'Pulldown com corda 3x12', 'Remada unilateral com halter 3x10', 'Hiperextensão lombar 3x15'] },
    { name: 'Ombros', ex: ['Desenvolvimento com halteres 4x10', 'Elevação lateral 4x12', 'Elevação frontal 3x12', 'Crucifixo inverso 3x12', 'Encolhimento com halteres 3x15', 'Face pull 3x15'] },
    { name: 'Glúteos', ex: ['Elevação pélvica (hip thrust) 4x10', 'Agachamento sumô 4x12', 'Glúteo na polia (coice) 3x12', 'Abdução na máquina 4x15', 'Passada lateral com elástico 3x15', 'Stiff com halteres 3x12'] },
    { name: 'Peito/Braços', ex: ['Supino reto com halteres 4x10', 'Supino inclinado 3x10', 'Crucifixo na máquina 3x12', 'Rosca direta 3x12', 'Rosca martelo 3x12', 'Tríceps na polia 3x12', 'Tríceps francês 3x12'] },
    { name: 'Posteriores/Panturrilha', ex: ['Stiff com barra 4x10', 'Mesa flexora 4x12', 'Cadeira flexora 3x12', 'Bom dia com barra 3x10', 'Panturrilha em pé 4x15', 'Panturrilha sentada 4x15'] },
  ],
};

export const PLAN_FULLBODY = {
  id: 'plan-fullbody',
  name: 'Padrão 1 – Iniciante Corpo Inteiro (A/B/C)',
  author: 'Ficha padrão',
  pullup: false, core: true,
  days: [
    { name: 'A – Pernas e Peito', ex: ['Agachamento goblet 3x12', 'Leg press 3x12', 'Supino reto com halteres 3x12', 'Crucifixo na máquina 3x12', 'Panturrilha em pé 3x15'] },
    { name: 'B – Costas e Ombros', ex: ['Puxada frontal 3x12', 'Remada baixa 3x12', 'Desenvolvimento com halteres 3x12', 'Elevação lateral 3x12', 'Hiperextensão lombar 3x12'] },
    { name: 'C – Posteriores, Glúteos e Braços', ex: ['Stiff com halteres 3x12', 'Elevação pélvica 3x12', 'Mesa flexora 3x12', 'Rosca direta 3x12', 'Tríceps na polia 3x12'] },
  ],
};

export const PLAN_ABCD = {
  id: 'plan-abcd',
  name: 'Padrão 2 – Intermediário ABCD',
  author: 'Ficha padrão',
  pullup: true, core: true,
  days: [
    { name: 'A – Peito e Tríceps', ex: ['Supino reto 4x10', 'Supino inclinado com halteres 3x10', 'Crucifixo 3x12', 'Tríceps testa 3x12', 'Tríceps na polia 3x12'] },
    { name: 'B – Costas e Bíceps', ex: ['Puxada frontal 4x10', 'Remada curvada 4x10', 'Remada unilateral 3x10', 'Rosca direta 3x12', 'Rosca martelo 3x12'] },
    { name: 'C – Pernas completas', ex: ['Agachamento livre 4x10', 'Leg press 4x12', 'Cadeira extensora 3x12', 'Mesa flexora 3x12', 'Panturrilha sentada 4x15'] },
    { name: 'D – Ombros e Glúteos', ex: ['Desenvolvimento 4x10', 'Elevação lateral 4x12', 'Crucifixo inverso 3x12', 'Elevação pélvica 4x10', 'Abdução 3x15'] },
  ],
};

export const BUILTIN_PLANS = [PLAN_EYSHILLA, PLAN_FULLBODY, PLAN_ABCD];

export const CORE = {
  loaded: ['Abdominal na polia 3x15', 'Abdominal com anilha 3x15', 'Elevação de pernas com caneleira 3x12'],
  free: ['Prancha 3x40s', 'Abdominal remador 3x20', 'Prancha lateral 3x30s (cada lado)', 'Abdominal bicicleta 3x20'],
};

export const ACTIVITY = {
  sedentario: { f: 1.2, label: 'Sedentário (pouco ou nenhum exercício)' },
  leve: { f: 1.375, label: 'Leve (1–3 treinos/semana)' },
  moderado: { f: 1.55, label: 'Moderado (3–5 treinos/semana)' },
  intenso: { f: 1.725, label: 'Intenso (6–7 treinos/semana)' },
  muito: { f: 1.9, label: 'Muito intenso (treino + trabalho físico)' },
};

export const DEFAULT_REMINDERS = {
  weigh: { on: true, times: ['07:00'] },
  water: { on: true, every: 2, from: '08:00', to: '21:00' },
  meals: { on: true, times: ['08:00', '12:15', '14:15', '18:45', '21:30'] },
  workout: { on: true, times: ['14:45'] },
  night: { on: true, times: ['21:45'] },
  photo: { on: true, times: ['07:15'], days: [0, 1] },
  chat: { on: true },
};

export function defaultProfile(over = {}) {
  return {
    name: '', age: null, height: null, sex: '', activity: 'moderado',
    startDate: new Date().toISOString().slice(0, 10),
    startWeight: null, goalWeight: null,
    interim: null, // { date, min, max }
    kcalGoal: 1600, kcalTol: 1800, proteinGoal: 160, waterGoal: 4000,
    weeklyRate: 0.8, // kg por semana projetado depois da curva de referência
    refCurve: [], // [{ date, min, max }]
    cardioGoal: [{ fromWeek: 1, min: 45, max: 60 }, { fromWeek: 2, min: 70, max: 80 }],
    planId: PLAN_EYSHILLA.id,
    plans: [], // fichas criadas pela própria pessoa
    reminders: structuredClone(DEFAULT_REMINDERS),
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo',
    color: '#0ea5a4',
    ...over,
  };
}

export const EYSHILLA_ID = '00000000-0000-4000-8000-000000000001';

export function eyshillaPreset() {
  return {
    ...defaultProfile({
      name: 'Eyshilla Cristyna', age: 26, height: 174, sex: 'F', activity: 'intenso',
      startDate: '2026-11-23', startWeight: 96.3, goalWeight: 75,
      interim: { date: '2026-12-28', min: 88.8, max: 90.2 },
      kcalGoal: 1600, kcalTol: 1800, proteinGoal: 160, waterGoal: 4000,
      weeklyRate: 0.8,
      refCurve: [
        { date: '2026-11-23', min: 96.3, max: 96.3 },
        { date: '2026-11-30', min: 93.0, max: 94.0 },
        { date: '2026-12-07', min: 91.5, max: 92.8 },
        { date: '2026-12-14', min: 90.5, max: 91.8 },
        { date: '2026-12-21', min: 89.5, max: 91.0 },
        { date: '2026-12-28', min: 88.8, max: 90.2 },
      ],
      planId: PLAN_EYSHILLA.id,
      color: '#db2777',
    }),
    id: EYSHILLA_ID,
    createdAt: '2026-11-19T00:00:00.000Z',
  };
}
