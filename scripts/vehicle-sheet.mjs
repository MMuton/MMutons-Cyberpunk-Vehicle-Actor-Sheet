import SystemUtils from '/systems/cyberpunk-red-core/modules/utils/cpr-systemUtils.js';

const OWNERSHIP = { NONE: 0, LIMITED: 1, OBSERVER: 2, OWNER: 3 };

export class VehicleSheet extends ActorSheet {

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["cyberpunk-red", "sheet", "actor", "vas-vehicle"],
      template: "modules/mmutons-cyberpunk-red-vas/templates/vehicle-sheet.hbs",
      width: 820,
      height: 750,
      tabs: [{navSelector: ".tabs", contentSelector: ".sheet-body", initial: "main"}],
      dragDrop: [{dragSelector: ".item-list .item", dropSelector: null}]
    });
  }

  async _render(force = false, options = {}) {
    await super._render(force, options);
    if (game.user.isGM) {
      const syncedVersion = this.actor.getFlag('mmutons-cyberpunk-red-vas', 'permissionsSynced');
      if (!syncedVersion) {
        await this.actor.setFlag('mmutons-cyberpunk-red-vas', 'permissionsSynced', true);
        const positions = this.actor.getFlag('mmutons-cyberpunk-red-vas', 'positions') || [];
        await this._syncOccupantAccess(positions);
      }
    }
  }

  async getData(options) {
    const context = await super.getData(options);
    
    if (!this.actor.getFlag('mmutons-cyberpunk-red-vas', 'positions')) {
      await this.actor.setFlag('mmutons-cyberpunk-red-vas', 'positions', []);
    }
    
    context.positions = await this._preparePositions();
    context.weapons = this.actor.items.filter(i => i.type === 'weapon');
    context.armor = this.actor.items.filter(i => i.type === 'armor');

    const excludedTypes = ['weapon', 'armor', 'skill', 'role', 'criticalInjury'];
    const cargoItems = this.actor.items.filter(i => {
      if (excludedTypes.includes(i.type)) return false;
      if (i.type === 'itemUpgrade' && i.getFlag('mmutons-cyberpunk-red-vas', 'mounted')) return false;
      if (i.type === 'cyberware' && i.getFlag('mmutons-cyberpunk-red-vas', 'installed')) return false;
      if (i.name && i.name.includes('Option Slots')) return false;
      return true;
    });
    
    context.cargoByCategory = this._sortCargoByCategory(cargoItems);
    
    context.mountedUpgrades = this._prepareMountedUpgrades();
    
    context.criticalInjuries = this.actor.items.filter(i => i.type === 'criticalInjury');
    
    context.isOwner = this.actor.isOwner;
    context.editable = this.isEditable;
    
    return context;
  }

  _sortCargoByCategory(cargoItems) {
    if (!cargoItems || cargoItems.length === 0) return null;
    
    const grouped = {};
    cargoItems.forEach(item => {
      const type = item.type;
      if (!grouped[type]) grouped[type] = [];
      grouped[type].push(item);
    });
    
    return Object.keys(grouped).sort().map(category => ({
      categoryName: category.charAt(0).toUpperCase() + category.slice(1),
      items: grouped[category].sort((a, b) => a.name.localeCompare(b.name))
    }));
  }

  _prepareMountedUpgrades() {
    const upgrades = this.actor.items.filter(i => 
      i.type === 'itemUpgrade' && i.getFlag('mmutons-cyberpunk-red-vas', 'mounted')
    );
    const cyberware = this.actor.items.filter(i => 
      i.type === 'cyberware' && i.getFlag('mmutons-cyberpunk-red-vas', 'installed')
    );
    
    return [...upgrades, ...cyberware].map(item => ({
      id: item.id,
      name: item.name,
      img: item.img,
      type: item.type,
      description: item.system.description?.value || item.system.description || ''
    }));
  }
  
  async _preparePositions() {
    const positions = this.actor.getFlag('mmutons-cyberpunk-red-vas', 'positions') || [];
    const prepared = [];
    
    for (const pos of positions) {
      const occupantPromises = (pos.occupants || []).map(async (uuid) => {
        try {
          const actor = await fromUuid(uuid);
          if (actor && actor.testUserPermission(game.user, "OBSERVER")) {
            return {
              uuid: uuid,
              id: actor.id,
              name: actor.name,
              img: actor.img,
              type: actor.type,
              hp: actor.system.derivedStats?.hp?.value || 0,
              hpMax: actor.system.derivedStats?.hp?.max || 0
            };
          }
        } catch(e) { }
        return null;
      });
      
      const occupants = (await Promise.all(occupantPromises)).filter(o => o !== null);
      const assignedWeapons = this.actor.items.filter(item =>
        item.type === 'weapon' && item.getFlag('mmutons-cyberpunk-red-vas', 'mountedPosition') === pos.id
      );
      const maxOccupants = pos.maxOccupants || 1;
      
      prepared.push({
        ...pos,
        occupants: occupants,
        hasOccupants: occupants.length > 0,
        isFull: occupants.length >= maxOccupants,
        isCrammed: occupants.length > maxOccupants,
        weapons: assignedWeapons,
        hasWeapons: assignedWeapons.length > 0,
        skillsList: (pos.skills || '').split(',').map(s => s.trim()).filter(s => s),
        bulletproofGlass: pos.bulletproofGlass || false,
        glassHp: pos.glassHp || 0,
        glassHpMax: pos.glassHpMax || 0
      });
    }
    
    return prepared.sort((a, b) => (a.order || 0) - (b.order || 0));
  }

  activateListeners(html) {
    super.activateListeners(html);
    
    html.find('.item-edit').click(this._onItemEdit.bind(this));
    html.find('.occupant-view').click(this._onOccupantView.bind(this));
    html.find('.select-token').click(this._onSelectToken.bind(this));
    html.find('.weapon-sheet-btn').click(this._onWeaponSheet.bind(this));
    html.find('.weapon-action-icon[data-action="changeAmmo"]').click(this._onChangeAmmo.bind(this));
    html.find('.weapon-action-icon[data-action="reload"]').click(this._onReload.bind(this));
    html.find('.position-weapons-compact .rollable').click(this._onWeaponRoll.bind(this));
    html.find('.position-skills .skill-tag.rollable').click(this._onSkillRoll.bind(this));
	html.find('.glass-hp').click(this._onGlassHpClick.bind(this));
	html.find('.upgrade-mount').click(this._onUpgradeMount.bind(this));
    html.find('.upgrade-unmount').click(this._onUpgradeUnmount.bind(this));
    html.find('.upgrade-view').click(this._onItemEdit.bind(this));
    html.find('.cyberware-install').click(this._onCyberwareInstall.bind(this));
    html.find('.cyberware-uninstall').click(this._onCyberwareUninstall.bind(this));
    
    html.find('.occupant-item.draggable').each((i, el) => {
      el.addEventListener('dragstart', this._onOccupantDragStart.bind(this));
    });
    html.find('.drop-zone').each((i, el) => {
      el.addEventListener('dragover', this._onOccupantDragOver.bind(this));
      el.addEventListener('drop', this._onOccupantDrop.bind(this));
    });
    
    const nameInput = html.find('.charname input')[0];
    if (nameInput) {
      const resizeName = (el) => el.setAttribute('size', Math.max(6, (el.value || el.placeholder || '').length));
      resizeName(nameInput);
      nameInput.addEventListener('input', () => resizeName(nameInput));
    }

    if (!this.isEditable) return;

    html.find('button.item-create').click(this._onItemCreate.bind(this));
    html.find('.item-delete').click(this._onItemDelete.bind(this));
    html.find('button.position-add').click(this._onPositionAdd.bind(this));
    html.find('.position-edit').click(this._onPositionEdit.bind(this));
    html.find('.position-delete').click(this._onPositionDelete.bind(this));
    html.find('.occupant-remove').click(this._onOccupantRemove.bind(this));
    html.find('.weapon-mount').click(this._onWeaponMount.bind(this));
    html.find('.weapon-unmount').click(this._onWeaponUnmount.bind(this));
    html.find('.armor-equip').click(this._onArmorEquip.bind(this));
    html.find('.fire-checkbox').click(this._onFireCheckboxToggle.bind(this));
    html.find('.item-split').click(this._onItemSplit.bind(this));
    
    html.find('.item.draggable').each((i, el) => {
      el.addEventListener('dragstart', this._onItemDragStart.bind(this));
      el.addEventListener('dragend', this._onItemDragEnd.bind(this));
    });
  }

  _onItemEdit(event) {
    event.preventDefault();
    const itemId = event.currentTarget.closest('[data-item-id]')?.dataset.itemId;
    this.actor.items.get(itemId)?.sheet.render(true);
  }

  _onWeaponSheet(event) {
    event.preventDefault();
    this.actor.items.get(event.currentTarget.dataset.itemId)?.sheet.render(true);
  }

  _onOccupantView(event) {
    event.preventDefault();
    fromUuid(event.currentTarget.dataset.occupantUuid).then(actor => actor?.sheet.render(true));
  }

  async _onSelectToken(event) {
    event.preventDefault();
    const posId = event.currentTarget.dataset.positionId;
    const controlled = canvas.tokens.controlled;
    
    if (controlled.length === 0) {
      ui.notifications.warn('Please select a token first');
      return;
    }
    if (controlled.length > 1) {
      ui.notifications.warn('Please select only one token');
      return;
    }
    
    const actor = controlled[0].actor;
    if (!actor) return;
    
    const positions = foundry.utils.deepClone(
      this.actor.getFlag('mmutons-cyberpunk-red-vas', 'positions') || []
    );
    
    positions.forEach(p => {
      if (!p.occupants) p.occupants = [];
      p.occupants = p.occupants.filter(u => u !== actor.uuid);
    });
    
    const targetPos = positions.find(p => p.id === posId);
    if (targetPos) {
      if (!targetPos.occupants) targetPos.occupants = [];
      
      const maxOccupants = targetPos.maxOccupants || 1;
      if (targetPos.occupants.length > maxOccupants) return;
      
      targetPos.occupants.push(actor.uuid);
      await this.actor.setFlag('mmutons-cyberpunk-red-vas', 'positions', positions);
      await this._grantVehicleAccess(actor.uuid, posId);
    }
  }

  async _onItemCreate(event) {
    event.preventDefault();
    const type = event.currentTarget.dataset.type;
    return Item.create({ name: `New ${type.capitalize()}`, type: type, system: {} }, { parent: this.actor });
  }

  async _onItemDelete(event) {
    event.preventDefault();
    event.stopPropagation();
    
    const itemId = event.currentTarget.closest('[data-item-id]')?.dataset.itemId;
    if (!itemId) return;
    
    const item = this.actor.items.get(itemId);
    if (item) {
      const confirmed = await Dialog.confirm({
        title: 'Delete Item',
        content: `<p>Delete ${item.name}?</p>`
      });
      if (confirmed) await item.delete();
    }
  }

  async _onPositionAdd(event) {
    event.preventDefault();
    event.stopPropagation();
    
    const positions = foundry.utils.deepClone(
      this.actor.getFlag('mmutons-cyberpunk-red-vas', 'positions') || []
    );
    
    positions.push({
      id: foundry.utils.randomID(),
      name: 'New Position',
      order: positions.length + 1,
      occupants: [],
      skills: '',
      maxOccupants: 1,
      canControlWeapons: false,
      grantsTokenControl: false
    });
    
    await this.actor.setFlag('mmutons-cyberpunk-red-vas', 'positions', positions);
  }

  async _onPositionEdit(event) {
    event.preventDefault();
    const posId = event.currentTarget.dataset.positionId;
    const pos = this.actor.getFlag('mmutons-cyberpunk-red-vas', 'positions').find(p => p.id === posId);
    if (!pos) return;
    
    new Dialog({
      title: `Edit Position: ${pos.name}`,
      content: `
        <form>
          <div class="form-group">
            <label>Position Name</label>
            <input type="text" name="name" value="${pos.name}"/>
          </div>
          <div class="form-group">
            <label>Display Order</label>
            <input type="number" name="order" value="${pos.order || 1}" min="1"/>
          </div>
          <div class="form-group">
            <label>Max Occupants</label>
            <input type="number" name="maxOccupants" value="${pos.maxOccupants || 1}" min="1"/>
          </div>
          <div class="form-group">
            <label>
              <input type="checkbox" name="canControlWeapons" ${pos.canControlWeapons ? 'checked' : ''}/>
              Can Control Weapons
            </label>
          </div>
          <div class="form-group">
            <label>
              <input type="checkbox" name="bulletproofGlass" class="glass-checkbox" ${pos.bulletproofGlass ? 'checked' : ''}/>
              Bulletproof Glass
            </label>
          </div>
          <div class="form-group glass-hp-group" style="display: ${pos.bulletproofGlass ? 'block' : 'none'};">
            <label>Glass HP Max</label>
            <input type="number" name="glassHpMax" value="${pos.glassHpMax || 0}" min="0"/>
          </div>
          <div class="form-group">
            <label>Skills (comma-separated)</label>
            <input type="text" name="skills" value="${pos.skills || ''}" placeholder="Evasion"/>
          </div>
		  <div class="form-group">
            <label>
              <input type="checkbox" name="grantsTokenControl" ${pos.grantsTokenControl ? 'checked' : ''}/>
              Grants Vehicle Token Control
            </label>
          </div>
        </form>
      `,
      buttons: {
        save: {
          icon: '<i class="fas fa-save"></i>',
          label: 'Save',
          callback: async (html) => {
            const form = html[0].querySelector('form');
            const fd = new FormDataExtended(form).object;
            
            const positions = foundry.utils.deepClone(
              this.actor.getFlag('mmutons-cyberpunk-red-vas', 'positions')
            );
            const position = positions.find(p => p.id === posId);
            
            if (position) {
              position.name = fd.name;
              position.order = Number(fd.order);
              position.maxOccupants = Number(fd.maxOccupants);
              position.canControlWeapons = fd.canControlWeapons;
              position.skills = fd.skills;
              position.bulletproofGlass = fd.bulletproofGlass;
			  position.grantsTokenControl = fd.grantsTokenControl;
              
              if (fd.bulletproofGlass) {
                const newMax = Number(fd.glassHpMax);
                position.glassHpMax = newMax;
                if (!position.glassHp) {
                  position.glassHp = newMax;
                } else {
                  position.glassHp = Math.min(position.glassHp, newMax);
                }
              } else {
                position.glassHp = 0;
                position.glassHpMax = 0;
              }
              
              await this.actor.setFlag('mmutons-cyberpunk-red-vas', 'positions', positions);
            }
          }
        },
        cancel: {label: 'Cancel'}
      },
      default: 'save',
      render: (html) => {
        html.find('.glass-checkbox').change((e) => {
          const glassGroup = html.find('.glass-hp-group');
          if (e.target.checked) {
            glassGroup.show();
          } else {
            glassGroup.hide();
          }
        });
      }
    }).render(true);
  }

  async _onPositionDelete(event) {
    event.preventDefault();
    const posId = event.currentTarget.dataset.positionId;
    
    const confirmed = await Dialog.confirm({
      title: 'Delete Position',
      content: '<p>Delete this position?</p>'
    });
    
    if (!confirmed) return;
    
    const positions = (
      this.actor.getFlag('mmutons-cyberpunk-red-vas', 'positions') || []
    ).filter(p => p.id !== posId);
    
    await this.actor.setFlag('mmutons-cyberpunk-red-vas', 'positions', positions);
  }

  async _onOccupantRemove(event) {
    event.preventDefault();
    const posId = event.currentTarget.dataset.positionId;
    const occUuid = event.currentTarget.dataset.occupantUuid;
    
    const positions = foundry.utils.deepClone(
      this.actor.getFlag('mmutons-cyberpunk-red-vas', 'positions') || []
    );
    const pos = positions.find(p => p.id === posId);
    
    if (pos) {
      pos.occupants = (pos.occupants || []).filter(u => u !== occUuid);
      await this.actor.setFlag('mmutons-cyberpunk-red-vas', 'positions', positions);
      await this._revokeVehicleAccess(occUuid);
    }
  }

  async _onWeaponMount(event) {
    event.preventDefault();
    const item = this.actor.items.get(event.currentTarget.dataset.itemId);
    if (!item) return;
    
    const positions = this.actor.getFlag('mmutons-cyberpunk-red-vas', 'positions').filter(p => p.canControlWeapons);
    if (positions.length === 0) {
      ui.notifications.warn('No weapon-capable positions available');
      return;
    }
    
    const buttons = {};
    positions.forEach(pos => {
      buttons[pos.id] = {
        label: pos.name,
        callback: async () => item.setFlag('mmutons-cyberpunk-red-vas', 'mountedPosition', pos.id)
      };
    });
    buttons.cancel = { label: 'Cancel' };
    
    new Dialog(
      { title: `Mount ${item.name}`, content: '<p>Select position:</p>', buttons: buttons },
      { classes: ['dialog', 'vas-dialog'] }
    ).render(true);
  }

  async _onWeaponUnmount(event) {
    event.preventDefault();
    const item = this.actor.items.get(event.currentTarget.dataset.itemId);
    if (item) await item.unsetFlag('mmutons-cyberpunk-red-vas', 'mountedPosition');
  }
  
