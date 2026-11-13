# Student Voice (archived)

Student Voice is archived from public promotion until IUGA decides how it wants
to collect student input and use it for advocacy. There is no scheduled return.

## What is archived

- The Student Voice link is removed from the desktop navbar and mobile menu.
- The homepage no longer promotes Student Voice as a destination.
- The page code, form configuration, styles, and route are preserved. This is
  not a deletion or a redesign of the feature.

The direct URL, `/student-voice`, remains available and still requires UW sign-in.
Hiding links does not disable the page or its existing forms.

## Preserved implementation

- `frontend/src/pages/StudentVoice.jsx`: page component.
- `frontend/src/assets/data/StudentVoiceData.js`: existing form configuration.
- `frontend/src/App.jsx`: route and sign-in requirement.

## Before bringing it back

IUGA needs to decide how Student Voice will support student input and advocacy,
including who reviews submissions, how they are used, and what students should
expect after submitting. Verify the forms, their access settings, and the page
copy against that decision before restoring the navbar and homepage links.
Do not promise anonymity, confidentiality, or a response unless the chosen
process supports it.

Update this note and `docs/FRONTEND.md` when Student Voice returns.
