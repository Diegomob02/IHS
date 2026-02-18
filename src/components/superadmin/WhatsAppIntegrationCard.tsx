import { PlugZap, CheckCircle2, XCircle } from 'lucide-react';
import { InfoTooltip } from '../common/InfoTooltip';

export type WhatsAppFormState = {
  enabled: boolean;
  wabaId: string;
  phoneNumberId: string;
  accessToken: string;
  verifyToken: string;
  templatesJson: string;
  automationAutoReply: boolean;
};

export function WhatsAppIntegrationCard({
  state,
  setState,
  testing,
  onTest,
  lastTestAt,
  lastOk,
}: {
  state: WhatsAppFormState;
  setState: (next: WhatsAppFormState) => void;
  testing: boolean;
  onTest: () => void;
  lastTestAt: string | null;
  lastOk: boolean | null;
}) {
  return (
    <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="font-bold text-gray-900 flex items-center gap-2">
          <PlugZap size={18} /> WhatsApp
        </div>
        <div>{statusChip(lastOk)}</div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={state.enabled} onChange={(e) => setState({ ...state, enabled: e.target.checked })} />
        <span className="inline-flex items-center gap-1">
          Habilitar integración
          <InfoTooltip helpId="superadmin.whatsapp.enabled" label="Habilitar integración" />
        </span>
      </label>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="WABA ID" required={state.enabled} helpId="superadmin.whatsapp.wabaId">
          <input value={state.wabaId} onChange={(e) => setState({ ...state, wabaId: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
        </Field>
        <Field label="Phone Number ID" required={state.enabled} helpId="superadmin.whatsapp.phoneNumberId">
          <input value={state.phoneNumberId} onChange={(e) => setState({ ...state, phoneNumberId: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
        </Field>
        <Field label="Access Token" required={state.enabled} full helpId="superadmin.whatsapp.accessToken">
          <input value={state.accessToken} onChange={(e) => setState({ ...state, accessToken: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
        </Field>
        <Field label="Verify Token" full helpId="superadmin.whatsapp.verifyToken">
          <input value={state.verifyToken} onChange={(e) => setState({ ...state, verifyToken: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
        </Field>
      </div>

      <div className="space-y-2">
        <div className="text-xs font-bold text-gray-700 inline-flex items-center gap-1">
          Plantillas (JSON)
          <InfoTooltip helpId="superadmin.whatsapp.templatesJson" label="Plantillas (JSON)" />
        </div>
        <textarea
          value={state.templatesJson}
          onChange={(e) => setState({ ...state, templatesJson: e.target.value })}
          className="w-full h-32 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={state.automationAutoReply} onChange={(e) => setState({ ...state, automationAutoReply: e.target.checked })} />
          <span className="inline-flex items-center gap-1">
            Automatización: auto-respuesta inicial
            <InfoTooltip helpId="superadmin.whatsapp.autoReply" label="Auto-respuesta inicial" />
          </span>
        </label>
      </div>

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
