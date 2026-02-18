import { supabase } from '../supabase';

export type ReportLogLevel = 'debug' | 'info' | 'warn' | 'error';

export type ReportLogContext = {
  ledgerId?: string | null;
  propertyId?: string | null;
  month?: string | null;
};

export function createReportLogger(ctx: ReportLogContext) {
  const base = {
    ledger_id: ctx.ledgerId ?? null,
    property_id: ctx.propertyId ?? null,
    month: ctx.month ?? null,
  };

  const write = async (level: ReportLogLevel, step: string, message: string, data?: any) => {
    const payload = {
      ...base,
      level,
      step: step || null,
      message: message || '',
      data: data ?? null,
      created_at: new Date().toISOString(),
    };

    try {
      await supabase.from('report_generation_events').insert(payload as any);
    } catch (e) {
      console.error('Failed to write report_generation_events:', e);
    }
  };

  return {
    debug: (step: string, message: string, data?: any) => write('debug', step, message, data),
    info: (step: string, message: string, data?: any) => write('info', step, message, data),
    warn: (step: string, message: string, data?: any) => write('warn', step, message, data),
    error: (step: string, message: string, data?: any) => write('error', step, message, data),
  };
}

