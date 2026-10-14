/*
Purpose: Show up to three photos as an overlapping, tilted collage.

Expected Request Information:
- photos: array of { src, thumbnail }; the collage has room for three, so only the first three are used. thumbnail is an
  optional smaller file, preferred because the collage shows photos small.

Expected Response Information:
- A decorative collage, hidden from assistive technology.
*/

const MAX_PHOTOS = 3;

function PhotoCollage({ photos }) {
    return (
        <div className="photoCollage" aria-hidden="true">
            {photos.slice(0, MAX_PHOTOS).map((photo) => (
                <img src={photo.thumbnail ?? photo.src} alt="" key={photo.src} />
            ))}
        </div>
    );
}

export default PhotoCollage;
