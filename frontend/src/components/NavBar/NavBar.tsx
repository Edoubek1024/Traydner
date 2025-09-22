import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, User } from "lucide-react";
import traydnerTitle from "../../assets/Traydner_title.png";

const Navbar = ({ overlay = false }) => {
  const navigate = useNavigate();
  const [isTradeDropdownOpen, setIsTradeDropdownOpen] = useState(false);

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
              src={traydnerTitle} 
              alt="Traydner Logo" 
              className="h-10 w-auto cursor-pointer" 
              onClick={() => navigate('/home')} 
            />
            
            <div className="hidden md:flex items-center space-x-6">
              <button
                className="text-gray-300 hover:text-gray-200 px-3 py-2 text-sm font-medium transition-colors"
                onClick={() => navigate("/how-it-works")}
              >
                How it works
              </button>

              <button
                className="text-gray-300 hover:text-gray-200 px-3 py-2 text-sm font-medium transition-colors"
                onClick={() => navigate("/wallet")}
              >
                Wallet
              </button>
              
              <div className="relative">
                <button
                  className="text-gray-300 hover:text-gray-200 px-3 py-2 text-sm font-medium transition-colors flex items-center gap-1"
                  onClick={() => setIsTradeDropdownOpen(!isTradeDropdownOpen)}
                >
                  Trade
                  <ChevronDown className="h-4 w-4" />
                </button>
                
                {isTradeDropdownOpen && (
                  <div className="absolute top-full left-0 mt-1 w-48 bg-gray-700 border border-gray-500 rounded-md shadow-lg z-50">
                    <button
                      onClick={() => {
                        navigate("/trade/stocks");
                        setIsTradeDropdownOpen(false);
                      }}
                      className="block w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-500 hover:text-gray-200 transition-colors"
                    >
                      Stocks
                    </button>
                    <button
                      onClick={() => {
                        navigate("/trade/crypto");
                        setIsTradeDropdownOpen(false);
                      }}
                      className="block w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-500 hover:text-gray-200 transition-colors"
                    >
                      Crypto
                    </button>
                    <button
                      onClick={() => {
                        navigate("/trade/forex");
                        setIsTradeDropdownOpen(false);
                      }}
                      className="block w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-500 hover:text-gray-200 transition-colors"
                    >
                      Foreign Exchange
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <button
              onClick={() => navigate("/profile")}
              className="px-4 py-2 bg-gray-200 text-gray-700 hover:text-gray-900 hover:bg-gray-300 rounded-md transition-colors font-medium flex items-center gap-2"
            >
              <User className="h-4 w-4" />
              Profile
            </button>
          </div>
        </div>
      </div>
      
      {/* Backdrop to close dropdown when clicking outside */}
      {isTradeDropdownOpen && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => setIsTradeDropdownOpen(false)}
        />
      )}
    </nav>
  );
};

export default Navbar;