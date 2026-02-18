import { ReactNode } from 'react';
import { InfoTooltip } from '../common/InfoTooltip';

export type CompanyFormState = {
  company_name: string;
  company_legal_name: string;
  email: string;
  phone: string;
  address: string;
  website: string;
};

export function CompanyFields({ form, setForm }: { form: CompanyFormState; setForm: (next: CompanyFormState) => void }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <div className="font-bold text-gray-900">Datos de empresa</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Nombre comercial" required helpId="superadmin.company.company_name">
          <input
            value={form.company_name}
            onChange={(e) => setForm({ ...form, company_name: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </Field>
        <Field label="Nombre legal" helpId="superadmin.company.company_legal_name">
          <input
            value={form.company_legal_name}
            onChange={(e) => setForm({ ...form, company_legal_name: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </Field>
        <Field label="Email" helpId="superadmin.company.email">
          <input
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </Field>
        <Field label="Teléfono" helpId="superadmin.company.phone">
          <input
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </Field>
        <Field label="Dirección fiscal" full helpId="superadmin.company.address">
          <input
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </Field>
        <Field label="Sitio web" full helpId="superadmin.company.website">
          <input
            value={form.website}
            onChange={(e) => setForm({ ...form, website: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </Field>
      </div>
    </div>
  );
}

function Field({ label, required, full, children, helpId }: { label: string; required?: boolean; full?: boolean; children: ReactNode; helpId?: string }) {
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
