import { VehicleSheet } from './vehicle-sheet.mjs';

const MOD = 'mmutons-cyberpunk-red-vas';
const SOCKET = `module.${MOD}`;

let _wired = false;
const _recentRequests = new Set();
const _handledRequests = new Set();

function _active() {
  try {
    return game.modules.get('Rideable')?.active
      && game.settings.get(MOD, 'rideableIntegration');
  } catch (e) {
    return false;
  }
}

function _seatMode() {
  try {
    return game.settings.get(MOD, 'seatSelection');
  } catch (e) {
    return 'gm';
  }
}

function _isVASVehicle(actor) {
  if (!actor) return false;
  if (actor.getFlag?.('core', 'sheetClass') === `${MOD}.VehicleSheet`) return true;
  return Array.isArray(actor.getFlag?.(MOD, 'positions'));
}

function _tokenDoc(obj) {
  if (!obj) return null;
  if (obj.documentName) return obj;
  if (obj.document?.documentName) return obj.document;
  return null;
}

function _seatableRiderUuid(riderDoc) {
  if (!riderDoc?.actorLink) return null;
  const uuid = riderDoc.actor?.uuid;
  if (typeof uuid !== 'string' || !uuid.startsWith('Actor.')) return null;
  return uuid;
}

async function _ensureUncapped(tokenDoc) {
  try {
    if (!tokenDoc?.setFlag) return;
    const flags = game.modules.get('Rideable')?.api?.RideableFlags;
    if (flags?.MaxRiders) {
      let eff;
      try { eff = flags.MaxRiders(tokenDoc); } catch (e) { eff = undefined; }
      if (eff === Infinity) return;
    }
    if (tokenDoc.getFlag('Rideable', 'MaxRiderFlag') === -1) return;
    await tokenDoc.setFlag('Rideable', 'MaxRiderFlag', -1);
  } catch (error) {
    console.error('VAS | _ensureUncapped error:', error);
  }
}

async function _seat(vehicleActor, riderUuid, positionId) {
  const positions = foundry.utils.deepClone(
    vehicleActor.getFlag(MOD, 'positions') || []
  );

  positions.forEach(p => { p.occupants = (p.occupants || []).filter(u => u !== riderUuid); });

  const target = positions.find(p => p.id === positionId);
  if (!target) return;

  target.occupants = target.occupants || [];
  const max = target.maxOccupants || 1;
  if (target.occupants.length >= max) {
    ui.notifications.warn(`${target.name}: no space left.`);
    return;
  }

  target.occupants.push(riderUuid);
  await vehicleActor.setFlag(MOD, 'positions', positions);
}

function _renderSeatDialog(title, seats, onPick) {
  const rows = seats.map(s => {
    const room = (s.max || 1) > 1 ? ` <span style="opacity:.6">(${s.used || 0}/${s.max})</span>` : '';
    return `<a class="vas-template-pick" data-position-id="${s.id}">${s.name}${room}</a>`;
  }).join('');

  const dialog = new Dialog({
    title,
    content: `<div class="vas-template-picker">${rows}</div>`,
    buttons: { cancel: { label: 'None' } },
    default: 'cancel',
    render: (html) => {
      html.find('.vas-template-pick').click((ev) => {
        const positionId = ev.currentTarget.dataset.positionId;
        dialog.close();
        onPick(positionId);
      });
    }
  }, { classes: ['dialog', 'vas-dialog'] });

  dialog.render(true);
}

function _seatsPayload(freePositions) {
  return freePositions.map(p => ({
    id: p.id,
    name: p.name,
    used: (p.occupants || []).length,
    max: p.maxOccupants || 1
  }));
}

function _dispatchSeatPicker(vehicleActor, riderActor, riderUuid, free) {
  if (_seatMode() === 'players') {
    const owners = game.users.filter(u => u.active && !u.isGM && riderActor.testUserPermission(u, 'OWNER'));
    if (owners.length > 0) {
      game.socket.emit(SOCKET, {
        type: 'requestSeatPick',
        requestId: foundry.utils.randomID(),
        targetUserIds: owners.map(u => u.id),
        vehicleUuid: vehicleActor.uuid,
        vehicleName: vehicleActor.name,
        riderUuid,
        riderName: riderActor.name,
        seats: _seatsPayload(free)
      });
      return;
    }
  }

  _renderSeatDialog(
    `Seat ${riderActor.name} in ${vehicleActor.name}`,
    _seatsPayload(free),
    (positionId) => { if (positionId) _seat(vehicleActor, riderUuid, positionId); }
  );
}

