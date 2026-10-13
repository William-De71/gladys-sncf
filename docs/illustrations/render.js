// Renders integration widget contents the way the Gladys front does
// (front/src/components/boxs/external-widget, ExternalWidgetBox +
// WidgetComponents), in plain DOM, with the same slots, order and class
// names. Only the components these widgets use: text, value, card-list,
// status. Query: ?lang=fr&cards=trip,board&theme=dark
/* global DATA */
const params = new URLSearchParams(location.search);
const LANG = params.get('lang') || 'en';
const CARDS = (params.get('cards') || 'trip').split(',');

const text = (value) =>
  value && typeof value === 'object' ? (value[LANG] ?? value.en ?? '') : (value ?? '');
const formatNumber = (value) =>
  typeof value === 'number'
    ? new Intl.NumberFormat(LANG, { maximumFractionDigits: 2 }).format(value)
    : text(value);
const COLOR = {
  neutral: 'colorNeutral',
  primary: 'colorPrimary',
  success: 'colorSuccess',
  warning: 'colorWarning',
  danger: 'colorDanger',
  info: 'colorInfo',
};
const BADGE_COLOR = {
  primary: 'badgeColorPrimary',
  success: 'badgeColorSuccess',
  warning: 'badgeColorWarning',
  danger: 'badgeColorDanger',
  info: 'badgeColorInfo',
};
const el = (tag, cls, children = []) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
};
const icon = (name, cls = '') => el('i', `fe fe-${name} ${cls}`);

// widgetContentUtils.splitIntoSlots
function splitIntoSlots(components) {
  const slots = { header: [], tiles: [], focal: null, body: null, status: null, buttons: [] };
  for (const c of components) {
    if (c.type === 'text') c.variant === 'body' ? (slots.body = c) : slots.header.push(c);
    else if (c.type === 'value' || c.type === 'gauge') slots.tiles.push(c);
    else if (['chart', 'card-list', 'image'].includes(c.type)) slots.focal = c;
    else if (c.type === 'status') slots.status = c;
    else if (c.type === 'button') slots.buttons.push(c);
  }
  return slots;
}

const header = (components) =>
  el(
    'div',
    'header',
    components.map((c) => el('div', c.variant === 'heading' ? 'heading' : 'caption', text(c.text))),
  );

const tiles = (components) =>
  el(
    'div',
    'tilesBox',
    el(
      'div',
      `tiles tilesCount${Math.min(components.length, 6)}`,
      components.map((c) =>
        el('div', 'tile', [
          c.icon ? icon(c.icon, `tileIcon ${COLOR[c.color] || ''}`) : null,
          el('span', `tileValue ${COLOR[c.color] || ''}`, [
            formatNumber(c.value),
            c.unit ? el('span', 'tileUnit', text(c.unit)) : null,
          ]),
          c.label ? el('span', 'tileLabel', text(c.label)) : null,
        ]),
      ),
    ),
  );

// WidgetCardList: an item with a description or links is clickable.
const cardList = (component) =>
  el(
    'div',
    null,
    el(
      'div',
      'cardList',
      component.items.map((item) => {
        const clickable = Boolean(item.description) || (item.links && item.links.length > 0);
        const node = el('button', `cardListItem ${clickable ? 'clickable' : ''}`, [
          el('div', 'cardListText', [
            el('span', 'cardTitle', text(item.title)),
            item.subtitle ? el('span', 'cardMeta', text(item.subtitle)) : null,
            item.badge
              ? el('span', `wbadge ${BADGE_COLOR[item.badge.color] || ''}`, text(item.badge.text))
              : null,
          ]),
        ]);
        node.type = 'button';
        node.disabled = !clickable;
        return node;
      }),
    ),
  );

const statusList = (component) =>
  el(
    'ul',
    'statusList',
    component.items.map((item) =>
      el('li', 'statusRow', [
        item.icon
          ? icon(item.icon, `statusIcon ${COLOR[item.color || 'neutral']}`)
          : el('span', `statusDot ${COLOR[item.color || 'neutral']}`),
        el('span', 'statusLabel', text(item.label)),
        el('span', 'statusValue', formatNumber(item.value)),
      ]),
    ),
  );

function card(name) {
  const content = DATA.contents[LANG][name];
  const { icon: cardIcon, label } = DATA.cards[name];
  const slots = splitIntoSlots(content.components);
  return el('div', 'card', [
    el(
      'div',
      'card-header',
      el('h3', 'card-title', [icon(cardIcon || 'grid'), el('span', 'm-1', text(label))]),
    ),
    el(
      'div',
      'card-body',
      el('div', 'slots', [
        slots.header.length ? header(slots.header) : null,
        slots.tiles.length ? tiles(slots.tiles) : null,
        slots.focal && slots.focal.type === 'card-list' ? cardList(slots.focal) : null,
        slots.body ? el('p', 'body', text(slots.body.text)) : null,
        slots.status ? statusList(slots.status) : null,
      ]),
    ),
  ]);
}

const row = document.getElementById('row');
for (const name of CARDS) {
  row.append(el('div', 'col', card(name)));
}
document.body.dataset.ready = '1';
