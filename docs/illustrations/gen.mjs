// Builds the widget contents of the illustrations with the integration's own
// code: node gen.mjs <repo> <out.json> (run by render.sh)
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const [repo, out] = process.argv.slice(2);
const load = (path) => import(pathToFileURL(`${repo}/${path}`).href);
const { buildTripWidget, buildBoardWidget } = await load('src/widgets.js');
const { LANGUAGES } = await load('src/i18n.js');
const manifest = JSON.parse(readFileSync(`${repo}/gladys-assistant-integration.json`, 'utf8'));

// A weekday morning in Rennes: Tuesday 13 October 2026, 07:32. The widgets
// show Paris time, whatever the time zone of the machine that renders them.
const NOW = Date.parse('2026-10-13T05:32:00Z');
const MINUTE = 60000;
const at = (inMinutes) => NOW + inMinutes * MINUTE;

const TRIP = {
  slot: 1,
  key: '87471003-87481002',
  name: 'Rennes → Nantes',
  from: { id: 'stop_area:SNCF:87471003', name: 'Rennes' },
  to: { id: 'stop_area:SNCF:87481002', name: 'Nantes' },
  hours: null,
  days: [1, 2, 3, 4, 5],
};

// The followed trains of the trip, the way the watcher keeps them: one
// cancelled, one late, the others on time. The causes come from the SNCF, in
// French (they only show when a train is tapped).
const train = (number, inMinutes, { delay = 0, cancelled = false, cause = '' } = {}) => ({
  id: `${number}@${at(inMinutes)}`,
  number,
  mode: 'TER',
  direction: 'Nantes',
  baseDeparture: at(inMinutes),
  departure: at(inMinutes + delay),
  baseArrival: at(inMinutes + 78),
  arrival: at(inMinutes + 78 + delay),
  delay,
  cancelled,
  cause,
});
const TRAINS = [
  train('858305', 8, { cancelled: true, cause: 'Mouvement social local' }),
  train('858307', 28, { delay: 7, cause: 'Panne de signalisation' }),
  train('858309', 88),
  train('858311', 148),
];

// The departures board of Rennes, every direction.
const departure = (mode, number, direction, inMinutes, { delay = 0, cancelled = false } = {}) => ({
  id: `${number}@${at(inMinutes)}`,
  number,
  mode,
  direction,
  baseDeparture: at(inMinutes),
  departure: at(inMinutes + delay),
  delay,
  cancelled,
  cause: delay || cancelled ? 'Arrivée tardive du train en provenance de Brest' : '',
});
const DEPARTURES = [
  departure('TGV INOUI', '8610', 'Paris Montparnasse', 3),
  departure('TER', '858305', 'Nantes', 8, { cancelled: true }),
  departure('TER', '856115', 'Saint-Malo', 13),
  departure('OUIGO', '7812', 'Paris Montparnasse', 21, { delay: 12 }),
  departure('TER', '858307', 'Nantes', 28, { delay: 7 }),
  departure('TER', '855013', 'Quimper', 36),
];

const widgets = Object.fromEntries(manifest.widgets.map((w) => [w.key, w]));
const contents = {};
for (const language of LANGUAGES) {
  contents[language] = {
    trip: buildTripWidget({
      trip: TRIP,
      snapshot: { trains: TRAINS, span: { date: '2026-10-13' }, readAt: NOW },
      threshold: 5,
      busy: true,
      language,
      now: NOW,
    }),
    board: buildBoardWidget({
      station: { name: 'Rennes' },
      departures: DEPARTURES,
      count: 6,
      threshold: 5,
      language,
    }),
  };
}
const cards = Object.fromEntries(
  Object.keys(contents.en).map((key) => [
    key,
    { icon: widgets[key].icon, label: widgets[key].label },
  ]),
);
writeFileSync(out, JSON.stringify({ now: NOW, cards, contents }, null, 1));
console.log('ok', Object.keys(contents.en).join(', '));
