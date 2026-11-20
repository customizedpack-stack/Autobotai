import { beforeEach, describe, expect, it } from 'vitest';
import { bus } from '../../../core/bus/connectorBus';
import { useProjectStore } from '../../../stores/projectStore';
import { useSceneStore } from '../../../stores/sceneStore';
import { useSelectionStore } from '../../../stores/selectionStore';
import { useSettingsStore } from '../../../stores/settingsStore';
import { useBlueprintStore } from '../../blueprint/blueprintStore';
import { PARTS } from '../../blueprint/catalog/parts';
import { API_REFERENCE } from '../../code-studio/api/apiReference';
import { programsForProject, useProgramStore } from '../../code-studio/storage/programStore';
import { findComponent } from '../../component-library/catalog';
import { endControlSession } from '../../controls/controlSession';
import { useSimulationStore } from '../../physics/simulation/simulationStore';
import { robotModel } from '../../robot-model/robotModelConnector';
import { findTemplate } from '../../robot-library/templates';
import { PROJECT_DEFINITIONS, findProjectDefinition, physicalSummary } from '../catalog/projects';
import { TUTORIALS, buildTutorial, findTutorial } from '../catalog/tutorials';
import { verifiedBudget } from '../engine/budget';
import { runCheck } from '../engine/checks';
import { connectLearningEvidence } from '../engine/evidence';
import { DEFAULT_FILTER, filterProjects } from '../engine/library';
import { apiUsage, explainProgram } from '../engine/programExplain';
import { createFromDefinition, projectsFromDefinition } from '../engine/projectFactory';
import { matchPurpose } from '../engine/purposeMatcher';
import { buildSequence, hierarchy, inspectComponent, relatedProgramLines } from '../engine/reverse';
import { getProgress, goToStep, isTutorialComplete, restartTutorial, setManualConfirmed, skipStep, startTutorial, summarize, verifyStep } from '../engine/tutorialEngine';
import { CAPABILITY_LABEL, STAGE_ORDER } from '../model/types';
import { progressKey, useLearningStore } from '../store/learningStore';
import { useLearningSession } from '../store/learningSession';

connectLearningEvidence();

const def = (id: string) => findProjectDefinition(id)!;

function reset() {
  localStorage.clear();
  endControlSession();
  useSceneStore.getState().closeProject();
  useBlueprintStore.getState().close();
  useProjectStore.setState({ projects: {} });
  useProgramStore.setState({ programs: {}, lastOpened: {} });
  useLearningStore.setState({ origins: {}, progress: {}, runs: {} });
  useLearningSession.getState().end();
  useSelectionStore.getState().clear();
  useSimulationStore.setState({ engine: 'kinematic' });
}

function open(projectId: string) {
  const p = useProjectStore.getState().projects[projectId]!;
  useSceneStore.getState().loadProject(p);
  useBlueprintStore.getState().load(p.id, p.blueprint);
}

beforeEach(reset);

