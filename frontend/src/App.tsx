import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
// import Home from "./pages/Home";
// import CreateAccount from "./pages/Auth/CreateAccount";
import LandingPage from "./pages/Landing";

function App() {

  return (
    <Router>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        {/*
        <Route path="/Home" element={<Home />} />
        <Route path="/CreateAccount" element={<CreateAccount />} />
        */}
        <Route path="*" element={<h1>404 Not Found</h1>} />
      </Routes>
    </Router>
  );
}

export default App;
