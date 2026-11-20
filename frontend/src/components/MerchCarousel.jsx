/*
Purpose: The shop's product mockups on rotation, with a progress bar per slide,
         for the Merch preview on the homepage.

`playing` pauses the rotation while the preview is hidden. Hovering also pauses
it, and visitors who prefer reduced motion see the first product without rotation.
*/

import { useEffect, useRef, useState } from "react";
import { shopProducts } from "../assets/data/ShopData";
import useMediaQuery from "../hooks/useMediaQuery";

const SLIDE_MS = 2600;

export default function MerchCarousel({ playing }) {
  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const autoplay = !useMediaQuery("(prefers-reduced-motion: reduce)");
  const remaining = useRef(SLIDE_MS);
  const running = autoplay && playing && !hovered;

  // A timer owns the slide change so the pace never depends on CSS events;
  // pausing keeps the time left on the current slide.
  useEffect(() => {
    remaining.current = SLIDE_MS;
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
                    animationDuration: `${SLIDE_MS}ms`,
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
