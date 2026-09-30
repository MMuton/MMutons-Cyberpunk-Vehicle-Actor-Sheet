## 2.6
- Fixed the issues with the module not working with custom themes. (I think?)
- Added a compatability setting for the Rideable module. With it enabled, when someone mounts a rideable token that uses the VAS sheet, a dialogue asking where they want to sit opens up. Dismounting also removed the token from the seat.
- Stat Mods now support an override modifier, alongside the existing add/subtract modifiers. Use `=` to set a stat to a fixed value. (e.g. BODY=12, especially useful for ACPA's and Linear Frames!)

## 2.5
New feature: Templates (Idea by LT-ATLAS on Discord)
- You can now create position templates to set up vehicles faster!
- There 10 templates by default that you can use, edit or remove. (Back Seat, Cockpit, Co-Pilot, Driver's Seat,Gunner, Helm, Passenger Seat, Port Side, Starboard Side, Turret)

## 2.4
- You can now toggle an option in the settings that prevents losing permissions on an actor.
- There is now a info tab to take notes and write details about the vehicle.
- You can now set up bonuses and penalties per seat, which is managed by an Active Effect created in the occupant's sheet. (Edge-case warning, if you delete an unlinked token from the canvas without removing the occupant, the AE can get stuck. But don't worry, a hard-refresh cleans up all orphaned effects)

## 2.3
-Fixed VAS not appearing on Mook sheets.

## 2.2
- Removed redundant auto-detect vehicle upgrade code.

## 2.1
- Added non-English skill name matching.

## 2.0
- Initial release.