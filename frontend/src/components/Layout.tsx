import type { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { roleLabel, tradeLabel } from "../constants/labels";

function KeyMark() {
  return (
    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brass/15 ring-1 ring-brass/40">
      <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden="true">
        <path d="M4 4h16v6l-8 10L4 10V4Z" stroke="#E4B65C" strokeWidth="1.4" strokeLinejoin="round" />
        <circle cx="12" cy="9.5" r="2.1" stroke="#E4B65C" strokeWidth="1.4" />
        <path d="M12 11.6v4.2M12 14h2" stroke="#E4B65C" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    </span>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const trade = tradeLabel(user?.trade);
  const role = roleLabel(user?.role);

  return (
    <div className="min-h-screen">
      <header className="bg-blueprint-deep text-plaster">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-3">
            <KeyMark />
            <span className="leading-none">
              <span className="block font-display text-lg tracking-wide">מפתח הבית</span>
              <span className="eyebrow block pt-1 text-blueprint-tint/70">ניהול פרויקטי בנייה</span>
            </span>
          </Link>

          {user && (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
              <span className="flex items-center gap-2 text-blueprint-tint/85">
                <span className="numeric grid size-7 place-items-center rounded-full bg-brass/25 text-xs font-medium text-brass-tint">
                  {user.name.slice(0, 2)}
                </span>
                <span className="hidden sm:inline">
                  {user.name}
                  <span className="text-blueprint-tint/50"> · {role}</span>
                  {trade ? <span className="text-blueprint-tint/50"> · {trade}</span> : ""}
                </span>
              </span>

              {(user.role === "SUPER_ADMIN" || user.role === "ENTREPRENEUR") && (
                <Link
                  to="/admin"
                  className={`relative pb-1 text-sm font-medium transition-colors ${
                    pathname === "/admin" ? "text-brass-tint" : "text-blueprint-tint/80 hover:text-plaster"
                  }`}
                >
                  ניהול
                  {pathname === "/admin" && (
                    <span className="absolute inset-x-0 -bottom-0.5 h-0.5 rounded-full bg-brass" />
                  )}
                </Link>
              )}

              <button
                type="button"
                onClick={() => {
                  logout();
                  navigate("/login");
                }}
                className="rounded-lg border border-plaster/20 px-3 py-1.5 text-sm font-medium text-blueprint-tint/85 transition-colors hover:border-brass/60 hover:text-brass-tint"
              >
                התנתקות
              </button>
            </div>
          )}
        </div>
        <div className="h-1 bg-linear-to-l from-brass via-brass/30 to-transparent" />
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
