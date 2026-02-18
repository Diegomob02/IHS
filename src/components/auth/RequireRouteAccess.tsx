import { ReactNode, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { clearSessionStartedAt, isSessionOlderThan24h, resolvePostLoginRedirect } from '../../utils/authRouting';

type RequireRouteAccessProps = {
  expected: '/portal-contratistas' | '/propietarios/panel';
  children: ReactNode;
};

type AccessState =
  | { status: 'checking' }
  | { status: 'allow' }
  | { status: 'redirect'; to: string; error?: string };

export function RequireRouteAccess({ expected, children }: RequireRouteAccessProps) {
  const [state, setState] = useState<AccessState>({ status: 'checking' });

  useEffect(() => {
    const run = async () => {
      setState({ status: 'checking' });
      try {
        if (isSessionOlderThan24h()) {
          await supabase.auth.signOut();
          clearSessionStartedAt();
        }

        const { data } = await supabase.auth.getSession();
        const u = data?.session?.user;
        if (!u?.id) {
          setState({ status: 'redirect', to: '/auth' });
          return;
        }

        const emailLower = String(u.email ?? '').trim().toLowerCase();
        const { data: roleRow } = await supabase
          .from('user_roles')
          .select('email, role, status')
          .eq('email', emailLower)
          .maybeSingle();

        const { data: userRow } = await supabase
          .from('users')
          .select('role')
          .eq('id', u.id)
          .maybeSingle();

        const decision = resolvePostLoginRedirect({ email: emailLower, roleRow: (roleRow as any) || null, userProfileRow: (userRow as any) || null });

        if (!decision.ok) {
          await supabase.auth.signOut();
          clearSessionStartedAt();
          const msg = 'message' in decision ? String((decision as any).message) : 'No autorizado.';
          setState({ status: 'redirect', to: '/auth', error: msg });
          return;
        }

        if (decision.redirectTo !== expected) {
          setState({ status: 'redirect', to: decision.redirectTo });
          return;
        }

        setState({ status: 'allow' });
      } catch (e: any) {
        setState({ status: 'redirect', to: '/auth', error: String(e?.message || 'No autorizado.') });
      }
    };
    run();
  }, [expected]);

  if (state.status === 'checking') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (state.status === 'redirect') {
    return <Navigate to={state.to} replace state={state.error ? { error: state.error } : undefined} />;
  }

  return <>{children}</>;
}
