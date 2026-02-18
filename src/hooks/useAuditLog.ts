import { useState } from 'react';
import { supabase } from '../lib/supabase';

export const useAuditLog = () => {
  const [loading, setLoading] = useState(false);

  const logAction = async (
    action: string,
    resource: string,
    details: any,
    resourceId?: string
  ) => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('id')
        .eq('email', user.email)
        .single();

      const profileId = profileError ? null : profile?.id;

      const { error } = await supabase.from('audit_logs').insert({
        user_id: profileId,
        action,
        entity_type: resource,
        entity_id: resourceId,
        details,
        ip_address: 'client-side'
      });

      if (error) {
        console.error('Error logging action:', error);
      }
    } catch (err) {
      console.error('Error in logAction:', err);
    } finally {
      setLoading(false);
    }
  };

  return { logAction, loading };
};
