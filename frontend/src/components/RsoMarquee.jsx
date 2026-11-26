/*
Purpose: Two rows of student-organization logos drifting in opposite directions,
         for the RSOs preview on the homepage.

`playing` pauses the drift while the preview is hidden.
*/

import { resources } from "../assets/data/ResourcesData";

// One tile per organization with a logo; two clubs that share a logo show it once.
const RSO_LOGOS = [
  ...new Map(
    resources
      .filter((resource) => resource.type === "RSO" && resource.rImage)
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

// Each row is rendered twice and slides by exactly one copy, so the loop has no seam.
export default function RsoMarquee({ playing }) {
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
