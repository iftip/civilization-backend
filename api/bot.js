import { createClient } from '@supabase/supabase-js';

// Use SERVICE ROLE key for God Mode permissions (Bypasses RLS)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Helper to send Telegram messages
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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).json({ status: "ok" });

  const update = req.body;
  if (!update.message) return res.status(200).json({ status: "no_message" });

  const chatId = update.message.chat.id;
  const text = update.message.text || "";

  if (text.startsWith('/start')) {
    await sendMessage(chatId, "🏰 **Civilization Bot Online!**\n\nStart chatting to build your city.\nType /top for leaderboard.");
  }

  const { error } = await supabase.rpc('add_brick', { group_id: chatId.toString() });
  if (error) console.error("Add Brick Error:", error);

  if (text.startsWith('/top') || text.startsWith('/leaderboard')) {
    const { data: groups } = await supabase
      .from('groups')
      .select('tg_group_id, bricks')
      .order('bricks', { ascending: false })
      .limit(10);

    let msg = "🏆 *Civilization Leaderboard*\n\n";

    if (groups && groups.length > 0) {
      groups.forEach((g, i) => {
        msg += `${i + 1}. Group ...${g.tg_group_id.slice(-4)}: *${g.bricks} 🧱*\n`;
      });
    } else msg += "_No groups yet._";

    await sendMessage(chatId, msg);
  }

  return res.status(200).json({ status: "done" });
}