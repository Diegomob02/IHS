import { Eye, EyeOff } from 'lucide-react';
import { useId, useMemo, useState } from 'react';

type Props = {
  id?: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  autoComplete?: string;
  className?: string;
};

export function PasswordField(props: Props) {
  const reactId = useId();
  const inputId = props.id || reactId;
  const [visible, setVisible] = useState(false);
  const ariaLabel = useMemo(() => (visible ? 'Ocultar contraseña' : 'Mostrar contraseña'), [visible]);

  return (
    <div className="relative">
      <input
        id={inputId}
        name={props.name}
        type={visible ? 'text' : 'password'}
        autoComplete={props.autoComplete}
        required={props.required}
        disabled={props.disabled}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        className={props.className}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={ariaLabel}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-500 hover:text-gray-700"
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

