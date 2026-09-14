import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useQuery } from "convex/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/convex/_generated/api";
import { Loader2, Mail, KeyRound, UserX, CloudOff, WifiOff } from "lucide-react";

// ============================================================
// AFTERFALL — autenticación.
// Métodos: correo + contraseña (entrar / registrarse), Google
// OAuth, código por correo (OTP) e invitado (solo local).
// La sesión persiste: si ya hay sesión, se salta al juego.
// ============================================================

interface AuthProps {
  redirectAfterAuth?: string;
}

function resolveRedirectAfterAuth(returnTo: string | null, fallback: string) {
  if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) {
    return returnTo;
  }
  return fallback;
}

type Mode = "signIn" | "signUp";

/** Map provider errors to friendly Spanish messages. */
function authErrorMessage(err: unknown, mode: Mode): string {
  if (!navigator.onLine) {
    return "Sin conexión. Comprueba tu red e inténtalo de nuevo.";
  }
  const raw = err instanceof Error ? err.message : String(err);
  const msg = raw.toLowerCase();
  if (msg.includes("invalidcredentials") || msg.includes("invalid credentials") || msg.includes("account not found")) {
    return "Credenciales inválidas. Comprueba tu correo y contraseña.";
  }
  if (msg.includes("already exists") || msg.includes("alreadyregistered") || msg.includes("ya está registrado")) {
    return "Ese correo ya tiene cuenta. Inicia sesión en su lugar.";
  }
  if (msg.includes("password") && (msg.includes("8") || msg.includes("at least") || msg.includes("caracteres"))) {
    return "La contraseña debe tener al menos 8 caracteres.";
  }
  if (msg.includes("failed to fetch") || msg.includes("network") || msg.includes("fetch")) {
    return "No se pudo conectar con el servidor. Revisa tu conexión.";
  }
  if (mode === "signUp" && msg.includes("invalid")) {
    return "No se pudo crear la cuenta. Revisa los datos.";
  }
  return "Error de autenticación. Inténtalo de nuevo.";
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z" />
    </svg>
  );
}

