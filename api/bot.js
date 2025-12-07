import { createClient } from '@supabase/supabase-js';

// Supabase Connection
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Helper: Send Text
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

// Helper: Send Photo
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
      // Only log error, fallback to text message below
      console.error(`Telegram sendPhoto failed ${res.status}: ${text}`);
      throw new Error("Photo failed"); 
    }
  } catch (err) {
    // Fallback: Send text if image fails
    await sendMessage(chatId, caption);
  }
}

// Helper: Get City Image
function getCity(bricks) {
  const base = "https://raw.githubusercontent.com/iftip/civilization-backend/main/api/images/";
  // Using Capitalized JPGs as confirmed working
  if (bricks < 10) return { name: "⛺ Camp", img: base + "Camp.jpg" };
  if (bricks < 50) return { name: "🛖 Village", img: base + "Village.jpg" };
  if (bricks < 100) return { name: "🏠 Town", img: base + "Town.jpg" };
  // 100+ uses City.jpg for both City and Kingdom
  return { name: bricks < 500 ? "🏙️ City" : "🏰 Kingdom", img: base + "City.jpg" };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).json({ ok: true });

  const update = req.body;
  if (!update?.message) return res.status(200).json({ ok: true });

  const msg = update.message;
  const chatId = String(msg.chat.id);
  const rawText = (msg.text || "").trim();
  const parts = rawText.split(/\s+/);
  const command = parts[0]; // e.g. /city or /city@BotName
  const groupName = msg.chat.title || `Group ${chatId}`;

  console.log("TEXT RECEIVED:", rawText);

  try {
    // --- /start ---
    if (command === "/start" || command.startsWith("/start@")) {
      await supabase.from("groups").upsert(
        { tg_group_id: chatId, name: groupName, bricks: 0 },
        { onConflict: "tg_group_id" }
      );
      await sendMessage(chatId, `🏰 Civilization started for *${groupName}*`);
    }

    // --- Passive Brick ---
    try {
      await supabase.rpc("add_brick", { group_id: chatId });
    } catch (e) {
      console.error("Passive brick error:", e);
    }

    // --- /top (With IDs for attacking) ---
    if (command === "/top" || command.startsWith("/top@")) {
      const { data, error } = await supabase
        .from("groups")
        .select("name, bricks, tg_group_id")
        .order("bricks", { ascending: false })
        .limit(10);

      if (error) {
        await sendMessage(chatId, "Could not fetch leaderboard.");
      } else {
        let out = "🏆 *Top Cities*\n(Copy ID to attack)\n\n";
        (data || []).forEach((g, i) => {
          out += `${i + 1}. *${g.name || 'Unknown'}* — ${g.bricks} 🧱\n🆔 \`${g.tg_group_id}\`\n\n`;
        });
        await sendMessage(chatId, out);
      }
    }

    // --- /city ---
    if (command === "/city" || command.startsWith("/city@")) {
      const { data } = await supabase
        .from("groups")
        .select("name, bricks")
        .eq("tg_group_id", chatId)
        .single();

      if (!data) {
        await sendMessage(chatId, "⚠️ No city found. Use /start first.");
      } else {
        const city = getCity(data.bricks || 0);
        const caption = `🏙️ *${data.name || groupName}*\n${city.name}\nBricks: *${data.bricks || 0}* 🧱`;
        await sendPhoto(chatId, city.img, caption);
      }
    }

    // --- /attack (WAR MODULE) ---
    if (command === "/attack" || command.startsWith("/attack@")) {
      const targetId = parts[1];

      // 1. Validate Input
      if (!targetId) {
        await sendMessage(chatId, "⚔️ **War System**\nUsage: `/attack <TargetID>`\n(Get IDs from /top)");
        return res.status(200).json({ ok: true });
      }
      if (targetId === chatId) {
        await sendMessage(chatId, "❌ You cannot attack yourself.");
        return res.status(200).json({ ok: true });
      }

      // 2. Fetch Attacker & Defender
      // We try to select 'last_attack'. If column missing, Supabase ignores it silently usually.
      const { data: attacker } = await supabase
        .from("groups")
        .select("name, bricks, last_attack")
        .eq("tg_group_id", chatId)
        .single();

      const { data: defender } = await supabase
        .from("groups")
        .select("name, bricks")
        .eq("tg_group_id", targetId)
        .single();

      if (!attacker) return sendMessage(chatId, "❌ You must /start first.");
      if (!defender) return sendMessage(chatId, "❌ Target group not found.");

      // 3. Cooldown Check (1 minute)
      const now = Date.now();
      if (attacker.last_attack) {
        const diff = now - attacker.last_attack;
        if (diff < 60000) { // 60 seconds
          const waitSecs = Math.ceil((60000 - diff) / 1000);
          await sendMessage(chatId, `⌛ Troops are resting. Wait **${waitSecs}s**.`);
          return res.status(200).json({ ok: true });
        }
      }

      // 4. Calculate Battle (Steal 10%)
      const steal = Math.max(1, Math.floor(defender.bricks * 0.10));

      // 5. Update Database
      await supabase.from("groups")
        .update({ bricks: defender.bricks - steal })
        .eq("tg_group_id", targetId);

      // Try to update last_attack. If column missing, it might error, so we catch it.
      try {
        await supabase.from("groups")
          .update({ bricks: attacker.bricks + steal, last_attack: now })
          .eq("tg_group_id", chatId);
      } catch (err) {
        // Fallback: update bricks only (if no last_attack column)
        await supabase.from("groups")
          .update({ bricks: attacker.bricks + steal })
          .eq("tg_group_id", chatId);
      }

      // 6. Notify Results
      await sendMessage(chatId, `⚔️ *Victory!*\nYou stole *${steal} bricks* from *${defender.name}*!`);
      await sendMessage(targetId, `⚠️ **Under Attack!**\n*${attacker.name}* stole *${steal} bricks* from you!`);
    }

  } catch (fatal) {
    console.error("Handler Fatal Error:", fatal);
  }

  return res.status(200).json({ ok: true });
}
