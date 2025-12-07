import { supabase } from "../../supabaseClient.js";

export default async function handler(req, res) {
  const { group_id, group_name } = req.query;

  const { data, error } = await supabase
    .from("groups")
    .upsert({ group_id, group_name, bricks: 0 })
    .select();

  if (error) return res.status(500).json({ error });
  return res.status(200).json({ success: true, group: data });
}