function Auth({ redirectAfterAuth = "/juego" }: AuthProps) {
  const { isLoading: authLoading, isAuthenticated, signIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = resolveRedirectAfterAuth(searchParams.get("returnTo"), redirectAfterAuth);

  const authStatus = useQuery(api.gameSaves.authStatus, {});
  const googleEnabled = authStatus?.googleConfigured === true;

  const [mode, setMode] = useState<Mode>("signIn");
  const [showOtp, setShowOtp] = useState(false);
  const [otpSentTo, setOtpSentTo] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Session persistence: already signed in → go straight to the game.
  if (!authLoading && isAuthenticated && !otpSentTo) {
    navigate(redirect, { replace: true });
    return null;
  }

  const handlePasswordSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    try {
      await signIn("password", { email, password, flow: mode });
      navigate(redirect, { replace: true });
    } catch (err) {
      setError(authErrorMessage(err, mode));
      setIsLoading(false);
    }
  };

  const handleGoogle = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Full-page redirect to Google; returns straight into `redirect`.
      await signIn("google", { redirectTo: window.location.origin + redirect });
    } catch (err) {
      setError(authErrorMessage(err, mode));
      setIsLoading(false);
    }
  };

  const handleOtpSend = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim();
    try {
      await signIn("email-otp", { email });
      setOtpSentTo(email);
      setIsLoading(false);
    } catch (err) {
      setError(authErrorMessage(err, "signIn"));
      setIsLoading(false);
    }
  };

  const handleOtpVerify = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!otpSentTo) return;
    setIsLoading(true);
    setError(null);
    try {
      await signIn("email-otp", { email: otpSentTo, code: otp });
      navigate(redirect, { replace: true });
    } catch {
      setError("El código introducido no es correcto.");
      setOtp("");
      setIsLoading(false);
    }
  };

  const handleGuest = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await signIn("anonymous");
      navigate(redirect, { replace: true });
    } catch (err) {
      setError(authErrorMessage(err, "signIn"));
      setIsLoading(false);
    }
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
  };

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-[#0b0d0e] px-4 text-zinc-200">
      {/* backdrop glow */}
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          backgroundImage:
            "radial-gradient(60% 40% at 50% 88%, rgba(34,197,94,0.10), transparent 70%), radial-gradient(80% 50% at 50% 110%, rgba(34,197,94,0.08), transparent 60%)",
        }}
      />

      <div className="relative z-10 w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full border-2 border-green-500/70 bg-black/60 shadow-[0_0_30px_rgba(34,197,94,0.25)]">
            <span className="text-2xl text-green-500">☢</span>
          </div>
          <h1 className="text-2xl font-black tracking-[0.3em] text-zinc-100">AFTERFALL</h1>
          <p className="mt-1 text-[10px] uppercase tracking-[0.3em] text-green-500/90">
            Guardado en la nube
          </p>
        </div>

        {showOtp ? (
          otpSentTo ? (
            <section className="rounded-lg border border-zinc-800 bg-[#101213] p-5">
              <h2 className="text-center text-sm font-bold uppercase tracking-widest text-zinc-100">
                Revisa tu correo
              </h2>
              <p className="mt-1 text-center text-xs text-zinc-500">
                Hemos enviado un código a {otpSentTo}
              </p>
              <form onSubmit={handleOtpVerify} className="mt-4 flex flex-col gap-4">
                <input type="hidden" name="email" value={otpSentTo} />
                <input type="hidden" name="code" value={otp} />
                <div className="flex justify-center">
                  <InputOTP value={otp} onChange={setOtp} maxLength={6} disabled={isLoading}>
                    <InputOTPGroup>
                      {Array.from({ length: 6 }).map((_, i) => (
                        <InputOTPSlot key={i} index={i} />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>
                </div>
                {error && <p className="text-center text-xs text-red-400">{error}</p>}
                <Button
                  type="submit"
                  disabled={isLoading || otp.length !== 6}
                  className="h-10 border border-green-500/40 bg-green-600/90 font-bold uppercase tracking-widest text-black hover:bg-green-500"
                >
                  {isLoading ? <Loader2 className="size-4 animate-spin" /> : "Verificar código"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setOtpSentTo(null);
                    setOtp("");
                    setError(null);
                  }}
                  className="h-8 text-xs uppercase tracking-widest text-zinc-500"
                >
                  Usar otro método
                </Button>
              </form>
            </section>
          ) : (
            <section className="rounded-lg border border-zinc-800 bg-[#101213] p-5">
              <h2 className="text-center text-sm font-bold uppercase tracking-widest text-zinc-100">
                Código por correo
              </h2>
              <p className="mt-1 text-center text-xs text-zinc-500">
                Sin contraseña: te enviamos un código de un solo uso.
              </p>
              <form onSubmit={handleOtpSend} className="mt-4 flex flex-col gap-3">
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 size-4 text-zinc-600" />
                  <Input
                    name="email"
                    type="email"
                    required
                    placeholder="tu@correo.com"
                    autoComplete="email"
                    disabled={isLoading}
                    className="border-zinc-700 bg-black/50 pl-9 text-zinc-200 placeholder:text-zinc-600"
                  />
                </div>
                {error && <p className="text-xs text-red-400">{error}</p>}
                <Button
                  type="submit"
                  disabled={isLoading}
                  className="h-10 border border-green-500/40 bg-green-600/90 font-bold uppercase tracking-widest text-black hover:bg-green-500"
                >
                  {isLoading ? <Loader2 className="size-4 animate-spin" /> : "Enviar código"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setShowOtp(false);
                    setError(null);
                  }}
                  className="h-8 text-xs uppercase tracking-widest text-zinc-500"
                >
                  Volver
                </Button>
              </form>
            </section>
          )
        ) : (
          <section className="rounded-lg border border-zinc-800 bg-[#101213] p-5">
            {/* mode tabs */}
            <div className="mb-4 grid grid-cols-2 gap-1 rounded-md border border-zinc-800 bg-black/40 p-1">
              <button
                type="button"
                onClick={() => switchMode("signIn")}
                className={
                  mode === "signIn"
                    ? "rounded-sm bg-green-600/90 px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-black"
                    : "rounded-sm px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-zinc-500 hover:text-zinc-300"
                }
              >
                Entrar
              </button>
              <button
                type="button"
                onClick={() => switchMode("signUp")}
                className={
                  mode === "signUp"
                    ? "rounded-sm bg-green-600/90 px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-black"
                    : "rounded-sm px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-zinc-500 hover:text-zinc-300"
                }
              >
                Crear cuenta
              </button>
            </div>

            <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email" className="text-[10px] uppercase tracking-widest text-zinc-500">
                  Correo electrónico
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 size-4 text-zinc-600" />
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    required
                    placeholder="tu@correo.com"
                    autoComplete="email"
                    disabled={isLoading}
                    className="border-zinc-700 bg-black/50 pl-9 text-zinc-200 placeholder:text-zinc-600"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="password" className="text-[10px] uppercase tracking-widest text-zinc-500">
                  Contraseña
                </Label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-2.5 size-4 text-zinc-600" />
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    required
                    minLength={8}
                    placeholder={mode === "signUp" ? "Mínimo 8 caracteres" : "••••••••"}
                    autoComplete={mode === "signUp" ? "new-password" : "current-password"}
                    disabled={isLoading}
                    className="border-zinc-700 bg-black/50 pl-9 text-zinc-200 placeholder:text-zinc-600"
                  />
                </div>
              </div>

              {error && (
                <p className="rounded-sm border border-red-900/50 bg-red-950/30 px-3 py-2 text-xs text-red-400">
                  {error}
                </p>
              )}

              <Button
                type="submit"
                disabled={isLoading}
                className="h-11 border border-green-500/40 bg-green-600/90 text-sm font-bold uppercase tracking-widest text-black hover:bg-green-500"
              >
                {isLoading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : mode === "signIn" ? (
                  "Iniciar sesión"
                ) : (
                  "Registrarse"
                )}
              </Button>
            </form>

            {googleEnabled && (
              <>
                <div className="my-4 flex items-center gap-3">
                  <span className="h-px flex-1 bg-zinc-800" />
                  <span className="text-[10px] uppercase tracking-widest text-zinc-600">o</span>
                  <span className="h-px flex-1 bg-zinc-800" />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={isLoading}
                  onClick={handleGoogle}
                  className="h-11 w-full border-zinc-700 bg-zinc-900/60 text-sm font-bold uppercase tracking-widest text-zinc-200 hover:border-green-500/50 hover:bg-zinc-900"
                >
                  <GoogleIcon className="mr-2 size-4" />
                  Iniciar sesión con Google
                </Button>
              </>
            )}

            <div className="mt-4 flex flex-col gap-2 border-t border-zinc-800 pt-4">
              <button
                type="button"
                onClick={() => setShowOtp(true)}
                className="flex items-center gap-2 text-xs text-zinc-500 transition-colors hover:text-green-400"
              >
                <Mail className="size-3.5" />
                Entrar con código por correo (sin contraseña)
              </button>
              <button
                type="button"
                onClick={handleGuest}
                disabled={isLoading}
                className="flex items-center gap-2 text-xs text-zinc-500 transition-colors hover:text-zinc-300"
              >
                <UserX className="size-3.5" />
                Continuar como invitado (solo este dispositivo)
              </button>
              {!navigator.onLine && (
                <p className="mt-1 flex items-center gap-2 text-xs text-amber-500">
                  <WifiOff className="size-3.5" />
                  Sin conexión — puedes jugar, pero no sincronizar.
                </p>
              )}
            </div>
          </section>
        )}

        <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-[10px] uppercase tracking-[0.25em] text-zinc-600">
          <CloudOff className="size-3" />
          Tu partida también se guarda en este dispositivo
        </p>
      </div>
    </main>
  );
}

export default function AuthPage(props: AuthProps) {
  return <Auth {...props} />;
}
