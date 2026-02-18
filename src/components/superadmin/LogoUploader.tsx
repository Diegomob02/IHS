import { useRef } from 'react';
import { Upload } from 'lucide-react';
import { InfoTooltip } from '../common/InfoTooltip';

export function LogoUploader({
  logoUrl,
  disabled,
  onFileSelected,
}: {
  logoUrl: string;
  disabled: boolean;
  onFileSelected: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <div className="font-bold text-gray-900 inline-flex items-center gap-1">
        Logo corporativo
        <InfoTooltip helpId="superadmin.brand.logo" label="Logo corporativo" />
      </div>
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 flex items-center justify-center">
        <img src={logoUrl} alt="Logo" className="max-h-24 w-auto object-contain" />
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".png,.jpg,.jpeg,.svg,image/png,image/jpeg,image/svg+xml"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFileSelected(f);
          if (inputRef.current) inputRef.current.value = '';
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        className="w-full px-4 py-2 rounded-lg border border-gray-300 text-gray-800 hover:bg-gray-50 text-sm flex items-center justify-center gap-2 disabled:opacity-50"
      >
        <Upload size={16} />
        Subir logo (PNG/JPG/SVG)
      </button>
      <div className="text-xs text-gray-500">Máximo 2MB. Se intentará extraer una paleta automáticamente.</div>
    </div>
  );
}
