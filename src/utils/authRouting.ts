export type UserRoleDecision =
  | { ok: true; redirectTo: '/portal-contratistas' }
  | { ok: true; redirectTo: '/propietarios/panel' }
  | { ok: false; message: string };

export type RoleRow = {
  email: string;
  role: 'owner' | 'contractor';
  status: 'pending' | 'approved' | 'rejected' | 'revoked';
} | null;

export type UserProfileRow = {
  role?: string | null;
} | null;

export function resolvePostLoginRedirect(opts: {
  email: string | null | undefined;
  roleRow: RoleRow;
  userProfileRow: UserProfileRow;
}): UserRoleDecision {
  const email = String(opts.email ?? '').trim().toLowerCase();
  if (!email) return { ok: false, message: 'Email inválido.' };

  if (opts.roleRow) {
    if (opts.roleRow.role === 'contractor') {
      if (opts.roleRow.status === 'approved') return { ok: true, redirectTo: '/portal-contratistas' };
      if (opts.roleRow.status === 'pending') return { ok: false, message: 'Tu acceso como contratista está pendiente de aprobación.' };
      if (opts.roleRow.status === 'rejected') return { ok: false, message: 'Tu solicitud de contratista fue rechazada.' };
      return { ok: false, message: 'Tu acceso como contratista fue revocado.' };
    }

    if (opts.roleRow.role === 'owner') {
      if (opts.roleRow.status === 'approved') return { ok: true, redirectTo: '/propietarios/panel' };
      return { ok: false, message: 'Tu acceso como propietario no está habilitado.' };
    }
  }

  const fallbackRole = String(opts.userProfileRow?.role ?? '').trim();
  if (fallbackRole === 'owner' || fallbackRole === 'admin' || fallbackRole === 'super_admin') {
    return { ok: true, redirectTo: '/propietarios/panel' };
  }
  if (fallbackRole === 'contractor') {
    return { ok: true, redirectTo: '/portal-contratistas' };
  }

  return { ok: false, message: 'Tu email no está registrado o no tiene rol asignado.' };
}

const SESSION_STARTED_AT_KEY = 'ihs_session_started_at';

export function markSessionStartedNow() {
  try {
    localStorage.setItem(SESSION_STARTED_AT_KEY, String(Date.now()));
  } catch {
    // ignore
  }
}

export function clearSessionStartedAt() {
  try {
    localStorage.removeItem(SESSION_STARTED_AT_KEY);
  } catch {
    // ignore
  }
}

export function isSessionOlderThan24h() {
  try {
    const raw = localStorage.getItem(SESSION_STARTED_AT_KEY);
    const startedAt = raw ? Number(raw) : NaN;
    if (!Number.isFinite(startedAt)) return false;
    return Date.now() - startedAt > 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

