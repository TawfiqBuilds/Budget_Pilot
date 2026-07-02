import React, { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";

export default function Auth({ onAuthed }) {
  const [session, setSession] = useState(null);
  const [checked, setChecked] = useState(false);
  const [mode, setMode] = useState("signin"); // signin | signup | reset | update
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChecked(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, sess) => {
      if (event === "PASSWORD_RECOVERY") {
        setMode("update");
        setPassword("");
      }
      setSession(sess);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setInfo("");
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin,
        });
        if (error) throw error;
        setInfo("Password reset link sent. Check your email.");
      } else if (mode === "update") {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        setPassword("");
        setInfo("Password updated.");
        setMode("signin");
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setInfo("Account created. Check your email to confirm, then sign in.");
      }
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  if (!checked) return null;

  if (session && mode !== "update") {
    return onAuthed(session);
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#EFEBE0",
        fontFamily: "-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif",
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          background: "#FFFDF8",
          border: "1px solid #D3CBB5",
          borderRadius: 8,
          padding: "32px 28px",
          width: 300,
        }}
      >
        <h1 style={{ fontFamily: "Georgia, serif", fontSize: 22, margin: "0 0 4px" }}>Budget Pilot</h1>
        <p style={{ fontSize: 12.5, color: "#6B6656", margin: "0 0 20px" }}>
          {mode === "signin" ? "Sign in to your ledger" : mode === "reset" ? "Reset your password" : mode === "update" ? "Choose a new password" : "Create your account"}
        </p>

        {mode !== "update" && (
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ width: "100%", padding: "9px 10px", marginBottom: 10, border: "1px solid #D3CBB5", borderRadius: 4, fontSize: 14 }}
          />
        )}
        {mode !== "reset" && (
          <input
            type="password"
            placeholder={mode === "update" ? "New password" : "Password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            style={{ width: "100%", padding: "9px 10px", marginBottom: 14, border: "1px solid #D3CBB5", borderRadius: 4, fontSize: 14 }}
          />
        )}

        {error && <p style={{ color: "#A24B3B", fontSize: 12.5, margin: "0 0 10px" }}>{error}</p>}
        {info && <p style={{ color: "#5C7A4F", fontSize: 12.5, margin: "0 0 10px" }}>{info}</p>}

        <button
          type="submit"
          disabled={busy}
          style={{
            width: "100%",
            background: "#242219",
            color: "#FFFDF8",
            border: "none",
            borderRadius: 4,
            padding: "10px 0",
            fontSize: 14,
            cursor: "pointer",
            marginBottom: 12,
          }}
        >
          {busy ? "Please wait..." : mode === "signin" ? "Sign in" : mode === "reset" ? "Send reset link" : mode === "update" ? "Update password" : "Sign up"}
        </button>

        {mode === "signin" && (
          <button
            type="button"
            onClick={() => {
              setMode("reset");
              setError("");
              setInfo("");
            }}
            style={{ width: "100%", background: "none", border: "none", color: "#6B6656", fontSize: 12.5, cursor: "pointer", textDecoration: "underline", marginBottom: 10 }}
          >
            Forgot password?
          </button>
        )}

        {mode !== "update" && (
          <button
            type="button"
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setError("");
              setInfo("");
            }}
            style={{ width: "100%", background: "none", border: "none", color: "#6B6656", fontSize: 12.5, cursor: "pointer", textDecoration: "underline" }}
          >
            {mode === "signin" ? "Need an account? Sign up" : "Back to sign in"}
          </button>
        )}
      </form>
    </div>
  );
}
