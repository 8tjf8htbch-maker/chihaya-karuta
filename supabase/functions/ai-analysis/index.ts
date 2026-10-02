// 國大練習 - AI分析 Supabase Edge Function
// Gemini APIキーはこのファイルやGitHubには書かず、Supabase Edge Function Secrets に GEMINI_API_KEY として設定してください。

const ALLOWED_ORIGIN = 'https://8tjf8htbch-maker.github.io';
const MODEL = Deno.env.get('GEMINI_MODEL') || 'gemini-3.8-flash';

function corsHeaders(origin) {
  const allowed = origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN;
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json; charset=utf-8',
    'Vary': 'Origin'
  };
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders(origin)
  });
}

function extractOutputText(response) {
  return response?.choices?.[0]?.message?.content?.trim() || '';
}

const INSTRUCTIONS = [
  'あなたは競技かるたの練習記録を分析するアシスタントです。',
  '目的は、選手の成長・対戦傾向・練習内容・大会準備に役立つ情報を整理することです。',
  '勝率だけでなく、直近の推移、枚差、対戦相手、相手の級、対戦頻度、札分け、練習目的、練習テーマ、大会との違いを確認してください。',
  '記録から直接確認できる事実と、そこから考えられる練習上の選択肢を分けて書いてください。',
  '記録されていない原因を推測して断定しないでください。例えば「A級に弱い原因は守り」などとは言わないでください。',
  'サンプル数が少ない場合は、傾向の信頼性が低いことを明記してください。',
  '提案は「次に試せる選択肢」として提示し、唯一の正解として断定しないでください。',
  '競技かるたの技術的原因を記録なしに推測せず、必要なら「追加で記録すると分析できる情報」を示してください。',
  '以下の見出しで日本語で回答してください。',
  '【1. 現状】',
  '【2. 成長・変化】',
  '【3. 対戦傾向】',
  '【4. 級別の傾向】',
  '【5. 札分け・練習テーマ】',
  '【6. 大会との比較】',
  '【7. 次の練習で試せること】',
  '【8. 追加すると分析しやすい記録】',
  '簡潔だが具体的に書いてください。'
].join('\n');

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') || '';
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(origin) });
  }
  if (req.method !== 'POST') {
    return json({ error: 'POST only' }, 405, origin);
  }
  if (origin && origin !== ALLOWED_ORIGIN) {
    return json({ error: 'Origin not allowed' }, 403, origin);
  }

  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    return json({ error: 'GEMINI_API_KEY is not configured in Supabase Edge Function Secrets.' }, 503, origin);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON.' }, 400, origin);
  }

  const data = body?.data;
  if (!data || typeof data !== 'object') {
    return json({ error: 'data is required.' }, 400, origin);
  }

  const payload = JSON.stringify(data);

  try {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: INSTRUCTIONS },
          { role: 'user', content: payload }
        ],
        max_tokens: 1400
      })
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const rawMessage = result?.error?.message || result?.message || result?.error || 'Unknown Gemini error.';
      const detail = typeof rawMessage === 'string' ? rawMessage : JSON.stringify(rawMessage);
      return json({
        error: 'Gemini API request failed.',
        detail: '[' + response.status + '] ' + detail,
        model: MODEL
      }, response.status >= 500 ? 502 : response.status, origin);
    }

    const text = extractOutputText(result);
    if (!text) {
      return json({ error: 'AI returned no text.' }, 502, origin);
    }

    return json({
      model: result?.model || MODEL,
      analysis: text
    }, 200, origin);
  } catch (error) {
    return json({
      error: 'AI analysis request failed.',
      detail: error?.message || String(error)
    }, 500, origin);
  }
});
