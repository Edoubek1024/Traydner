import Silk from "../react-bits/Silk";
import ScrollReveal from "../react-bits/ScrollReveal";
import { Link } from "react-router-dom";
import SplitText from "../react-bits/SplitText";
import logo from "../assets/Traydner_logo.png"

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
        <div className="flex items-center gap-4">
          <img src={logo} alt="Logo" className="w-48 h-48"/>
          <div style={{ fontFamily: 'Georgia' }} className="pt-2">
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

      <section className="relative z-10 min-h-screen flex items-center justify-center text-center p-8">
        <div className="text-5xl font-bold">
          <ScrollReveal
            baseOpacity={0.2}
            enableBlur={false}
            baseRotation={0}
            blurStrength={5}
          >
            Coming soon
          </ScrollReveal>{" "}
        </div>
      </section>

      <footer className="text-center p-4 text-gray-400 text-sm bg-black/90 relative z-10">
        &copy; {new Date().getFullYear()} Traydner. All rights reserved.
      </footer>
    </div>
  );
};

export default LandingPage;
