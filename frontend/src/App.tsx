import { BrowserRouter as Router, Routes, Route, useLocation, Navigate } from "react-router-dom";
import Home from "./pages/Home";
import CreateAccount from "./pages/Auth/CreateAccount";
import LandingPage from "./pages/Landing";
import { useEffect, useState, ReactElement } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "./firebase/firebaseConfig";
import NavBar from "./components/NavBar/NavBar";
import NavBarDemo from "./components/NavBar/NavBarDemo";
import NotFound from "./pages/Error/404";
import Login from "./pages/Auth/Login";
import StockTrade from "./pages/Trade/StockTrade";
import CryptoTrade from "./pages/Trade/CryptoTrade";
import ForexTrade from "./pages/Trade/ForexTrade";
import Holdings from "./pages/Wallet";
import HowItWorks from "./pages/HowItWorks";
import Profile from "./pages/Profile";

type RequireAuthProps = {
  user: User | null;
  authReady: boolean;
  children: ReactElement;
};

function RequireAuth({ user, authReady, children }: RequireAuthProps): ReactElement | null {
  const location = useLocation();
  if (!authReady) return null; // or a loading spinner component
  if (!user) {
    return <Navigate to="/" replace state={{ from: location }} />;
  }
  return children;
}

type RedirectIfAuthedProps = {
  user: User | null;
  authReady: boolean;
  to?: string;
  children: ReactElement;
};

function RedirectIfAuthed({
  user,
  authReady,
  to = "/home",
  children,
}: RedirectIfAuthedProps): ReactElement | null {
  if (!authReady) return null;   // or a spinner
  if (user) return <Navigate to={to} replace />;
  return children;
}

function App() {
  const [user, setUser] = useState<any>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  return (
    <Router>
      <NavWrapper user={user} />

      <Routes>
  <Route
    path="/"
    element={
      <RedirectIfAuthed user={user} authReady={authReady}>
        <LandingPage />
      </RedirectIfAuthed>
    }
  />
  <Route
    path="/createaccount"
    element={
      <RedirectIfAuthed user={user} authReady={authReady}>
        <CreateAccount />
      </RedirectIfAuthed>
    }
  />
  <Route
    path="/login"
    element={
      <RedirectIfAuthed user={user} authReady={authReady}>
        <Login />
      </RedirectIfAuthed>
    }
  />
  <Route 
    path="/home" 
    element={
      <RequireAuth user={user} authReady={authReady}>
        <Home />
      </RequireAuth>
    } 
  />
  <Route
    path="/wallet"
    element={
      <RequireAuth user={user} authReady={authReady}>
        <Holdings />
      </RequireAuth>
    }
  />
  <Route
    path="/trade/stocks"
    element={
      <RequireAuth user={user} authReady={authReady}>
        <StockTrade />
      </RequireAuth>
    }
  />
  <Route
    path="/trade/crypto"
    element={
      <RequireAuth user={user} authReady={authReady}>
        <CryptoTrade />
      </RequireAuth>
    }
  />
  <Route
    path="/trade/forex"
    element={
      <RequireAuth user={user} authReady={authReady}>
        <ForexTrade />
      </RequireAuth>
    }
  />
  <Route
    path="/profile"
    element={
      <RequireAuth user={user} authReady={authReady}>
        <Profile />
      </RequireAuth>
    }
  />

  <Route path="/how-it-works" element={<HowItWorks />} />
  <Route path="*" element={<NotFound />} />
</Routes>

    </Router>
  );
}

function NavWrapper({ user }: { user: any }) {
  const location = useLocation();
  const isOverlay = location.pathname.toLowerCase() === "/home" || location.pathname.toLowerCase() === "/how-it-works";

  if (user) {
    return <NavBar overlay={isOverlay} />;
  } else {
    return <NavBarDemo overlay={isOverlay} />;
  }
}

export default App;