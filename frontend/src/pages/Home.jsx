import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import capstoneNight from "../assets/gallery/past-events/capstone-formation-night.webp";
import fairFriends from "../assets/gallery/past-events/fair-friends-small.webp";
import accenturePanel from "../assets/gallery/past-events/accenture-panel-small.webp";
import HomeEvents from "../components/HomeEvents";
import HomeExplore from "../components/HomeExplore";

// One academic, one social, and one career event, so the first screen shows the
// whole range of what IUGA runs rather than a single kind of event.
const HERO_PHOTOS = [
  {
    src: capstoneNight,
    alt: "Students filling a room of round tables at Capstone Formation Night",
    event: "Capstone Formation Night",
  },
  {
    src: fairFriends,
    alt: "Three students smiling together at the IUGA RSO Fair",
    event: "IUGA RSO Fair",
  },
  {
    src: accenturePanel,
    alt: "Students standing and talking in a classroom at Networking with Accenture",
    event: "Networking with Accenture",
  },
];

function HomePage() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <main className="baseContainer homePage">
      <header className="homeOpening">
        <div className="homeIntro">
          <h1>Informatics Undergraduate Association</h1>
          <p className="homeSummary">
            IUGA is the undergraduate student government for UW Informatics.
            Find your community, support, and a say in what happens next.
          </p>
        </div>
        <ul className="homeHeroPhotos" aria-label="Recent IUGA events">
          {HERO_PHOTOS.map((photo) => (
            <li key={photo.event}>
              <figure>
                <img src={photo.src} alt={photo.alt} />
                <figcaption>{photo.event}</figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </header>

      <HomeEvents />
      <HomeExplore />
    </main>
  );
}

export default HomePage;
