import { PlugZap, CheckCircle2, XCircle } from 'lucide-react';
import { InfoTooltip } from '../common/InfoTooltip';

export type N8nFormState = {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  webhookUrl: string;
  syncEnabled: boolean;
};

export function N8nIntegrationCard({
  state,
  setState,
  testing,
  onTest,
  lastTestAt,
  lastOk,
}: {
  state: N8nFormState;
  setState: (next: N8nFormState) => void;
  testing: boolean;
  onTest: () => void;
  lastTestAt: string | null;
  lastOk: boolean | null;
}) {
  return (
    <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="font-bold text-gray-900 flex items-center gap-2">
          <PlugZap size={18} /> n8n
        </div>
        <div>{statusChip(lastOk)}</div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={state.enabled} onChange={(e) => setState({ ...state, enabled: e.target.checked })} />
        <span className="inline-flex items-center gap-1">
          Habilitar integración
          <InfoTooltip helpId="superadmin.n8n.enabled" label="Habilitar integración" />
        </span>
      </label>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Base URL" required={state.enabled} full helpId="superadmin.n8n.baseUrl">
          <input
            value={state.baseUrl}
            onChange={(e) => setState({ ...state, baseUrl: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            placeholder="https://n8n.tu-dominio.com"
          />
        </Field>
        <Field label="API Key" full helpId="superadmin.n8n.apiKey">
          <input value={state.apiKey} onChange={(e) => setState({ ...state, apiKey: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
        </Field>
        <Field label="Webhook URL" full helpId="superadmin.n8n.webhookUrl">
          <input value={state.webhookUrl} onChange={(e) => setState({ ...state, webhookUrl: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={state.syncEnabled} onChange={(e) => setState({ ...state, syncEnabled: e.target.checked })} />
        <span className="inline-flex items-center gap-1">
          Sincronización: enviar eventos a n8n
          <InfoTooltip
            label="Sincronización"
            help={{
              title: 'Sincronización con n8n',
              purpose: 'Envía eventos del sistema a n8n para automatizaciones (reportes, alertas, workflows).',
              accepted: 'Activado / Desactivado',
              impact: 'Al activarse, se disparan webhooks/eventos hacia la integración configurada.',
              restrictions: 'Requiere que Base URL/Webhook estén correctos; revisa límites de tasa de tu instancia.',
              examples: ['Enviar lead nuevo a CRM externo', 'Notificar pago atrasado por email'],
            }}
          />
        </span>
      </label>

      <button
        type="button"
        onClick={onTest}
        disabled={testing}
        className="w-full px-4 py-2 rounded-lg border border-gray-300 text-gray-800 hover:bg-gray-50 text-sm disabled:opacity-50"
      >
        {testing ? 'Probando...' : 'Probar conexión'}
      </button>

      {lastTestAt && <div className="text-xs text-gray-500">Última prueba: {new Date(lastTestAt).toLocaleString()}</div>}
    </section>
  );
}

function statusChip(ok: boolean | null) {
  if (ok === null) return <span className="text-xs text-gray-500">Sin pruebas</span>;
  if (ok) return <span className="inline-flex items-center gap-1 text-xs font-bold text-green-700"><CheckCircle2 size={14} /> OK</span>;
  return <span className="inline-flex items-center gap-1 text-xs font-bold text-red-700"><XCircle size={14} /> Error</span>;
}

function Field({ label, required, full, children, helpId }: { label: string; required?: boolean; full?: boolean; children: any; helpId?: string }) {
  return (
    <div className={full ? 'md:col-span-2' : ''}>
      <div className="text-xs font-bold text-gray-700 mb-1 inline-flex items-center gap-1">
        {label}
        {helpId ? <InfoTooltip helpId={helpId} label={label} /> : null}
        {required ? <span className="text-red-500"> *</span> : null}
      </div>
      {children}
    </div>
  );
}
