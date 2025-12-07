import { createClient } from '@supabase/supabase-js';

// Supabase (server-side safe)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Send text message
async function sendMessage(chatId, text) {
  const url = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" })
    });
  } catch (err) {
    console.error("SendMessage Error:", err);
  }
}

// Send photo with fallback
async function sendPhoto(chatId, photoUrl, caption = "") {
  const url = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendPhoto`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, photo: photoUrl, caption, parse_mode: "Markdown" })
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Telegram sendPhoto failed ${res.status}: ${text}`);
    }
  } catch (err) {
    console.error("sendPhoto error:", err);
    // fallback to text so /city still responds
    await sendMessage(chatId, caption);
  }
}

// === ONLY 4 IMAGE URLS: Camp, Village, Town, City ===
function getCity(bricks) {
  const base = "https://raw.githubusercontent.com/iftip/civilization-backend/main/api/images/";

  if (bricks < 10) return { name: "⛺ Camp", img: base + "Camp.jpg" };
  if (bricks < 50) return { name: "🛖 Village", img: base + "Village.jpg" };
  if (bricks < 100) return { name: "🏠 Town", img: base + "Town.jpg" };
  // 100+ → City image used for both City and Kingdom (no 5th URL)
  return { name: bricks < 500 ? "🏙️ City" : "🏰 Kingdom", img: base + "City.jpg" };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).json({ ok: true });

  const update = req.body;
  if (!update?.message) return res.status(200).json({ ok: true });

  const msg = update.message;
  const chatId = String(msg.chat.id);
  const rawText = (msg.text || "").trim();
  const text = rawText.split(/\s+/)[0]; // take first token like /city or /city@Bot
  const groupName = msg.chat.title || `Group ${chatId}`;

  console.log("TEXT RECEIVED:", rawText);

  try {
    // /start: register/upsert
    if (text === "/start" || text.startsWith("/start@")) {
      await supabase.from("groups").upsert(
        { tg_group_id: chatId, name: groupName, bricks: 0 },
        { onConflict: "tg_group_id" }
      );
      await sendMessage(chatId, `🏰 Civilization started for *${groupName}*`);
    }

    // Passive brick (wrapped)
    try {
      const { error } = await supabase.rpc("add_brick", { group_id: chatId });
      if (error) console.error("add_brick rpc error:", error);
    } catch (e) {
      console.error("add_brick crashed:", e);
    }

    // /top
    if (text === "/top" || text.startsWith("/top@")) {
      const { data, error } = await supabase
        .from("groups")
        .select("name, bricks")
        .order("bricks", { ascending: false })
        .limit(10);
      if (error) {
        console.error("/top db error:", error);
        await sendMessage(chatId, "Could not fetch leaderboard.");
      } else {
        let out = "🏆 *Top Cities*\n\n";
        (data || []).forEach((g, i) => {
          out += `${i + 1}. *${g.name || 'Unknown'}* — ${g.bricks || 0} 🧱\n`;
        });
        await sendMessage(chatId, out);
      }
    }

    // /city (handles /city, /city@BotName, etc.)
    if (text === "/city" || text.startsWith("/city@")) {
      // fetch group row
      const { data, error } = await supabase
        .from("groups")
        .select("name, bricks")
        .eq("tg_group_id", chatId)
        .single();

      if (error) {
        console.error("/city db error:", error);
        await sendMessage(chatId, "⚠️ Could not fetch city data. Try /start first.");
      } else if (!data) {
        await sendMessage(chatId, "⚠️ No city found. Use /start first.");
      } else {
        const city = getCity(data.bricks || 0);
        const caption = `🏙️ *${data.name || groupName}*\n${city.name}\nBricks: *${data.bricks || 0}* 🧱`;
        await sendPhoto(chatId, city.img, caption);
      }
    }
  } catch (fatal) {
    console.error("Fatal handler error:", fatal);
  }

  return res.status(200).json({ ok: true });
}