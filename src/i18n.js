// -----------------------------------------------------------------------------
// Texts of the integration, in English and French (English fallback).
//
// The manifest carries its own labels; these are the texts the code writes at
// runtime: device and feature names, widget contents, scene summaries,
// messages of the Configuration screen.
// -----------------------------------------------------------------------------

import { formatTime } from './time.js';

const TEXTS = {
  // devices
  deviceName: { en: 'SNCF – {trip}', fr: 'SNCF – {trip}' },
  featureNext: { en: 'Next train', fr: 'Prochain train' },
  featureDelay: { en: 'Delay of the next train', fr: 'Retard du prochain train' },
  featureDisrupted: { en: 'Disrupted trains', fr: 'Trains perturbés' },

  // train states
  onTime: { en: 'on time', fr: 'à l’heure' },
  late: { en: '+{n} min', fr: '+{n} min' },
  cancelled: { en: 'cancelled', fr: 'supprimé' },
  badgeOnTime: { en: 'On time', fr: 'À l’heure' },
  badgeCancelled: { en: 'Cancelled', fr: 'Supprimé' },
  nextLine: { en: '{time} · {train} · {state}', fr: '{time} · {train} · {state}' },
  noTrain: { en: 'No train', fr: 'Aucun train' },

  // scene summaries
  summaryFirst: {
    en: '{trip}: the {train} of {time} is {state}.',
    fr: '{trip} : le {train} de {time} est {state}.',
  },
  summaryFirstLate: {
    en: '{trip}: the {train} of {time} is {n} min late, leaving at {expected}.',
    fr: '{trip} : le {train} de {time} a {n} min de retard, départ à {expected}.',
  },
  summaryCause: { en: ' Cause: {cause}.', fr: ' Motif : {cause}.' },
  summaryNext: { en: ' Then: {list}.', fr: ' Ensuite : {list}.' },
  summaryNone: {
    en: '{trip}: no train found in the followed period.',
    fr: '{trip} : aucun train trouvé sur la période suivie.',
  },
  summaryReminder: {
    en: '{trip}: the {train} leaves in {minutes} min, at {expected}{late}.',
    fr: '{trip} : le {train} part dans {minutes} min, à {expected}{late}.',
  },
  reminderLate: { en: ' ({n} min late)', fr: ' ({n} min de retard)' },
  summaryDelayed: {
    en: '{trip}: the {train} of {time} is {n} min late, leaving at {expected}.{cause}',
    fr: '{trip} : le {train} de {time} a {n} min de retard, départ à {expected}.{cause}',
  },
  summaryCancelled: {
    en: '{trip}: the {train} of {time} is cancelled.{cause}',
    fr: '{trip} : le {train} de {time} est supprimé.{cause}',
  },

  // widgets
  departsIn: { en: 'Leaves in', fr: 'Départ dans' },
  nextTrain: { en: 'Next train', fr: 'Prochain train' },
  minutesShort: { en: 'min', fr: 'min' },
  arrivalAt: { en: 'arrives {time}', fr: 'arrivée {time}' },
  towards: { en: 'to {direction}', fr: 'vers {direction}' },
  tripDay: { en: 'Trains of {day}', fr: 'Trains du {day}' },
  disruptedCount: { en: 'Disrupted', fr: 'Perturbés' },
  updatedAt: { en: 'Updated at {time}', fr: 'Mis à jour à {time}' },
  boardOf: { en: 'Departures · {station}', fr: 'Départs · {station}' },
  noDeparture: {
    en: 'No departure in the next hours.',
    fr: 'Aucun départ dans les prochaines heures.',
  },
  noTrainWidget: {
    en: 'No train in the followed period of this trip.',
    fr: 'Aucun train sur la période suivie de ce trajet.',
  },
  waitingData: {
    en: 'Reading the trains… come back in a minute.',
    fr: 'Lecture des trains en cours… revenez dans une minute.',
  },
  noTrip: {
    en: 'No trip is configured: add one in the integration settings.',
    fr: 'Aucun trajet n’est configuré : ajoutez-en un dans les réglages de l’intégration.',
  },
  noApiKey: {
    en: 'Enter your SNCF API key in the integration settings.',
    fr: 'Renseignez votre clé d’API SNCF dans les réglages de l’intégration.',
  },
  noStation: {
    en: 'Choose a station: type one in the widget settings, or configure a trip.',
    fr: 'Choisissez une gare : saisissez-la dans les réglages du widget, ou configurez un trajet.',
  },
  unknownStation: {
    en: 'Station "{name}" not found: use the "Find a station" button of the integration.',
    fr: 'Gare « {name} » introuvable : utilisez le bouton « Chercher une gare » de l’intégration.',
  },
  unavailable: {
    en: 'The SNCF API is unavailable for now.',
    fr: 'L’API SNCF est indisponible pour le moment.',
  },

  // connection status
  statusOk: {
    en: 'Connected · {trips} trip(s) · {used} requests in 24 h',
    fr: 'Connecté · {trips} trajet(s) · {used} requêtes en 24 h',
  },
  statusNoTrip: {
    en: 'API key accepted. No trip configured yet.',
    fr: 'Clé d’API acceptée. Aucun trajet configuré pour l’instant.',
  },
  statusInvalidKey: {
    en: 'The SNCF API key is refused: check it.',
    fr: 'La clé d’API SNCF est refusée : vérifiez-la.',
  },
  statusQuota: {
    en: 'Daily quota of the SNCF API reached: paused until {time}.',
    fr: 'Quota quotidien de l’API SNCF atteint : en pause jusqu’à {time}.',
  },
  statusBudget: {
    en: 'Close to the daily quota ({used} requests in 24 h): trips paused for a while.',
    fr: 'Proche du quota quotidien ({used} requêtes en 24 h) : trajets en pause un moment.',
  },
  statusUnreachable: {
    en: 'The SNCF API cannot be reached; retrying.',
    fr: 'L’API SNCF est injoignable ; nouvel essai en cours.',
  },
  statusBadStation: {
    en: 'Station not found: {names}. Use the "Find a station" button.',
    fr: 'Gare introuvable : {names}. Utilisez le bouton « Chercher une gare ».',
  },
};

