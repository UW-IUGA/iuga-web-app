import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { shopProducts } from "../assets/data/ShopData";
import { resources } from "../assets/data/ResourcesData";
import { resourceTags } from "../assets/data/Enum";
import gates from "../assets/gallery/mary_gates.jpg";
import winfoTable from "../assets/gallery/past-events/fair-winfo-table-small.webp";
import fairMerch from "../assets/gallery/past-events/fair-merch-small.webp";
import iugaTable from "../assets/gallery/past-events/fair-iuga-table-small.webp";
import iFormal from "../assets/iFormal-2026.jpeg";

const DESTINATIONS = [
  {
    label: "RSOs",
    tone: "social",
    description: "Find clubs and communities across the iSchool.",
    detail:
      "Find clubs and communities across the iSchool, from design to data to gaming.",
    cta: "Browse organizations",
    to: "/resources?category=Community",
    image: winfoTable,
    showcase: "rsos",
  },
  {
    label: "Resources",
    tone: "academic",
    description: "Academic, career, community, and well-being support.",
    detail: "Advising, career help, and well-being support, all in one place.",
    cta: "View resources",
    to: "/resources",
    image: gates,
  },
  {
    label: "Merch",
    tone: "career",
    invite: true,
    description: "Browse the current Informatics merch.",
    detail:
      "Hoodies, crewnecks, baseball tees, and tote bags with Informatics designs.",
    cta: "Browse merch",
    to: "/shop",
    image: fairMerch,
    showcase: "merch",
  },
  {
    label: "About IUGA",
    tone: "brand",
    description: "Meet the students and teams behind IUGA.",
    detail: "Meet the students and teams behind IUGA and see how we work.",
    cta: "Meet the team",
    to: "/about",
    image: iFormal,
    fit: "whole",
  },
  {
    label: "Get involved",
    tone: "academic",
    description: "Join a committee and help shape Informatics.",
    detail:
      "Join a student-led committee and help shape what happens in the Informatics community.",
    cta: "Find a committee",
    to: "/get-involved",
    image: iugaTable,
    fit: "whole",
  },
];

// The progress bar advances the carousel, so pausing it needs no separate timer.
const MERCH_SLIDE_MS = 2600;

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// One tile per organization with a logo; two clubs that share a logo show it once.
const RSO_LOGOS = [
  ...new Map(
    resources[resourceTags.COMMUNITY]
      .filter((rso) => rso.rImage)
      .map((rso) => [rso.rImage, rso]),
  ).values(),
].map((rso) => ({
  image: rso.rImage,
  name: rso.rName,
  inset: rso.rImageInset,
}));

const RSO_ROWS = [
  RSO_LOGOS.filter((_, i) => i % 2 === 0),
  RSO_LOGOS.filter((_, i) => i % 2 === 1),
];

// Two rows drift in opposite directions. Each row is rendered twice and slides
// by exactly one copy, so the loop has no seam.
function RsoMarquee({ playing }) {
  return (
    <div
      className="homeRsoMarquee"
      data-theme="light"
      style={{ "--marquee-state": playing ? "running" : "paused" }}
    >
      {RSO_ROWS.map((row, r) => (
        <div className="homeRsoRow" key={r}>
          {[0, 1].map((copy) => (
            <ul className="homeRsoTrack" key={copy}>
              {row.map((rso) => (
                <li key={rso.name}>
                  <img
                    className={rso.inset ? "isInset" : undefined}
                    src={rso.image}
                    alt=""
                    decoding="async"
                  />
                </li>
              ))}
            </ul>
          ))}
        </div>
      ))}
    </div>
  );
}

