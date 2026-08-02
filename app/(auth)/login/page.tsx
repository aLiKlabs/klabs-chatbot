import { ShieldCheck, Sparkles } from "lucide-react";
import { LoginForm } from "@/components/forms/login-form";
import { Brand } from "@/components/layout/brand";

export default function LoginPage() {
  return (
    <main className="login-page">
      <section className="login-story">
        <Brand />
        <div className="story-content">
          <span className="story-pill"><Sparkles size={15} /> Internal K-Labs platform</span>
          <h1>Every website gets an assistant that knows its business.</h1>
          <p>Create, train, test, and install grounded AI chatbots without mixing client knowledge.</p>
          <div className="knowledge-orbit" aria-hidden="true">
            <span className="orbit-core"><strong>K</strong><i /></span>
            <span className="orbit-card orbit-card-one">Website pages <b>24</b></span>
            <span className="orbit-card orbit-card-two">Verified answer <b>✓</b></span>
            <span className="orbit-card orbit-card-three">Arabic + English</span>
          </div>
        </div>
        <p className="story-foot">Designed and operated by K-Labs</p>
      </section>
      <section className="login-panel">
        <div className="login-box">
          <span className="secure-icon"><ShieldCheck size={23} /></span>
          <p className="eyebrow">Administrator access</p>
          <h2>Welcome back</h2>
          <p>Sign in with an approved K-Labs account to manage website assistants.</p>
          <LoginForm />
          <div className="security-note"><ShieldCheck size={16} /><span>Protected workspace<br /><small>Access is restricted to approved administrators.</small></span></div>
        </div>
      </section>
    </main>
  );
}
