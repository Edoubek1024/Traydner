import Silk from "../react-bits/Silk";
import { Link } from "react-router-dom"; // ✅ make sure this is imported
import SplitText from "../react-bits/SplitText";
import logo from "../assets/Traydner_logo.png";

const LandingPage = () => {
  return (
    <div className="relative w-full min-h-screen overflow-hidden text-white">
      <div className="absolute inset-0 w-full h-full z-0 pointer-events-none">
        <Silk
          speed={5}
          scale={1.5}
          color="#458956"
          noiseIntensity={1.5}
          rotation={0}
        />
      </div>

      <section className="relative z-10 flex flex-col items-center justify-center min-h-screen text-center p-8">
        <div className="flex items-center gap-4">
          <img src={logo} alt="Logo" className="w-48 h-48" />
          <div style={{ fontFamily: "Georgia" }} className="pt-2">
            <SplitText
              text="TRAYDNER"
              className="text-9xl font-semibold text-center"
              delay={100}
              duration={0.6}
              ease="power3.out"
              splitType="chars"
              from={{ opacity: 0, y: 40 }}
              to={{ opacity: 1, y: 0 }}
              threshold={0.1}
              rootMargin="-100px"
              textAlign="center"
            />
          </div>
        </div>
        <p className="text-xl mb-6 max-w-2xl">
          A trading practice platform that gives users access to simulated Stock, Cryptocurrency, and ForEx exchanges.
        </p>
      </section>

      {/* CTA Section */}
      <section className="relative z-10 min-h-[60vh] flex flex-col items-center justify-center text-center p-8">
        <div className="max-w-xl">
          <p className="text-2xl md:text-3xl font-semibold mb-6">
            Ready to learn by <i>doing</i>... risk-free?
          </p>

          {/* Keep the button outside ScrollReveal so it always renders */}
          <Link
            to="/createaccount"
            aria-label="Create your Traydner account"
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-green-600 to-lime-700 px-6 py-3 text-white font-semibold shadow hover:shadow-lg hover:brightness-110 transition"
          >
            Get started →
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
