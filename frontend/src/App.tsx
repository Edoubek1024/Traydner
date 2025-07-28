import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import CreateAccount from "./pages/Auth/CreateAccount";
import LandingPage from "./pages/Landing";
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase/firebaseConfig";
import NavBar from "./components/NavBar/NavBar";
import NavBarDemo from "./components/NavBar/NavBarDemo";
import NotFound from "./pages/Error/404";
import Login from "./pages/Auth/Login";

function App() {

  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });

    return () => unsubscribe();
  }, []);

  return (
    <Router>
      {user ? <NavBar /> : <NavBarDemo />}

      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/Home" element={<Home />} />
        <Route path="/CreateAccount" element={<CreateAccount />} />
        <Route path="/Login" element={<Login />} />
        
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Router>
  );
}

export default App;
