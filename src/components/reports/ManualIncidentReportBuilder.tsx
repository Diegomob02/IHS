import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Loader2, Trash2, Upload } from 'lucide-react';
import { compressImageToJpeg } from '../../utils/imageCompression';

export type ManualReportCostRow = {
  id: string;
  date: string;
  concept: string;
  amount: string;
};

export type ManualReportImage = {
  id: string;
  name: string;
  caption: string;
  order: number;
  url: string;
  width?: number;
  height?: number;
  bytes?: number;
};

export type ManualReportContext = {
  incidentText: string;
  images: ManualReportImage[];
  costs: Array<{ date: string; concept: string; amount: number }>;
};

type Props = {
  propertyId: string;
  disabled?: boolean;
  onChange: (ctx: ManualReportContext, isValid: boolean) => void;
};

export const ManualIncidentReportBuilder: React.FC<Props> = ({ propertyId, disabled, onChange }) => {
  const [incidentText, setIncidentText] = useState('');
  const [costRows, setCostRows] = useState<ManualReportCostRow[]>([]);
  const [images, setImages] = useState<ManualReportImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalizedCosts = useMemo(() => {
    return (costRows || [])
      .map((r) => ({
        date: String(r.date || '').trim(),
        concept: String(r.concept || '').trim(),
        amount: Number(String(r.amount || '').replace(/,/g, '')),
      }))
      .filter((r) => r.date || r.concept || Number.isFinite(r.amount));
  }, [costRows]);

  const ctx = useMemo<ManualReportContext>(() => {
    return {
      incidentText: incidentText.trim(),
      images: [...images].sort((a, b) => a.order - b.order),
      costs: normalizedCosts.filter((c) => c.date && c.concept && Number.isFinite(c.amount) && c.amount > 0),
    };
  }, [incidentText, images, normalizedCosts]);

  const isValid = useMemo(() => {
    if (!ctx.incidentText) return false;
    const invalidCosts = normalizedCosts.some((c) => (c.date || c.concept || Number.isFinite(c.amount)) && (!c.date || !c.concept || !Number.isFinite(c.amount) || c.amount <= 0));
    if (invalidCosts) return false;
    return true;
  }, [ctx.incidentText, normalizedCosts]);

  useEffect(() => {
    onChange(ctx, isValid);
  }, [ctx, isValid, onChange]);

  const addCostRow = () => {
    setCostRows((prev) => [
      ...prev,
      { id: crypto.randomUUID(), date: new Date().toISOString().slice(0, 10), concept: '', amount: '' },
    ]);
  };

  const removeCostRow = (id: string) => setCostRows((prev) => prev.filter((r) => r.id !== id));

  const moveImage = (id: string, dir: -1 | 1) => {
    setImages((prev) => {
      const sorted = [...prev].sort((a, b) => a.order - b.order);
      const idx = sorted.findIndex((i) => i.id === id);
      if (idx < 0) return prev;
      const swapIdx = idx + dir;
      if (swapIdx < 0 || swapIdx >= sorted.length) return prev;
      const a = sorted[idx];
      const b = sorted[swapIdx];
      const next = sorted.map((x) => ({ ...x }));
      next[idx].order = b.order;
      next[swapIdx].order = a.order;
      return next.sort((x, y) => x.order - y.order);
    });
  };

  const removeImage = (id: string) => setImages((prev) => prev.filter((i) => i.id !== id).map((i, idx) => ({ ...i, order: idx })));

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (!files.length) return;

    try {
      setUploading(true);
      setError(null);

      const nextItems: ManualReportImage[] = [];
      for (const file of files) {
        if (file.size > 15 * 1024 * 1024) {
          throw new Error(`La imagen "${file.name}" es demasiado grande.`);
        }
        const { blob, width, height } = await compressImageToJpeg(file, { maxDimensionPx: 1600, quality: 0.8 });
        const ext = 'jpg';
        const fileName = `manual_reports/${propertyId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

        const { error: uploadError } = await supabase.storage.from('property-images').upload(fileName, blob, {
          contentType: 'image/jpeg',
          upsert: false,
        });
        if (uploadError) throw uploadError;

        const { data } = supabase.storage.from('property-images').getPublicUrl(fileName);
        const url = data?.publicUrl ? String(data.publicUrl) : '';
        if (!url) throw new Error('No se pudo obtener la URL pública de la imagen');

        nextItems.push({
          id: crypto.randomUUID(),
          name: file.name,
          caption: '',
          order: 0,
          url,
          width,
          height,
          bytes: blob.size,
        });
      }

      setImages((prev) => {
        const base = [...prev].sort((a, b) => a.order - b.order);
        const start = base.length;
        const appended = nextItems.map((i, idx) => ({ ...i, order: start + idx }));
        return [...base, ...appended];
      });
    } catch (err: any) {
      setError(String(err?.message || err || 'Error subiendo imágenes'));
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-bold text-gray-800 mb-2">Incidentes / Eventos</label>
        <textarea
          className="w-full min-h-40 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
          placeholder="Describe incidentes, acciones realizadas, recomendaciones y estado general..."
          value={incidentText}
          onChange={(e) => setIncidentText(e.target.value)}
          disabled={disabled || uploading}
        />
        {!incidentText.trim() ? <div className="text-xs text-red-600 mt-1">Este campo es requerido.</div> : null}
      </div>

      <div className="border border-gray-200 rounded-lg p-3 bg-gray-50">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-bold text-gray-800">Evidencias (Imágenes)</div>
          <label className={`cursor-pointer bg-white border border-gray-300 px-3 py-2 rounded text-sm flex items-center gap-2 hover:bg-gray-100 ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
            {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
            Adjuntar imágenes
            <input type="file" multiple accept="image/*" className="hidden" onChange={handleImageSelect} disabled={disabled || uploading} />
          </label>
        </div>

        {error ? <div className="text-xs text-red-600 mt-2">{error}</div> : null}

        {images.length ? (
          <div className="mt-3 space-y-2">
            {images
              .sort((a, b) => a.order - b.order)
              .map((img, idx) => (
                <div key={img.id} className="bg-white border border-gray-200 rounded p-2">
                  <div className="flex items-start gap-3">
                    <a href={img.url} target="_blank" rel="noreferrer" className="shrink-0">
                      <img src={img.url} alt={img.name} className="w-16 h-16 object-cover rounded border border-gray-200" />
                    </a>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-gray-700 font-bold truncate">{idx + 1}. {img.name}</div>
                      <input
                        value={img.caption}
                        onChange={(e) =>
                          setImages((prev) => prev.map((p) => (p.id === img.id ? { ...p, caption: e.target.value } : p)))
                        }
                        className="mt-1 w-full text-xs border border-gray-300 rounded px-2 py-1"
                        placeholder="Descripción de la imagen (opcional)"
                        disabled={disabled || uploading}
                      />
                      <div className="text-[11px] text-gray-500 mt-1">
                        {img.width && img.height ? `${img.width}×${img.height}` : ''}{img.bytes ? ` · ${Math.round(img.bytes / 1024)} KB` : ''}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        className="text-xs px-2 py-1 border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50"
                        onClick={() => moveImage(img.id, -1)}
                        disabled={disabled || uploading || idx === 0}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="text-xs px-2 py-1 border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50"
                        onClick={() => moveImage(img.id, 1)}
                        disabled={disabled || uploading || idx === images.length - 1}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="text-xs px-2 py-1 border border-red-300 text-red-700 rounded hover:bg-red-50 disabled:opacity-50 flex items-center justify-center"
                        onClick={() => removeImage(img.id)}
                        disabled={disabled || uploading}
                        title="Eliminar"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        ) : (
          <div className="text-xs text-gray-500 mt-2">No hay imágenes adjuntas.</div>
        )}
      </div>

      <div className="border border-gray-200 rounded-lg p-3 bg-gray-50">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-bold text-gray-800">Costos</div>
          <button
            type="button"
            onClick={addCostRow}
            className="bg-white border border-gray-300 px-3 py-2 rounded text-sm hover:bg-gray-100 disabled:opacity-50"
            disabled={disabled || uploading}
          >
            Agregar costo
          </button>
        </div>

        {costRows.length ? (
          <div className="mt-3 space-y-2">
            {costRows.map((r) => (
              <div key={r.id} className="grid grid-cols-1 md:grid-cols-12 gap-2 bg-white border border-gray-200 rounded p-2">
                <div className="md:col-span-3">
                  <label className="block text-[11px] text-gray-600 mb-1">Fecha</label>
                  <input
                    type="date"
                    value={r.date}
                    onChange={(e) => setCostRows((prev) => prev.map((p) => (p.id === r.id ? { ...p, date: e.target.value } : p)))}
                    className="w-full text-sm border border-gray-300 rounded px-2 py-1"
                    disabled={disabled || uploading}
                  />
                </div>
                <div className="md:col-span-6">
                  <label className="block text-[11px] text-gray-600 mb-1">Concepto</label>
                  <input
                    value={r.concept}
                    onChange={(e) => setCostRows((prev) => prev.map((p) => (p.id === r.id ? { ...p, concept: e.target.value } : p)))}
                    className="w-full text-sm border border-gray-300 rounded px-2 py-1"
                    placeholder="Ej. Plomería, refacción, mano de obra..."
                    disabled={disabled || uploading}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-[11px] text-gray-600 mb-1">Monto</label>
                  <input
                    value={r.amount}
                    onChange={(e) => setCostRows((prev) => prev.map((p) => (p.id === r.id ? { ...p, amount: e.target.value } : p)))}
                    className="w-full text-sm border border-gray-300 rounded px-2 py-1"
                    placeholder="0.00"
                    inputMode="decimal"
                    disabled={disabled || uploading}
                  />
                </div>
                <div className="md:col-span-1 flex items-end">
                  <button
                    type="button"
                    onClick={() => removeCostRow(r.id)}
                    className="w-full border border-red-300 text-red-700 rounded px-2 py-2 hover:bg-red-50 disabled:opacity-50"
                    disabled={disabled || uploading}
                    title="Eliminar"
                  >
                    <Trash2 size={16} className="mx-auto" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-gray-500 mt-2">No hay costos agregados.</div>
        )}
      </div>

      {!isValid ? (
        <div className="text-xs text-gray-600">
          Completa el texto de incidentes y verifica que cada costo tenga fecha, concepto y monto válido.
        </div>
      ) : null}
    </div>
  );
};
