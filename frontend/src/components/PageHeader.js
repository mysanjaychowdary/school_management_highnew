import React from 'react';
import { Link } from 'react-router-dom';

/**
 * Consistent page header used across all admin/staff pages.
 * Renders title (emerald accent), optional subtitle, optional breadcrumb,
 * and a slot for action buttons on the right.
 */
const PageHeader = ({ title, subtitle, breadcrumb, actions, icon: Icon }) => (
  <div className="relative pb-5 mb-6 border-b border-slate-200/70" data-testid="page-header">
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
      <div className="min-w-0">
        {breadcrumb && (
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-600 mb-1.5 flex items-center gap-1">
            {breadcrumb.map((b, i) => (
              <span key={i} className="flex items-center gap-1">
                {b.href ? (
                  <Link to={b.href} className="hover:text-emerald-700 transition-colors">{b.label}</Link>
                ) : (
                  <span>{b.label}</span>
                )}
                {i < breadcrumb.length - 1 && <span className="text-slate-300">/</span>}
              </span>
            ))}
          </p>
        )}
        <div className="flex items-center gap-3">
          {Icon && (
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md shadow-emerald-100 flex-shrink-0">
              <Icon className="w-5 h-5 text-white" strokeWidth={2.5} />
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl lg:text-[34px] font-extrabold tracking-tight text-slate-900 leading-tight truncate" style={{ fontFamily: 'Nunito' }}>{title}</h1>
            {subtitle && <p className="text-sm sm:text-base font-medium text-slate-500 mt-0.5" style={{ fontFamily: 'Figtree' }}>{subtitle}</p>}
          </div>
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 sm:flex-shrink-0">{actions}</div>}
    </div>
  </div>
);

export default PageHeader;
