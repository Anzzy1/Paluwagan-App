// Supabase Edge Function: ai
//
// Online AI for the app, through Groq. The Groq API key stays here on the server and
// never ships in the app. The caller must be signed in.
// (Without internet the app uses a local model through Ollama instead: src/lib/localAi.ts.)
//
// Modes (POST JSON):
//   {"mode":"chat",    "messages":[{role,content}...], "context":"..."}  -> {"reply": "..."}
//   {"mode":"plan",    "goal":{...}, "context":"..."}                     -> {"plan": {...}}
//   {"mode":"insight", "context":"..."}                                   -> {"insight": "..."}
//
// `context` is a plain-text snapshot of the user's own paluwagan, dues, goals and ipon,
// built on the device (src/lib/ai.ts).
//
// Deployed as "hyper-service" (dashboard name; the app calls that, see AI_FUNCTION in src/lib/ai.ts).
// CLI:     supabase functions deploy hyper-service  (from this folder's code)
// Secrets: supabase secrets set GROQ_API_KEY=gsk_...
//          (optional) supabase secrets set GROQ_MODEL=openai/gpt-oss-120b

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
// Production model on Groq that also supports strict JSON schema output (used for plans).
const MODEL = Deno.env.get('GROQ_MODEL') || 'openai/gpt-oss-120b';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const clip = (s: unknown, n: number) => String(s ?? '').slice(0, n);

const MASCOT_PROMPT = `You are Ipon, the friendly squirrel mascot and money buddy inside Paluwagan, a Filipino app for running paluwagan (rotating savings circles) and personal ipon (savings goals).

Who you help: everyday Filipino earners — employees paid every kinsenas (15th and 30th), freelancers, students, OFW families. Amounts are in Philippine pesos (₱).

How to answer:
- Always call a group a "paluwagan" (plural also "paluwagan"), never a "circle", because that is what the app calls it.
- Ground every answer in the user's data snapshot when it is relevant. Quote real numbers, paluwagan names, due dates and goal names from it. Never invent figures that are not in the snapshot; if something is missing, say so and suggest how they can add it in the app.
- Give practical, specific advice: concrete peso amounts, dates, and next steps they can do in the app (pay a due contribution, add a deposit, set a target date, adjust a savings plan).
- Be warm, encouraging and concise — like a smart friend, not a bank. Short paragraphs. Use simple bullet points ("• ") for lists. No markdown headings, tables, bold or code blocks: the chat shows plain text.
- Write in clear English. You may sprinkle a light Filipino word (ipon, hulog, kinsenas) where natural.
- Paluwagan facts: members contribute a fixed amount each round; one member (by draw order) receives the whole pot each round; there is no interest. Warn the user if a "paluwagan" promises interest or returns, since that is a common scam pattern.
- You are not a licensed financial adviser. For investments, loans, taxes or legal matters, give general educational guidance and suggest a qualified professional for big decisions. Never ask for passwords, OTPs, PINs or full account numbers.
- If asked about something unrelated to money, savings, budgeting or the app, answer briefly and steer back.`;

type Msg = { role: 'system' | 'user' | 'assistant'; content: string };

