import { createClient } from '@supabase/supabase-js';

// Connect to Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Send text message
async function sendMessage(chatId, text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' })
    });
  } catch (err) {
    console.error("SendMessage Error:", err);
  }
}

// Send image message
async function sendPhoto(chatId, photoUrl, caption = "") {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const url = `https://api.telegram.org/bot${token}/sendPhoto`;

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        photo: photoUrl,
        caption: caption,
        parse_mode: 'Markdown'
      })
    });
  } catch (err) {
    console.error("SendPhoto Error:", err);
  }
}

// Level name + image based on bricks
function getCity(bricks) {
  if (bricks < 10)
    return { name: "⛺ Camp", img: "https://i.imgur.com/8Qz5K0P.png" };

  if (bricks < 50)
    return { name: "🛖 Village", img: "https://i.imgur.com/X2f3s9L.png" };

  if (bricks < 100)
    return { name: "🏠 Town", img: "https://i.imgur.com/7dP9k2m.png" };

  if (bricks < 500)
    return { name: "🏙️ City", img: "https://i.imgur.com/e4R3v8K.png" };

  return { name: "🏰 Kingdom", img: "https://i.imgur.com/Z9k4pLm.png" };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).json({ ok: true });

  const update = req.body;
  if (!update.message) return res.status(200).json({ ok: true });

  const msg = update.message;
  const chatId = msg.chat.id.toString();
  const text = msg.text || "";
  const groupName = msg.chat.title || `Group ${chatId}`;

  // 1. /start
  if (text.startsWith("/start")) {
    await supabase
      .from("groups")
      .update({ name: groupName })
      .eq("tg_group_id", chatId);

    await sendMessage(chatId, `🏰 *Civilization Bot Online!*\n\nCity registered: *${groupName}*`);
  }

  // 2. Passive +1 brick
  await supabase.rpc("add_brick", { group_id: chatId });

  // 3. /top
  if (text.startsWith("/top")) {
    const { data } = await supabase
      .from("groups")
      .select("name, bricks")
      .order("bricks", { ascending: false })
      .limit(10);

    let msg = "🏆 *Top Cities*\n\n";

    data.forEach((g, i) => {
      const lvl = getCity(g.bricks).name;
      msg += `${i + 1}. *${g.name}*\n${lvl} • ${g.bricks} 🧱\n\n`;
    });

    await sendMessage(chatId, msg);
  }

  // 4. /city
  if (text.startsWith("/city")) {
    const { data } = await supabase
      .from("groups")
      .select("name, bricks")
      .eq("tg_group_id", chatId)
      .single();

    const city = getCity(data.bricks);
    const caption = `🏙️ *${data.name}*\n${city.name}\nBricks: *${data.bricks}* 🧱`;

    await sendPhoto(chatId, city.img, caption);
  }

  return res.status(200).json({ ok: true });
}