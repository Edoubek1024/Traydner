import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase/firebaseConfig";
import { Link } from "react-router-dom";
import Silk from "../react-bits/Silk";
import { UserPlus, Wallet, LineChart, Rocket, Shield, HelpCircle, ArrowRight } from "lucide-react";

export default function HowItWorks() {
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setAuthed(!!u));
    return () => unsub();
  }, []);

  const primaryCta = authed
    ? { label: "Account", to: "/wallet" }        // logged in → go to Wallet (account area)
    : { label: "Create account", to: "/createaccount" }; // logged out → create account

  return (
    <div className="relative min-h-screen pt-16">
      {/* Background */}
      <div className="fixed inset-0 -z-10 pointer-events-none">
      <Silk
        speed={5}
        scale={1.5}
        color="#3b5000"
        noiseIntensity={1.5}
        rotation={0}
      />
    </div>

      {/* Hero */}
      <header className="max-w-6xl mx-auto px-6 py-12 text-center">
        <h1 className="text-4xl md:text-5xl font-extrabold text-white tracking-tight">
          How Traydner Works
        </h1>
        <p className="mt-4 text-lg md:text-xl text-emerald-100/90">
          Learn-by-doing trading — practice stocks, crypto, and forex with a risk-free paper wallet.
        </p>

        <div className="mt-8 flex flex-wrap gap-3 justify-center">
          <Link
            to={primaryCta.to}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-green-600 to-lime-700 px-5 py-3 text-white font-semibold shadow hover:shadow-lg hover:brightness-110 transition"
          >
            {primaryCta.label} <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            to="/wallet"
            className="inline-flex items-center gap-2 rounded-xl border-2 border-emerald-500/70 bg-gray-900 px-5 py-3 text-emerald-100 font-semibold hover:bg-gray-800 transition"
          >
            View Wallet
          </Link>
        </div>
      </header>

      {/* 4 Steps */}
      <section className="max-w-6xl mx-auto px-6 py-6">
        <h2 className="text-2xl md:text-3xl font-bold text-white mb-6">Your first 4 steps</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
          <StepCard
            icon={<UserPlus className="h-6 w-6" />}
            title="Create your account"
            body="Sign up with email or Google. We'll create your profile and paper wallet."
            ctaLabel={primaryCta.label}
            to={primaryCta.to}
          />
          <StepCard
            icon={<Wallet className="h-6 w-6" />}
            title="Get virtual cash"
            body="We fund new accounts with starting cash of $100,000 so you can begin trading right away."
            ctaLabel="Open wallet"
            to="/wallet"
          />
          <StepCard
            icon={<LineChart className="h-6 w-6" />}
            title="Pick a market"
            body="Trade stocks, crypto, or forex. Use the range selector to explore history."
            ctaLabel="Trade stocks"
            to="/trade/stocks"
          />
          <StepCard
            icon={<Rocket className="h-6 w-6" />}
            title="Place your trade"
            body="The simulated stock and forex markets close when the real markets close, but crypto is always available to trade."
            ctaLabel="Go to crypto"
            to="/trade/crypto"
          />
        </div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-6 py-10">
        <h2 className="text-2xl md:text-3xl font-bold text-white mb-6">What you can do</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          <FeatureCard title="Real-time pricing" body="Watch prices update and analyze candles across multiple time ranges." />
          <FeatureCard title="Unified wallet" body="See your cash, stocks, crypto, and forex in one place, with allocations." />
          <FeatureCard title="Clean charts" body="Quickly switch ranges (1D → 5Y) and compare performance over time." />
          <FeatureCard title="No risk learning" body="Develop discipline and test strategies before you ever use real money." />
          <FeatureCard title="Keyboard-friendly" body="Fast, responsive UI built with modern React & Tailwind." />
          <FeatureCard title="Made for practice" body="Built by students for students — iterate, learn, and improve." />
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-5xl mx-auto px-6 pb-20">
        <h2 className="text-2xl md:text-3xl font-bold text-white mb-6">FAQ</h2>
        <div className="space-y-3">
          <FaqItem q="Is this real money?" a="No. Traydner is a practice environment with a paper wallet so you can learn without risking real funds." />
          <FaqItem q="What can I trade?" a="Stocks, cryptocurrencies, and major forex pairs — each with history charts and range controls." />
          <FaqItem q="Do I need a credit card?" a="No payment required to practice. Just create an account and start exploring." />
          <FaqItem q="How do prices update?" a="Prices are fetched from market data providers and refreshed on the frontend; timing may vary by market." />
        </div>
        <p className="mt-6 text-sm text-emerald-100/80 flex items-center gap-2">
          <Shield className="h-4 w-4" /> Traydner is for educational use only and does not provide financial advice.
        </p>
      </section>
    </div>
  );
}

function StepCard({
  icon, title, body, ctaLabel, to,
}: { icon: React.ReactNode; title: string; body: string; ctaLabel: string; to: string }) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-emerald-600/40 bg-gray-900 p-5 shadow transition hover:shadow-xl">
      <div className="flex items-start gap-4">
        <div className="rounded-xl bg-emerald-600/15 p-3 text-emerald-300 group-hover:bg-emerald-600/25 transition">
          {icon}
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <p className="mt-1 text-emerald-100/90 text-sm leading-relaxed">{body}</p>
          <Link to={to} className="mt-3 inline-flex items-center gap-2 text-emerald-300 hover:text-emerald-200 font-medium">
            {ctaLabel} <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}

function FeatureCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-emerald-600/40 bg-gray-900 p-5 shadow">
      <h3 className="text-lg font-semibold text-white">{title}</h3>
      <p className="mt-1 text-emerald-100/90 text-sm leading-relaxed">{body}</p>
    </div>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  return (
    <details className="group rounded-xl border border-emerald-600/40 bg-gray-900 p-4">
      <summary className="flex cursor-pointer list-none items-center justify-between text-white font-medium">
        <span className="flex items-center gap-2"><HelpCircle className="h-4 w-4 text-emerald-300" /> {q}</span>
        <ArrowRight className="h-4 w-4 transition group-open:rotate-90" />
      </summary>
      <p className="mt-3 text-emerald-100/90 text-sm leading-relaxed">{a}</p>
    </details>
  );
}
