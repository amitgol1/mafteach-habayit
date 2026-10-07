import axios from "axios";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { User } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { HouseIllustration } from "../components/HouseIllustration";

const highlights = [
  { value: "10", label: "שלבי בנייה במעקב" },
  { value: "1", label: "יומן לכל תת-שלב" },
  { value: "₪", label: "שולם מול יתרה" },
];

type LoginResponse =
  | { status: "totp_setup_required"; pendingToken: string; user: User }
  | { status: "totp_required"; pendingToken: string; user: User };

type TotpSetupData = { secret: string; qrCodeDataUrl: string };

type Step =
  | { kind: "credentials"; error?: string }
  | { kind: "totp_setup"; pendingToken: string; user: User; setupData?: TotpSetupData }
  | { kind: "totp_verify"; pendingToken: string; user: User };

function pendingAuthErrorMessage(err: unknown): string | undefined {
  if (!axios.isAxiosError(err)) return undefined;
  return (err.response?.data as { error?: string } | undefined)?.error;
}

// Anything other than a 401 (a 5xx such as Cloudflare's "exceeded resource
// limits", or a network failure) is not the user's fault — say so instead of
// blaming their credentials or session.
function isUnauthorized(err: unknown): boolean {
  return axios.isAxiosError(err) && err.response?.status === 401;
}

const SERVER_ERROR_MESSAGE = "תקלה זמנית בשרת, נסו שוב בעוד רגע";

const PENDING_AUTH_KEY = "pendingAuth";

type PersistedPendingAuth = {
  step: "totp_setup" | "totp_verify";
  pendingToken: string;
  user: User;
  setupData?: TotpSetupData;
};

// On mobile, switching to the authenticator app to scan the QR / read the
// code often backgrounds this tab long enough for the browser to reload it
// on return. Step state lived only in memory, so that reload silently
// dropped the user back to the credentials form mid-setup. Persisting the
// pending step across a reload fixes that; the pendingToken still expires
// server-side after 10 minutes regardless.
//
// setupData is persisted too: /auth/totp/setup overwrites the secret on
// every call, so re-fetching it after a reload would show a new QR/manual
// code that no longer matches what the user already entered into their
// authenticator app.
//
// Rehydration is gated on this actually being a *reload* of the page
// (performance navigation type), not just any fresh mount — otherwise a
// deliberate return to /login (e.g. to log in as someone else after
// abandoning a pending 2FA flow) would resume the stale flow instead of
// showing the credentials form, since sessionStorage survives same-origin
// navigations too.
function isReloadNavigation(): boolean {
  const [entry] = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
  return entry?.type === "reload";
}

function loadPendingAuth(): Step {
  const raw = sessionStorage.getItem(PENDING_AUTH_KEY);
  if (!raw) return { kind: "credentials" };
  if (!isReloadNavigation()) {
    sessionStorage.removeItem(PENDING_AUTH_KEY);
    return { kind: "credentials" };
  }
  try {
    const parsed = JSON.parse(raw) as PersistedPendingAuth;
    if (parsed.step === "totp_setup") {
      return { kind: "totp_setup", pendingToken: parsed.pendingToken, user: parsed.user, setupData: parsed.setupData };
    }
    return { kind: "totp_verify", pendingToken: parsed.pendingToken, user: parsed.user };
  } catch {
    return { kind: "credentials" };
  }
}

function savePendingAuth(entry: PersistedPendingAuth) {
  sessionStorage.setItem(PENDING_AUTH_KEY, JSON.stringify(entry));
}

function savePendingAuthSetupData(setupData: TotpSetupData) {
  const raw = sessionStorage.getItem(PENDING_AUTH_KEY);
  if (!raw) return;
  const parsed = JSON.parse(raw) as PersistedPendingAuth;
  sessionStorage.setItem(PENDING_AUTH_KEY, JSON.stringify({ ...parsed, setupData }));
}

function clearPendingAuth() {
  sessionStorage.removeItem(PENDING_AUTH_KEY);
}

