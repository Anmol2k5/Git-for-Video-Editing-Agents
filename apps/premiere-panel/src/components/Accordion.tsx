import React, { useState } from 'react';
import { ChevronRight } from 'lucide-react';

export function Accordion({ title, defaultOpen = true, children }: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mb-1" style={{ transition: 'all 120ms ease-in-out' }}>
      <button
        className="accordion-header w-full flex items-center justify-between text-left focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
        onClick={() => setOpen(!open)}
        style={{ height: '32px' }}
      >
        <div className="flex items-center gap-1.5">
          <ChevronRight size={10} className={`accordion-chevron ${open ? 'open' : ''}`} />
          {title}
        </div>
      </button>
      {open && <div className="fade-in px-1">{children}</div>}
    </div>
  );
}
