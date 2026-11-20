# Phase 11 known limitations

## Robotics capability (unchanged from earlier phases, stated in the library)

- No line sensor: the Line Following project practices the route with timed moves.
- No grasping physics: the arm moves through the poses, but the gripper does not hold objects.
- No object, face or plant recognition: cameras give an image, brightness and mean color.
- No soil, moisture or temperature sensors.
- No mapping, GPS or path planning.
- Physical hardware:
  - only the Explorer Bot reference profile (Phase 10);
  - tested with the simulated device only;
  - ESP32 firmware compilation is still blocked in the build environment;
  - encoders, IMU, odometry and cameras are refused on the physical target.

## Learning features

- **Manual checks are self-reported.** Purpose understanding, reading the build guide and seeing the expected result cannot be observed by the app. They are labeled "Manual check".
- **"Expected behavior" is not measured.** The simulation step verifies that a project program *completed* a run (in the Physics engine where needed). It does not measure, for example, that the robot avoided every obstacle.
- **Example robots are normal projects.** "Explore Project" creates a project named "… (example)" once and then reuses it. It appears in My Projects and can be deleted like any project.
- **Inspection guard is partial.** The editing panels are inert, and Save / Ctrl+S are disabled. Code Studio and the Blueprint stay usable for running and reading. A program saved inside Code Studio during inspection is still saved, because programs are stored separately.
- **No Blockly highlighting.** The program explanation shows Blockly programs as their generated JavaScript. It does not highlight blocks in the Blockly editor.
- **Rule-based matching.** The Purpose Builder matches English keywords and the guided answers. Wording outside its keyword lists may find no match; the page then asks for more detail or links to the library.
- **Build sequence is derived.** It comes from the model hierarchy and is not a verified physical procedure.

## Behaviors found but left unchanged

- Explorer Bot template joint descriptions still say "Continuous drive arrives with motor control in Phase 3". Changing them would change what new projects store.
- A project without a stored environment records `"floor"` (the default) when it is opened after another project used a different environment. This is Phase 7 behavior; it names the same default environment. The regression test allows exactly this case.

## Testing

- Physical hardware: none (see the Phase 10 report).
- Accessibility was checked by automated rules in the browser suite (headings, names, labels, keyboard, focus, token contrast). No screen reader test was run.
