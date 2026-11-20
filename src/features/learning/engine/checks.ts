/**
 * Automatic tutorial verification. Every check reads REAL state:
 * - the live scene when the project is open (unsaved edits count), otherwise the saved project;
 * - saved programs, environments, the Robot Blueprint and recorded program runs.
 * Failure messages come from the real validators where there is one (diagnoseDrive).
 */
import { useBlueprintStore } from '../../blueprint/blueprintStore';
import { useCodeStudioStore } from '../../code-studio/codeStudioStore';
import { programsForProject, useProgramStore } from '../../code-studio/storage/programStore';
import { resolveEnvironment } from '../../environment/store/environmentStore';
import { useSimulationStore } from '../../physics/simulation/simulationStore';
import { diagnoseDrive } from '../../robot-model/driveRepair';
import type { Model } from '../../robot-model/operations';
import { useProjectStore } from '../../../stores/projectStore';
import { useSceneStore } from '../../../stores/sceneStore';
import { useSelectionStore } from '../../../stores/selectionStore';
import type { CheckResult, CheckSpec } from '../model/types';
import { useLearningStore } from '../store/learningStore';

export interface CheckContext {
  projectId: string;
  /** Generates JavaScript from a saved Blockly program (injected so tests and pages need not load Blockly). */
  generateBlockly?: (source: string) => string | null;
  /** True when the open project has unsaved robot, Blueprint or program changes. */
  hasUnsaved?: () => boolean;
}

/** The project's robot model: live while it is open in the workspace, otherwise as saved. */
export function currentModel(projectId: string): Model | null {
  const scene = useSceneStore.getState();
  if (scene.projectId === projectId) return { objects: scene.objects, joints: scene.joints, actuators: scene.actuators, controllers: scene.controllers, sensors: scene.sensors };
  const p = useProjectStore.getState().projects[projectId];
  return p ? { objects: p.objects, joints: p.joints, actuators: p.actuators, controllers: p.controllers, sensors: p.sensors ?? [] } : null;
}

const pass = (label: string, detail: string): CheckResult => ({ ok: true, label, detail });
const fail = (label: string, detail: string, why: string, where: string): CheckResult => ({ ok: false, label, detail, why, where });

function environmentOf(projectId: string): string {
  const scene = useSceneStore.getState();
  if (scene.projectId === projectId) return useSimulationStore.getState().settings.environment;
  return useProjectStore.getState().projects[projectId]?.environmentId ?? 'floor';
}

export function programSources(ctx: CheckContext): { name: string; code: string | null; language: string; id: string }[] {
  const programs = programsForProject(useProgramStore.getState().programs, ctx.projectId);
  return programs.map((p) => ({ id: p.id, name: p.name, language: p.language, code: p.language === 'javascript' ? p.source : (ctx.generateBlockly?.(p.source) ?? null) }));
}

