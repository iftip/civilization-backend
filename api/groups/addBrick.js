import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' });

  const { id } = req.body;

  if (!id)
    return res.status(400).json({ error: 'Group ID is required' });

  // Call the SQL function in Supabase
  const { error } = await supabase.rpc('add_brick', { group_id: id });

  if (error)
    return res.status(500).json({ error: error.message });

  return res.status(200).json({ message: 'Brick added!' });
}