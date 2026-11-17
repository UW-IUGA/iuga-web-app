import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronLeft, faChevronRight } from "@fortawesome/free-solid-svg-icons";

const ImageCarousel = ({ images, label }) => {
    const [activeIndex, setActiveIndex] = useState(0);
    const count = images.length;

    if (count === 0) return null;

    // Wraps any index into the valid range, so next from the last slide and
    // previous from the first slide both loop around.
    const goTo = (index) => setActiveIndex(((index % count) + count) % count);
    const showPrevious = () => goTo(activeIndex - 1);
    const showNext = () => goTo(activeIndex + 1);

    // Arrow keys browse the carousel when the viewport is focused; preventDefault keeps the page from scrolling along with them.

    const handleKeyDown = (event) => {
        if (event.key === "ArrowLeft") {
            event.preventDefault();
            showPrevious();
        } else if (event.key === "ArrowRight") {
            event.preventDefault();
            showNext();
        }
    };

    return (
        <div className="imageCarousel" role="group" aria-roledescription="carousel" aria-label={label}>
            <div
                className="imageCarouselViewport"
                tabIndex={0}
                onKeyDown={handleKeyDown}
                aria-label={`${label}, use arrow keys to browse`}
            >
                <div
                    className="imageCarouselTrack"
                    style={{ transform: `translateX(-${activeIndex * 100}%)` }}
                >
                    {images.map((image) => (
                        <div className="imageCarouselSlide" key={image.src}>
                            <img src={image.src} alt={image.alt} />
                        </div>
                    ))}
                </div>
            </div>
            {count > 1 && (
                <div className="imageCarouselControls">
                    <button
                        type="button"
                        className="imageCarouselButton"
                        onClick={showPrevious}
                        aria-label="Previous image"
                    >
                        <FontAwesomeIcon icon={faChevronLeft} aria-hidden="true" />
                    </button>
                    <div className="imageCarouselDots" role="group" aria-label="Choose image">
                        {images.map((image, index) => (
                            <button
                                type="button"
                                className={`imageCarouselDot${index === activeIndex ? " active" : ""}`}
                                key={image.src}
                                onClick={() => goTo(index)}
                                aria-label={`Show image ${index + 1} of ${count}`}
                                aria-current={index === activeIndex ? "true" : undefined}
                            />
                        ))}
                    </div>
                    <button
                        type="button"
                        className="imageCarouselButton"
                        onClick={showNext}
                        aria-label="Next image"
                    >
                        <FontAwesomeIcon icon={faChevronRight} aria-hidden="true" />
                    </button>
                </div>
            )}
            <p className="imageCarouselPosition" aria-live="polite">
                {activeIndex + 1} / {count}
            </p>
        </div>
    );
};

export default ImageCarousel;
