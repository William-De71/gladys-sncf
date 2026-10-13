// -----------------------------------------------------------------------------
// Texts of the integration, in English, French, German and Spanish (English
// fallback).
//
// The manifest carries its own labels; these are the texts the code writes at
// runtime: device and feature names, widget contents, scene summaries,
// messages of the Configuration screen.
// -----------------------------------------------------------------------------

import { formatTime } from './time.js';

const LANGUAGES = ['en', 'fr', 'de', 'es'];
// Locale of the dates written in each language.
const LOCALES = { en: 'en-GB', fr: 'fr-FR', de: 'de-DE', es: 'es-ES' };

const TEXTS = {
  // devices
  deviceName: {
    en: 'SNCF – {trip}',
    fr: 'SNCF – {trip}',
    de: 'SNCF – {trip}',
    es: 'SNCF – {trip}',
  },
  featureNext: { en: 'Next train', fr: 'Prochain train', de: 'Nächster Zug', es: 'Próximo tren' },
  featureDelay: {
    en: 'Delay of the next train',
    fr: 'Retard du prochain train',
    de: 'Verspätung des nächsten Zuges',
    es: 'Retraso del próximo tren',
  },
  featureDisrupted: {
    en: 'Disrupted trains',
    fr: 'Trains perturbés',
    de: 'Gestörte Züge',
    es: 'Trenes con incidencias',
  },

  // train states
  onTime: { en: 'on time', fr: 'à l’heure', de: 'pünktlich', es: 'en hora' },
  late: { en: '+{n} min', fr: '+{n} min', de: '+{n} min', es: '+{n} min' },
  cancelled: { en: 'cancelled', fr: 'supprimé', de: 'ausgefallen', es: 'cancelado' },
  badgeOnTime: { en: 'On time', fr: 'À l’heure', de: 'Pünktlich', es: 'Puntual' },
  badgeCancelled: { en: 'Cancelled', fr: 'Supprimé', de: 'Fällt aus', es: 'Cancelado' },
  nextLine: {
    en: '{time} · {train} · {state}',
    fr: '{time} · {train} · {state}',
    de: '{time} · {train} · {state}',
    es: '{time} · {train} · {state}',
  },
  noTrain: { en: 'No train', fr: 'Aucun train', de: 'Kein Zug', es: 'Ningún tren' },

  // scene summaries
  summaryFirst: {
    en: '{trip}: the {train} of {time} is {state}.',
    fr: '{trip} : le {train} de {time} est {state}.',
    de: '{trip}: Der {train} um {time} ist {state}.',
    es: '{trip}: el {train} de las {time} está {state}.',
  },
  summaryFirstLate: {
    en: '{trip}: the {train} of {time} is {n} min late, leaving at {expected}.',
    fr: '{trip} : le {train} de {time} a {n} min de retard, départ à {expected}.',
    de: '{trip}: Der {train} um {time} hat {n} min Verspätung, Abfahrt um {expected}.',
    es: '{trip}: el {train} de las {time} lleva {n} min de retraso, sale a las {expected}.',
  },
  summaryCause: {
    en: ' Cause: {cause}.',
    fr: ' Motif : {cause}.',
    de: ' Grund: {cause}.',
    es: ' Motivo: {cause}.',
  },
  summaryNext: {
    en: ' Then: {list}.',
    fr: ' Ensuite : {list}.',
    de: ' Danach: {list}.',
    es: ' Después: {list}.',
  },
  summaryNone: {
    en: '{trip}: no train found in the followed period.',
    fr: '{trip} : aucun train trouvé sur la période suivie.',
    de: '{trip}: kein Zug im verfolgten Zeitraum gefunden.',
    es: '{trip}: ningún tren encontrado en el periodo seguido.',
  },
  summaryReminder: {
    en: '{trip}: the {train} leaves in {minutes} min, at {expected}{late}.',
    fr: '{trip} : le {train} part dans {minutes} min, à {expected}{late}.',
    de: '{trip}: Der {train} fährt in {minutes} min ab, um {expected}{late}.',
    es: '{trip}: el {train} sale dentro de {minutes} min, a las {expected}{late}.',
  },
  reminderLate: {
    en: ' ({n} min late)',
    fr: ' ({n} min de retard)',
    de: ' ({n} min Verspätung)',
    es: ' ({n} min de retraso)',
  },
  summaryDelayed: {
    en: '{trip}: the {train} of {time} is {n} min late, leaving at {expected}.{cause}',
    fr: '{trip} : le {train} de {time} a {n} min de retard, départ à {expected}.{cause}',
    de: '{trip}: Der {train} um {time} hat {n} min Verspätung, Abfahrt um {expected}.{cause}',
    es: '{trip}: el {train} de las {time} lleva {n} min de retraso, sale a las {expected}.{cause}',
  },
  summaryCancelled: {
    en: '{trip}: the {train} of {time} is cancelled.{cause}',
    fr: '{trip} : le {train} de {time} est supprimé.{cause}',
    de: '{trip}: Der {train} um {time} fällt aus.{cause}',
    es: '{trip}: el {train} de las {time} está cancelado.{cause}',
  },

  // widgets
  departsIn: { en: 'Leaves in', fr: 'Départ dans', de: 'Abfahrt in', es: 'Sale en' },
  nextTrain: { en: 'Next train', fr: 'Prochain train', de: 'Nächster Zug', es: 'Próximo tren' },
  minutesShort: { en: 'min', fr: 'min', de: 'min', es: 'min' },
  arrivalAt: {
    en: 'arrives {time}',
    fr: 'arrivée {time}',
    de: 'Ankunft {time}',
    es: 'llegada {time}',
  },
  towards: {
    en: 'to {direction}',
    fr: 'vers {direction}',
    de: 'nach {direction}',
    es: 'hacia {direction}',
  },
  tripDay: {
    en: 'Trains of {day}',
    fr: 'Trains du {day}',
    de: 'Züge am {day}',
    es: 'Trenes del {day}',
  },
  disruptedCount: { en: 'Disrupted', fr: 'Perturbés', de: 'Gestört', es: 'Con incidencias' },
  updatedAt: {
    en: 'Updated at {time}',
    fr: 'Mis à jour à {time}',
    de: 'Aktualisiert um {time}',
    es: 'Actualizado a las {time}',
  },
  boardOf: {
    en: 'Departures · {station}',
    fr: 'Départs · {station}',
    de: 'Abfahrten · {station}',
    es: 'Salidas · {station}',
  },
  noDeparture: {
    en: 'No departure in the next hours.',
    fr: 'Aucun départ dans les prochaines heures.',
    de: 'Keine Abfahrt in den nächsten Stunden.',
    es: 'Ninguna salida en las próximas horas.',
  },
  noTrainWidget: {
    en: 'No train in the followed period of this trip.',
    fr: 'Aucun train sur la période suivie de ce trajet.',
    de: 'Kein Zug im verfolgten Zeitraum dieser Strecke.',
    es: 'Ningún tren en el periodo seguido de este trayecto.',
  },
  waitingData: {
    en: 'Reading the trains… come back in a minute.',
    fr: 'Lecture des trains en cours… revenez dans une minute.',
    de: 'Die Züge werden gelesen… schau in einer Minute wieder vorbei.',
    es: 'Leyendo los trenes… vuelve dentro de un minuto.',
  },
  noTrip: {
    en: 'No trip is configured: add one in the integration settings.',
    fr: 'Aucun trajet n’est configuré : ajoutez-en un dans les réglages de l’intégration.',
    de: 'Keine Strecke konfiguriert: Füge eine in den Einstellungen der Integration hinzu.',
    es: 'No hay ningún trayecto configurado: añade uno en los ajustes de la integración.',
  },
  noApiKey: {
    en: 'Enter your SNCF API key in the integration settings.',
    fr: 'Renseignez votre clé d’API SNCF dans les réglages de l’intégration.',
    de: 'Trage deinen SNCF-API-Schlüssel in den Einstellungen der Integration ein.',
    es: 'Introduce tu clave de API de SNCF en los ajustes de la integración.',
  },
  noStation: {
    en: 'Choose a station: type one in the widget settings, or configure a trip.',
    fr: 'Choisissez une gare : saisissez-la dans les réglages du widget, ou configurez un trajet.',
    de: 'Wähle einen Bahnhof: Gib ihn in den Widget-Einstellungen ein oder konfiguriere eine Strecke.',
    es: 'Elige una estación: escríbela en los ajustes del widget o configura un trayecto.',
  },
  unknownStation: {
    en: 'Station "{name}" not found: use the "Find a station" button of the integration.',
    fr: 'Gare « {name} » introuvable : utilisez le bouton « Chercher une gare » de l’intégration.',
    de: 'Bahnhof „{name}“ nicht gefunden: Nutze die Schaltfläche „Bahnhof suchen“ der Integration.',
    es: 'Estación «{name}» no encontrada: usa el botón «Buscar una estación» de la integración.',
  },
  unavailable: {
    en: 'The SNCF API is unavailable for now.',
    fr: 'L’API SNCF est indisponible pour le moment.',
    de: 'Die SNCF-API ist im Moment nicht verfügbar.',
    es: 'La API de SNCF no está disponible por ahora.',
  },

  // connection status
  statusOk: {
    en: 'Connected · {trips} trip(s) · {used} requests in 24 h',
    fr: 'Connecté · {trips} trajet(s) · {used} requêtes en 24 h',
    de: 'Verbunden · {trips} Strecke(n) · {used} Anfragen in 24 h',
    es: 'Conectado · {trips} trayecto(s) · {used} peticiones en 24 h',
  },
  statusNoTrip: {
    en: 'API key accepted. No trip configured yet.',
    fr: 'Clé d’API acceptée. Aucun trajet configuré pour l’instant.',
    de: 'API-Schlüssel akzeptiert. Noch keine Strecke konfiguriert.',
    es: 'Clave de API aceptada. Todavía no hay ningún trayecto configurado.',
  },
  statusInvalidKey: {
    en: 'The SNCF API key is refused: check it.',
    fr: 'La clé d’API SNCF est refusée : vérifiez-la.',
    de: 'Der SNCF-API-Schlüssel wird abgelehnt: Prüfe ihn.',
    es: 'La clave de API de SNCF es rechazada: compruébala.',
  },
  statusQuota: {
    en: 'Daily quota of the SNCF API reached: paused until {time}.',
    fr: 'Quota quotidien de l’API SNCF atteint : en pause jusqu’à {time}.',
    de: 'Tageskontingent der SNCF-API erreicht: pausiert bis {time}.',
    es: 'Cuota diaria de la API de SNCF alcanzada: en pausa hasta las {time}.',
  },
  statusBudget: {
    en: 'Close to the daily quota ({used} requests in 24 h): trips paused for a while.',
    fr: 'Proche du quota quotidien ({used} requêtes en 24 h) : trajets en pause un moment.',
    de: 'Nahe am Tageskontingent ({used} Anfragen in 24 h): Strecken eine Weile pausiert.',
    es: 'Cerca de la cuota diaria ({used} peticiones en 24 h): trayectos en pausa un rato.',
  },
  statusUnreachable: {
    en: 'The SNCF API cannot be reached; retrying.',
    fr: 'L’API SNCF est injoignable ; nouvel essai en cours.',
    de: 'Die SNCF-API ist nicht erreichbar; neuer Versuch läuft.',
    es: 'No se puede acceder a la API de SNCF; reintentando.',
  },
  statusBadStation: {
    en: 'Station not found: {names}. Use the "Find a station" button.',
    fr: 'Gare introuvable : {names}. Utilisez le bouton « Chercher une gare ».',
    de: 'Bahnhof nicht gefunden: {names}. Nutze die Schaltfläche „Bahnhof suchen“.',
    es: 'Estación no encontrada: {names}. Usa el botón «Buscar una estación».',
  },

  // Configuration screen
  tripOk: {
    en: '{trip}: OK, {count} train(s), next {next}',
    fr: '{trip} : OK, {count} train(s), prochain {next}',
    de: '{trip}: OK, {count} Zug/Züge, nächster {next}',
    es: '{trip}: OK, {count} tren(es), próximo {next}',
  },
  tripError: {
    en: '{trip}: {error}',
    fr: '{trip} : {error}',
    de: '{trip}: {error}',
    es: '{trip}: {error}',
  },
  stationNotFound: {
    en: '"{name}": station not found',
    fr: '« {name} » : gare introuvable',
    de: '„{name}“: Bahnhof nicht gefunden',
    es: '«{name}»: estación no encontrada',
  },
  requestsCount: {
    en: '{used} requests in 24 h',
    fr: '{used} requêtes en 24 h',
    de: '{used} Anfragen in 24 h',
    es: '{used} peticiones en 24 h',
  },
  searchTooShort: {
    en: 'Type at least 2 characters of the station name.',
    fr: 'Saisissez au moins 2 caractères du nom de la gare.',
    de: 'Gib mindestens 2 Zeichen des Bahnhofsnamens ein.',
    es: 'Escribe al menos 2 caracteres del nombre de la estación.',
  },
  searchNone: {
    en: 'No station matches "{query}".',
    fr: 'Aucune gare ne correspond à « {query} ».',
    de: 'Kein Bahnhof passt zu „{query}“.',
    es: 'Ninguna estación coincide con «{query}».',
  },
  searchFound: {
    en: '{list}. Copy the identifier of the right station into a trip field.',
    fr: '{list}. Copiez l’identifiant de la bonne gare dans un champ de trajet.',
    de: '{list}. Kopiere die Kennung des richtigen Bahnhofs in ein Streckenfeld.',
    es: '{list}. Copia el identificador de la estación correcta en un campo de trayecto.',
  },
  // transport badge
  transportQuota: {
    en: 'Daily quota of the SNCF API reached: the trains are read again later.',
    fr: 'Quota quotidien de l’API SNCF atteint : les trains seront relus plus tard.',
    de: 'Tageskontingent der SNCF-API erreicht: Die Züge werden später erneut gelesen.',
    es: 'Cuota diaria de la API de SNCF alcanzada: los trenes se volverán a leer más tarde.',
  },
  transportBudget: {
    en: 'Close to the daily quota: this trip is read less often for a while.',
    fr: 'Proche du quota quotidien : ce trajet est lu moins souvent pendant un moment.',
    de: 'Nahe am Tageskontingent: Diese Strecke wird eine Weile seltener gelesen.',
    es: 'Cerca de la cuota diaria: este trayecto se lee con menos frecuencia durante un rato.',
  },
};

/**
 * @description Whether a language has its own texts.
 * @param {unknown} language - A language code.
 * @returns {boolean} True for en, fr, de and es.
 * @example
 * isLanguage('de'); // -> true
 */
function isLanguage(language) {
  return LANGUAGES.includes(language);
}

/**
 * @description The locale of the dates written in a language.
 * @param {string} language - The language.
 * @returns {string} The locale, British English by default.
 * @example
 * localeOf('de'); // -> 'de-DE'
 */
function localeOf(language) {
  return LOCALES[language] ?? LOCALES.en;
}

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
 * @returns {{ en: string, fr: string, de: string, es: string }} The message.
 * @example
 * all('statusQuota', { time: '14:00' });
 */
function all(key, values = {}) {
  const of = (language) => (typeof values === 'function' ? values(language) : values);
  return Object.fromEntries(
    LANGUAGES.map((language) => [language, t(key, language, of(language))]),
  );
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

export { LANGUAGES, TEXTS, isLanguage, localeOf, t, all, trainLabel, stateText, nextLine };
