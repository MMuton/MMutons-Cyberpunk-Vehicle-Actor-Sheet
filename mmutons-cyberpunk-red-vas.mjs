import { VehicleSheet } from './scripts/vehicle-sheet.mjs';

Hooks.once('init', () => {
  Handlebars.registerHelper('cprFireMode', (actor, mode, weaponId) => {
    return actor.getFlag('cyberpunk-red-core', `firetype-${weaponId}`) === mode;
  });
});

Hooks.once('setup', () => {
  Actors.registerSheet('mmutons-cyberpunk-red-vas', VehicleSheet, {
    types: ['character'],
    makeDefault: false,
    label: 'Vehicle Sheet (VAS)'
  });
});

Hooks.once('ready', () => {
  Hooks.on('updateActor', async (actor, changes) => {
    if (!game.user.isGM) return;
    if (!foundry.utils.hasProperty(changes, 'flags.mmutons-cyberpunk-red-vas.positions')) return;
    await VehicleSheet.reconcilePermissions(actor);
  });
});