describe('Project definitions (11.2)', () => {
  it('has six versioned definitions with unique ids and slugs', () => {
    expect(PROJECT_DEFINITIONS).toHaveLength(6);
    expect(new Set(PROJECT_DEFINITIONS.map((d) => d.id)).size).toBe(6);
    expect(new Set(PROJECT_DEFINITIONS.map((d) => d.slug)).size).toBe(6);
    expect(PROJECT_DEFINITIONS.map((d) => d.difficulty)).toEqual(['beginner', 'beginner', 'intermediate', 'intermediate', 'intermediate', 'advanced']);
    for (const d of PROJECT_DEFINITIONS) {
      expect(d.version).toBe(1);
      expect(findTutorial(d.tutorialId)).toBeDefined();
      for (const c of [...d.simulationCapabilities, ...d.physicalRequirements]) expect(Object.keys(CAPABILITY_LABEL)).toContain(c.status);
    }
  });

  it('maps every project to an existing template whose parts really contain the required components', () => {
    for (const d of PROJECT_DEFINITIONS) {
      const template = findTemplate(d.templateId);
      expect(template, d.id).toBeDefined();
      const built = template!.build();
      for (const c of d.requiredComponents) {
        expect(findComponent(c.componentId), c.componentId).toBeDefined();
        if (c.componentId === 'sensor-camera') continue; // added by setup or by the tutorial
        expect(built.filter((b) => b.componentId === c.componentId).length, `${d.id}: ${c.componentId}`).toBeGreaterThanOrEqual(c.count);
      }
      for (const p of d.parts) expect(PARTS.some((x) => x.id === p.partId), p.partId).toBe(true);
    }
  });

  it('never claims unsupported capabilities', () => {
    const line = def('line-following');
    expect(line.simulationCapabilities.find((c) => c.id === 'line-sensor')!.status).toBe('not-yet-supported');
    expect(def('pick-and-place-arm').simulationCapabilities.find((c) => c.id === 'grasp')!.status).toBe('not-yet-supported');
    for (const id of ['agriculture-monitoring', 'security-patrol']) {
      expect(def(id).simulationCapabilities.find((c) => c.id === 'camera')!.status).toBe('simulation-only');
      expect(def(id).physicalRequirements.find((c) => c.id === 'camera-hw')!.status).toBe('not-yet-supported');
    }
    // Hardware deployment is claimed only for the Explorer Bot reference profile (Phase 10).
    for (const d of PROJECT_DEFINITIONS) {
      const deploy = d.physicalRequirements.some((c) => c.status === 'hardware-deployment');
      if (deploy) {
        expect(d.templateId).toBe('explorer-bot');
        expect(d.physicalRequirements.find((c) => c.status === 'hardware-deployment')!.note).toMatch(/simulated device only/);
      }
    }
    expect(physicalSummary(def('obstacle-avoidance')).label).toMatch(/not physically tested/);
    expect(def('pick-and-place-arm').parts).toHaveLength(0);
  });

  it('starter programs only call documented API functions', () => {
    const names = new Set(API_REFERENCE.map((a) => a.name));
    for (const d of PROJECT_DEFINITIONS) {
      const source = d.setup.program!.source;
      // Syntax check as the sandbox wraps it (an async function body).
      expect(() => new Function(`return (async () => {\n${source}\n})`), d.id).not.toThrow();
      const calls = [...source.matchAll(/\b(robotControl|robotSensors|robotCamera|robot)\.([a-zA-Z]+)(?:\.([a-zA-Z]+))?/g)].map((m) => m[0]);
      for (const call of calls) expect([...names].some((n) => n === call || n.startsWith(`${call}.`) || call.startsWith(n)), `${d.id}: ${call}`).toBe(true);
    }
  });

  it('filters by text, difficulty and support', () => {
    expect(filterProjects(PROJECT_DEFINITIONS, DEFAULT_FILTER)).toHaveLength(6);
    expect(filterProjects(PROJECT_DEFINITIONS, { ...DEFAULT_FILTER, difficulty: 'beginner' }).map((d) => d.id)).toEqual(['obstacle-avoidance', 'line-following']);
    expect(filterProjects(PROJECT_DEFINITIONS, { ...DEFAULT_FILTER, text: 'camera' }).map((d) => d.id)).toEqual(['agriculture-monitoring', 'security-patrol']);
    expect(filterProjects(PROJECT_DEFINITIONS, { ...DEFAULT_FILTER, text: 'arm gripper' }).map((d) => d.id)).toEqual(['pick-and-place-arm']);
    expect(filterProjects(PROJECT_DEFINITIONS, { ...DEFAULT_FILTER, support: 'hardware' }).map((d) => d.id)).not.toContain('pick-and-place-arm');
    expect(filterProjects(PROJECT_DEFINITIONS, { ...DEFAULT_FILTER, support: 'simulation' }).map((d) => d.id)).toEqual(['obstacle-avoidance']);
  });

  it('shows a budget only from verified catalog prices', () => {
    const b = verifiedBudget(def('obstacle-avoidance'))!;
    // 2 × 1101 (23.95) + 1429 (7.45) + 713 (4.95) + 989 (2.95); ESP32, 951 and 2490 have no verified price.
    expect(b.total).toBe(63.25);
    expect(b.priced).toBe(4);
    expect(b.unpriced).toHaveLength(3);
    expect(verifiedBudget(def('pick-and-place-arm'))).toBeNull();
  });
});

