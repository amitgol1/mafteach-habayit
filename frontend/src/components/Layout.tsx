import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <Link to="/" className="font-semibold text-gray-900">
          mafteach habayit
        </Link>
        {user && (
          <div className="flex items-center gap-4 text-sm text-gray-600">
            <span>
              {user.name} · {user.role}
              {user.trade ? ` · ${user.trade}` : ""}
            </span>
            {user.role === "ADMIN" && (
              <Link to="/admin" className="text-gray-600 hover:underline">
                Admin
              </Link>
            )}
            <button
              type="button"
              onClick={() => {
                logout();
                navigate("/login");
              }}
              className="text-red-600 hover:underline"
            >
              Log out
            </button>
          </div>
        )}
      </header>
      <main className="max-w-5xl mx-auto p-6">{children}</main>
    </div>
  );
}
