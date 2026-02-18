import { ThemeColors } from '../../utils/brandTheme';
import { InfoTooltip } from '../common/InfoTooltip';

const COLOR_FIELDS: Array<{ key: keyof ThemeColors; label: string }> = [
  { key: 'primary', label: 'Primary' },
  { key: 'primaryForeground', label: 'Primary foreground' },
  { key: 'background', label: 'Background' },
  { key: 'accent', label: 'Accent' },
  { key: 'accentForeground', label: 'Accent foreground' },
  { key: 'textMain', label: 'Texto principal' },
  { key: 'textSecondary', label: 'Texto secundario' },
  { key: 'muted', label: 'Muted' },
  { key: 'mutedForeground', label: 'Muted foreground' },
  { key: 'border', label: 'Border' },
];

const colorHelp = (key: keyof ThemeColors, label: string) => {
  const purposeBase = 'Define un color global del tema usado por los portales.';
  const accepted = 'HEX #RRGGBB.';
  const restrictions = 'Procura contraste suficiente (WCAG 2.1 AA) para texto sobre fondos.';
  const examples = [`${label}: #0B1220`];

  const impactByKey: Record<string, string> = {
    primary: 'Afecta botones primarios, links destacados y acentos principales.',
    primaryForeground: 'Afecta el texto/iconos sobre elementos primarios.',
    background: 'Afecta el fondo general de páginas.',
    accent: 'Afecta indicadores, badges y detalles de énfasis.',
    accentForeground: 'Afecta el texto/iconos sobre elementos de acento.',
    textMain: 'Afecta el color de texto principal.',
    textSecondary: 'Afecta el color de texto secundario/descriptivo.',
    muted: 'Afecta superficies suaves (chips, bloques sutiles).',
    mutedForeground: 'Afecta texto sobre superficies muted.',
    border: 'Afecta líneas y bordes de componentes.',
  };

  return {
    title: label,
    purpose: purposeBase,
    accepted,
    impact: impactByKey[String(key)] ?? 'Afecta la apariencia del portal.',
    restrictions,
    examples,
  };
};

export function PaletteEditor({
  colors,
  onChange,
  onRestore,
}: {
  colors: ThemeColors;
  onChange: (next: ThemeColors) => void;
  onRestore: () => void;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="font-bold text-gray-900 inline-flex items-center gap-1">
            Paleta de colores
            <InfoTooltip helpId="superadmin.brand.palette" label="Paleta de colores" />
          </div>
          <div className="text-sm text-gray-500">Edita colores y guarda para aplicar globalmente.</div>
        </div>
        <button
          type="button"
          onClick={onRestore}
          className="px-3 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 text-sm"
        >
          Restaurar defaults
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {COLOR_FIELDS.map((f) => (
          <div key={f.key} className="rounded-lg border border-gray-200 p-3">
            <div className="text-xs font-bold text-gray-700 inline-flex items-center gap-1">
              {f.label}
              <InfoTooltip label={f.label} help={colorHelp(f.key, f.label)} />
            </div>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="color"
                value={colors[f.key]}
                onChange={(e) => onChange({ ...colors, [f.key]: e.target.value.toUpperCase() })}
                className="h-10 w-10 p-0 border-0 bg-transparent"
              />
              <input
                value={colors[f.key]}
                onChange={(e) => onChange({ ...colors, [f.key]: e.target.value.toUpperCase() })}
                className="flex-1 px-2 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div className="mt-3 h-8 rounded-md" style={{ background: colors[f.key] }} />
          </div>
        ))}
      </div>
    </div>
  );
}
