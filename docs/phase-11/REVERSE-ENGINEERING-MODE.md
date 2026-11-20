# Reverse Engineering Mode

Code: `src/features/learning/engine/reverse.ts`, `engine/programExplain.ts`, `store/learningSession.ts`, `components/InspectPanel.tsx`, plus small hooks in `features/viewport/Viewport.tsx`, `SceneObjectNode.tsx` and `CameraRig.tsx`.

## How to open it

- **Learn Robotics → Reverse Engineering**: "Inspect the …" opens a finished example of a library project, or one of the user's projects.
- **Project detail → Explore Project** does the same for that project.
- **Workspace top bar → magnifier button** toggles inspection on any open project.
- With the experience mode set to **Reverse Engineering**, opening a project starts in inspection.

The example robot is a normal project created once with the template, the setup and the starter program. It is reused on later visits.

## Reusing the existing model

Everything is read from the existing robot model in the scene store: objects and their `parentId` hierarchy, joints, actuators, controllers and sensors. It also reads the Phase 9 Blueprint (mappings, wiring) and saved programs. There is no second model.

## Read-only behavior

- Inspection has its own state, `useLearningSession().inspectedId`. While inspecting, viewport clicks go there, never to the Builder `selectionStore`, so no gizmo appears and nothing can be moved.
- The inspected part is highlighted in purple. "Inspect components" frames the camera on it through a new `viewportStore.requestFocus(id)`.
- The left (library) and right (properties) panels are `inert` while inspecting.
- The top-bar Save button and Ctrl+S are disabled.
- The browser suite checks that the inspected project's stored data is identical before and after inspection.

## The nine stages

1. Understand the completed robot: name, purpose, counts of parts, joints, actuators, controllers, sensors and programs.
2. Explore overall behavior: how it works, and which API functions its program actually calls.
3. Inspect components: a hierarchy tree plus details for the selected part:
   - name, category, purpose and why it is needed;
   - parent, children, and parts connected by joints;
   - related joints, sensors, actuators and drive;
   - the program lines that use it;
   - the Phase 9 real part, if mapped.
4. Understand mechanical structure: the same tree, focused on attachment.
5. Understand joints: type, parent → child, limits, and the actuator that drives each joint (or that none does).
6. Review electronics and wiring: Blueprint mappings and the wire count, or a clear note that none are mapped.
7. Understand the program: each line of a real saved program with an explanation:
   - API lines use the descriptions from Code Studio's `API_REFERENCE`;
   - loops, decisions, variables and comments have short explanations;
   - lines that use the inspected part are highlighted;
   - Blockly programs are explained through their generated JavaScript;
   - a robot without a program shows "nothing to explain" (no code is invented).
8. Explore simulation: open Code Studio or Simulate with the existing controls.
9. Review the build sequence: the assembly order derived from the hierarchy, joints, actuators, controller and sensors. It is labeled as derived from the model, not a verified physical procedure.

No component-removal experiment was built, so nothing needs a temporary clone.
