import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' });

  const { attacker_id, defender_id } = req.body;

  if (!attacker_id || !defender_id)
    return res.status(400).json({ error: 'Both attacker_id and defender_id are required' });

  // Call stored procedure
  const { data, error } = await supabase.rpc('raid_group', {
    attacker_id,
    defender_id
  });

  if (error)
    return res.status(500).json({ error: error.message });

  return res.status(200).json(data);
}