# Guided Robot Purpose Builder

Code: `src/features/learning/engine/purposeMatcher.ts`, `pages/PurposeBuilderPage.tsx`. Route: `/builder` (navigation item **Robot Builder**). The dashboard's "What do you want to build?" box opens it with the text filled in.

## Input

- Free text: "What do you want your robot to do?"
- Optional short questions:
  - What must it detect? (any of seven choices)
  - Where will it operate?
  - Your experience level.
  - Budget preference.

## Deterministic matching (no AI)

For each of the six definitions:

| Rule | Points |
|---|---|
| Each definition keyword found as a whole word or phrase in the text | +3 |
| Each "detect" choice that the project actually covers | +2 to +6 |
| Operating place listed in the project's environments | +2 |
| The project is the closest supported option for an unsupported concept in the text | +2 |
| Experience equals the project difficulty | +2 |
| Project is harder than the stated experience | −2 per level |

Every point adds a reason sentence, and those sentences are what the results show. Ties keep the catalog order, so the same input always gives the same output. A project with no points is never recommended.

## Unsupported ideas

A fixed table lists what AutoBotAI cannot do and the closest supported project for each:

| Idea | Missing | Closest supported project |
|---|---|---|
| Soil or moisture | No soil or moisture sensor | Agriculture Monitoring |
| Recognizing people or objects | No recognition | Security Patrol |
| Flying | Drone flight is not simulated | Obstacle Avoidance |
| Walking | Walking robots are not simulated | Obstacle Avoidance |
| Water | Water is not simulated | Obstacle Avoidance |
| Voice | No speech features | Security Patrol |
| Mapping or GPS | No mapping, GPS or path planning | Delivery |
| Line sensing | No line sensor | Line Following |
| Grasping | Grasping is not simulated | Pick & Place Robot Arm |
| Cutting or spraying | No such tools | Agriculture Monitoring |
| Vacuuming | No vacuum or brush | Obstacle Avoidance |

When a core concept is unsupported, the results say so first: "Part of your idea cannot be built or simulated in AutoBotAI yet". They explain what is missing, then show the closest project and state that it does not do everything described. Limits that a project only partly covers (line sensing, grasping, vacuuming) are shown as "Limits to know about".

## Results

Each result shows:

- best match and why it matches;
- alternatives (up to two);
- difficulty and components;
- simulation capabilities with statuses;
- physical status;
- budget, only from verified prices;
- the suggested tutorial.

Actions: Explore Project, Start Tutorial, Open Robot and Modify My Idea. AI-generated custom designs are out of scope.
