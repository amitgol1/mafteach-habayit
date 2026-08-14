import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { HouseIllustration } from "../components/HouseIllustration";

const highlights = [
  { value: "10", label: "שלבי בנייה במעקב" },
  { value: "1", label: "יומן לכל תת-שלב" },
  { value: "₪", label: "שולם מול יתרה" },
];

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      navigate("/");
    } catch {
      setError("אימייל או סיסמה שגויים");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[1.15fr_1fr]">
      <section className="relative overflow-hidden bg-blueprint-deep px-6 py-10 text-plaster sm:px-10 lg:flex lg:flex-col lg:justify-between lg:py-14">
        <div className="relative">
          <p className="eyebrow text-brass">מפתח הבית</p>
          <h1 className="mt-3 font-display text-3xl leading-tight sm:text-4xl">ניהול פרויקטי בנייה פרטית</h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-blueprint-tint/80 sm:text-base">
            משלד ועד טופס 4 — התוכנית, העדכונים מהשטח והכספים במקום אחד.
          </p>
        </div>

        <HouseIllustration className="relative mx-auto mt-8 w-full max-w-lg lg:mt-10" />

        <div className="relative mt-8 flex flex-wrap gap-x-8 gap-y-3 border-t border-plaster/15 pt-5">
          {highlights.map((item) => (
            <div key={item.label}>
              <p className="numeric font-display text-xl text-brass">{item.value}</p>
              <p className="eyebrow mt-1 text-blueprint-tint/60">{item.label}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="flex items-center justify-center px-4 py-12 sm:px-8">
        <form onSubmit={handleSubmit} className="panel panel-edge-brass w-full max-w-sm p-6 sm:p-8">
          <p className="eyebrow text-brass-deep">כניסה למערכת</p>
          <h2 className="mt-2 font-display text-2xl text-ink">ברוכים השבים</h2>
          <p className="mt-2 text-sm text-ink-soft">היכנסו עם הפרטים שקיבלתם ממנהל העבודה.</p>

          <div className="mt-6 space-y-4">
            <div>
              <label className="form-label" htmlFor="email">
                אימייל
              </label>
              <input
                id="email"
                type="email"
                dir="ltr"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="form-field text-start"
              />
            </div>
            <div>
              <label className="form-label" htmlFor="password">
                סיסמה
              </label>
              <input
                id="password"
                type="password"
                dir="ltr"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="form-field text-start"
              />
            </div>
          </div>

          {error && (
            <p className="mt-4 rounded-lg border border-brick/30 bg-brick-tint px-3 py-2 text-sm text-brick-deep">
              {error}
            </p>
          )}

          <button type="submit" disabled={loading} className="btn btn-primary mt-6 w-full">
            {loading ? "מתחבר..." : "כניסה"}
          </button>
        </form>
      </section>
    </div>
  );
}
