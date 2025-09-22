import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "../firebase/firebaseConfig";
// Removed Squares import
import { User, LogOut, Mail, BadgeCheck } from "lucide-react";

interface BackendProfile {
  firstName?: string;
  lastName?: string;
  displayName?: string;
  email?: string;
  uid?: string;
  createdAt?: string | number | Date;
}

export default function Profile() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState(false);
  const [firebaseEmail, setFirebaseEmail] = useState<string>("");
  const [firebaseDisplay, setFirebaseDisplay] = useState<string>("");
  const [profile, setProfile] = useState<BackendProfile | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setAuthed(!!u);
      if (!u) {
        setLoading(false);
        return;
      }
      setFirebaseEmail(u.email || "");
      setFirebaseDisplay(u.displayName || "");

      try {
        const token = await u.getIdToken();
        const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/users/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setProfile(data || null);
        }
      } catch (_) {
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  const computedFirst = (profile?.firstName || "").trim();
  const computedLast = (profile?.lastName || "").trim();
  const computedDisplay =
    (computedFirst && `${computedFirst}${computedLast ? ` ${computedLast}` : ""}`) ||
    (profile?.displayName || "").trim() ||
    (firebaseDisplay || "").trim() ||
    (firebaseEmail ? firebaseEmail.split("@")[0] : "");

  async function handleLogout() {
    try {
      await signOut(auth);
      navigate("/login");
    } catch (_) {}
  }

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-gray-800">
        <div className="flex items-center gap-3 text-white/90">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span>Loading profile…</span>
        </div>
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="relative min-h-screen pt-16 bg-gray-800">
        <div className="max-w-xl mx-auto px-6 py-16 text-center">
          <h1 className="text-3xl md:text-4xl font-extrabold text-white">You're not signed in</h1>
          <p className="mt-3 text-emerald-100/90">Log in to view your profile and wallet.</p>
          <div className="mt-6 flex justify-center gap-3">
            <Link to="/login" className="rounded-xl bg-gradient-to-r from-green-600 to-lime-700 px-5 py-3 text-white font-semibold shadow hover:shadow-lg transition">Log in</Link>
            <Link to="/createaccount" className="rounded-xl border-2 border-emerald-500/70 bg-gray-900 px-5 py-3 text-emerald-100 font-semibold hover:bg-gray-800 transition">Create account</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen pt-16 bg-gray-800">
      <main className="max-w-3xl mx-auto px-6 py-12">
        {/* Header Card */}
        <div className="rounded-2xl border border-emerald-600/40 bg-gray-900 p-6 shadow">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl bg-emerald-600/15 p-3 text-emerald-300">
              <User className="h-7 w-7" />
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                {computedDisplay}
                <BadgeCheck className="h-5 w-5 text-emerald-300" />
              </h1>
              {firebaseEmail && (
                <p className="mt-1 text-emerald-100/90 flex items-center gap-2">
                  <Mail className="h-4 w-4" /> {firebaseEmail}
                </p>
              )}
            </div>
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-green-600 to-lime-700 px-4 py-2 text-white font-semibold shadow hover:shadow-lg transition"
            >
              <LogOut className="h-4 w-4" /> Log out
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
