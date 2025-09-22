import { useNavigate } from "react-router-dom";
import traydner_title from "../../assets/Traydner_title.png";

const NavBarDemo = ({ overlay = false }) => {
  const navigate = useNavigate();

  return (
    <nav
      className={`${
        overlay ? "fixed" : "sticky"
      } top-0 left-0 right-0 h-16 bg-gray-800 border-b border-gray-700 z-50 shadow-lg`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-8">
            <img
              src={traydner_title}
              alt="Traydner Logo"
              className="h-10 w-auto cursor-pointer"
              onClick={() => navigate("/")}
            />

            {/* Only "How it works" remains */}
            <div className="hidden md:flex items-center space-x-6">
              <button
                className="text-gray-300 hover:text-gray-200 px-3 py-2 text-sm font-medium transition-colors"
                onClick={() => navigate("/how-it-works")}
              >
                How it works
              </button>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <button
              onClick={() => navigate("/login")}
              className="px-4 py-2 bg-gray-100 text-gray-700 hover:text-gray-900 hover:bg-gray-200 rounded-md transition-colors font-medium"
            >
              Log in
            </button>
            <button
              onClick={() => navigate("/createaccount")}
              className="px-4 py-2 bg-gradient-to-r from-green-600 to-lime-700 hover:from-green-700 hover:to-lime-800 text-white rounded-md transition-colors font-medium"
            >
              Create Account
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default NavBarDemo;
