import { VehicleSheet } from './scripts/vehicle-sheet.mjs';

Hooks.once('init', () => {
  Handlebars.registerHelper('cprFireMode', (actor, mode, weaponId) => {
    return actor.getFlag('cyberpunk-red-core', `firetype-${weaponId}`) === mode;
  });

  game.settings.register('mmutons-cyberpunk-red-vas', 'preserveGMPermissions', {
    name: 'Preserve GM-set Permissions',
    hint: 'When enabled, VAS will never downgrade permissions the GM has manually set above what VAS would calculate. Disable to let VAS fully manage all vehicle permissions.',
    scope: 'world',
    config: true,
    type: Boolean,
    default: true
  });
});

Hooks.once('setup', () => {
  Actors.registerSheet('mmutons-cyberpunk-red-vas', VehicleSheet, {
    types: ['character', 'mook'],
    makeDefault: false,
    label: 'Vehicle Sheet (VAS)'
  });
});

Hooks.once('ready', () => {
  Hooks.on('updateActor', async (actor, changes) => {
    if (!game.user.isGM) return;
    if (!foundry.utils.hasProperty(changes, 'flags.mmutons-cyberpunk-red-vas.positions')) return;
    await VehicleSheet.reconcilePermissions(actor);
    await VehicleSheet.reconcileEffects(actor);
  });

  Hooks.on('deleteActor', async (actor) => {
    if (!game.user.isGM) return;
    if (!actor.getFlag('mmutons-cyberpunk-red-vas', 'positions')) return;
    const affectedActors = game.actors.filter(a =>
      a.effects.some(e => e.getFlag('mmutons-cyberpunk-red-vas', 'managedBy') === actor.id)
    );
    for (const a of affectedActors) {
      const orphaned = a.effects
        .filter(e => e.getFlag('mmutons-cyberpunk-red-vas', 'managedBy') === actor.id)
        .map(e => e.id);
      if (orphaned.length > 0) {
        try {
          await a.deleteEmbeddedDocuments('ActiveEffect', orphaned, { render: false });
        } catch (error) {
          console.error('VAS | deleteActor cleanup error:', error);
        }
      }
    }
  });

  Hooks.on('renderActorSheet', (sheet, html) => {
    if (!game.user.isGM) return;
    if (!['CPRCharacterActorSheet', 'CPRMookActorSheet'].includes(sheet.constructor.name)) return;
    const actor = sheet.actor;
    html.find('li.item.effect.flexrow[data-effect-id]').each((i, el) => {
      const aeId = el.dataset.effectId.split('.').pop();
      const effect = actor.effects.get(aeId);
      if (!effect) return;
      const vasFlags = effect.flags?.['mmutons-cyberpunk-red-vas'];
      if (!vasFlags?.managedBy) return;
      const btn = document.createElement('a');
      btn.innerHTML = '<i class="fas fa-sign-out-alt"></i>';
      btn.title = 'Remove from Vehicle and Delete the AE';
      btn.style.cssText = 'margin-left: 4px; color: var(--cpr-color-red, #b90202); cursor: pointer; padding: 0 4px;';
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const vehicleActor = game.actors.get(vasFlags.managedBy);
        if (!vehicleActor) return;
        const vasAes = actor.effects
          .filter(ef => ef.getFlag('mmutons-cyberpunk-red-vas', 'managedBy') === vasFlags.managedBy)
          .map(ef => ef.id);
        if (vasAes.length > 0) {
          await actor.deleteEmbeddedDocuments('ActiveEffect', vasAes);
        }
        const positions = foundry.utils.deepClone(
          vehicleActor.getFlag('mmutons-cyberpunk-red-vas', 'positions') || []
        );
        const position = positions.find(p => p.id === vasFlags.positionId);
        if (!position) return;
        position.occupants = (position.occupants || []).filter(u => u !== actor.uuid);
        await vehicleActor.setFlag('mmutons-cyberpunk-red-vas', 'positions', positions);
      });
      const actions = el.querySelector('.effect-actions');
      if (actions) actions.appendChild(btn);
      else el.appendChild(btn);
    });
  });

  if (game.user.isGM) {
    (async () => {
      const affectedActors = game.actors.filter(a =>
        a.effects.some(e => e.getFlag('mmutons-cyberpunk-red-vas', 'managedBy'))
      );
      if (affectedActors.length === 0) return;
      const vehicleIds = new Set(
        affectedActors.flatMap(a =>
          a.effects.map(e => e.getFlag('mmutons-cyberpunk-red-vas', 'managedBy')).filter(Boolean)
        )
      );
      for (const vehicleId of vehicleIds) {
        const vehicleActor = game.actors.get(vehicleId);
        if (vehicleActor) {
          await VehicleSheet.reconcileEffects(vehicleActor);
        } else {
          for (const a of affectedActors) {
            const orphaned = a.effects
              .filter(e => e.getFlag('mmutons-cyberpunk-red-vas', 'managedBy') === vehicleId)
              .map(e => e.id);
            if (orphaned.length > 0) await a.deleteEmbeddedDocuments('ActiveEffect', orphaned, { render: false });
          }
        }
      }
    })();
  }
});