async function _onRideableMount(pRider, pRidden) {
  try {
    if (!game.user.isGM || !_active()) return;

    const riddenDoc = _tokenDoc(pRidden);
    if (riddenDoc?.documentName !== 'Token') return;
    const vehicleActor = riddenDoc.actor;
    if (!_isVASVehicle(vehicleActor)) return;

    const riderDoc = _tokenDoc(pRider);
    const riderUuid = _seatableRiderUuid(riderDoc);
    if (!riderUuid) return;

    await _ensureUncapped(riddenDoc);

    const positions = vehicleActor.getFlag(MOD, 'positions') || [];
    if (positions.length === 0) return;
    if (positions.some(p => (p.occupants || []).includes(riderUuid))) return;

    const free = positions.filter(p => (p.occupants || []).length < (p.maxOccupants || 1));
    if (free.length === 0) {
      ui.notifications.warn(`${vehicleActor.name}: no free seats for ${riderDoc.actor?.name ?? 'rider'}.`);
      return;
    }

    _dispatchSeatPicker(vehicleActor, riderDoc.actor, riderUuid, free);
  } catch (error) {
    console.error('VAS | Rideable Mount handler error:', error);
  }
}

async function _onRideableUnMount(pRider, pRidden) {
  try {
    if (!game.user.isGM || !_active()) return;

    const riddenDoc = _tokenDoc(pRidden);
    if (riddenDoc?.documentName !== 'Token') return;
    const vehicleActor = riddenDoc.actor;
    if (!_isVASVehicle(vehicleActor)) return;

    const riderUuid = _tokenDoc(pRider)?.actor?.uuid;
    if (!riderUuid) return;

    if (VehicleSheet._rideableSyncGuard.has(`${vehicleActor.id}:${riderUuid}`)) return;

    const positions = foundry.utils.deepClone(vehicleActor.getFlag(MOD, 'positions') || []);
    let changed = false;
    positions.forEach(p => {
      const before = (p.occupants || []).length;
      p.occupants = (p.occupants || []).filter(u => u !== riderUuid);
      if (p.occupants.length !== before) changed = true;
    });

    if (changed) await vehicleActor.setFlag(MOD, 'positions', positions);
  } catch (error) {
    console.error('VAS | Rideable UnMount handler error:', error);
  }
}

function _onRenderVASSheet(sheet) {
  try {
    if (!game.user.isGM || !_active()) return;
    if (sheet?.constructor?.name !== 'VehicleSheet') return;
    const actor = sheet.actor;
    if (!actor) return;

    if (sheet.token) _ensureUncapped(sheet.token);
    if (actor.prototypeToken) _ensureUncapped(actor.prototypeToken);
    for (const t of (canvas?.scene?.tokens?.filter(t => t.actorId === actor.id) || [])) {
      _ensureUncapped(t);
    }
  } catch (error) {
    console.error('VAS | Rideable render-uncap error:', error);
  }
}

function _onSeatRequest(payload) {
  if (!payload.targetUserIds?.includes(game.user.id)) return;

  const dedupeKey = `${payload.vehicleUuid}:${payload.riderUuid}`;
  if (_recentRequests.has(dedupeKey)) return;
  _recentRequests.add(dedupeKey);
  setTimeout(() => _recentRequests.delete(dedupeKey), 5000);

  _renderSeatDialog(
    `Seat ${payload.riderName} in ${payload.vehicleName}`,
    payload.seats || [],
    (positionId) => {
      if (!positionId) return;
      game.socket.emit(SOCKET, {
        type: 'seatPicked',
        requestId: payload.requestId,
        vehicleUuid: payload.vehicleUuid,
        riderUuid: payload.riderUuid,
        positionId,
        userId: game.user.id
      });
    }
  );
}

async function _onSeatPicked(payload) {
  if (game.users.activeGM?.id !== game.user.id) return;
  if (!payload.positionId) return;
  if (_handledRequests.has(payload.requestId)) return;
  _handledRequests.add(payload.requestId);
  setTimeout(() => _handledRequests.delete(payload.requestId), 10000);

  try {
    const vehicleActor = await fromUuid(payload.vehicleUuid);
    if (!vehicleActor || !_isVASVehicle(vehicleActor)) return;

    const sender = game.users.get(payload.userId);
    const riderActor = await fromUuid(payload.riderUuid);
    if (!riderActor) return;
    if (sender && !riderActor.testUserPermission(sender, 'OWNER')) return;

    await _seat(vehicleActor, payload.riderUuid, payload.positionId);
  } catch (error) {
    console.error('VAS | seatPicked handler error:', error);
  }
}

function _onSocket(payload) {
  if (!payload || typeof payload !== 'object') return;
  if (payload.type === 'requestSeatPick') return _onSeatRequest(payload);
  if (payload.type === 'seatPicked') return _onSeatPicked(payload);
}

export function initRideableCompat() {
  if (_wired) return;
  _wired = true;

  Hooks.on('Rideable.Mount', _onRideableMount);
  Hooks.on('Rideable.UnMount', _onRideableUnMount);
  Hooks.on('renderActorSheet', _onRenderVASSheet);
  game.socket.on(SOCKET, _onSocket);
}
