// Discord requires every required option to come before every optional one, so the order matters.
const STRING = 3;

export const EVENT_COMMAND = {
  name: "event",
  description: "Submit an RSO event for moderator approval",
  options: [
    { type: STRING, name: "name", description: "Event name", required: true, max_length: 120 },
    { type: STRING, name: "date", description: "Date, YYYY-MM-DD (Pacific time)", required: true },
    { type: STRING, name: "start_time", description: "Start time, HH:MM 24-hour (Pacific)", required: true },
    { type: STRING, name: "location", description: "Where it happens", required: true, max_length: 120 },
    {
      type: STRING,
      name: "category",
      description: "Event category",
      required: true,
      choices: [
        { name: "Academic", value: "Academic" },
        { name: "Social", value: "Social" },
        { name: "Career", value: "Career" },
      ],
    },
    { type: STRING, name: "description", description: "What the event is", required: true, max_length: 1000 },
    { type: STRING, name: "end_time", description: "End time, HH:MM 24-hour (optional)" },
    { type: STRING, name: "rsvp_url", description: "RSVP link, https (optional)", max_length: 300 },
  ],
};
