import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  // GET → Show all groups
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('groups')
      .select('*')
      .order('bricks', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json(data);
  }

  // POST → Add brick using group_id
  if (req.method === 'POST') {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'Group ID is required' });
    }

    const { error } = await supabase.rpc('add_brick', { group_id: id });

    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({ message: 'Brick added!' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}