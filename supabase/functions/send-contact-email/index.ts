import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { name, subject, message } = await req.json();
    if (!message || String(message).trim().length === 0) {
      return new Response(JSON.stringify({ error: "message is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("RESEND_API_KEY");
    const to = Deno.env.get("CONTACT_TO") || "kokudai-toiawase@outlook.com";
    const from = Deno.env.get("CONTACT_FROM");

    if (!apiKey || !from) {
      throw new Error("Mail service is not configured");
    }

    const emailText =
      "國大練習からお問い合わせが届きました。\n\n" +
      "【お名前】\n" + String(name || "未記入") + "\n\n" +
      "【件名】\n" + String(subject || "國大練習からのお問い合わせ") + "\n\n" +
      "【お問い合わせ内容】\n" + String(message);

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: subject || "國大練習からのお問い合わせ",
        text: emailText,
      }),
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result?.message || "Email send failed");
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: "メール送信に失敗しました" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
