import Silk from "../react-bits/Silk";
import ScrollReveal from "../react-bits/ScrollReveal";
import { Link } from "react-router-dom";

const LandingPage = () => {
  return (
    <div className="relative w-full min-h-screen overflow-hidden text-white">
      <div className="absolute inset-0 w-full h-full z-0">
        <Silk
          speed={5}
          scale={1.5}
          color="#458956"
          noiseIntensity={1.5}
          rotation={0}
        />
      </div>

      <section className="relative z-10 flex flex-col items-center justify-center min-h-screen text-center p-8">
        <h1 className="text-5xl font-extrabold mb-4">Welcome to Traydner</h1>
        <p className="text-xl mb-6 max-w-2xl">
          Master trading with simulations and AI-powered insights.
        </p>
      </section>

      <section className="relative z-10 min-h-screen flex items-center justify-center text-center p-8">
        <ScrollReveal baseOpacity={0} enableBlur baseRotation={0} blurStrength={10}>
          A trading training platform that gives user access to simulated Stock, Cryptocurrency, and ForEx exchanges.
        </ScrollReveal>
      </section>

      <section className="relative z-10 min-h-screen flex items-center justify-center text-center p-8">
        <div className="text-5xl font-bold">
          <ScrollReveal
            baseOpacity={0.2}
            enableBlur={false}
            baseRotation={0}
            blurStrength={5}
          >
            Get started
          </ScrollReveal>{" "}
          <Link to="/CreateAccount" className="text-blue-400 underline hover:text-blue-600">
            here
          </Link>
        </div>
      </section>

      <footer className="text-center p-4 text-gray-400 text-sm bg-black/90 relative z-10">
        &copy; {new Date().getFullYear()} Traydner. All rights reserved.
      </footer>
    </div>
  );
};

export default LandingPage;
