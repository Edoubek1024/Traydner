import { useEffect } from "react";
import Squares from "../react-bits/Squares";
import { Link } from "react-router-dom";
import { auth } from "../firebase/firebaseConfig";

export default function Home() {

  useEffect(() => {
    async function loadName() {
      const user = auth.currentUser;
      if (!user) return;

      let name = "";

      // Try backend profile first
      try {
        const idToken = await user.getIdToken();
        const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/users/me`, {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        if (res.ok) {
          const profile = await res.json();
          name = profile?.firstName || "";
        }
      } catch {
      }

      if (!name) {
        const display = user.displayName || "";
        if (display) {
          name = display.split(" ")[0];
        } else if (user.email) {
          name = user.email.split("@")[0];
        }
      }

    }

    loadName();
  }, []);

  return (
    <>
      {/* Background */}
      <Squares
        className="fixed inset-0 -z-10"
        direction="diagonal"
        speed={0.4}
        squareSize={44}
        borderColor="rgba(13,74,25,1)"
        hoverFillColor="rgba(77,64,0,1)"
      />

      {/* Foreground */}
      <div className="relative z-0 flex flex-col items-center justify-center h-screen text-center">
        <h1 className="text-4xl md:text-4xl font-bold text-white mb-8">
          Let's get going!
        </h1>

        <div className="flex flex-row gap-6 flex-wrap justify-center">
          {[
            { to: "/wallet", label: "Wallet" },
            { to: "/trade/stocks", label: "Trade Stocks" },
            { to: "/trade/crypto", label: "Trade Crypto" },
            { to: "/trade/forex", label: "Trade Forex" },
          ].map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              className="flex items-center justify-center w-36 h-16 bg-gray-900 border-2 border-emerald-500 text-white rounded-xl shadow-md hover:bg-gray-800 transition"
            >
              {label}
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