describe('Safe project creation (11.2)', () => {
  it('creates a NEW project from the template and never changes existing projects', () => {
    const mine = useProjectStore.getState().createProject({ name: 'My Own Bot', category: 'mobile', templateId: 'explorer-bot' });
    const before = JSON.stringify(useProjectStore.getState().projects[mine.id]);
    for (const d of PROJECT_DEFINITIONS) {
      const r = createFromDefinition(d, { kind: 'robot', complete: true });
      expect(r.ok, d.id).toBe(true);
      if (!r.ok) continue;
      expect(r.project.id).not.toBe(mine.id);
      expect(r.project.templateId).toBe(d.templateId);
      expect(r.notes).toEqual([]);
      const saved = useProjectStore.getState().projects[r.project.id]!;
      if (d.setup.camera) expect(saved.sensors?.some((s) => s.type === 'camera')).toBe(true);
      if (d.setup.jointActuators) expect(saved.actuators.filter((a) => a.controlMode === 'position')).toHaveLength(3);
      if (d.setup.environmentId) expect(saved.environmentId).toBe(d.setup.environmentId);
      expect(programsForProject(useProgramStore.getState().programs, r.project.id).map((p) => p.name)).toEqual([d.setup.program!.name]);
      expect(useLearningStore.getState().origins[r.project.id]).toMatchObject({ definitionId: d.id, kind: 'robot', definitionVersion: 1 });
    }
    expect(JSON.stringify(useProjectStore.getState().projects[mine.id])).toBe(before);
    expect(Object.keys(useProjectStore.getState().projects)).toHaveLength(7);
    expect(projectsFromDefinition('delivery-robot', 'robot')).toHaveLength(1);
  });

  it('a tutorial project starts from the plain template (the learner builds the rest)', () => {
    const r = createFromDefinition(def('security-patrol'), { kind: 'tutorial', complete: false });
    expect(r.ok && r.project.sensors?.some((s) => s.type === 'camera')).toBe(false);
    expect(r.ok && programsForProject(useProgramStore.getState().programs, r.project.id)).toEqual([]);
  });

  it('deleting a project removes its learning records', () => {
    const r = createFromDefinition(def('obstacle-avoidance'), { kind: 'tutorial', complete: false });
    if (!r.ok) throw new Error();
    startTutorial(findTutorial(def('obstacle-avoidance').tutorialId)!, r.project.id);
    useProjectStore.getState().deleteProject(r.project.id);
    expect(useLearningStore.getState().origins[r.project.id]).toBeUndefined();
    expect(Object.keys(useLearningStore.getState().progress)).toEqual([]);
  });
});

