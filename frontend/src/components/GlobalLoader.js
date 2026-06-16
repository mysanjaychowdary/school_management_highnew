import React, { useEffect, useState } from 'react';
import { getPending } from '../lib/loader';

/**
 * Top progress bar that fades in whenever any axios request is in flight.
 * Subtle, accessible, non-blocking.
 */
const GlobalLoader = () => {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const onChange = (e) => {
      const p = e?.detail?.pending ?? getPending();
      setActive(p > 0);
    };
    window.addEventListener('app-loader-change', onChange);
    return () => window.removeEventListener('app-loader-change', onChange);
  }, []);

  return (
    <div
      data-testid="global-loader"
      aria-hidden={!active}
      className={`fixed top-0 left-0 right-0 z-[100] h-[3px] pointer-events-none transition-opacity duration-200 ${active ? 'opacity-100' : 'opacity-0'}`}
    >
      <div className="h-full bg-gradient-to-r from-sky-400 via-violet-500 to-emerald-400 animate-loader-bar shadow-[0_2px_8px_rgba(56,189,248,0.45)]" />
    </div>
  );
};

export default GlobalLoader;
