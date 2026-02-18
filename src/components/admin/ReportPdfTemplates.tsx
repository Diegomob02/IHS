import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { ReportPdfTemplate } from '../../types';
import { Save, Plus, Trash2, Edit, RefreshCw } from 'lucide-react';
import { selectPdfTemplate } from '../../lib/pdfTemplates/selectPdfTemplate';

type Draft = {
  id?: string;
  name: string;
  report_key: string;
  enabled: boolean;
  priority: number;
  template_spec_text: string;
  match_rules_text: string;
};

const safeStringify = (v: any) => {
  try {
    return JSON.stringify(v ?? {}, null, 2);
  } catch {
    return '{}';
  }
};

const parseJson = (raw: string) => {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return {};
  return JSON.parse(trimmed);
};

export function ReportPdfTemplates() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [templates, setTemplates] = useState<ReportPdfTemplate[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);

  const selectedPreview = useMemo(() => {
    const picked = selectPdfTemplate(templates as any, {
      reportKey: 'property_monthly_maintenance',
      totalCost: 2500,
      eventsCount: 8,
      hasImages: true,
      location: 'Cabo San Lucas',
    });
    return picked?.name || '—';
  }, [templates]);

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      setError(null);
      const { data, error: err } = await supabase
        .from('report_pdf_templates')
        .select('*')
        .order('report_key', { ascending: true })
        .order('priority', { ascending: true })
        .order('updated_at', { ascending: false });
      if (err) throw err;
      setTemplates((data || []) as any);
    } catch (e: any) {
      console.error('Error fetching templates:', e);
      setError(String(e?.message || 'Error cargando plantillas'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const openCreate = () => {
    setDraft({
      name: '',
      report_key: 'property_monthly_maintenance',
      enabled: true,
      priority: 100,
      template_spec_text: safeStringify({ version: 1 }),
      match_rules_text: safeStringify({ report_key: 'property_monthly_maintenance' }),
    });
    setModalOpen(true);
  };

  const openEdit = (tpl: ReportPdfTemplate) => {
    setDraft({
      id: tpl.id,
      name: tpl.name || '',
      report_key: tpl.report_key || '',
      enabled: Boolean(tpl.enabled),
      priority: Number(tpl.priority || 0),
      template_spec_text: safeStringify(tpl.template_spec),
      match_rules_text: safeStringify(tpl.match_rules),
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setDraft(null);
  };

  const saveDraft = async () => {
    if (!draft) return;
    if (!draft.name.trim()) {
      alert('Nombre requerido');
      return;
    }
    if (!draft.report_key.trim()) {
      alert('report_key requerido');
      return;
    }

    let templateSpec: any;
    let matchRules: any;
    try {
      templateSpec = parseJson(draft.template_spec_text);
    } catch {
      alert('template_spec: JSON inválido');
      return;
    }
    try {
      matchRules = parseJson(draft.match_rules_text);
    } catch {
      alert('match_rules: JSON inválido');
      return;
    }

    try {
      setSaving(true);
      const user = (await supabase.auth.getUser()).data.user;
      if (draft.id) {
        const { error: err } = await supabase
          .from('report_pdf_templates')
          .update({
            name: draft.name.trim(),
            report_key: draft.report_key.trim(),
            enabled: draft.enabled,
            priority: Number(draft.priority || 0),
            template_spec: templateSpec,
            match_rules: matchRules,
            updated_at: new Date().toISOString(),
          })
          .eq('id', draft.id);
        if (err) throw err;
      } else {
        const { error: err } = await supabase.from('report_pdf_templates').insert({
          name: draft.name.trim(),
          report_key: draft.report_key.trim(),
          enabled: draft.enabled,
          priority: Number(draft.priority || 0),
          template_spec: templateSpec,
          match_rules: matchRules,
          created_by: user?.id || null,
        });
        if (err) throw err;
      }

      closeModal();
      await fetchTemplates();
    } catch (e: any) {
      console.error('Error saving template:', e);
      alert(String(e?.message || 'Error guardando plantilla'));
    } finally {
      setSaving(false);
    }
  };

  const deleteTemplate = async (tpl: ReportPdfTemplate) => {
    if (!tpl?.id) return;
    const ok = confirm(`Eliminar plantilla "${tpl.name}"?`);
    if (!ok) return;
    try {
      const { error: err } = await supabase.from('report_pdf_templates').delete().eq('id', tpl.id);
      if (err) throw err;
      await fetchTemplates();
    } catch (e: any) {
      console.error('Error deleting template:', e);
      alert(String(e?.message || 'Error eliminando plantilla'));
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Plantillas de PDF</h2>
          <div className="text-sm text-gray-500">Auto-selección (preview): {selectedPreview}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={fetchTemplates}
            className="inline-flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white hover:bg-gray-50"
            disabled={loading || saving}
          >
            <RefreshCw size={16} />
            Actualizar
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-primary text-white hover:bg-opacity-90"
            disabled={loading || saving}
          >
            <Plus size={16} />
            Nueva plantilla
          </button>
        </div>
      </div>

      {error && <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="py-10 text-center text-gray-500">Cargando…</div>
      ) : templates.length ? (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">report_key</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Prioridad</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Activa</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {templates.map((tpl) => (
                <tr key={tpl.id}>
                  <td className="px-4 py-3 text-sm text-gray-900">{tpl.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{tpl.report_key}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{tpl.priority}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{tpl.enabled ? 'Sí' : 'No'}</td>
                  <td className="px-4 py-3 text-sm text-right">
                    <div className="inline-flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(tpl)}
                        className="inline-flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white hover:bg-gray-50"
                      >
                        <Edit size={16} />
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteTemplate(tpl)}
                        className="inline-flex items-center gap-2 px-3 py-2 border border-red-200 rounded-lg text-sm bg-white text-red-600 hover:bg-red-50"
                      >
                        <Trash2 size={16} />
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="py-10 text-center text-gray-500">Sin plantillas.</div>
      )}

      {modalOpen && draft && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-blue-50">
              <div>
                <h3 className="font-bold text-lg text-gray-900">{draft.id ? 'Editar plantilla' : 'Nueva plantilla'}</h3>
                <p className="text-sm text-gray-500">Define la estructura y reglas de selección automática.</p>
              </div>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600">
                ×
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
                  <input
                    type="text"
                    value={draft.name}
                    onChange={(e) => setDraft((p) => (p ? { ...p, name: e.target.value } : p))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">report_key</label>
                  <input
                    type="text"
                    value={draft.report_key}
                    onChange={(e) => setDraft((p) => (p ? { ...p, report_key: e.target.value } : p))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Prioridad (menor = primero)</label>
                  <input
                    type="number"
                    value={draft.priority}
                    onChange={(e) => setDraft((p) => (p ? { ...p, priority: Number(e.target.value) } : p))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div className="flex items-center gap-2 mt-6">
                  <input
                    id="enabled"
                    type="checkbox"
                    checked={draft.enabled}
                    onChange={(e) => setDraft((p) => (p ? { ...p, enabled: e.target.checked } : p))}
                  />
                  <label htmlFor="enabled" className="text-sm text-gray-700">
                    Activa
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">match_rules (JSON)</label>
                  <textarea
                    value={draft.match_rules_text}
                    onChange={(e) => setDraft((p) => (p ? { ...p, match_rules_text: e.target.value } : p))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-xs h-64"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">template_spec (JSON)</label>
                  <textarea
                    value={draft.template_spec_text}
                    onChange={(e) => setDraft((p) => (p ? { ...p, template_spec_text: e.target.value } : p))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-xs h-64"
                  />
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2 bg-gray-50">
              <button
                type="button"
                onClick={closeModal}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm bg-white hover:bg-gray-50"
                disabled={saving}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={saveDraft}
                className="px-4 py-2 rounded-lg text-sm bg-primary text-white hover:bg-opacity-90 inline-flex items-center gap-2 disabled:opacity-60"
                disabled={saving}
              >
                <Save size={16} />
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

