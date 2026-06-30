<p align="center">
  <img src="https://i.imgur.com/xdCVW5d.png" width=300>
</p>
<h1 align="center"> Cyberpunk RED: Vehicle Actor Sheet </h1> <br>
<p align="center">
  A fully-featured vehicle sheet with positions, weapon mounting (with skills taken from the user!).
</p>

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->

## Table of Contents

- [Introduction](#introduction)
- [Features](#features)
- [Not Just Vehicles](#not-just-vehicles)
- [Known Issues](#known-issues)
- [Credits](#credits)
- [Disclaimer](#disclaimer)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

## Introduction

This is a module that adds a dedicated vehicle actor sheet to the Foundry VTT Cyberpunk RED system. Assign crew to seats, delegate skill checks and weapon attacks to occupants, manage cargo and upgrades, and let the sheet handle player permissions automatically depending on the position.
<p align="center">
  <img src="https://i.imgur.com/Sz1su35.png" width=700>
</p>
## Features

* **Crew positions:** Positions are fully configurable. Set the seat name, max occupants, available skills, and whether the position can control mounted weapons or grants token movement to the owner of the actor.
* **Drag actors into seats:** Drag actors directly from the actor list or via the pressing the "Assign Selected Token" button to select them directly from the canvas. Drag occupants between seats to move them without removing and re-adding.
* **Automatic permission management:** When a player's character sits in a seat, the GM client automatically grants them the correct level of access to the vehicle actor. Observer seats grant sheet visibility; weapon control and token control seats grant full ownership. Permissions are revoked when the occupant leaves.
* **Skill roll delegation:** Each seat can be assigned a comma-separated list of skills. Clicking a skill tag rolls it using the occupant's own skill level, routed through CPR's native roll pipeline.
* **Mounted weapon system:** Weapons on the vehicle can be assigned to specific positions. Occupants of those positions can fire, reload, change ammo, and switch fire modes directly from the Operations tab as they were managing their own sheet.
* **Bulletproof glass tracking:** Positions can be flagged as having bulletproof glass with a configurable HP max. Click the HP badge to apply damage or repair it.
* **Upgrades tab:** Vehicle upgrades and cyberware can be mounted directly from cargo and are displayed with their full description.

<p align="center">
  <img src="https://i.imgur.com/57rVHSe.png" width=700>
</p>

## Not Just Vehicles

Don't let the name fool you, the sheet works for any mounted or crewed platform. Use it for **turrets**, **ACPAs**, **weapon emplacements**, **mechs**, and anything else that requires a crew position.

<p align="center">
  <img src="https://i.imgur.com/I7DWu6q.png" width=700>
</p>

<p align="center">
  <img src="https://i.imgur.com/OF5sXVg.png" width=700>
</p>

<p align="center">
  <img src="https://i.imgur.com/Vj9uKyo.png" width=700>
</p>

<p align="center">
  <img src="https://i.imgur.com/YnnBrY7.png" width=700>
</p>

<p align="center">
  <img src="https://i.imgur.com/4SZLKDy.png" width=700>
</p>

<p align="center">
  <img src="https://i.imgur.com/r2SiVem.png" width=700>
</p>

<p align="center">
  <img src="https://i.imgur.com/sqA9Dnw.png" width=700>
</p>

<p align="center">
  <img src="https://i.imgur.com/8GXd8Pb.png" width=700>
</p>

## Known Issues

No known issues at this time.

## Credits

Militech font by Adam Rucki

## Disclaimer

As someone who is still new to programming, I have enlisted the help of AI during this project when I have struggled with the code (Especially with skill delegation and auto-ownership)
