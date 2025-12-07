This is the COMPLETE, FINAL FILE. It includes everything:
 * War (/attack <ID> with Cooldown)
 * Economy (/buy market)
 * Defense (/buy wall - Reduces damage by 50%)
 * Images (Correct .jpg logic)
 * Stability (No crashes)
Copy and paste this ENTIRE block into your api/bot.js file.
import { createClient } from '@supabase/supabase-js';

// Supabase Connection
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Helper: Send Text
async function sendMessage(chatId, text) {
  try {
    await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" })
    });
  } catch (e) {}
}

// Helper: Send Photo
async function sendPhoto(chatId, url, caption="") {
  try {
    const r = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendPhoto`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, photo: url, caption, parse_mode: "Markdown" })
    });
    if (!r.ok) throw new Error();
  } catch (e) {
    await sendMessage(chatId, caption);
  }
}

// City System
function getCity(bricks) {
  const base = "https://raw.githubusercontent.com/iftip/civilization-backend/main/api/images/";
  if (bricks < 10) return { name: "⛺ Camp", img: base + "Camp.jpg" };
  if (bricks < 50) return { name: "🛖 Village", img: base + "Village.jpg" };
  if (bricks < 100) return { name: "🏠 Town", img: base + "Town.jpg" };
  return { name: bricks < 500 ? "🏙️ City" : "🏰 Kingdom", img: base + "City.jpg" };
}

export default async function handler(req, res) {
  // Always return 200 OK at the end
  if (req.method !== "POST") return res.status(200).json({ ok: true });

  try {
    const update = req.body;
    if (!update?.message) return res.status(200).json({ ok: true });

    const msg = update.message;
    const chatId = String(msg.chat.id);
    const txt = (msg.text || "").trim();
    const parts = txt.split(" ");
    const cmd = parts[0];
    const groupName = msg.chat.title || `Group ${chatId}`;

    // --- /start ---
    if (cmd.startsWith("/start")) {
      await supabase.from("groups").upsert(
        { tg_group_id: chatId, name: groupName, bricks: 0 },
        { onConflict: "tg_group_id" }
      );
      await sendMessage(chatId, `🏰 Civilization started for *${groupName}*`);
    }

    // Passive Bricks (+Markets)
    try { await supabase.rpc("add_brick", { group_id: chatId }); } catch {}

    // --- /top ---
    if (cmd.startsWith("/top")) {
      const { data } = await supabase
        .from("groups")
        .select("name, bricks, markets, walls, tg_group_id")
        .order("bricks", { ascending: false })
        .limit(10);

      let t = "🏆 *Top Cities*\n\n";
      data?.forEach((g, i) => {
        const icons = (g.markets ? "🏪" : "") + (g.walls ? "🛡️" : "");
        t += `${i+1}. *${g.name}* — ${g.bricks} 🧱 ${icons}\n🆔 \`${g.tg_group_id}\`\n\n`;
      });
      await sendMessage(chatId, t);
    }

    // --- /city ---
    if (cmd.startsWith("/city")) {
      const { data } = await supabase
        .from("groups")
        .select("name, bricks, markets, walls")
        .eq("tg_group_id", chatId)
        .single();

      if (!data) return await sendMessage(chatId, "Use /start first.");

      const city = getCity(data.bricks);
      const m = data.markets ? `\n🏪 Markets: *${data.markets}* (+${data.markets * 2}/msg)` : "";
      const w = data.walls ? `\n🛡️ Walls: *${data.walls}* (-50% Dmg)` : "";
      
      const caption = `🏙️ *${data.name}*\n${city.name}\nBricks: *${data.bricks}* 🧱${m}${w}`;
      await sendPhoto(chatId, city.img, caption);
    }

    // --- /buy (MARKET + WALL) ---
    if (cmd.startsWith("/buy")) {
      const item = parts[1];
      
      // SHOP MENU
      if (!item) {
        return await sendMessage(chatId,
          "🛒 *Marketplace*\n\n" +
          "1️⃣ `/buy market` (500 🧱)\n" +
          "   _Generates +2 bricks/msg_\n\n" +
          "2️⃣ `/buy wall` (1000 🧱)\n" +
          "   _Reduces enemy attacks by 50%_"
        );
      }

      const { data: g } = await supabase.from("groups").select("bricks, markets, walls").eq("tg_group_id", chatId).single();
      if (!g) return await sendMessage(chatId, "Use /start first.");

      // BUY MARKET
      if (item === "market") {
        if (g.bricks < 500) return await sendMessage(chatId, `❌ Need 500 bricks. Have: ${g.bricks}`);
        await supabase.from("groups").update({ bricks: g.bricks - 500, markets: (g.markets||0) + 1 }).eq("tg_group_id", chatId);
        await sendMessage(chatId, `✅ Market Built! (+2 income)`);
      }
      // BUY WALL
      else if (item === "wall") {
        if (g.bricks < 1000) return await sendMessage(chatId, `❌ Need 1000 bricks. Have: ${g.bricks}`);
        if (g.walls > 0) return await sendMessage(chatId, `❌ You already have a Wall!`);
        
        await supabase.from("groups").update({ bricks: g.bricks - 1000, walls: 1 }).eq("tg_group_id", chatId);
        await sendMessage(chatId, `✅ **Great Wall Constructed!**\nEnemy attacks are now 50% weaker.`);
      }
    }

    // --- /attack <ID> (WAR + DEFENSE) ---
    if (cmd.startsWith("/attack")) {
      const targetId = parts[1];
      if (!targetId) return await sendMessage(chatId, "⚔️ Usage: `/attack <ID>`");
      if (targetId === chatId) return await sendMessage(chatId, "❌ Cannot attack self.");

      const { data: att } = await supabase.from("groups").select("name, bricks, last_attack").eq("tg_group_id", chatId).single();
      const { data: def } = await supabase.from("groups").select("name, bricks, walls").eq("tg_group_id", targetId).single();

      if (!att) return await sendMessage(chatId, "Use /start first.");
      if (!def) return await sendMessage(chatId, "❌ Target not found.");

      // Cooldown
      const now = Date.now();
      if (att.last_attack && now - att.last_attack < 60000) {
        const wait = Math.ceil((60000 - (now - att.last_attack)) / 1000);
        return await sendMessage(chatId, `⌛ Wait ${wait}s.`);
      }

      // Battle Logic (Check for Walls)
      const reduction = def.walls ? 0.5 : 1.0;
      const steal = Math.max(1, Math.floor((def.bricks * 0.10) * reduction));

      await supabase.from("groups").update({ bricks: def.bricks - steal }).eq("tg_group_id", targetId);
      await supabase.from("groups").update({ bricks: att.bricks + steal, last_attack: now }).eq("tg_group_id", chatId);

      const shielded = def.walls ? " (🛡️ Wall blocked 50%!)" : "";
      await sendMessage(chatId, `⚔️ Victory! Stole ${steal} bricks from ${def.name}!${shielded}`);
      await sendMessage(targetId, `⚠️ Attacked by ${att.name}! Lost ${steal} bricks.${shielded}`);
    }

  } catch (err) { console.error(err); }

  return res.status(200).json({ ok: true });
}

