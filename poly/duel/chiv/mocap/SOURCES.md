# Motion provenance

## Combat

The current four attack clips derive from Carnegie Mellon University's Graphics Lab motion-capture database, subject 02, trials 07 and 08 (swordplay).

- https://mocap.cs.cmu.edu/search.php?subjectnumber=2&motion=sword
- https://mocap.cs.cmu.edu/subjects/02/02.asf
- https://mocap.cs.cmu.edu/subjects/02/02_07.amc
- https://mocap.cs.cmu.edu/subjects/02/02_08.amc

Attribution: CMU Graphics Lab Motion Capture Database, created with funding from NSF EIA-0196217. Consult https://mocap.cs.cmu.edu/ for source usage terms.

ASF/AMC bone-axis corrections are applied, and motion is sampled from 120 to 30 fps. Left cut, right cut, overhead and forward extension use separate recorded segments. The thrust extension is rotated about the shoulder toward gameplay aim, preserving limb lengths. Blade direction is adapted from wrist orientation and attack aim, not captured prop tracking. Playback follows the combat phases.

## Locomotion

Walk, run and sprint derive from Ubisoft LAFAN1, subject 2: https://github.com/ubisoft/ubisoft-laforge-animation-dataset . Review its licence before commercial distribution. This prototype is not claimed to be cleared for commercial release.

The corrected BVH parser keeps terminal-joint offsets separate from End Site offsets. Root travel determines stride speed, loops close over a whole gait cycle, and a common gait phase aligns blends. Runtime IK anchors planted toes and preserves knee bend during strafing and backpedalling.
