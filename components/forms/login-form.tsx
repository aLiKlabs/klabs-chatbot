"use client";

import { useActionState } from "react";
import { LoaderCircle, LogIn } from "lucide-react";
import { login, type LoginState } from "@/app/actions/auth";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, action, pending] = useActionState(login, initialState);

  return (
    <form action={action} className="auth-form">
      <label>
        <span>Email address</span>
        <input
          type="email"
          name="email"
          autoComplete="email"
          placeholder="you@klabs.co"
          required
          autoFocus
        />
      </label>
      <label>
        <span>Password</span>
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          placeholder="Enter your password"
          required
        />
      </label>
      {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
      <button className="button button-primary button-wide" disabled={pending}>
        {pending ? <LoaderCircle className="spin" size={18} /> : <LogIn size={18} />}
        {pending ? "Signing in…" : "Sign in securely"}
      </button>
    </form>
  );
}
