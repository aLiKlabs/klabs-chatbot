import { LoginForm } from "@/components/forms/login-form";
import { Brand } from "@/components/layout/brand";

export default function LoginPage() {
  return (
    <main className="login-page">
      <section className="login-box">
        <Brand />
        <header>
          <h1>Welcome back</h1>
          <p>Sign in to K-Labs ChatBot.</p>
        </header>
        <LoginForm />
      </section>
    </main>
  );
}