describe('Tutorial engine (11.3)', () => {
  it('follows the nine-stage order with conditional steps', () => {
    for (const t of TUTORIALS) {
      const stages = t.steps.map((s) => s.stage);
      expect(stages).toEqual([...stages].sort((a, b) => STAGE_ORDER.indexOf(a) - STAGE_ORDER.indexOf(b)));
      expect(stages[0]).toBe('purpose');
      expect(stages.at(-1)).toBe('complete');
    }
    expect(buildTutorial(def('security-patrol')).steps.some((s) => s.id === 'design-camera')).toBe(true);
    expect(buildTutorial(def('obstacle-avoidance')).steps.some((s) => s.id === 'design-camera')).toBe(false);
    expect(buildTutorial(def('pick-and-place-arm')).steps.some((s) => s.stage === 'physical')).toBe(false);
    expect(buildTutorial(def('obstacle-avoidance')).steps.find((s) => s.stage === 'physical')!.optional).toBe(true);
    expect(buildTutorial(def('pick-and-place-arm')).steps.find((s) => s.id === 'assemble')!.verify.checks).toEqual([{ kind: 'jointActuators' }]);
  });

  it('Learn → Do → Verify against the real scene: selection, manual confirmation, persistence and resume', () => {
    const d = def('obstacle-avoidance');
    const t = findTutorial(d.tutorialId)!;
    const r = createFromDefinition(d, { kind: 'tutorial', complete: false });
    if (!r.ok) throw new Error();
    open(r.project.id);
    startTutorial(t, r.project.id);
    const ctx = { projectId: r.project.id };

    // Step 1 is manual only: it never passes on its own.
    expect(verifyStep(t, r.project.id, 0, ctx)!.status).toBe('failed');
    setManualConfirmed(t, r.project.id, 0, true);
    expect(verifyStep(t, r.project.id, 0, ctx)!.status).toBe('passed');

    // Step 2 checks the real selection.
    const fail = verifyStep(t, r.project.id, 1, ctx)!;
    expect(fail.status).toBe('failed');
    expect(fail.results.find((x) => !x.ok)!.detail).toBe('Nothing is selected.');
    useSelectionStore.getState().select(useSceneStore.getState().objects.find((o) => o.name === 'Left Wheel')!.id);
    expect(verifyStep(t, r.project.id, 1, ctx)!.results.find((x) => !x.ok)!.detail).toBe('"Left Wheel" is selected instead.');
    useSelectionStore.getState().select(useSceneStore.getState().objects.find((o) => o.name === 'Distance Sensor')!.id);
    expect(verifyStep(t, r.project.id, 1, ctx)!.status).toBe('passed');

    goToStep(t, r.project.id, 2);
    // Persisted in localStorage under arai.learning.v1 (no robot copy).
    const stored = JSON.parse(localStorage.getItem('arai.learning.v1')!).state.progress[progressKey(t.id, r.project.id)];
    expect(stored).toMatchObject({ tutorialId: t.id, projectId: r.project.id, tutorialVersion: 1, currentStep: 2, completed: ['purpose', 'components'] });
    expect(JSON.stringify(stored)).not.toContain('"objects"');
    // Resume returns the same progress.
    expect(startTutorial(t, r.project.id).currentStep).toBe(2);
    restartTutorial(t, r.project.id);
    expect(getProgress(t, r.project.id)).toMatchObject({ currentStep: 0, completed: [] });
  });

  it('drive verification uses the real validator output', () => {
    const d = def('obstacle-avoidance');
    const r = createFromDefinition(d, { kind: 'tutorial', complete: false });
    if (!r.ok) throw new Error();
    open(r.project.id);
    expect(runCheck({ kind: 'drive' }, { projectId: r.project.id }).ok).toBe(true);
    const joint = useSceneStore.getState().joints.find((j) => j.name === 'Left Wheel Joint')!;
    expect(robotModel.deleteJoint(joint.id).ok).toBe(true);
    const result = runCheck({ kind: 'drive' }, { projectId: r.project.id });
    expect(result.ok).toBe(false);
    expect(result.detail).toContain('Revolute wheel joints');
    expect(result.detail).toContain('Left Wheel: no joint');
    expect(result.where).toMatch(/Set up differential drive/);
  });

  it('arm actuators, camera, program, environment, run and save checks read real state', () => {
    const arm = createFromDefinition(def('pick-and-place-arm'), { kind: 'tutorial', complete: false });
    if (!arm.ok) throw new Error();
    open(arm.project.id);
    const missing = runCheck({ kind: 'jointActuators' }, { projectId: arm.project.id });
    expect(missing.detail).toBe('Missing on: Shoulder, Elbow, Wrist.');

    const patrol = createFromDefinition(def('security-patrol'), { kind: 'tutorial', complete: false });
    if (!patrol.ok) throw new Error();
    open(patrol.project.id);
    const ctx = { projectId: patrol.project.id };
    expect(runCheck({ kind: 'sensor', sensorType: 'camera', label: 'cam' }, ctx).ok).toBe(false);
    expect(robotModel.addCamera().ok).toBe(true);
    expect(runCheck({ kind: 'sensor', sensorType: 'camera', label: 'cam' }, ctx).ok).toBe(true);
    // The camera is unsaved: the save check sees it.
    expect(runCheck({ kind: 'saved' }, ctx).ok).toBe(false);

    const programSpec = { kind: 'program' as const, mustUse: ['robotSensors.distance', 'robotCamera.capture'], label: 'program' };
    expect(runCheck(programSpec, ctx).detail).toBe('This project has no saved program.');
    useProgramStore.getState().createProgram({ projectId: patrol.project.id, language: 'javascript', name: 'Only drive', source: 'await robotControl.drive.forward({ durationMs: 100 });' });
    expect(runCheck(programSpec, ctx).ok).toBe(false);
    const good = useProgramStore.getState().createProgram({ projectId: patrol.project.id, language: 'javascript', name: 'Patrol', source: def('security-patrol').setup.program!.source });
    if (!good.ok) throw new Error();
    expect(runCheck(programSpec, ctx)).toMatchObject({ ok: true, detail: '"Patrol" (javascript).' });

    expect(runCheck({ kind: 'environment', minObjects: 3 }, ctx).ok).toBe(false);
    useSimulationStore.setState({ settings: { ...useSimulationStore.getState().settings, environment: 'arena' } });
    expect(runCheck({ kind: 'environment', minObjects: 3 }, ctx).detail).toContain('Basic Test Arena');

    // Only COMPLETED runs of this project's programs count; physics is recorded from the engine.
    expect(runCheck({ kind: 'programRun', physics: true }, ctx).ok).toBe(false);
    bus.publish('codeStudio.execution', { sessionId: 's1', programId: good.program.id, state: 'stopped' as never });
    bus.publish('codeStudio.execution', { sessionId: 's1', programId: good.program.id, state: 'completed' });
    expect(runCheck({ kind: 'programRun', physics: false }, ctx).ok).toBe(true);
    expect(runCheck({ kind: 'programRun', physics: true }, ctx).ok).toBe(false);
    useSimulationStore.setState({ engine: 'physics' });
    bus.publish('codeStudio.execution', { sessionId: 's2', programId: good.program.id, state: 'completed' });
    expect(runCheck({ kind: 'programRun', physics: true }, ctx).ok).toBe(true);
  });

  it('optional steps can be skipped, the tutorial completes, and the summary separates verified and manual stages', () => {
    const d = def('line-following');
    const t = findTutorial(d.tutorialId)!;
    const r = createFromDefinition(d, { kind: 'tutorial', complete: false });
    if (!r.ok) throw new Error();
    startTutorial(t, r.project.id);
    const key = progressKey(t.id, r.project.id);
    // Mark every step by the same paths a user takes.
    t.steps.forEach((s, i) => {
      if (s.optional) expect(skipStep(t, r.project.id, i)).toBe(true);
      else
        useLearningStore.getState().updateProgress(key, (p) => ({ ...p, steps: { ...p.steps, [s.id]: { status: 'passed', results: [], checkedAt: 'x', manualConfirmed: s.verify.manualPrompt !== null } } }));
    });
    const progress = useLearningStore.getState().progress[key]!;
    expect(isTutorialComplete(t, progress)).toBe(true);
    const summary = summarize(t, progress, 'Build guide only');
    expect(summary.manualStages).toContain('Understand Robot Purpose');
    expect(summary.verifiedStages).toContain('Assemble Robot');
    expect(summary.skippedStages).toContain('Understand Electronics and Wiring');
    expect(skipStep(t, r.project.id, 0)).toBe(false); // required steps cannot be skipped
  });
});

