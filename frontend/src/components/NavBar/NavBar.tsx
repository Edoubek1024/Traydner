import { useNavigate } from "react-router-dom";

const NavBar = () => {
  const navigate = useNavigate();

  return (
    <nav className="w-full bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Left side - Logo/Brand */}
          <div className="flex items-center space-x-8">
            <div className="text-2xl font-bold text-gray-900">
              Traydner
            </div>
            
            {/* Navigation Links */}
            <div className="hidden md:flex items-center space-x-6">
              <button className="text-gray-700 hover:text-gray-900 px-3 py-2 text-sm font-medium transition-colors">
                About
              </button>
              <button className="text-gray-700 hover:text-gray-900 px-3 py-2 text-sm font-medium transition-colors">
                How it works
              </button>
              <button className="text-gray-700 hover:text-gray-900 px-3 py-2 text-sm font-medium transition-colors">
                Features
              </button>
              <button className="text-gray-700 hover:text-gray-900 px-3 py-2 text-sm font-medium transition-colors">
                Pricing
              </button>
            </div>
          </div>

          {/* Right side - Auth buttons */}
          <div className="flex items-center space-x-4">
            <button 
              onClick={() => navigate("/login")}
              className="px-4 py-2 text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors font-medium"
            >
              Log in
            </button>
            <button 
              onClick={() => navigate("/create-account")}
              className="px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white rounded-md transition-colors font-medium"
            >
              Create Account
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default NavBar;