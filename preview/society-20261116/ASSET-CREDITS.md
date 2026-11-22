# Realms art and motion credits

This candidate combines project-authored armour, clothing, rigging and environment geometry with the following licensed source assets. This file documents the candidate, not the older public combat build.

## Anatomical geometry

The head and neck derive from the MakeHuman core base mesh, released under CC0 1.0. The mesh was cropped, fitted, UV-preserved and extended into the garment in this project. MakeHuman application code was not imported.

- Source: https://github.com/makehumancommunity/makehuman/blob/master/makehuman/data/3dobjs/base.obj
- Asset licence: https://github.com/makehumancommunity/makehuman/blob/master/LICENSE.md

## Skin materials

### Freckled light
Authors: Toigo (albedo); Mindfront (normal/specular). Licence: CC0-1.0.
- http://www.makehumancommunity.org/node/1325
- http://www.makehumancommunity.org/node/850
Only the head/neck atlas regions are exported. Roughness is an artistic conversion from a source specular map, not a measured roughness scan.

### Weathered deep
Authors: Mindfront. Licence: CC0-1.0.
- http://www.makehumancommunity.org/node/526
Only the head/neck atlas regions are exported. Roughness is an artistic conversion from a source specular map, not a measured roughness scan.

## Environment and equipment surfaces

Poly Haven assets are CC0. Publisher file checksums and source URLs are recorded in `assets/manifest.json`. Conversions include resolution changes, isolated foliage cutouts and game-ready image formats.

- [MakeHuman anatomical head subset](https://polyhaven.com/a/MakeHuman anatomical head subset)
- [brown_leather](https://polyhaven.com/a/brown_leather)
- [fern_02](https://polyhaven.com/a/fern_02)
- [forest_floor](https://polyhaven.com/a/forest_floor)
- [grass_ground](https://polyhaven.com/a/grass_ground)
- [grass_medium_01](https://polyhaven.com/a/grass_medium_01)
- [grey_roof_tiles_02](https://polyhaven.com/a/grey_roof_tiles_02)
- [kloofendal_overcast_puresky](https://polyhaven.com/a/kloofendal_overcast_puresky)
- [metal_plate_02](https://polyhaven.com/a/metal_plate_02)
- [mossy_cobblestone](https://polyhaven.com/a/mossy_cobblestone)
- [oak_wood_planks](https://polyhaven.com/a/oak_wood_planks)
- [old_stone_wall](https://polyhaven.com/a/old_stone_wall)
- [pine_tree_01](https://polyhaven.com/a/pine_tree_01)
- [plastered_stone_wall](https://polyhaven.com/a/plastered_stone_wall)
- [wooden_barrels_01](https://polyhaven.com/a/wooden_barrels_01)

## Motion capture

Walking, running and swordplay use the CMU Graphics Lab motion-capture database. Source references and selected frames are retained in `mocap/locomotion.json` and `mocap/swings.json`. Sprint is a speed-adapted running clip, not a separately captured sprint. Retargeting, looping and contact corrections are project processing.

- https://mocap.cs.cmu.edu/

The candidate does not claim that the old public release has been relicensed. The runtime uses captured clip blending and inverse kinematics; a complete pose-search motion-matching system remains an open development item.

## Rendering library

Three.js and its loaders/utilities are MIT-licensed. Their source notices are retained in the bundled library files.

Bare working hands use a wrist-cropped derivative of the same CC0 MakeHuman base mesh cited above. The face landmark variation and brow geometry are project-authored.
