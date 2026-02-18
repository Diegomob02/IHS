import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';
import type { TooltipHelp } from '../../help/tooltips';
import { getTooltipHelp } from '../../help/tooltips';

type Placement = 'top' | 'bottom';

const computePlacement = (rect: DOMRect): Placement => {
  const spaceBelow = window.innerHeight - rect.bottom;
  const spaceAbove = rect.top;
  return spaceBelow < 180 && spaceAbove > 180 ? 'top' : 'bottom';
};

export function InfoTooltip({
  helpId,
  help,
  label,
  className,
}: {
  helpId?: string;
  help?: TooltipHelp;
  label: string;
  className?: string;
}) {
  const resolvedHelp = useMemo(() => {
    if (help) return help;
    if (helpId) return getTooltipHelp(helpId);
    return null;
  }, [help, helpId]);

  if (!resolvedHelp) return null;

  return (
    <InfoTooltipInternal
      help={resolvedHelp}
      label={label}
      className={className}
    />
  );
}

function InfoTooltipInternal({
  help,
  label,
  className,
}: {
  help: TooltipHelp;
  label: string;
  className?: string;
}) {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<Placement>('bottom');
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const hoverTimerRef = useRef<number | null>(null);

  const tooltipId = `tooltip-${id}`;

  const close = () => {
    if (hoverTimerRef.current) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setOpen(false);
  };

  const scheduleOpen = () => {
    if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = window.setTimeout(() => {
      setOpen(true);
    }, 500);
  };

  useEffect(() => {
    if (!open) return;
    const el = triggerRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const nextPlacement = computePlacement(rect);
    setPlacement(nextPlacement);

    const margin = 10;
    const left = Math.max(margin, Math.min(window.innerWidth - margin, rect.left + rect.width / 2));
    const top = nextPlacement === 'top' ? rect.top - 8 : rect.bottom + 8;
    setPos({ top, left });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    const onScrollOrResize = () => {
      const r = el.getBoundingClientRect();
      const p = computePlacement(r);
      setPlacement(p);
      const l = Math.max(margin, Math.min(window.innerWidth - margin, r.left + r.width / 2));
      const t = p === 'top' ? r.top - 8 : r.bottom + 8;
      setPos({ top: t, left: l });
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={
          className ??
          'inline-flex items-center justify-center align-middle text-gray-400 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded'
        }
        aria-label={`Información: ${label}`}
        aria-describedby={open ? tooltipId : undefined}
        onMouseEnter={scheduleOpen}
        onMouseLeave={close}
        onFocus={() => setOpen(true)}
        onBlur={close}
      >
        <Info size={14} aria-hidden="true" />
      </button>
      {open && pos
        ? createPortal(
            <div
              id={tooltipId}
              role="tooltip"
              className={
                'z-[1000] fixed px-3 py-2 rounded-lg shadow-lg border border-slate-700 bg-slate-900 text-white text-xs leading-relaxed ' +
                'max-w-[min(92vw,380px)]'
              }
              style={{
                top: pos.top,
                left: pos.left,
                transform: placement === 'top' ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
              }}
            >
              <div className="font-bold text-sm">{help.title}</div>
              <div className="mt-1">
                <div className="font-semibold text-slate-200">Función</div>
                <div className="text-slate-100">{help.purpose}</div>
              </div>
              <div className="mt-2">
                <div className="font-semibold text-slate-200">Valores</div>
                <div className="text-slate-100">{help.accepted}</div>
              </div>
              <div className="mt-2">
                <div className="font-semibold text-slate-200">Impacto</div>
                <div className="text-slate-100">{help.impact}</div>
              </div>
              {help.restrictions ? (
                <div className="mt-2">
                  <div className="font-semibold text-slate-200">Restricciones</div>
                  <div className="text-slate-100">{help.restrictions}</div>
                </div>
              ) : null}
              {help.examples && help.examples.length > 0 ? (
                <div className="mt-2">
                  <div className="font-semibold text-slate-200">Ejemplos</div>
                  <ul className="list-disc pl-4 text-slate-100">
                    {help.examples.slice(0, 3).map((ex) => (
                      <li key={ex}>{ex}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

