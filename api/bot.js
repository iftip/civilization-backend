import { Bot } from "grammy";
import { createClient } from "@supabase/supabase-js";

// Env variables from Vercel
const bot = new Bot(process.env.BOT_TOKEN);
const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Count messages → +1 Brick
bot.on("message", async (ctx) => {
  const chat = ctx.chat;

  if (!chat || chat.type === "private") return;

  const chatId = chat.id.toString();
  const msgId = ctx.message.message_id;

  await supa.from("groups").upsert({
    id: chatId,
    name: chat.title || "Group"
  });

  const uniqueId = `${chatId}_${msgId}`;

  const exists = await supa
    .from("messages")
    .select("id")
    .eq("id", uniqueId)
    .maybeSingle();

  if (exists.data) return;

  await supa.from("messages").insert({
    id: uniqueId,
    chat_id: chatId,
    user_id: ctx.from?.id || null,
    telegram_message_id: msgId
  });

  await supa
    .from("groups")
    .update({ bricks: supa.rpc("increment", { x: 1 }) })
    .eq("id", chatId);

  ctx.reply("🧱 +1 Brick!");
});

export default async function handler(req, res) {
  try {
    await bot.handleUpdate(req.body);
    res.status(200).send("OK");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error");
  }
}
