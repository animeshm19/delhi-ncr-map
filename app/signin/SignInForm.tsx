"use client";

import { useActionState } from "react";
import { sendMagicLink, type SignInState } from "./actions";

export default function SignInForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(sendMagicLink, { status: "idle" });
  if (state.status === "sent") {
    return (
      <div className="card" role="status">
        <h2 style={{ marginTop: 0 }}>Check your email</h2>
        <p className="muted">We sent a sign-in link. It works once and expires within the hour.</p>
      </div>
    );
  }
  return (
    <form action={action} className="form">
      <input type="hidden" name="next" value={next} />
      <label>
        <span>Email</span>
        <input name="email" type="email" required autoComplete="email" maxLength={200} />
      </label>
      {state.status === "error" && (
        <p className="error" role="alert">
          {state.message}
        </p>
      )}
      <button className="btn" type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send sign-in link"}
      </button>
    </form>
  );
}
