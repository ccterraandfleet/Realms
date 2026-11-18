# Horse model and animation source

Quaternius, Ultimate Animated Animal Pack (July 2021), Horse.gltf. CC0 1.0. Original creator page: https://quaternius.com/packs/ultimateanimatedanimals.html

Original publicly shared file: https://drive.google.com/file/d/1hbtY8kxnXiPdwYGVY7rWRgU0jl_-Q-LG/view

Source SHA-256: 3deb61550dff1d2786d04b6e8559d63ad3907d6ab606ba28ce0af074ed96341b

The supplied animations are authored animation clips, not claimed to be motion capture. Realms adds material refinement and riding tack; the source model/animations remain credited here. Embedded buffers were extracted without changing mesh or animation data.


## Internal mesh and gait refinements

`horse-smooth.gltf` applies one constrained Loop subdivision to the coat primitives only. Hoof, mane, eye and muzzle meshes are retained; open seams are pinned. Interpolated skin weights are normalized and the original skeleton and animation channels are unchanged. Rebuild with `art/refine_horse.py`; metrics are in `evidence/horse-mesh-refinement.json`.

`motion-metrics.json` is derived from the original scaled rig by sampling the four hoof meshes. Walk/gallop reference speeds use median rearward hoof velocity during contact. Idle/eating contact samples support ground clearance. Rebuild with `art/calibrate_horse_motion.mjs`. These derived measurements are not a claim that the clips are motion capture or that every contact is physically simulated.
