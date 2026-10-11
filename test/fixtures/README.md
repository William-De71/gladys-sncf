# Real SNCF API answers

Captured from `api.sncf.com` by other projects, kept verbatim so the parser is tested against what the API really
sends:

| File                         | Answer                                                                     | Source (license)                                                                                                                 |
| ---------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `journey-delayed.json`       | `/journeys`, real time, a TER 35 min late after a points failure (2023)    | [Pierrad/sncf-api-wrapper](https://github.com/Pierrad/sncf-api-wrapper/blob/main/data/journey_with_disruption.json) (Apache-2.0) |
| `departures-paris-lyon.json` | `/stop_areas/…/departures` of Paris Gare de Lyon, with added trains (2021) | [rjkerrison/ticker-board](https://github.com/rjkerrison/ticker-board/blob/main/demo/.example.json) (MIT)                         |