export function Login() {
  const { completeLogin } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(loadPendingAuth);

  function handleLoggedIn(token: string, user: User) {
    clearPendingAuth();
    completeLogin(token, user);
    navigate("/");
  }

  function handlePendingExpired(message = "פג תוקף החיבור, נא להתחבר שוב") {
    clearPendingAuth();
    setStep({ kind: "credentials", error: message });
  }

  function handleCredentialsAccepted(data: LoginResponse) {
    const kind = data.status === "totp_setup_required" ? "totp_setup" : "totp_verify";
    savePendingAuth({ step: kind, pendingToken: data.pendingToken, user: data.user });
    setStep({ kind, pendingToken: data.pendingToken, user: data.user } as Step);
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
        {step.kind === "credentials" && (
          <CredentialsForm initialError={step.error} onLoggedIn={handleCredentialsAccepted} />
        )}
        {step.kind === "totp_setup" && (
          <TotpSetupForm
            pendingToken={step.pendingToken}
            user={step.user}
            initialSetupData={step.setupData}
            onSetupData={savePendingAuthSetupData}
            onComplete={handleLoggedIn}
            onExpired={handlePendingExpired}
          />
        )}
        {step.kind === "totp_verify" && (
          <TotpVerifyForm
            pendingToken={step.pendingToken}
            user={step.user}
            onComplete={handleLoggedIn}
            onExpired={handlePendingExpired}
          />
        )}
      </section>
    </div>
  );
}

interface CredentialsFormProps {
  initialError?: string;
  onLoggedIn: (data: LoginResponse) => void;
}

function CredentialsForm({ initialError, onLoggedIn }: CredentialsFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { data } = await api.post<LoginResponse>("/auth/login", { email, password });
      onLoggedIn(data);
    } catch (err) {
      setError(isUnauthorized(err) ? "אימייל או סיסמה שגויים" : SERVER_ERROR_MESSAGE);
    } finally {
      setLoading(false);
    }
  }

  return (
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
  );
}

interface TotpStepProps {
  pendingToken: string;
  user: User;
  onComplete: (token: string, user: User) => void;
  onExpired: (message?: string) => void;
}

interface TotpSetupFormProps extends TotpStepProps {
  initialSetupData?: TotpSetupData;
  onSetupData: (data: TotpSetupData) => void;
}

