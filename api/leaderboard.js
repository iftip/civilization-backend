import { supabase } from "../supabaseClient.js";

export default async function handler(req, res) {
  const { data, error } = await supabase
    .from("groups")
    .select("*")
    .order("bricks", { ascending: false })
    .limit(20);

  if (error) return res.status(500).json({ error });
  return res.status(200).json({ leaderboard: data });
}