export function runCheck(spec: CheckSpec, ctx: CheckContext): CheckResult {
  const model = currentModel(ctx.projectId);
  if (!model) return fail('Project', 'The project no longer exists in this browser.', 'The tutorial checks a real project.', 'My Projects');
  const componentCount = (id: string) => model.objects.filter((o) => o.metadata.componentId === id).length;

  switch (spec.kind) {
    case 'component': {
      const n = componentCount(spec.componentId);
      return n >= spec.min
        ? pass(spec.label, `${n} found.`)
        : fail(spec.label, `${n} of ${spec.min} found.`, 'The robot needs this part to work as designed.', 'Build → Library: drag the part onto the robot, or undo the change that removed it.');
    }
    case 'selected': {
      const id = useSelectionStore.getState().selectedId;
      const selected = id ? model.objects.find((o) => o.id === id) : undefined;
      if (selected && selected.metadata.componentId === spec.componentId) return pass(spec.label, `"${selected.name}" is selected.`);
      return fail(spec.label, selected ? `"${selected.name}" is selected instead.` : 'Nothing is selected.', 'Selecting a part shows its settings and highlights it in 3D.', 'Build → Objects list on the left, or click the part in the 3D view.');
    }
    case 'sensor': {
      const sensors = (model.sensors ?? []).filter((s) => s.type === spec.sensorType);
      return sensors.length > 0
        ? pass(spec.label, sensors.map((s) => s.id).join(', '))
        : fail(spec.label, `No ${spec.sensorType} sensor is configured.`, `The program reads this ${spec.sensorType} sensor.`, spec.sensorType === 'camera' ? 'Build → Inspector → Sensors → Camera, or "Add a camera" in this step.' : 'Build → Inspector → Sensors.');
    }
    case 'drive': {
      const diagnosis = diagnoseDrive(model);
      const controller = model.controllers.find((c) => c.type === 'differentialDrive');
      const failed = diagnosis.checks.filter((c) => !c.ok);
      if (diagnosis.ready && controller) return pass('Differential drive', `${controller.name}: ${diagnosis.checks.map((c) => c.label).join(', ')}.`);
      const detail = failed.length
        ? failed.map((c) => `${c.label}: ${c.detail}`).join(' · ')
        : diagnosis.errors.length
          ? diagnosis.errors.join(' ')
          : 'The wheels are ready, but no differential-drive controller is configured.';
      return fail(
        'Differential drive',
        detail,
        'Your robot needs two revolute wheel joints on the chassis, two motors and a differential-drive controller before it can drive.',
        'Build → Inspector → "Set up differential drive".',
      );
    }
    case 'jointActuators': {
      const revolute = model.joints.filter((j) => j.type === 'revolute');
      const missing = revolute.filter((j) => !model.actuators.some((a) => a.jointId === j.id && a.controlMode === 'position' && a.enabled));
      if (revolute.length > 0 && missing.length === 0) return pass('Every revolute joint has a position actuator', revolute.map((j) => j.name).join(', '));
      return fail(
        'Every revolute joint has a position actuator',
        revolute.length === 0 ? 'The robot has no revolute joints.' : `Missing on: ${missing.map((j) => j.name).join(', ')}.`,
        'A joint only moves when an actuator drives it; the program sets targets on these actuators.',
        'Build → click the joint marker → Inspector → Actuator → Generic Joint Actuator or Servo.',
      );
    }
    case 'program': {
      const sources = programSources(ctx);
      if (sources.length === 0) return fail(spec.label, 'This project has no saved program.', 'The robot only does what its program tells it.', 'Code → New program, or "Insert starter program" in this step. Then Save.');
      const match = sources.find((s) => s.code !== null && spec.mustUse.every((u) => s.code!.includes(u)));
      if (match) return pass(spec.label, `"${match.name}" (${match.language}).`);
      const drafts = Object.keys(useCodeStudioStore.getState().drafts).length;
      return fail(
        spec.label,
        `None of the saved programs (${sources.map((s) => `"${s.name}"`).join(', ')}) uses ${spec.mustUse.map((u) => u.replace(/\.$/, '')).join(' and ')}.${drafts > 0 ? ' A program has unsaved edits: click Save in Code Studio.' : ''}`,
        'The program has to read the sensors and drive the actuators this project is about.',
        'Code Studio: edit the program (or insert the starter program) and click Save.',
      );
    }
    case 'environment': {
      const id = environmentOf(ctx.projectId);
      const env = resolveEnvironment(id);
      const objects = env.objects.filter((o) => o.kind !== 'ground').length;
      return objects >= spec.minObjects
        ? pass(`Test environment with obstacles`, `"${env.name}" with ${objects} objects.`)
        : fail(`Test environment with obstacles`, `"${env.name}" has ${objects} objects; at least ${spec.minObjects} are needed.`, 'Sensors need real objects to detect.', 'Use the environment button in this step, or Simulate → environment menu, or build one in the Environment Editor.');
    }
    case 'blueprintMapped': {
      const bp = useBlueprintStore.getState();
      const mappings = bp.projectId === ctx.projectId ? bp.blueprint.mappings : (useProjectStore.getState().projects[ctx.projectId]?.blueprint?.mappings ?? []);
      return mappings.length >= spec.min
        ? pass(`At least ${spec.min} parts mapped to real parts`, `${mappings.length} mapped.`)
        : fail(`At least ${spec.min} parts mapped to real parts`, `${mappings.length} mapped.`, 'Mapping turns the 3D placeholders into a real shopping and wiring plan.', 'Blueprint → Real Parts → Map.');
    }
    case 'programRun': {
      const ids = new Set(programsForProject(useProgramStore.getState().programs, ctx.projectId).map((p) => p.id));
      const runs = (useLearningStore.getState().runs[ctx.projectId] ?? []).filter((r) => ids.has(r.programId) && (!spec.physics || r.physics));
      const label = spec.physics ? 'A program finished a run in the Physics engine' : 'A program finished a run';
      if (runs.length > 0) return pass(label, `Last run ${new Date(runs[runs.length - 1]!.completedAt).toLocaleTimeString()}.`);
      return fail(
        label,
        'No completed run was recorded for this project yet (stopped or failed runs do not count).',
        spec.physics ? 'Distance sensors only measure in the Physics engine.' : 'Running the program is how you see whether it works.',
        spec.physics ? 'Click Simulate, then Run in Code Studio, and let the program finish.' : 'Code Studio → Run, and let the program finish.',
      );
    }
    case 'saved': {
      const open = useSceneStore.getState().projectId === ctx.projectId;
      const unsaved = open && (ctx.hasUnsaved?.() ?? (useSceneStore.getState().dirty || useBlueprintStore.getState().dirty));
      return unsaved ? fail('Project saved', 'There are unsaved changes.', 'Saving keeps your work in this browser.', 'Click Save in the top bar (Ctrl+S).') : pass('Project saved', 'No unsaved changes.');
    }
  }
}

export function runChecks(specs: readonly CheckSpec[], ctx: CheckContext): CheckResult[] {
  return specs.map((s) => runCheck(s, ctx));
}
