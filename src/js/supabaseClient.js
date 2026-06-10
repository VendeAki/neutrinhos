import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://YOUR_PROJECT_ID.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

export const GUILD_NAME = 'Neutrinhos Carinhosos';
export const DEFAULT_WORLD = 'Quelibra';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export async function getCurrentProfile() {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return { user: null, profile: null, error: userError };

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  return { user, profile, error };
}

export function canManage(profile) {
  return ['admin', 'leader'].includes(profile?.role);
}
