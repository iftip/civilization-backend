import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function sendMessage(chatId, text) {
  const url = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" })
  });
}

// 💥 TEMP VERSION: NO IMAGES
function getCity(bricks) {
  if (bricks < 10) return { name: "⛺ Camp" };
  if (bricks < 50) return { name: "🛖 Village" };
  if (bricks < 100) return { name: "🏠 Town" };
  if (bricks < 500) return { name: "🏙️ City" };
  return { name: "🏰 Kingdom" };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).json({ ok: true });

  const update = req.body;
  if (!update.message) return res.status(200).json({ ok: true });

  const msg = update.message;
  const chatId = msg.chat.id.toString();
  const text = (msg.text || "").trim();
  const groupName = msg.chat.title || `Group ${chatId}`;

  console.log("TEXT RECEIVED:", text);

  // /start
  if (text.startsWith("/start")) {
    await supabase.from("groups").upsert(
      { tg_group_id: chatId, name: groupName, bricks: 0 },
      { onConflict: "tg_group_id" }
    );

    await sendMessage(chatId, `🏰 Civilization started for *${groupName}*`);
  }

  // add brick
  await supabase.rpc("add_brick", { group_id: chatId });

  // /top
  if (text.startsWith("/top")) {
    const { data } = await supabase
      .from("groups")
      .select("name, bricks")
      .order("bricks", { ascending: false })
      .limit(10);

    let msg = "🏆 *Top Cities*\n\n";
    data.forEach((g, i) => {
      msg += `${i + 1}. *${g.name}* — ${g.bricks} bricks\n`;
    });
    await sendMessage(chatId, msg);
  }

  // /city — NOW ONLY TEXT
  if (text.startsWith("/city")) {
    const { data } = await supabase
      .from("groups")
      .select("name, bricks")
      .eq("tg_group_id", chatId)
      .single();

    if (!data) {
      await sendMessage(chatId, "⚠️ No city found. Use /start first.");
      return res.status(200).json({ ok: true });
    }

    const city = getCity(data.bricks);

    await sendMessage(
      chatId,
      `🏙️ *${data.name}*\nLevel: ${city.name}\nBricks: ${data.bricks}`
    );
  }

  return res.status(200).json({ ok: true });
}