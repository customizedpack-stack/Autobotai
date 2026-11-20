# Tutorial engine

Code: `src/features/learning/catalog/tutorials.ts` (one reusable journey), `engine/checks.ts` (verification), `engine/tutorialEngine.ts` and `engine/progress.ts` (sequencing), `engine/evidence.ts` (run evidence), `store/learningStore.ts` (persistence), `components/TutorialPanel.tsx` and `components/doActions.ts` (UI).

## One journey, configured per project

`buildTutorial(definition)` creates every tutorial from the same nine stages. A small per-project configuration chooses:

- the key component to select;
- the API calls the program must use;
- whether the run must use the Physics engine;
- the test environment.

There are no hand-written tutorial pages.

| Stage | Step | Verify |
|---|---|---|
| 1 Understand Robot Purpose | purpose | Manual check |
| 2 Explore Components | components | Each required component exists in the robot; the key component is **selected** |
| 3 Design Robot in 3D | design / design-camera | Camera projects: a camera sensor exists. Others: wheels or joint markers exist |
| 4 Assemble Robot | assemble | Mobile: `diagnoseDrive` ready plus a differential-drive controller. Arm: every revolute joint has an enabled position actuator |
| 5 Understand Electronics and Wiring | electronics (optional) | Projects with verified parts: at least 2 Blueprint mappings. Arm: manual |
| 6 Learn Programming Logic | programming | A **saved** program uses the required API calls (Blockly programs are checked through their generated JavaScript) |
| 7 Run Simulation | simulation | Environment with enough objects (where needed) plus a **completed** run of one of the project's programs, in the Physics engine where needed |
| 8 Follow Physical Build Guide | physical (optional, only when a build guide exists) | Manual check, worded so it does not claim a built robot |
| 9 Test and Complete | complete | No unsaved changes, plus a manual check of the expected result |

Conditional steps:

- The camera step appears only for camera projects.
- The physical step appears only when a verified physical path exists. It is absent for the arm.

## Learn → Do → Verify

- **Learn** explains the idea and why it matters.
- **Do** lists the instructions. Its buttons call the same functions as the real controls: the mode buttons, Simulate, `robotModel.addCamera()`, Code Studio's `createProgram` and the environment selector.
- **Verify** has two parts:
  - **Check my robot** runs the automatic checks on the live scene (unsaved edits count) or on the saved project.
  - **Manual check** is a labeled checkbox, used only for what the app cannot observe.

There is no "mark as done" button for automatic checks. A step passes only when every check passes and its manual prompt (if any) is ticked.

## Failure messages

Each failed check shows:

- what is missing (the real result, for example `Left Wheel: no joint` from `diagnoseDrive`, or `"Left Wheel" is selected instead.`);
- why it matters;
- where to fix it;
- that the learner should click "Check my robot" again.

## Run evidence

`connectLearningEvidence()` (bootstrap) listens to `codeStudio.execution`. It records only `completed` runs for the open project, with whether the Physics engine was active. Stopped, failed and timed-out runs do not count. At most 20 runs are kept per project, and deleting a project deletes its learning records.

## Progress and resume

`arai.learning.v1` stores, per tutorial and project:

- tutorial id, project id and tutorial version;
- current step and completed steps;
- each step's status, check results and manual confirmation;
- start, update and completion times.

It never stores a copy of the robot. The learner can:

- start, pause (hide the panel), resume (dashboard "Continue Learning", the Learn page, or the tutorial button in the top bar);
- go back to any step and review it;
- skip optional steps;
- restart (with confirmation; the robot is not changed).

If the tutorial version changes, a new progress record starts.

## Completion

The summary lists:

- the objectives;
- the stages verified by the app;
- the manual-only stages;
- skipped stages;
- whether a completed run was recorded;
- the physical status, which always says "Not built or tested by AutoBotAI";
- the next action.
