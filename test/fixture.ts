/** Hand-built in the shape of ESPN's scoreboard response, trimmed to the fields the parser reads. */
export function scoreboard(state: "pre" | "in" | "post", home: number, away: number, awayAbbr = "DAL") {
  return {
    events: [
      {
        id: "401",
        shortName: "DAL @ NYG",
        competitions: [
          {
            status: { type: { state, shortDetail: state === "in" ? "4:12 - 3rd" : state } },
            competitors: [
              {
                homeAway: "home",
                score: String(home),
                team: { id: "19", abbreviation: "NYG", displayName: "New York Giants", color: "003c7f", alternateColor: "c9243f" },
              },
              {
                homeAway: "away",
                score: String(away),
                team: { id: "6", abbreviation: awayAbbr, displayName: "Dallas Cowboys", color: "002a5c", alternateColor: "b0b7bc" },
              },
            ],
          },
        ],
      },
      { id: "broken", competitions: [{ competitors: [{ team: {} }] }] },
    ],
  };
}
