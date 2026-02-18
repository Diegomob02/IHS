import { describe, expect, it } from 'vitest';
import { resolvePostLoginRedirect } from './authRouting';

describe('resolvePostLoginRedirect', () => {
  it('redirige a contratistas cuando roleRow es contractor approved', () => {
    const res = resolvePostLoginRedirect({
      email: 'c@x.com',
      roleRow: { email: 'c@x.com', role: 'contractor', status: 'approved' },
      userProfileRow: null,
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.redirectTo).toBe('/portal-contratistas');
  });

  it('prioriza user_roles sobre users.role para contratistas', () => {
    const res = resolvePostLoginRedirect({
      email: 'c@x.com',
      roleRow: { email: 'c@x.com', role: 'contractor', status: 'approved' },
      userProfileRow: { role: 'owner' },
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.redirectTo).toBe('/portal-contratistas');
  });

  it('bloquea contratistas pending', () => {
    const res = resolvePostLoginRedirect({
      email: 'c@x.com',
      roleRow: { email: 'c@x.com', role: 'contractor', status: 'pending' },
      userProfileRow: null,
    });
    expect(res.ok).toBe(false);
  });

  it('redirige a propietarios cuando roleRow es owner approved', () => {
    const res = resolvePostLoginRedirect({
      email: 'o@x.com',
      roleRow: { email: 'o@x.com', role: 'owner', status: 'approved' },
      userProfileRow: null,
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.redirectTo).toBe('/propietarios/panel');
  });

  it('usa fallback de users.role cuando no hay roleRow', () => {
    const res = resolvePostLoginRedirect({
      email: 'o@x.com',
      roleRow: null,
      userProfileRow: { role: 'owner' },
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.redirectTo).toBe('/propietarios/panel');
  });

  it('regresa error cuando no hay rol', () => {
    const res = resolvePostLoginRedirect({
      email: 'x@x.com',
      roleRow: null,
      userProfileRow: { role: null },
    });
    expect(res.ok).toBe(false);
  });
});
