import { createClient } from '@supabase/supabase-js';

// Connect to Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Helper to send messages
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
    console.error("Telegram Send Error:", err);
  }
}

// 🏰 City Level Logic
function getCityLevel(bricks) {
  if (bricks < 10) return "⛺ Camp";
  if (bricks < 50) return "🛖 Village";
  if (bricks < 100) return "🏠 Town";
  if (bricks < 500) return "🏙️ City";
  return "🏰 Kingdom";
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).json({ status: "ok" });

  const update = req.body;
  if (!update.message) return res.status(200).json({ status: "no_message" });

  const message = update.message;
  const chatId = message.chat.id;
  const text = message.text || "";
  const groupTitle = message.chat.title || `Group ${chatId}`;

  // 1. /start Command
  if (text.startsWith('/start')) {
    await supabase
      .from('groups')
      .update({ name: groupTitle })
      .eq('tg_group_id', chatId.toString());

    await sendMessage(chatId, "🏰 **Civilization Bot Updated!**\n\nYour city **" + groupTitle + "** is registered.\nKeep chatting to build your empire!");
  }

  // 2. Add Brick (Passive)
  try {
    const { error } = await supabase.rpc('add_brick', { group_id: chatId.toString() });
    if (error) console.error("Add Brick Error:", error);
  } catch (err) {
    console.error("Passive Brick Error:", err);
  }

  // 3. Leaderboard
  if (text.startsWith('/top') || text.startsWith('/leaderboard')) {
    await supabase
      .from('groups')
      .update({ name: groupTitle })
      .eq('tg_group_id', chatId.toString());

    const { data: groups } = await supabase
      .from('groups')
      .select('tg_group_id, bricks, name')
      .order('bricks', { ascending: false })
      .limit(10);

    let msg = "🏆 *Civilization Leaderboard* 🏆\n\n";
    if (groups && groups.length > 0) {
      groups.forEach((g, i) => {
        const displayName = g.name || `Group ...${g.tg_group_id.slice(-4)}`;
        const levelEmoji = getCityLevel(g.bricks);
        msg += `${i + 1}. *${displayName}*\n   ${levelEmoji} • *${g.bricks} 🧱*\n\n`;
      });
    } else {
      msg += "_No civilizations found yet._";
    }

    await sendMessage(chatId, msg);
  }

  return res.status(200).json({ status: "done" });
}