function TotpSetupForm({ pendingToken, user, initialSetupData, onSetupData, onComplete, onExpired }: TotpSetupFormProps) {
  const [setupData, setSetupData] = useState<TotpSetupData | null>(initialSetupData ?? null);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const requestedRef = useRef(false);

  useEffect(() => {
    // /auth/totp/setup overwrites the user's secret on every call — StrictMode's
    // dev-only double-invoke would otherwise fire it twice per mount, racing
    // two different secrets against each other (whichever DB write lands last
    // may not match whichever response the DOM ends up showing). The ref
    // guard survives StrictMode's mount→cleanup→mount cycle (same component
    // instance), so only the first invocation actually fires the request.
    // No cancelled-flag gating on the response: StrictMode's synthetic
    // cleanup runs once regardless of the guard above, so a locally-scoped
    // `cancelled` flag would falsely discard this single real request's own
    // response. React 18 safely no-ops a state update on an unmounted
    // component, so nothing further is needed for a genuine unmount either.
    //
    // If setupData was already restored from sessionStorage (a tab reload
    // after switching to the authenticator app), skip the call entirely —
    // firing it again would silently replace the secret the user may have
    // already entered into their app.
    if (setupData) return;
    if (requestedRef.current) return;
    requestedRef.current = true;
    axios
      .post<{ secret: string; otpauthUrl: string; qrCodeDataUrl: string }>(
        "/api/auth/totp/setup",
        {},
        { headers: { Authorization: `Bearer ${pendingToken}` } }
      )
      .then(({ data }) => {
        const next = { secret: data.secret, qrCodeDataUrl: data.qrCodeDataUrl };
        setSetupData(next);
        onSetupData(next);
      })
      .catch((err) => {
        onExpired(isUnauthorized(err) ? undefined : SERVER_ERROR_MESSAGE);
      });
  }, [pendingToken, onExpired, setupData, onSetupData]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setCodeError(null);
    setSubmitting(true);
    try {
      const { data } = await axios.post<{ token: string; user: User }>(
        "/api/auth/totp/confirm",
        { code },
        { headers: { Authorization: `Bearer ${pendingToken}` } }
      );
      onComplete(data.token, data.user);
    } catch (err) {
      if (pendingAuthErrorMessage(err) === "Invalid code") {
        setCodeError("קוד שגוי, נסו שוב");
      } else if (isUnauthorized(err)) {
        onExpired();
      } else {
        setCodeError(SERVER_ERROR_MESSAGE);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="panel panel-edge-brass w-full max-w-sm p-6 sm:p-8">
      <p className="eyebrow text-brass-deep">הגדרת אימות דו-שלבי</p>
      <h2 className="mt-2 font-display text-2xl text-ink">שלום, {user.name}</h2>
      <p className="mt-2 text-sm text-ink-soft">
        סרקו את קוד ה-QR באמצעות אפליקציית אימות (כגון Google Authenticator), ולאחר מכן הזינו את הקוד שהיא מציגה.
      </p>

      <div className="mt-4 rounded-lg border border-limestone-deep bg-limestone/30 px-3 py-2 text-xs text-ink-soft">
        <p className="font-medium text-ink">אין לכם אפליקציית אימות בטלפון?</p>
        <p className="mt-1">
          זו אפליקציה חינמית שמייצרת קוד אימות. פתחו את חנות האפליקציות בטלפון —{" "}
          <span dir="ltr" className="font-medium">App Store</span> באייפון, או{" "}
          <span dir="ltr" className="font-medium">Google Play</span> באנדרואיד — וחפשו{" "}
          <span dir="ltr" className="font-medium">Google Authenticator</span>. התקינו, פתחו אותה, ואז חזרו לכאן וסרקו
          את קוד ה-QR למטה.
        </p>
      </div>

      {!setupData && <p className="mt-6 text-sm text-ink-soft">טוען...</p>}

      {setupData && (
        <>
          <div className="mt-6 flex justify-center">
            <img
              src={setupData.qrCodeDataUrl}
              alt="קוד QR להגדרת אימות דו-שלבי"
              data-testid="totp-qr-code"
              className="h-40 w-40 rounded-lg border border-limestone-deep"
            />
          </div>
          <p className="mt-4 text-xs text-ink-soft">
            או הזינו קוד זה ידנית:{" "}
            <span className="numeric font-medium text-ink" dir="ltr" data-testid="totp-manual-secret">
              {setupData.secret}
            </span>
          </p>

          <form onSubmit={handleSubmit} className="mt-6">
            <label className="form-label" htmlFor="totp-code">
              קוד בן 6 ספרות
            </label>
            <input
              id="totp-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              dir="ltr"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="form-field text-start"
              data-testid="totp-code-input"
            />

            {codeError && (
              <p className="mt-4 rounded-lg border border-brick/30 bg-brick-tint px-3 py-2 text-sm text-brick-deep">
                {codeError}
              </p>
            )}

            <button type="submit" disabled={submitting} className="btn btn-primary mt-6 w-full">
              {submitting ? "מאמת..." : "אישור והפעלה"}
            </button>
          </form>
        </>
      )}
    </div>
  );
}

function TotpVerifyForm({ pendingToken, user, onComplete, onExpired }: TotpStepProps) {
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setCodeError(null);
    setSubmitting(true);
    try {
      const { data } = await axios.post<{ token: string; user: User }>(
        "/api/auth/totp/verify",
        { code },
        { headers: { Authorization: `Bearer ${pendingToken}` } }
      );
      onComplete(data.token, data.user);
    } catch (err) {
      if (pendingAuthErrorMessage(err) === "Invalid code") {
        setCodeError("קוד שגוי, נסו שוב");
      } else if (isUnauthorized(err)) {
        onExpired();
      } else {
        setCodeError(SERVER_ERROR_MESSAGE);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="panel panel-edge-brass w-full max-w-sm p-6 sm:p-8">
      <p className="eyebrow text-brass-deep">אימות דו-שלבי</p>
      <h2 className="mt-2 font-display text-2xl text-ink">שלום, {user.name}</h2>
      <p className="mt-2 text-sm text-ink-soft">הזינו את הקוד בן 6 הספרות מאפליקציית האימות שלכם.</p>

      <div className="mt-6">
        <label className="form-label" htmlFor="totp-code">
          קוד בן 6 ספרות
        </label>
        <input
          id="totp-code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          dir="ltr"
          required
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="form-field text-start"
          data-testid="totp-code-input"
        />
      </div>

      {codeError && (
        <p className="mt-4 rounded-lg border border-brick/30 bg-brick-tint px-3 py-2 text-sm text-brick-deep">
          {codeError}
        </p>
      )}

      <button type="submit" disabled={submitting} className="btn btn-primary mt-6 w-full">
        {submitting ? "מאמת..." : "כניסה"}
      </button>
    </form>
  );
}