function MerchCarousel({ playing }) {
  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [autoplay] = useState(() => !prefersReducedMotion());
  const remaining = useRef(MERCH_SLIDE_MS);
  const running = autoplay && playing && !hovered;

  // A timer owns the slide change so the pace never depends on CSS events;
  // pausing keeps the time left on the current slide.
  useEffect(() => {
    remaining.current = MERCH_SLIDE_MS;
  }, [index]);

  useEffect(() => {
    if (!running) return undefined;
    const startedAt = performance.now();
    const timer = setTimeout(() => {
      setIndex((current) => (current + 1) % shopProducts.length);
    }, remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current = Math.max(
        0,
        remaining.current - (performance.now() - startedAt),
      );
    };
  }, [running, index]);

  return (
    // The mockups are drawn on white, so the frame stays light in both themes.
    <div
      className="homeMerchCarousel"
      data-theme="light"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {shopProducts.map((item, i) => (
        <img
          key={item.sku}
          className={i === index ? "isActive" : undefined}
          src={item.image}
          alt=""
          decoding="async"
        />
      ))}
      <span className="homeMerchFooter">
        <span className="homeMerchNames">
          {shopProducts.map((item, i) => (
            <span
              key={item.sku}
              className={i === index ? "isActive" : undefined}
            >
              {item.name}
            </span>
          ))}
        </span>
        <span className="homeMerchSteps">
          {shopProducts.map((item, i) => (
            <span key={item.sku} className={i < index ? "isDone" : undefined}>
              {i === index && autoplay && (
                <span
                  key={index}
                  className="homeMerchProgress"
                  style={{
                    animationDuration: `${MERCH_SLIDE_MS}ms`,
                    animationPlayState: running ? "running" : "paused",
                  }}
                />
              )}
            </span>
          ))}
        </span>
      </span>
    </div>
  );
}

// True from the first time most of the element is on screen, and from then on.
function useSeenOnce(ref) {
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setSeen(true);
        observer.disconnect();
      },
      { threshold: 0.5 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);

  return seen;
}

export default function HomeExplore() {
  const [active, setActive] = useState(0);
  const sectionRef = useRef(null);
  const seen = useSeenOnce(sectionRef);

  return (
    <section
      ref={sectionRef}
      className="homeExplore"
      aria-labelledby="homeExploreHeading"
    >
      <div className="homeSectionHeading">
        <h2 id="homeExploreHeading">
          Explore <span>Informatics.</span>
        </h2>
        <p className="homeSummary">
          Everything you need to make the most of your Informatics experience.
        </p>
      </div>

      <div className="homeDestinations">
        <ul className="homeDestinationList">
          {DESTINATIONS.map((destination, i) => (
            <li key={destination.to}>
              <Link
                to={destination.to}
                className={
                  i === active ? "homeDestination isActive" : "homeDestination"
                }
                data-tone={destination.tone}
                data-invite={(seen && destination.invite) || undefined}
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
              >
                <img src={destination.image} alt="" loading="lazy" />
                <span className="homeDestinationText">
                  <strong>{destination.label}</strong>
                  <span>{destination.description}</span>
                </span>
                <FontAwesomeIcon
                  className="homeDestinationArrow"
                  icon={faChevronRight}
                  aria-hidden="true"
                />
              </Link>
            </li>
          ))}
        </ul>

        <article
          className="homePreview"
          data-tone={DESTINATIONS[active].tone}
          aria-hidden="true"
        >
          <div className="homePreviewPhoto">
            {DESTINATIONS.map((destination, i) => (
              <div
                key={destination.to}
                className={
                  i === active
                    ? "homePreviewLayer isActive"
                    : "homePreviewLayer"
                }
              >
                {destination.showcase === "rsos" ? (
                  <RsoMarquee playing={i === active} />
                ) : destination.showcase === "merch" ? (
                  <MerchCarousel playing={i === active} />
                ) : (
                  <>
                    {destination.fit === "whole" && (
                      <img
                        className="homePreviewBackdrop"
                        src={destination.image}
                        alt=""
                        loading="lazy"
                      />
                    )}
                    <img
                      className={
                        destination.fit === "whole" ? "isWhole" : undefined
                      }
                      src={destination.image}
                      alt=""
                      loading="lazy"
                    />
                  </>
                )}
              </div>
            ))}
          </div>
          <div className="homePreviewBody">
            {DESTINATIONS.map((destination, i) => (
              <div
                key={destination.to}
                className={i === active ? "isActive" : undefined}
              >
                <h3>{destination.label}</h3>
                <p>{destination.detail}</p>
                <Link
                  className="homePrimaryLink"
                  to={destination.to}
                  tabIndex={-1}
                >
                  {destination.cta}
                </Link>
              </div>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}
