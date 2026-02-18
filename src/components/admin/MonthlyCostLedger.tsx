import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Download, Eye, RefreshCw } from 'lucide-react';
import { isPdfBase64 } from '../../utils/pdfBase64';

type LedgerRow = {
  id: string;
  property_id: string;
  month: string;
  events: any;
  totals: any;
  pdf_base64: string;
  pdf_bytes?: number | null;
  created_at: string;
  updated_at: string;
};

export function MonthlyCostLedger({ properties }: { properties: any[] }) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [propertyFilter, setPropertyFilter] = useState<string>('all');
  const [preview, setPreview] = useState<LedgerRow | null>(null);

  const propertyTitleById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of properties || []) {
      const id = String((p as any)?.id || '');
      const title = String((p as any)?.title || (p as any)?.name || '');
      if (id) map.set(id, title || id);
    }
    return map;
  }, [properties]);

  const fetchRows = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('monthly_cost_ledger')
        .select('*')
        .order('month', { ascending: false })
        .order('updated_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      setRows((data || []) as any);
    } catch (e) {
      console.error('Error fetching monthly_cost_ledger:', e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRows();
  }, []);

  const filtered = useMemo(() => {
    if (propertyFilter === 'all') return rows;
    return rows.filter((r) => String(r.property_id) === propertyFilter);
  }, [rows, propertyFilter]);

  const downloadPdf = (row: LedgerRow) => {
    const b64 = String(row.pdf_base64 || '').trim();
    if (!b64 || !isPdfBase64(b64)) {
      alert('PDF inválido');
      return;
    }
    const link = document.createElement('a');
    link.href = `data:application/pdf;base64,${b64}`;
    link.download = `reporte_${row.month}.pdf`;
    link.click();
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Bitácora mensual (PDF)</h2>
          <div className="text-sm text-gray-500">Histórico mensual por propiedad (base64 + costos).</div>
        </div>
        <button
          type="button"
          onClick={fetchRows}
          className="inline-flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white hover:bg-gray-50"
          disabled={loading}
        >
          <RefreshCw size={16} />
          Actualizar
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <label className="text-sm text-gray-700">Propiedad</label>
        <select
          value={propertyFilter}
          onChange={(e) => setPropertyFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
        >
          <option value="all">Todas</option>
          {(properties || []).map((p: any) => (
            <option key={p.id} value={p.id}>
              {p.title || p.name || p.id}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="py-10 text-center text-gray-500">Cargando…</div>
      ) : filtered.length ? (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Propiedad</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Mes</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actualizado</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3 text-sm text-gray-900">{propertyTitleById.get(r.property_id) || r.property_id}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{r.month}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{String(r.totals?.totalCost ?? '')}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{r.updated_at ? new Date(r.updated_at).toLocaleString('es-ES') : ''}</td>
                  <td className="px-4 py-3 text-sm text-right">
                    <div className="inline-flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPreview(r)}
                        className="inline-flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white hover:bg-gray-50"
                      >
                        <Eye size={16} />
                        Ver
                      </button>
                      <button
                        type="button"
                        onClick={() => downloadPdf(r)}
                        className="inline-flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white hover:bg-gray-50"
                      >
                        <Download size={16} />
                        Descargar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="py-10 text-center text-gray-500">Sin registros.</div>
      )}

      {preview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl h-[85vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <div className="font-bold text-gray-900">
                {propertyTitleById.get(preview.property_id) || preview.property_id} · {preview.month}
              </div>
              <button onClick={() => setPreview(null)} className="text-gray-400 hover:text-gray-600">
                ×
              </button>
            </div>
            <div className="flex-1 bg-gray-100">
              <iframe
                src={preview.pdf_base64 ? `data:application/pdf;base64,${preview.pdf_base64}` : ''}
                className="w-full h-full"
                title="PDF Preview"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

