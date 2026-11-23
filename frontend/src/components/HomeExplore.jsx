/*
Purpose: The homepage's Explore section: a list of destinations beside a preview
         of the one hovered or focused.

Every row is itself a link, so the preview is a desktop extra and is hidden from
assistive technology. To add a destination, add an entry to DESTINATIONS and
pick the preview that shows it.
*/

import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronRight } from "@fortawesome/free-solid-svg-icons";
import useSeenOnce from "../hooks/useSeenOnce";
import MerchCarousel from "./MerchCarousel";
import RsoMarquee from "./RsoMarquee";
import gates from "../assets/gallery/mary_gates.jpg";
import winfoTable from "../assets/gallery/past-events/fair-winfo-table-small.webp";
import fairMerch from "../assets/gallery/past-events/fair-merch-small.webp";
import iugaTable from "../assets/gallery/past-events/fair-iuga-table-small.webp";
import iFormal from "../assets/iFormal-2026.jpeg";

// A photo cropped to fill the preview.
function CoverPhoto({ image }) {
  return <img src={image} alt="" loading="lazy" />;
}

// The whole photo, uncropped, over a blurred copy that fills the frame around it.
function WholePhoto({ image }) {
  return (
    <>
      <img className="homePreviewBackdrop" src={image} alt="" loading="lazy" />
      <img className="isWhole" src={image} alt="" loading="lazy" />
    </>
  );
}

// `image` is the row's thumbnail. `Preview` fills the large card and receives
// that image and whether its card is the one showing. An `immersive` preview
// fills the whole card and carries its own copy over the image. `tone` is an event
// category colour; without one the brand colour is used. `invite` marks the one
// destination worth a nudge once the section is in view.
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
    Preview: RsoMarquee,
  },
  {
    label: "Resources",
    tone: "academic",
    description: "Academic, career, community, and well-being support.",
    detail: "Advising, career help, and well-being support, all in one place.",
    cta: "View resources",
    to: "/resources",
    image: gates,
    Preview: CoverPhoto,
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
    Preview: MerchCarousel,
    immersive: true,
  },
  {
    label: "About IUGA",
    description: "Meet the students and teams behind IUGA.",
    detail: "Meet the students and teams behind IUGA and see how we work.",
    cta: "Meet the team",
    to: "/about",
    image: iFormal,
    Preview: WholePhoto,
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
    Preview: WholePhoto,
  },
];

const activeClass = (base, isActive) => (isActive ? `${base} isActive` : base);

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
                className={activeClass("homeDestination", i === active)}
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

        {/* Every card stays mounted and only the active one shows, so quick hovers
            retarget a fade instead of restarting it. */}
        <article
          className="homePreview"
          data-tone={DESTINATIONS[active].tone}
          aria-hidden="true"
        >
          <div className="homePreviewPhoto">
            {DESTINATIONS.map(({ to, image, Preview, immersive }, i) =>
              immersive ? null : (
                <div key={to} className={activeClass("homePreviewLayer", i === active)}>
                  <Preview image={image} playing={i === active} />
                </div>
              ),
            )}
          </div>
          {DESTINATIONS.map((destination, i) =>
            destination.immersive ? (
              <div
                key={destination.to}
                className={activeClass("homePreviewLayer isImmersive", i === active)}
              >
                <destination.Preview
                  {...destination}
                  playing={i === active}
                />
              </div>
            ) : null,
          )}
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