describe('Reverse Engineering (11.4)', () => {
  it('reads relationships from the real hierarchy, joints, sensors, actuators and controller', () => {
    const r = createFromDefinition(def('obstacle-avoidance'), { kind: 'example', complete: true });
    if (!r.ok) throw new Error();
    open(r.project.id);
    const s = useSceneStore.getState();
    const model = { objects: s.objects, joints: s.joints, actuators: s.actuators, controllers: s.controllers, sensors: s.sensors };
    const wheel = s.objects.find((o) => o.name === 'Left Wheel')!;
    const insight = inspectComponent(model, wheel.id)!;
    expect(insight.parent?.name).toBe('Chassis');
    expect(insight.joints.map((j) => j.name)).toEqual(['Left Wheel Joint']);
    expect(insight.connected.map((c) => c.object.name)).toEqual(['Chassis']);
    expect(insight.sensors.map((x) => x.id)).toEqual(['left-encoder']);
    expect(insight.actuators).toHaveLength(1);
    expect(insight.controllers).toHaveLength(1);
    const chassis = inspectComponent(model, s.objects.find((o) => o.name === 'Chassis')!.id)!;
    expect(chassis.children.map((c) => c.name)).toEqual(expect.arrayContaining(['Left Wheel', 'Right Wheel', 'Distance Sensor', 'Top Plate']));
    expect(hierarchy(s.objects)[0]!.object.name).toBe('Chassis');
    expect(buildSequence(model)[0]!.text).toBe('Start with Chassis (top-level part).');
    // Inspection state is separate from the Builder selection.
    useLearningSession.getState().begin(r.project.id, { inspect: true });
    useLearningSession.getState().inspect(wheel.id);
    expect(useSelectionStore.getState().selectedId).toBeNull();
  });

  it('links a component to the program lines that use it, and explains the real program', () => {
    const d = def('obstacle-avoidance');
    const r = createFromDefinition(d, { kind: 'example', complete: true });
    if (!r.ok) throw new Error();
    open(r.project.id);
    const s = useSceneStore.getState();
    const model = { objects: s.objects, joints: s.joints, actuators: s.actuators, controllers: s.controllers, sensors: s.sensors };
    const sensor = inspectComponent(model, s.objects.find((o) => o.name === 'Distance Sensor')!.id)!;
    const code = programsForProject(useProgramStore.getState().programs, r.project.id)[0]!.source;
    expect(relatedProgramLines(code, sensor)).toEqual([3]);
    const lines = explainProgram(code);
    expect(lines[2]!.explanation).toContain(API_REFERENCE.find((a) => a.name === 'robotSensors.distance')!.description);
    expect(lines[2]!.explanation).toContain('stored in "sensor"');
    expect(lines.find((l) => l.code.includes('for ('))!.kind).toBe('control');
    expect(lines[0]!.kind).toBe('comment');
    expect(apiUsage(code)).toEqual(expect.arrayContaining(['robotSensors.distance', 'robotControl.turn.left', 'robotControl.drive.forward', 'robotControl.stop']));
    // A robot without a program has nothing to explain (nothing is invented).
    const plain = useProjectStore.getState().createProject({ name: 'Plain', category: 'mobile', templateId: 'explorer-bot' });
    expect(programsForProject(useProgramStore.getState().programs, plain.id)).toEqual([]);
  });
});