/**
 * @description Pick a text in a language (English fallback), with `{name}`
 * substitutions.
 * @param {string} key - The TEXTS key.
 * @param {string} language - The language.
 * @param {object} [values] - The substitutions.
 * @returns {string} The text.
 * @example
 * t('late', 'fr', { n: 5 }); // -> '+5 min'
 */
function t(key, language, values = {}) {
  const entry = TEXTS[key];
  if (!entry) {
    return key;
  }
  const template = entry[language] ?? entry.en;
  return template.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ''));
}

/**
 * @description The text in every language, for a multi-language message.
 * @param {string} key - The TEXTS key.
 * @param {object} [values] - The substitutions, or `(language) => values`.
 * @returns {{ en: string, fr: string }} The message.
 * @example
 * all('statusQuota', { time: '14:00' });
 */
function all(key, values = {}) {
  const of = (language) => (typeof values === 'function' ? values(language) : values);
  return { en: t(key, 'en', of('en')), fr: t(key, 'fr', of('fr')) };
}

/**
 * @description "TER 17491": the mode and the number of a train.
 * @param {object} train - The train.
 * @returns {string} The label.
 * @example
 * trainLabel({ mode: 'TER', number: '17491' }); // -> 'TER 17491'
 */
function trainLabel(train) {
  return [train.mode, train.number].filter(Boolean).join(' ') || '?';
}

/**
 * @description The state of a train, in words: "on time", "+5 min", "cancelled".
 * @param {object} train - The train.
 * @param {string} language - The language.
 * @returns {string} The state.
 */
function stateText(train, language) {
  if (train.cancelled) {
    return t('cancelled', language);
  }
  return train.delay > 0 ? t('late', language, { n: train.delay }) : t('onTime', language);
}

/**
 * @description One line for a train: "07:42 · TER 17491 · +5 min".
 * @param {object|undefined} train - The train.
 * @param {string} language - The language.
 * @returns {string} The line.
 * @example
 * nextLine(train, 'fr');
 */
function nextLine(train, language) {
  if (!train) {
    return t('noTrain', language);
  }
  return t('nextLine', language, {
    time: formatTime(train.baseDeparture),
    train: trainLabel(train),
    state: stateText(train, language),
  });
}

export { TEXTS, t, all, trainLabel, stateText, nextLine };
