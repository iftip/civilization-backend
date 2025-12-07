import { createClient } from '@supabase/supabase-js';

// Connect to Supabase
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

// Send image
async function sendPhoto(chatId, photoUrl, caption = "") {
  const url = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendPhoto`;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, photo: photoUrl, caption, parse_mode: "Markdown" })
    });
  } catch (err) {
    console.error("SendPhoto Error:", err);
  }
}

// === YOUR getCity function (with base) ===
function getCity(bricks) {
  const base = "https://raw.githubusercontent.com/iftip/civilization-backend/main/api/images/";

  if (bricks < 10)
    return { name: "⛺ Camp", img: base + "Camp.jpg" };

  if (bricks < 50)
    return { name: "🛖 Village", img: base + "Village.jpg" };

  if (bricks < 100)
    return { name: "🏠 Town", img: base + "Town.jpg" };

  if (bricks < 500)
    return { name: "🏙️ City", img: base + "City.jpg" };

  // Kingdom uses City.jpg (no extra file needed)
  return { name: "🏰 Kingdom", img: base + "City.jpg" };
}
// === end getCity ===

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).json({ ok: true });

  const update = req.body;
  if (!update.message) return res.status(200).json({ ok: true });

  const msg = update.message;
  const chatId = msg.chat.id.toString();
  const text = (msg.text || "").trim();
  const groupName = msg.chat.title || `Group ${chatId}`;

  console.log("TEXT RECEIVED:", text);

  try {
    // /start
    if (text.startsWith("/start")) {
      await supabase.from("groups").upsert(
        { tg_group_id: chatId, name: groupName, bricks: 0 },
        { onConflict: "tg_group_id" }
      );

      await sendMessage(chatId, `🏰 Civilization started for *${groupName}*`);
    }

    // Passive brick (crash-proof)
    try {
      const { error } = await supabase.rpc("add_brick", { group_id: chatId });
      if (error) console.error("add_brick error:", error);
    } catch (e) {
      console.error("add_brick RPC crashed:", e);
    }

    // /top
    if (text.startsWith("/top")) {
      const { data, error } = await supabase
        .from("groups")
        .select("name, bricks")
        .order("bricks", { ascending: false })
        .limit(10);

      if (error) throw error;

      let out = "🏆 *Top Cities*\n\n";
      data.forEach((g, i) => {
        out += `${i + 1}. *${g.name}* — ${g.bricks} bricks\n`;
      });

      await sendMessage(chatId, out);
    }

    // /city  — handle /city, /city@BotName and group variants
    if (
      text === "/city" ||
      text.startsWith("/city@") ||
      text.startsWith("/city ")
    ) {
      const { data, error } = await supabase
        .from("groups")
        .select("name, bricks")
        .eq("tg_group_id", chatId)
        .single();

      if (error) {
        console.error("/city DB error:", error);
        await sendMessage(chatId, "⚠️ Could not fetch city data.");
      } else if (!data) {
        await sendMessage(chatId, "⚠️ No city found. Use /start first.");
      } else {
        const city = getCity(data.bricks);
        const caption = `🏙️ *${data.name}*\n${city.name}\nBricks: *${data.bricks}* 🧱`;

        // Try to send image; if sendPhoto fails it will be logged but won't crash handler
        try {
          await sendPhoto(chatId, city.img, caption);
        } catch (e) {
          console.error("sendPhoto failed:", e);
          // fallback to text if image fails
          await sendMessage(chatId, `🏙️ *${data.name}*\n${city.name}\nBricks: *${data.bricks}* 🧱`);
        }
      }
    }
  } catch (fatal) {
    console.error("Fatal Bot Error:", fatal);
  }

  return res.status(200).json({ ok: true });
}