import { createClient } from '@supabase/supabase-js';

// Supabase Connection
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Send text
async function sendMessage(chatId, text) {
  const url = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" })
  });
}

// Send photo
async function sendPhoto(chatId, photoUrl, caption = "") {
  const url = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendPhoto`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        photo: photoUrl,
        caption,
        parse_mode: "Markdown"
      })
    });
    if (!res.ok) throw new Error("Telegram photo failed");
  } catch (err) {
    await sendMessage(chatId, caption);
  }
}

// City system (4 images)
function getCity(bricks) {
  const base = "https://raw.githubusercontent.com/iftip/civilization-backend/main/api/images/";
  if (bricks < 10) return { name: "⛺ Camp", img: base + "Camp.jpg" };
  if (bricks < 50) return { name: "🛖 Village", img: base + "Village.jpg" };
  if (bricks < 100) return { name: "🏠 Town", img: base + "Town.jpg" };
  return { name: bricks < 500 ? "🏙️ City" : "🏰 Kingdom", img: base + "City.jpg" };
}

export default async function handler(req, res) {

  if (req.method !== "POST")
    return res.status(200).json({ ok: true });

  const update = req.body;
  if (!update?.message)
    return res.status(200).json({ ok: true });

  // ⚡ FIX FOR SLOWNESS + DUPLICATE SPAM
  // Telegram stops retrying after this instant response.
  res.status(200).json({ ok: true });

  // ------------------------------------------------------
  // 🚀 All game logic continues AFTER Telegram is satisfied
  // ------------------------------------------------------

  const msg = update.message;
  const chatId = String(msg.chat.id);
  const raw = (msg.text || "").trim();
  const parts = raw.split(" ");
  const command = parts[0];
  const groupName = msg.chat.title || `Group ${chatId}`;

  // /start
  if (command.startsWith("/start")) {
    await supabase.from("groups").upsert(
      { tg_group_id: chatId, name: groupName, bricks: 0 },
      { onConflict: "tg_group_id" }
    );
    await sendMessage(chatId, `🏰 Civilization started for *${groupName}*`);
  }

  // Passive brick (uses new markets logic)
  try {
    await supabase.rpc("add_brick", { group_id: chatId });
  } catch {}

  // /top
  if (command.startsWith("/top")) {
    const { data } = await supabase
      .from("groups")
      .select("name, bricks, markets, tg_group_id")
      .order("bricks", { ascending: false })
      .limit(10);

    let out = "🏆 *Top Cities*\n\n";
    data?.forEach((g, i) => {
      const m = g.markets ? ` (+${g.markets}🏪)` : "";
      out += `${i + 1}. *${g.name}* — ${g.bricks} 🧱${m}\n🆔 \`${g.tg_group_id}\`\n\n`;
    });

    await sendMessage(chatId, out);
  }

  // /city
  if (command.startsWith("/city")) {
    const { data } = await supabase
      .from("groups")
      .select("name, bricks, markets")
      .eq("tg_group_id", chatId)
      .single();

    if (!data) return sendMessage(chatId, "⚠️ No city found. Use /start.");

    const city = getCity(data.bricks);
    const mk = data.markets ? `\n🏪 Markets: *${data.markets}* (+${data.markets * 2}/msg)` : "";
    const caption = `🏙️ *${data.name}*\n${city.name}\nBricks: *${data.bricks}* 🧱${mk}`;
    await sendPhoto(chatId, city.img, caption);
  }

  // /buy market
  if (command.startsWith("/buy")) {
    const item = parts[1];

    if (item !== "market") {
      await sendMessage(chatId,
        "🛒 *Marketplace*\n\n" +
        "🏪 *Market* — 500 🧱\n" +
        "_Generates +2 extra bricks per message_\n\n" +
        "Use: `/buy market`"
      );
      return;
    }

    const { data: grp } = await supabase
      .from("groups")
      .select("bricks, markets")
      .eq("tg_group_id", chatId)
      .single();

    if (!grp) return sendMessage(chatId, "❌ Use /start first.");

    if (grp.bricks < 500)
      return sendMessage(chatId, `❌ Not enough bricks.\nYou need 500, you have ${grp.bricks}.`);

    await supabase.from("groups").update({
      bricks: grp.bricks - 500,
      markets: (grp.markets || 0) + 1
    }).eq("tg_group_id", chatId);

    await sendMessage(chatId, `✅ *Market Built!*\nIncome increased by +2/msg.`);
  }

  // /attack <ID>
  if (command.startsWith("/attack")) {
    const targetId = parts[1];

    if (!targetId)
      return sendMessage(chatId, "⚔️ Usage: `/attack <ID>`\n(Get ID from /top)");

    if (targetId === chatId)
      return sendMessage(chatId, "❌ You cannot attack yourself.");

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

    if (!attacker) return sendMessage(chatId, "❌ Use /start first.");
    if (!defender) return sendMessage(chatId, "❌ Target does not exist.");

    // Cooldown 60s
    const now = Date.now();
    if (attacker.last_attack && now - attacker.last_attack < 60000) {
      const wait = Math.ceil((60000 - (now - attacker.last_attack)) / 1000);
      return sendMessage(chatId, `⌛ Wait *${wait}s* to attack again.`);
    }

    const steal = Math.max(1, Math.floor(defender.bricks * 0.10));

    await supabase.from("groups").update({
      bricks: defender.bricks - steal
    }).eq("tg_group_id", targetId);

    await supabase.from("groups").update({
      bricks: attacker.bricks + steal,
      last_attack: now
    }).eq("tg_group_id", chatId);

    await sendMessage(chatId,
      `⚔️ *Victory!*\nYou stole *${steal} bricks* from *${defender.name}*!`
    );

    await sendMessage(targetId,
      `⚠️ *Your city was attacked by ${attacker.name}!*`
    );
  }
}