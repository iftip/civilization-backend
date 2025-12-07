import { supabase } from "../../supabaseClient.js";

export default async function handler(req, res) {
  const { group_id } = req.query;

  const { data, error } = await supabase.rpc("add_brick", { gid: group_id });

  if (error) return res.status(500).json({ error });
  return res.status(200).json({ success: true });
}