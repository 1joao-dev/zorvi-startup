import { useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Eye, EyeOff, LockKeyhole, Mail, Sparkles, UserRound } from "lucide-react";
import { supabase } from "@/lib/supabase";

type Mode = "login" | "signup" | "reset";

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true); setError(""); setFeedback("");
    try {
      if (mode === "signup") {
        const { data, error: authError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { display_name: name.trim() } },
        });
        if (authError) throw authError;
        if (!data.session) setFeedback("Conta criada! Confira seu e-mail para confirmar o cadastro antes de entrar.");
      } else if (mode === "login") {
        const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (authError) throw authError;
      } else {
        const { error: authError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: window.location.origin,
        });
        if (authError) throw authError;
        setFeedback("Se o e-mail estiver cadastrado, você receberá um link para redefinir sua senha.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível concluir. Tente novamente.");
    } finally { setBusy(false); }
  };

  const title = mode === "signup" ? "Crie sua conta" : mode === "reset" ? "Recuperar senha" : "Que bom ter você aqui";
  const subtitle = mode === "signup" ? "Faça parte de uma comunidade de descobertas." : mode === "reset" ? "Enviaremos um link para seu e-mail." : "Entre para descobrir tudo que conecta sua cidade.";

  return <div className="zorvi-auth-page">
    <div className="zorvi-auth-brand"><img src="/zorvi-mark.webp" alt="Símbolo ZORVI"/><span>ZORVI</span></div>
    <div className="zorvi-auth-card">
      <div className="zorvi-auth-orb"><Sparkles size={25}/></div>
      <p className="eyebrow">TUDO SE CONECTA. TUDO SE DESCOBRE.</p>
      <h1>{title}</h1><p className="zorvi-auth-subtitle">{subtitle}</p>
      <form onSubmit={submit} className="zorvi-auth-form">
        {mode === "signup" && <label className="zorvi-auth-field"><UserRound size={17}/><input autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Como podemos chamar você?" required minLength={2}/></label>}
        <label className="zorvi-auth-field"><Mail size={17}/><input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Seu e-mail" required/></label>
        {mode !== "reset" && <label className="zorvi-auth-field"><LockKeyhole size={17}/><input type={showPassword ? "text" : "password"} autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Sua senha" required minLength={6}/><button type="button" aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={17}/> : <Eye size={17}/>}</button></label>}
        {mode === "login" && <button className="zorvi-auth-forgot" type="button" onClick={() => {setMode("reset");setError("");setFeedback("");}}>Esqueci minha senha</button>}
        {error && <p className="zorvi-auth-error" role="alert">{error}</p>}
        {feedback && <p className="zorvi-auth-success" role="status">{feedback}</p>}
        <button className="zorvi-auth-submit" type="submit" disabled={busy}>{busy ? "Aguarde..." : mode === "signup" ? "Criar minha conta" : mode === "reset" ? "Enviar link de recuperação" : "Entrar"} <ArrowRight size={17}/></button>
      </form>
      <div className="zorvi-auth-switch">{mode === "signup" ? "Já tem uma conta?" : "Ainda não tem uma conta?"} <button onClick={() => {setMode(mode === "signup" ? "login" : "signup");setError("");setFeedback("");}}>{mode === "signup" ? "Fazer login" : "Cadastre-se"}</button></div>
      {mode === "reset" && <button className="zorvi-auth-back" onClick={() => {setMode("login");setError("");setFeedback("");}}><ArrowLeft size={15}/> Voltar para o login</button>}
    </div>
    <p className="zorvi-auth-legal">Ao continuar, você concorda com os Termos de Uso e a Política de Privacidade da ZORVI.</p>
  </div>;
}