class GroqError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function ask(opts: { system: string; context: string; messages: Msg[]; maxTokens: number; schema?: Record<string, unknown> }) {
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${Deno.env.get('GROQ_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      max_completion_tokens: opts.maxTokens,
      temperature: 0.5,
      messages: [
        { role: 'system', content: `${opts.system}

User data snapshot (as of ${new Date().toISOString().slice(0, 10)}):
${opts.context || '(no data yet)'}` },
        ...opts.messages,
      ],
      ...(opts.schema ? { response_format: { type: 'json_schema', json_schema: { name: 'savings_plan', strict: true, schema: opts.schema } } } : {}),
    }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new GroqError(res.status, body?.error?.message ?? `HTTP ${res.status}`);
  const text = String(body?.choices?.[0]?.message?.content ?? '').trim();
  if (!text) throw new GroqError(502, 'Empty answer');
  return text;
}

const PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['amount', 'frequency', 'deadline', 'summary', 'tips'],
  properties: {
    amount: { type: 'number', description: 'Peso amount to save each period, rounded to a friendly number' },
    frequency: { type: 'string', enum: ['daily', 'weekly', 'kinsenas', 'monthly'] },
    deadline: { type: 'string', description: 'Target date as YYYY-MM-DD' },
    summary: { type: 'string', description: 'One or two sentences explaining the plan' },
    tips: { type: 'array', items: { type: 'string' }, description: 'Two or three short, specific saving tips' },
  },
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (!Deno.env.get('GROQ_API_KEY')) return json({ error: 'AI is not set up yet. Add the GROQ_API_KEY secret to the ai function.' }, 503);

  // Signed-in users only.
  const auth = req.headers.get('Authorization') ?? '';
  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
  const { data: userData } = await userClient.auth.getUser();
  if (!userData.user) return json({ error: 'Please sign in to use Ipon AI.' }, 401);

  const body = await req.json().catch(() => ({}));
  const context = clip(body.context, 12_000);

  try {
    // ---------------------------------------------------------------- chat
    if (body.mode === 'chat' && Array.isArray(body.messages)) {
      const history: Msg[] = body.messages
        .slice(-20)
        .filter((m: { role?: string }) => m?.role === 'user' || m?.role === 'assistant')
        .map((m: { role: 'user' | 'assistant'; content: unknown }) => ({ role: m.role, content: clip(m.content, 2_000) }));
      while (history.length && history[0].role !== 'user') history.shift();
      if (!history.length || history[history.length - 1].role !== 'user') return json({ error: 'Send a message first.' }, 400);
      const reply = await ask({ system: MASCOT_PROMPT, context, messages: history, maxTokens: 4096 });
      return json({ reply });
    }

    // ---------------------------------------------------------------- plan
    if (body.mode === 'plan' && body.goal) {
      const g = body.goal;
      const prompt = `Suggest a realistic savings plan for this goal.
Goal: ${clip(g.title, 60)}
Target: ₱${Number(g.target) || 0}
Already saved: ₱${Number(g.saved) || 0}
Target date the user chose: ${g.deadline ? clip(g.deadline, 10) : 'none — propose one'}
Today: ${new Date().toISOString().slice(0, 10)}

Use the snapshot to fit the plan around what they already pay into their paluwagan (avoid stacking big ipon on weeks with large dues) and their pay rhythm. Prefer "kinsenas" if they seem payday-based. Keep the amount achievable; if the chosen date is unrealistic, propose a later one and say why.`;
      const raw = await ask({ system: MASCOT_PROMPT, context, messages: [{ role: 'user', content: prompt }], maxTokens: 4096, schema: PLAN_SCHEMA });
      return json({ plan: JSON.parse(raw) });
    }

    // ---------------------------------------------------------------- insight
    if (body.mode === 'insight') {
      const prompt = 'Look at my snapshot and give me one short, specific insight about my savings and paluwagan right now (max 2 sentences, under 45 words). Mention a real number or name from my data and one next step.';
      const insight = await ask({ system: MASCOT_PROMPT, context, messages: [{ role: 'user', content: prompt }], maxTokens: 2048 });
      return json({ insight });
    }

    return json({ error: 'Unknown mode' }, 400);
  } catch (e) {
    if (e instanceof GroqError) {
      if (e.status === 429) return json({ error: 'Ipon is busy right now. Try again in a minute.' }, 429);
      if (e.status === 401 || e.status === 403) return json({ error: 'The AI key is invalid. Check the GROQ_API_KEY secret.' }, 503);
      return json({ error: `AI error (${e.status}). Please try again.` }, 502);
    }
    return json({ error: e instanceof Error ? e.message : 'Something went wrong' }, 500);
  }
});
