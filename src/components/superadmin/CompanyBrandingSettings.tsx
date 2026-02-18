import { useEffect, useMemo, useState } from 'react';
import { Save, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { extractThemeFromLogoFile } from '../../utils/palette';
import { DEFAULT_THEME_COLORS, ThemeColors } from '../../utils/brandTheme';
import { useAuditLog } from '../../hooks/useAuditLog';
import { CompanyFields, CompanyFormState } from './CompanyFields';
import { LogoUploader } from './LogoUploader';
import { PaletteEditor } from './PaletteEditor';

type CompanySettingsRow = {
  id: string;
  company_name: string;
  company_legal_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  website: string | null;
  logo_path: string | null;
  theme_json: any;
  theme_version: number;
};

function isValidHexColor(value: string) {
  return /^#[0-9A-Fa-f]{6}$/.test(value);
}

function resolveLogoPublicUrl(path: string | null) {
  if (!path) return '/IHS.jpg';
  if (path === 'public/IHS.jpeg' || path === '/IHS.jpeg' || path.endsWith('/IHS.jpeg')) return '/IHS.jpg';
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  if (path.startsWith('public/')) return `/${path.replace(/^public\//, '')}`;
  const { data } = supabase.storage.from('branding').getPublicUrl(path);
  return data?.publicUrl || '/IHS.jpg';
}

export function CompanyBrandingSettings({ profileId }: { profileId: string | null }) {
  const { logAction } = useAuditLog();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [row, setRow] = useState<CompanySettingsRow | null>(null);
  const [form, setForm] = useState<CompanyFormState>({
    company_name: '',
    company_legal_name: '',
    email: '',
    phone: '',
    address: '',
    website: '',
  });

  const [colors, setColors] = useState<ThemeColors>(DEFAULT_THEME_COLORS);
  const [logoPath, setLogoPath] = useState<string | null>(null);

  const logoUrl = useMemo(() => resolveLogoPublicUrl(logoPath), [logoPath]);

  const fetchCompany = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: e } = await supabase
        .from('company_settings')
        .select('*')
        .eq('is_singleton', true)
        .single();
      if (e) throw e;
      setRow(data as any);
      setForm({
        company_name: String((data as any).company_name || ''),
        company_legal_name: String((data as any).company_legal_name || ''),
        email: String((data as any).email || ''),
        phone: String((data as any).phone || ''),
        address: String((data as any).address || ''),
        website: String((data as any).website || ''),
      });
      setLogoPath((data as any).logo_path || null);
      const theme = (data as any).theme_json?.colors ? (data as any).theme_json.colors : (data as any).theme_json;
      setColors({ ...DEFAULT_THEME_COLORS, ...(theme || {}) });
    } catch (err: any) {
      setError(err?.message || 'No se pudo cargar la configuración de empresa.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCompany();
  }, []);

  const handleLogoFile = async (file: File) => {
    setError(null);
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml'];
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const okExt = ['png', 'jpg', 'jpeg', 'svg'].includes(ext);
    if (!allowedTypes.includes(file.type) && !okExt) {
      setError('Formato inválido. Usa PNG, JPG o SVG.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('El archivo excede 2MB.');
      return;
    }

    try {
      setSaving(true);

      const theme = await extractThemeFromLogoFile(file);
      setColors(theme);

      const safeExt = ext || (file.type === 'image/svg+xml' ? 'svg' : 'png');
      const objectPath = `logos/company-logo.${safeExt}`;
      const { error: uploadError } = await supabase.storage
        .from('branding')
        .upload(objectPath, file, { upsert: true, contentType: file.type });
      if (uploadError) throw uploadError;

      setLogoPath(objectPath);

      if (row?.id) {
        const { error: updateError } = await supabase
          .from('company_settings')
          .update({
            logo_path: objectPath,
            updated_by: profileId,
            updated_at: new Date().toISOString(),
          })
          .eq('id', row.id);
        if (updateError) throw updateError;
        await logAction('update_company_logo', 'company_settings', { logo_path: objectPath }, row.id);
      }
    } catch (err: any) {
      setError(err?.message || 'No se pudo procesar el logo.');
    } finally {
      setSaving(false);
    }
  };

  const validate = () => {
    if (!form.company_name.trim()) return 'El nombre comercial es obligatorio.';
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return 'Email inválido.';
    if (form.website) {
      try {
        new URL(form.website);
      } catch {
        return 'Sitio web inválido.';
      }
    }
    for (const key of Object.keys(DEFAULT_THEME_COLORS) as Array<keyof ThemeColors>) {
      if (!isValidHexColor(colors[key])) return 'Hay un color inválido en la paleta.';
    }
    return null;
  };

  const handleSave = async () => {
    const v = validate();
    if (v) {
      setError(v);
      return;
    }

    if (!row?.id) return;

    setSaving(true);
    setError(null);
    try {
      const nextVersion = (Number(row.theme_version) || 1) + 1;
      const payload = {
        company_name: form.company_name.trim(),
        company_legal_name: form.company_legal_name.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
        website: form.website.trim() || null,
        theme_json: { colors },
        theme_version: nextVersion,
        logo_path: logoPath,
        updated_by: profileId,
        updated_at: new Date().toISOString(),
      };

      const { error: e } = await supabase.from('company_settings').update(payload).eq('id', row.id);
      if (e) throw e;

      await logAction('update_company_branding', 'company_settings', payload, row.id);
      await fetchCompany();
    } catch (err: any) {
      setError(err?.message || 'No se pudo guardar la configuración.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-sm text-gray-500">Cargando configuración de empresa...</div>;
  }

  if (!row) {
    return (
      <div className="space-y-3">
        <div className="text-sm text-red-600">No se encontró el registro de empresa.</div>
        <button onClick={fetchCompany} className="text-sm text-primary hover:underline">Reintentar</button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-lg font-bold text-gray-900">Empresa y Marca</div>
          <div className="text-sm text-gray-500">Logo, datos fiscales y tema global de los portales.</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchCompany}
            className="px-3 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 text-sm flex items-center gap-2"
          >
            <RefreshCw size={16} />
            Recargar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-opacity-90 disabled:opacity-50 flex items-center gap-2"
          >
            <Save size={16} />
            {saving ? 'Guardando...' : 'Guardar y Publicar'}
          </button>
        </div>
      </div>

      {error && <div className="p-3 rounded-lg bg-red-50 border border-red-100 text-red-700 text-sm">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <CompanyFields form={form} setForm={setForm} />
        </div>

        <div>
          <LogoUploader logoUrl={logoUrl} disabled={saving} onFileSelected={handleLogoFile} />
        </div>
      </div>

      <PaletteEditor colors={colors} onChange={setColors} onRestore={() => setColors(DEFAULT_THEME_COLORS)} />
    </div>
  );
}
