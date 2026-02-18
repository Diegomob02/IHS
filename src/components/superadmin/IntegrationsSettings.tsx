import { Save, RefreshCw } from 'lucide-react';
import { WhatsAppIntegrationCard } from './WhatsAppIntegrationCard';
import { N8nIntegrationCard } from './N8nIntegrationCard';
import { useIntegrationsSettings } from '../../hooks/useIntegrationsSettings';

export function IntegrationsSettings({ profileId }: { profileId: string | null }) {
  const {
    loading,
    saving,
    testing,
    error,
    wa,
    setWa,
    n8n,
    setN8n,
    waOk,
    n8nOk,
    rows,
    refresh,
    saveAll,
    testWhatsapp,
    testN8n,
  } = useIntegrationsSettings(profileId);

  if (loading) {
    return <div className="text-sm text-gray-500">Cargando integraciones...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-lg font-bold text-gray-900">Integraciones</div>
          <div className="text-sm text-gray-500">Configura WhatsApp, n8n y prueba conexiones.</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={refresh}
            className="px-3 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 text-sm flex items-center gap-2"
          >
            <RefreshCw size={16} />
            Recargar
          </button>
          <button
            type="button"
            onClick={saveAll}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-opacity-90 disabled:opacity-50 flex items-center gap-2"
          >
            <Save size={16} />
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>

      {error && <div className="p-3 rounded-lg bg-red-50 border border-red-100 text-red-700 text-sm">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <WhatsAppIntegrationCard
          state={wa}
          setState={setWa}
          testing={testing === 'whatsapp'}
          onTest={testWhatsapp}
          lastOk={waOk}
          lastTestAt={rows.whatsapp?.last_test_at || null}
        />

        <N8nIntegrationCard
          state={n8n}
          setState={setN8n}
          testing={testing === 'n8n'}
          onTest={testN8n}
          lastOk={n8nOk}
          lastTestAt={rows.n8n?.last_test_at || null}
        />
      </div>
    </div>
  );
}
