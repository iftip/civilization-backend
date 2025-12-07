import { supabase } from "../../supabaseClient.js";

export default async function handler(req, res) {
  const { attacker, defender } = req.query;

  const { data, error } = await supabase.rpc("raid_group", {
    attacker_id: attacker,
    defender_id: defender
  });

  if (error) return res.status(500).json({ error });
  return res.status(200).json({ success: true, result: data });
}