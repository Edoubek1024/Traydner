import Dither from "../../react-bits/Dither";
import { useNavigate } from "react-router-dom";

const NotFound = () => {
  const navigate = useNavigate();

  return (
    <div className="relative w-full h-screen flex items-center justify-center bg-black text-white overflow-hidden">
      <div className="absolute inset-0 z-0">
        <Dither
          waveColor={[0.5, 0.5, 0.5]}
          disableAnimation={false}
          enableMouseInteraction={true}
          mouseRadius={0.3}
          colorNum={4}
          waveAmplitude={0.3}
          waveFrequency={3}
          waveSpeed={0.05}
        />
      </div>

      <div className="relative z-10 text-center px-4">
        <h1 className="text-6xl font-bold mb-4 text-outline-black text-white">404 Page Not Found</h1>
        <p className="text-2xl font-bold mb-8 text-outline-black text-white">Nice try, bud</p>
        <button
          onClick={() => navigate("/")}
          className="px-6 py-3 bg-gradient-to-r from-green-500 to-teal-600 text-white rounded-lg shadow-lg hover:scale-105 transition-transform"
        >
          Go back home
        </button>
      </div>
    </div>
  );
};

export default NotFound;