async _onFireCheckboxToggle(event) {
  event.preventDefault();
  const weaponID = event.currentTarget.dataset.itemId;
  const firemode = event.currentTarget.dataset.fireMode;
  
  const flag = this.actor.getFlag('cyberpunk-red-core', `firetype-${weaponID}`);
  
  if (this.token !== null && firemode === 'autofire') {
    const weapon = this.actor.items.get(weaponID);
    const weaponDvTable = weapon.system.dvTable;
    const currentDvTable = weaponDvTable === '' 
      ? foundry.utils.getProperty(this.token, 'flags.cprDvTable')
      : weaponDvTable;
      
    if (typeof currentDvTable !== 'undefined') {
      const dvTable = currentDvTable.replace(' (Autofire)', '');
      const dvTables = await SystemUtils.GetDvTables();
      const afTable = dvTables.filter(table =>
        table.name.includes(dvTable) && table.name.includes('Autofire')
      );
      
      let newDvTable = currentDvTable;
      if (afTable.length > 0) {
        newDvTable = flag === firemode ? dvTable : afTable[0];
      }
      await this.token.update({ 'flags.cprDvTable': newDvTable });
    }
  }
  
  if (flag === firemode) {
    await this.actor.unsetFlag('cyberpunk-red-core', `firetype-${weaponID}`);
  } else {
    await this.actor.setFlag('cyberpunk-red-core', `firetype-${weaponID}`, firemode);
  }
}

  _getFireCheckbox(weaponID) {
    return this.actor.getFlag('cyberpunk-red-core', `firetype-${weaponID}`) || 'attack';
  }

  async _onChangeAmmo(event) {
    event.preventDefault();
    const item = this.actor.items.get(event.currentTarget.dataset.itemId);
    if (item?.load) await item.load();
  }

  async _onReload(event) {
    event.preventDefault();
    const item = this.actor.items.get(event.currentTarget.dataset.itemId);
    if (item?.reload) await item.reload();
  }

  async _onWeaponRoll(event) {
    event.preventDefault();
    event.stopPropagation();
    
    try {
      const itemId = event.currentTarget.dataset.itemId;
      const rollTypeFromButton = event.currentTarget.dataset.rollType;
      const item = this.actor.items.get(itemId);
      if (!item) return;
      
      const mountedPos = item.getFlag('mmutons-cyberpunk-red-vas', 'mountedPosition');
      if (!mountedPos) return;
      
      const positions = this.actor.getFlag('mmutons-cyberpunk-red-vas', 'positions') || [];
      const position = positions.find(p => p.id === mountedPos);
      if (!position?.occupants?.length) return;
      
      const occupantActor = await fromUuid(position.occupants[0]);
      if (!occupantActor) return;
      
      const rollType = rollTypeFromButton === 'attack' ? this._getFireCheckbox(itemId) : 'damage';
      let cprRoll = item.createRoll(rollType, occupantActor);
      
      const keepRolling = await cprRoll.handleRollDialog(event, occupantActor, item);
      if (!keepRolling) return;
      
      cprRoll = await item.confirmRoll(cprRoll);
      if (!cprRoll) return;
      
      await cprRoll.roll();
      
      if (Number.isInteger(cprRoll.luck) && cprRoll.luck > 0) {
        const luckStat = occupantActor.system.stats.luck.value;
        await occupantActor.update({
          'system.stats.luck.value': luckStat - Math.min(cprRoll.luck, luckStat)
        });
      }
      
      let vehicleTokenId = this.token?.id ?? this.token?._id ?? null;
      if (!vehicleTokenId) {
        const vehicleTokens = canvas.scene?.tokens?.filter(t => t.actorId === this.actor.id) || [];
        if (vehicleTokens.length > 0) vehicleTokenId = vehicleTokens[0].id;
      }
      
      cprRoll.entityData = {
        actor: this.actor.id,
        token: vehicleTokenId,
        tokens: Array.from(game.user.targets).map(t => t.id),
        item: item.id
      };
      
      const CPRChat = await import('/systems/cyberpunk-red-core/modules/chat/cpr-chat.js');
      await CPRChat.default.RenderRollCard(cprRoll);
      
      if (!game.user.isGM && game.modules.get('autoanimations')?.active) {
        let vehicleTokenDoc = this.token ?? canvas.scene?.tokens?.find(t => t.actorId === this.actor.id);
        if (vehicleTokenDoc) {
          const vehicleTokenObj = vehicleTokenDoc.object ?? canvas.tokens.get(vehicleTokenDoc.id);
          if (vehicleTokenObj && window.AutomatedAnimations?.playAnimation) {
            window.AutomatedAnimations.playAnimation(vehicleTokenObj, item, { targets: Array.from(game.user.targets) });
          }
        }
      }
    } catch (error) { }
  }
  
  async _onSkillRoll(event) {
    event.preventDefault();
    const positionId = event.currentTarget.dataset.positionId;
    const skillTitle = event.currentTarget.dataset.rollTitle;
    
    const pos = this.actor.getFlag('mmutons-cyberpunk-red-vas', 'positions')?.find(p => p.id === positionId);
    if (!pos?.occupants?.length) return;
    
    const occupant = await fromUuid(pos.occupants[0]);
    if (!occupant) return;
    
    const normalize = s => s.normalize('NFC').trim().toLowerCase();
    const toCamel = name => name.split(' ').map((w, i) => i === 0 ? w.charAt(0).toLowerCase() + w.slice(1) : w.charAt(0).toUpperCase() + w.slice(1)).join('');
    const skill = occupant.items.find(i => {
      if (i.type !== 'skill') return false;
      if (normalize(i.name) === normalize(skillTitle)) return true;
      const label = game.i18n.localize(`CPR.global.itemType.skill.${toCamel(i.name)}`);
      if (label && normalize(label) === normalize(skillTitle)) return true;
      return false;
    });
    if (!skill) {
      ui.notifications.warn(`VAS | Skill "${skillTitle}" not found.`);
      return;
    }

    let cprRoll = skill.createRoll('skill', occupant);
    
    const keepRolling = await cprRoll.handleRollDialog(event, occupant, skill);
    if (!keepRolling) return;
    
    cprRoll = await skill.confirmRoll(cprRoll);
    if (!cprRoll) return;
    
    await cprRoll.roll();
    
    if (Number.isInteger(cprRoll.luck) && cprRoll.luck > 0) {
      const luckStat = occupant.system.stats.luck.value;
      await occupant.update({
        'system.stats.luck.value': luckStat - Math.min(cprRoll.luck, luckStat)
      });
    }
    
    cprRoll.entityData = {
      actor: occupant.id,
      token: this.token?._id ?? null,
      tokens: Array.from(game.user.targets).map(t => t.id),
      item: skill.id
    };
    
    const CPRChat = await import('/systems/cyberpunk-red-core/modules/chat/cpr-chat.js');
    CPRChat.default.RenderRollCard(cprRoll);
  }

  async _onArmorEquip(event) {
    event.preventDefault();
    const itemId = event.currentTarget.dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (!item) return;
    
    const currentState = item.system.equipped || 'owned';
    const states = ['equipped', 'owned', 'carried'];
    const currentIndex = states.indexOf(currentState);
    const newState = states[(currentIndex + 1) % states.length];
    
    await item.update({'system.equipped': newState});
    
    if (newState === 'equipped') {
      if (item.system.isBodyLocation) {
        const bodySP = item.system.bodyLocation?.sp || 0;
        const bodyAblation = item.system.bodyLocation?.ablation || 0;
        await this.actor.update({
          'system.externalData.currentArmorBody.value': bodySP - bodyAblation,
          'system.externalData.currentArmorBody.max': bodySP,
          'system.externalData.currentArmorBody.id': itemId
        });
      }
      if (item.system.isHeadLocation) {
        const headSP = item.system.headLocation?.sp || 0;
        const headAblation = item.system.headLocation?.ablation || 0;
        await this.actor.update({
          'system.externalData.currentArmorHead.value': headSP - headAblation,
          'system.externalData.currentArmorHead.max': headSP,
          'system.externalData.currentArmorHead.id': itemId
        });
      }
    } else {
      if (item.system.isBodyLocation) {
        await this.actor.update({
          'system.externalData.currentArmorBody.value': 0,
          'system.externalData.currentArmorBody.max': 0,
          'system.externalData.currentArmorBody.id': null
        });
      }
      if (item.system.isHeadLocation) {
        await this.actor.update({
          'system.externalData.currentArmorHead.value': 0,
          'system.externalData.currentArmorHead.max': 0,
          'system.externalData.currentArmorHead.id': null
        });
      }
    }
  }

  _onOccupantDragStart(event) {
    event.dataTransfer.setData('text/plain', JSON.stringify({
      type: 'occupant',
      uuid: event.currentTarget.dataset.occupantUuid,
      fromPosition: event.currentTarget.dataset.positionId
    }));
  }

  _onOccupantDragOver(event) {
    event.preventDefault();
    event.currentTarget.classList.add('dragover');
  }

  async _onOccupantDrop(event) {
    event.preventDefault();
    event.currentTarget.classList.remove('dragover');
    
    const data = JSON.parse(event.dataTransfer.getData('text/plain'));
    if (data.type !== 'occupant') return;
    
    const toPositionId = event.currentTarget.dataset.positionId;
    if (toPositionId === data.fromPosition) return;
    
    const positions = foundry.utils.deepClone(
      this.actor.getFlag('mmutons-cyberpunk-red-vas', 'positions') || []
    );
    
    const fromPos = positions.find(p => p.id === data.fromPosition);
    if (fromPos) fromPos.occupants = (fromPos.occupants || []).filter(u => u !== data.uuid);
    
    const toPos = positions.find(p => p.id === toPositionId);
    if (toPos) {
      if (!toPos.occupants) toPos.occupants = [];
      const maxOccupants = toPos.maxOccupants || 1;
      if (toPos.occupants.length > maxOccupants) return;
      toPos.occupants.push(data.uuid);
    }
    
    await this.actor.setFlag('mmutons-cyberpunk-red-vas', 'positions', positions);
    if (toPos) await this._grantVehicleAccess(data.uuid, toPositionId);
  }
  
  async _onGlassHpClick(event) {
    event.preventDefault();
    const posId = event.currentTarget.dataset.positionId;
    const pos = this.actor.getFlag('mmutons-cyberpunk-red-vas', 'positions')?.find(p => p.id === posId);
    if (!pos) return;
    
    new Dialog({
      title: `${pos.name} - Bulletproof Glass`,
      content: `
        <form>
          <div class="form-group">
            <label>Current HP: ${pos.glassHp}/${pos.glassHpMax}</label>
          </div>
          <div class="form-group">
            <label>Amount</label>
            <input type="number" name="amount" value="" autofocus/>
          </div>
        </form>
      `,
      buttons: {
        damage: {
          icon: '<i class="fas fa-heart-broken"></i>',
          label: 'Damage',
          callback: async (html) => {
            const amount = Number(html.find('[name="amount"]').val()) || 0;
            await this._updateGlassHp(posId, -amount);
          }
        },
        repair: {
          icon: '<i class="fas fa-wrench"></i>',
          label: 'Repair',
          callback: async (html) => {
            const amount = Number(html.find('[name="amount"]').val()) || 0;
            await this._updateGlassHp(posId, amount);
          }
        },
        },
      default: 'damage'
    }).render(true);
  }

  async _updateGlassHp(positionId, change) {
    const positions = foundry.utils.deepClone(
      this.actor.getFlag('mmutons-cyberpunk-red-vas', 'positions') || []
    );
    
    const position = positions.find(p => p.id === positionId);
    if (!position) return;
    
    position.glassHp = Math.max(0, Math.min(position.glassHpMax, position.glassHp + change));
    await this.actor.setFlag('mmutons-cyberpunk-red-vas', 'positions', positions);
  }
  
  async _onUpgradeMount(event) {
    event.preventDefault();
    const item = this.actor.items.get(event.currentTarget.dataset.itemId);
    if (!item) return;
    await item.setFlag('mmutons-cyberpunk-red-vas', 'mounted', true);
  }

  async _onUpgradeUnmount(event) {
    event.preventDefault();
    const item = this.actor.items.get(event.currentTarget.dataset.itemId);
    if (item) await item.unsetFlag('mmutons-cyberpunk-red-vas', 'mounted');
  }

  async _onCyberwareInstall(event) {
    event.preventDefault();
    const item = this.actor.items.get(event.currentTarget.dataset.itemId);
    if (item) await item.setFlag('mmutons-cyberpunk-red-vas', 'installed', true);
  }

  async _onCyberwareUninstall(event) {
    event.preventDefault();
    const item = this.actor.items.get(event.currentTarget.dataset.itemId);
    if (item) await item.unsetFlag('mmutons-cyberpunk-red-vas', 'installed');
  }

  static async reconcilePermissions(actor) {
    if (!game.user.isGM) return;
    try {
      const positions = actor.getFlag('mmutons-cyberpunk-red-vas', 'positions') || [];
      const players = game.users.filter(u => !u.isGM);

      for (const user of players) {
        let highestLevel = OWNERSHIP.NONE;
        let needsTokenControl = false;

        for (const pos of positions) {
          let userInPos = false;
          for (const uuid of (pos.occupants || [])) {
            if (!uuid.startsWith('Actor.')) continue;
            const occupantActor = game.actors.get(uuid.split('.')[1]);
            if (occupantActor && occupantActor.testUserPermission(user, 'OWNER')) {
              userInPos = true;
              break;
            }
          }
          if (!userInPos) continue;
          const level = (pos.grantsTokenControl || pos.canControlWeapons) ? OWNERSHIP.OWNER : OWNERSHIP.OBSERVER;
          if (level > highestLevel) highestLevel = level;
          if (pos.grantsTokenControl) needsTokenControl = true;
        }

        const currentLevel = actor.ownership?.[user.id] ?? OWNERSHIP.NONE;
        if (currentLevel !== highestLevel) {
          await actor.update({ [`ownership.${user.id}`]: highestLevel });
        }

        const targetTokenLevel = needsTokenControl ? OWNERSHIP.OWNER : OWNERSHIP.NONE;
        const sceneTokens = canvas.scene?.tokens?.filter(t => t.actorId === actor.id) || [];
        for (const tokenDoc of sceneTokens) {
          const curr = tokenDoc.ownership?.[user.id] ?? OWNERSHIP.NONE;
          if (curr !== targetTokenLevel) {
            await tokenDoc.update({ [`ownership.${user.id}`]: targetTokenLevel });
          }
        }
        const protoLevel = actor.prototypeToken?.ownership?.[user.id] ?? OWNERSHIP.NONE;
        if (protoLevel !== targetTokenLevel) {
          await actor.update({ [`prototypeToken.ownership.${user.id}`]: targetTokenLevel });
        }
      }
    } catch (error) {
      console.error('VAS | reconcilePermissions error:', error);
    }
  }

  _getActorOwner(actor) {
    const players = game.users.filter(u => !u.isGM);
    for (const user of players) {
      if (actor.testUserPermission(user, 'OWNER')) return user;
    }
    return null;
  }

  async _grantVehicleAccess(occupantUuid, positionId) {
    await VehicleSheet.reconcilePermissions(this.actor);
  }

  async _revokeVehicleAccess(occupantUuid) {
    await VehicleSheet.reconcilePermissions(this.actor);
  }

  async _syncOccupantAccess(positions = []) {
    await VehicleSheet.reconcilePermissions(this.actor);
  }

  async _onDrop(event) {
    const data = TextEditor.getDragEventData(event);
    if (Hooks.call("dropActorSheetData", this.actor, this, data) === false) return;
    
    switch (data.type) {
      case "Actor": return this._onDropActor(event, data);
      case "Item": return this._onDropItem(event, data);
      default: return super._onDrop(event);
    }
  }

  async _onDropActor(event, data) {
    if (!this.actor.isOwner || data.uuid === this.actor.uuid) return false;
    
    const actor = await fromUuid(data.uuid);
    if (!actor) return false;
    
    const posElement = event.target.closest('[data-position-id]');
    if (!posElement) return false;
    
    const posId = posElement.dataset.positionId;
    const positions = foundry.utils.deepClone(
      this.actor.getFlag('mmutons-cyberpunk-red-vas', 'positions') || []
    );
    
    positions.forEach(p => {
      if (!p.occupants) p.occupants = [];
      p.occupants = p.occupants.filter(u => u !== actor.uuid);
    });
    
    const targetPos = positions.find(p => p.id === posId);
    if (targetPos) {
      if (!targetPos.occupants) targetPos.occupants = [];
      const maxOccupants = targetPos.maxOccupants || 1;
      if (targetPos.occupants.length > maxOccupants) return false;
      targetPos.occupants.push(actor.uuid);
    }
    
    await this.actor.setFlag('mmutons-cyberpunk-red-vas', 'positions', positions);
    await this._grantVehicleAccess(actor.uuid, posId);
    return true;
  }

  async _onDropItem(event, data) {
    if (!this.actor.isOwner) return false;
    const item = await Item.implementation.fromDropData(data);
    if (!item) return;

    if (item.actor?.id === this.actor.id) {
      this._internalDrop = true;
      return this._onSortItem(event, item);
    }
    
    return this._onDropItemCreate(item, event);
  }

  async _onDropItemCreate(itemData, event) {
    itemData = itemData instanceof Array ? itemData : [itemData];
    const itemsToCreate = [];
    const itemsToDelete = [];
    
    for (let data of itemData) {
      const sourceActor = data.actor;
      const sourceItemId = data.id || data._id;
      
      const incomingData = data.toObject ? data.toObject() : foundry.utils.deepClone(data);
      delete incomingData._id;
      
      const incomingAmount = incomingData.system?.amount;
      if (incomingAmount !== undefined && incomingAmount !== null) {
        const existingItem = this.actor.items.find(i => 
          i.name === incomingData.name && i.type === incomingData.type
        );
        if (existingItem?.system.amount !== undefined) {
          await existingItem.update({ 'system.amount': (existingItem.system.amount || 0) + (incomingAmount || 1) });
          if (sourceActor && sourceItemId) itemsToDelete.push({ actor: sourceActor, itemId: sourceItemId });
          continue;
        }
      }
      
      itemsToCreate.push(incomingData);
      if (sourceActor && sourceItemId) itemsToDelete.push({ actor: sourceActor, itemId: sourceItemId });
    }
    
    if (itemsToCreate.length > 0) await this.actor.createEmbeddedDocuments("Item", itemsToCreate);
    
    for (const { actor, itemId } of itemsToDelete) {
      const itemToDelete = actor.items?.get(itemId);
      if (itemToDelete) await itemToDelete.delete();
    }
  }

  _onItemDragStart(event) {
    const item = this.actor.items.get(event.currentTarget.dataset.itemId);
    if (!item) return;
    
    event.dataTransfer.setData('text/plain', JSON.stringify(item.toDragData()));
    event.dataTransfer.effectAllowed = 'copyMove';
    this._draggedItemId = item.id;
  }

  async _onItemDragEnd(event) {
    const itemId = this._draggedItemId;
    this._draggedItemId = null;
    
    if (!itemId) return;
    
    if (this._internalDrop) {
      this._internalDrop = false;
      return;
    }
    
    if (event.dataTransfer.dropEffect === 'none') return;
    
    await new Promise(resolve => setTimeout(resolve, 150));
    
    const item = this.actor.items.get(itemId);
    if (item) await item.delete();
  }

  async _onItemSplit(event) {
    event.preventDefault();
    event.stopPropagation();
    
    const itemId = event.currentTarget.closest('[data-item-id]')?.dataset.itemId || event.currentTarget.dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (!item) return;
    
    const currentAmount = item.system.amount || 1;
    if (currentAmount <= 1) return;
    
    const sheet = this;
    
    new Dialog({
      title: `Split ${item.name}`,
      content: `
        <form>
          <div class="form-group">
            <label>Current Stack: ${currentAmount}</label>
          </div>
          <div class="form-group">
            <label>Amount to Split Off</label>
            <input type="number" name="splitAmount" value="1" min="1" max="${currentAmount - 1}"/>
          </div>
        </form>
      `,
      buttons: {
        split: {
          icon: '<i class="fas fa-scissors"></i>',
          label: 'Split',
          callback: async (html) => {
            const splitAmount = Math.floor(Number(html.find('[name="splitAmount"]').val()) || 1);
            if (splitAmount < 1 || splitAmount >= currentAmount) return;
            
            await item.update({ 'system.amount': currentAmount - splitAmount });
            
            const newItemData = item.toObject();
            newItemData.system.amount = splitAmount;
            delete newItemData._id;
            
            await sheet.actor.createEmbeddedDocuments('Item', [newItemData]);
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: 'Cancel'
        }
      },
      default: 'split'
    }).render(true);
  }
}