describe('Purpose Builder (11.5)', () => {
  it('matches goals to the six projects with reasons', () => {
    const garden = matchPurpose({ text: 'I want a robot that can move around my garden and monitor soil conditions.' });
    expect(garden.best!.def.id).toBe('agriculture-monitoring');
    expect(garden.best!.reasons.join(' ')).toMatch(/garden/);
    expect(garden.unsupported.map((u) => u.id)).toEqual(['soil']);
    expect(garden.goalUnsupported).toBe(true);

    expect(matchPurpose({ text: 'drive around my room without bumping into walls' }).best!.def.id).toBe('obstacle-avoidance');
    expect(matchPurpose({ text: 'deliver a package across the office' }).best!.def.id).toBe('delivery-robot');
    expect(matchPurpose({ text: 'patrol the warehouse at night' }).best!.def.id).toBe('security-patrol');
    const arm = matchPurpose({ text: 'pick up objects and sort them on a table' });
    expect(arm.best!.def.id).toBe('pick-and-place-arm');
    expect(arm.unsupported.map((u) => u.id)).toContain('grasp');
    expect(arm.goalUnsupported).toBe(false);
  });

  it('uses the guided answers deterministically', () => {
    const a = matchPurpose({ text: '', detect: ['distance-travelled'], where: 'warehouse', experience: 'intermediate' });
    expect(a.best!.def.id).toBe('delivery-robot');
    expect(a.best!.reasons).toEqual(expect.arrayContaining(['It measures distance traveled with wheel encoders.', 'It matches your level (intermediate).']));
    expect(matchPurpose({ text: '', detect: ['distance-travelled'], where: 'warehouse', experience: 'intermediate' })).toEqual(a);
    const beginner = matchPurpose({ text: 'camera patrol', experience: 'beginner' });
    expect(beginner.best!.reasons.join(' ')).toMatch(/harder than your level/);
  });

  it('handles unsupported and empty goals honestly', () => {
    const drone = matchPurpose({ text: 'a flying drone that films my house' });
    expect(drone.goalUnsupported).toBe(true);
    expect(drone.unsupported[0]!.missing).toMatch(/not simulated/);
    expect(drone.best!.def.id).toBe('obstacle-avoidance');
    expect(drone.best!.reasons.join(' ')).toMatch(/closest supported project/);
    const people = matchPurpose({ text: 'recognize faces of people at the door' });
    expect(people.unsupported.map((u) => u.id)).toContain('recognition');
    expect(people.best!.def.id).toBe('security-patrol');
    expect(matchPurpose({ text: 'xyz' }).best).toBeNull();
  });
});

describe('Experience modes (11.1)', () => {
  it('persists the mode in settings and never touches project data', () => {
    const p = useProjectStore.getState().createProject({ name: 'Keep Me', category: 'mobile', templateId: 'explorer-bot' });
    const before = JSON.stringify(useProjectStore.getState().projects);
    expect(useSettingsStore.getState().experienceMode).toBe('professional');
    useSettingsStore.getState().setExperienceMode('beginner');
    expect(JSON.parse(localStorage.getItem('arai.settings.v1')!).state).toMatchObject({ experienceMode: 'beginner', experienceChosen: true });
    useSettingsStore.getState().setExperienceMode('reverse');
    useSettingsStore.getState().reset();
    expect(useSettingsStore.getState().experienceMode).toBe('reverse'); // workspace reset keeps the mode
    expect(JSON.stringify(useProjectStore.getState().projects)).toBe(before);
    expect(useProjectStore.getState().projects[p.id]).toBeDefined();
    useSettingsStore.getState().setExperienceMode('professional');
  });
});
