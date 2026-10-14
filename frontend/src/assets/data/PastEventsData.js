// Every photo has two files in gallery/past-events, made by
// scripts/past-event-photo.sh: <name>.webp for the full-size viewer and
// <name>-small.webp for cards, thumbnails, and the hero collage.
const photoFiles = import.meta.glob("../gallery/past-events/*.webp", {
  eager: true,
  import: "default",
});

const photoFile = (fileName) => {
  const file = photoFiles[`../gallery/past-events/${fileName}.webp`];
  if (!file)
    throw new Error(
      `Missing past event photo: gallery/past-events/${fileName}.webp`,
    );
  return file;
};

const photo = (name, alt) => ({
  src: photoFile(name),
  thumbnail: photoFile(`${name}-small`),
  alt,
});

// Past events shown on the Events page, newest first. Each event's first photo
// is its cover. `when` is required; `time` and `location` are optional and are
// shown with it in the photo viewer.
export const pastEvents = [
  {
    id: "iuga-rso-fair",
    name: "IUGA RSO Fair",
    when: "Tuesday, October 6",
    time: "4:15–5:45 PM",
    location: "NAN 181",
    summary:
      "The IUGA RSO Fair brought together student organizations that support your extracurricular development at UW. Whether you were looking for professional growth, creative outlets, or just a welcoming community, there was a place for you.",
    photos: [
      photo(
        "fair-friends",
        "Three students smiling together in the middle of the fair",
      ),
      photo(
        "fair-iuga-table",
        "The IUGA table with a hand-lettered sign, tote bags, sweatshirts, and tees",
      ),
      photo(
        "fair-winfo-table",
        "Three students holding up stickers behind a table with laptops and flyers",
      ),
      photo(
        "fair-crowd",
        "A long line of students waiting at the tables along the far wall",
      ),
      photo(
        "fair-qr",
        "A student in a plaid shirt holding up a printed QR code and smiling",
      ),
      photo(
        "fair-merch",
        "Close-up of a tote bag, a gray sweatshirt with a dog at a laptop, and a green tee",
      ),
      photo(
        "fair-tables",
        "Students seated at a row of tables in front of large windows",
      ),
      photo("fair-busy", "Students walking between tables in a busy room"),
      photo(
        "fair-room",
        "Students gathered around tables on the far side of the room",
      ),
    ],
  },
  {
    id: "meet-iuga",
    name: "Meet IUGA",
    when: "September 2026",
    summary:
      "A social hosted by IUGA where students found out who we are and what we do for Informatics students",
    photos: [
      photo(
        "meetup-crowd",
        "Students standing and talking in groups at the front of a lecture hall",
      ),
      photo(
        "meetup-speaker",
        "A student speaking to rows of seated students, with open pizza boxes on the front desk",
      ),
      photo(
        "meetup-hall",
        "Students seated in the rows of a lecture hall, chatting before things begin",
      ),
      photo(
        "meetup-mingle",
        "Students gathered in conversation near the front desk of a lecture hall",
      ),
    ],
  },
];
