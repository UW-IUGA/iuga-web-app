// Discord requires every required option to come before every optional one, so the order matters.
const STRING = 3;

export const EVENT_COMMAND = {
  name: "event",
  description: "Submit an event for moderator approval (opens a form)",
  options: [
    {
      type: STRING,
      name: "rso",
      description: "Which of your RSOs it's for. Only needed if you lead more than one",
      autocomplete: true,
      max_length: 80,
    },
  ],
};

export const RSO_VERIFY_COMMAND = {
  name: "rso-verify",
  description: "Ask the IUGA board to verify you as an officer of your RSO",
  options: [
    {
      type: STRING,
      name: "rso",
      description: "Your RSO. Pick it from the list, or type the full name if it's new",
      required: true,
      autocomplete: true,
      max_length: 80,
    },
    { type: STRING, name: "position", description: "Your position, e.g. President", required: true, max_length: 60 },
  ],
};
