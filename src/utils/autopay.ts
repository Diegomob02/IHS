export const formatPeriodYyyymm = (d: Date) => {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}${m}`;
};

export const makeAutopayIdempotencyKey = (params: {
  leaseId: string;
  periodYyyymm: string;
  attemptNo: number;
  kind: 'scheduled' | 'manual';
}) => {
  const leaseId = String(params.leaseId || '').trim();
  const period = String(params.periodYyyymm || '').trim();
  const attemptNo = Math.max(1, Math.floor(Number(params.attemptNo || 1)));
  const kind = params.kind;

  if (!leaseId) throw new Error('leaseId requerido');
  if (!/^[0-9]{6}$/.test(period)) throw new Error('periodYyyymm inválido');
  return `lease:${leaseId}:${period}:${kind}:${attemptNo}`;
};

export const sanitizeFailureMessageSafe = (msg: unknown) => {
  const s = String(msg ?? '').trim();
  if (!s) return null;
  return s.length > 160 ? `${s.slice(0, 157)}...` : s;
};

