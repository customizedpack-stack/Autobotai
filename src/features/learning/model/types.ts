/**
 * Phase 11: Guided Robotics Learning — typed, versioned definitions.
 *
 * The project catalog is separate from the user's saved projects: a definition
 * describes a learning project; "Open Robot" creates a normal RobotProject from an
 * existing template (see engine/projectFactory.ts).
 */
import type { RobotCategory } from '../../../types/project';
import type { WorkspaceMode } from '../../../stores/robotStateStore';
import type { ExperienceMode } from '../../../stores/settingsStore';

export type { ExperienceMode };

export const PROJECT_DEFINITION_VERSION = 1;
export const TUTORIAL_VERSION = 1;

export const EXPERIENCE_MODES: readonly { id: ExperienceMode; label: string; description: string }[] = [
  { id: 'beginner', label: 'Beginner', description: 'Simple language, guided steps, fewer controls at a time and a clear next action.' },
  { id: 'professional', label: 'Professional', description: 'The full workspace: builder, Code Studio, physics, sensors, cameras, environments, Blueprint and hardware.' },
  { id: 'reverse', label: 'Reverse Engineering', description: 'Take a finished robot apart (read-only) to see how it is built and how its program works.' },
];

export type Difficulty = 'beginner' | 'intermediate' | 'advanced';

/**
 * Capability statuses shown on every project. Only set after checking the implementation.
 * - supported: works in this app today
 * - simulation-only: works in simulation; no physical path
 * - build-guide: Phase 9 parts, wiring and build guide are available
 * - hardware-deployment: Phase 10 deployment works for this (Explorer Bot reference profile only)
 * - requires-configuration: possible, but the user must set something up first
 * - not-yet-supported: not implemented
 */
export type CapabilityStatus = 'supported' | 'simulation-only' | 'build-guide' | 'hardware-deployment' | 'requires-configuration' | 'not-yet-supported';

export const CAPABILITY_LABEL: Record<CapabilityStatus, string> = {
  supported: 'Supported',
  'simulation-only': 'Simulation Only',
  'build-guide': 'Physical Build Guide Available',
  'hardware-deployment': 'Hardware Deployment Available',
  'requires-configuration': 'Requires Configuration',
  'not-yet-supported': 'Not Yet Supported',
};

export interface Capability {
  id: string;
  label: string;
  status: CapabilityStatus;
  /** Why this status (what exists, what is missing). */
  note: string;
}

/** A component of the template robot, by its existing catalog component id (src/features/component-library). */
export interface RequiredComponent {
  componentId: string;
  label: string;
  count: number;
  role: string;
}

/** A real part from the Phase 9 catalog (src/features/blueprint/catalog/parts.ts), by id. */
export interface RequiredPart {
  partId: string;
  quantity: number;
  role: string;
}

/** Extra setup applied on top of the template when a ready robot is created. */
export interface RobotSetup {
  /** Add a front camera with the existing camera builder. */
  camera?: boolean;
  /** Add a position actuator (generic joint actuator) to every revolute joint without one. */
  jointActuators?: boolean;
  /** Environment to simulate in (an environment template id). */
  environmentId?: string;
  /** Starter program (real, runnable JavaScript using the documented API). */
  program?: { name: string; description: string; source: string };
}

export interface ProjectDefinition {
  id: string;
  version: number;
  name: string;
  slug: string;
  purpose: string;
  summary: string;
  description: string;
  realWorldUse: string;
  howItWorks: string[];
  difficulty: Difficulty;
  category: RobotCategory;
  /** Existing template id (src/features/robot-library/templates.ts). */
  templateId: string;
  learningObjectives: string[];
  requiredComponents: RequiredComponent[];
  /** Sensor types from the existing sensor schema. */
  requiredSensors: ('distance' | 'encoder' | 'imu' | 'camera')[];
  requiredActuators: string[];
  requiredController: string;
  /** Simulation capabilities, each with a verified status. */
  simulationCapabilities: Capability[];
  /** Physical capabilities, each with a verified status. */
  physicalRequirements: Capability[];
  /** Real parts used for the physical build (empty when none are verified). */
  parts: RequiredPart[];
  tutorialId: string;
  expectedResult: string;
  successCriteria: string[];
  setup: RobotSetup;
  /** Words the Purpose Builder matches against. */
  keywords: string[];
  environments: ('indoor' | 'outdoor' | 'warehouse' | 'garden' | 'table')[];
}

// ── Tutorials ──

export type TutorialStage =
  | 'purpose'
  | 'components'
  | 'design'
  | 'assemble'
  | 'electronics'
  | 'programming'
  | 'simulation'
  | 'physical'
  | 'complete';

export const STAGE_LABEL: Record<TutorialStage, string> = {
  purpose: 'Understand Robot Purpose',
  components: 'Explore Components',
  design: 'Design Robot in 3D',
  assemble: 'Assemble Robot',
  electronics: 'Understand Electronics and Wiring',
  programming: 'Learn Programming Logic',
  simulation: 'Run Simulation',
  physical: 'Follow Physical Build Guide',
  complete: 'Test and Complete',
};

export const STAGE_ORDER: readonly TutorialStage[] = ['purpose', 'components', 'design', 'assemble', 'electronics', 'programming', 'simulation', 'physical', 'complete'];

/** Identifiers of automatic checks (implemented in engine/checks.ts). */
export type CheckSpec =
  | { kind: 'component'; componentId: string; min: number; label: string }
  | { kind: 'selected'; componentId: string; label: string }
  | { kind: 'sensor'; sensorType: 'distance' | 'encoder' | 'imu' | 'camera'; label: string }
  | { kind: 'drive' }
  | { kind: 'jointActuators' }
  | { kind: 'program'; mustUse: string[]; label: string }
  | { kind: 'environment'; minObjects: number }
  | { kind: 'blueprintMapped'; min: number }
  | { kind: 'programRun'; physics: boolean }
  | { kind: 'saved' };

/** A "Do" action that opens a real control. */
export interface DoAction {
  label: string;
  mode?: WorkspaceMode;
  /** Use the Physics engine (the Simulate button). */
  physics?: boolean;
  /** Insert the project's starter program into Code Studio. */
  insertProgram?: boolean;
  /** Add a front camera with the existing camera builder (one undo step). */
  addCamera?: boolean;
  /** Select this environment template for the simulation. */
  environmentId?: string;
}

export interface TutorialStep {
  id: string;
  stage: TutorialStage;
  title: string;
  learn: string[];
  doText: string[];
  actions: DoAction[];
  /**
   * Automatic checks read the real project state. A manual prompt is shown, labeled
   * "Manual check", only for things the app cannot observe (understanding, what you saw).
   * The step passes when every check passes AND the manual prompt (if any) is confirmed.
   */
  verify: { checks: CheckSpec[]; manualPrompt: string | null };
  optional: boolean;
}

export interface TutorialDefinition {
  id: string;
  version: number;
  projectId: string;
  title: string;
  steps: TutorialStep[];
}

// ── Progress ──

export interface CheckResult {
  ok: boolean;
  label: string;
  /** What is missing (real validator output when there is one). */
  detail: string;
  /** Why it matters and where to fix it (only on failure). */
  why?: string;
  where?: string;
}

export interface StepRecord {
  status: 'pending' | 'passed' | 'failed' | 'skipped';
  results: CheckResult[];
  /** The user confirmed the manual prompt (never set automatically). */
  manualConfirmed: boolean;
  checkedAt: string | null;
}

export interface TutorialProgress {
  tutorialId: string;
  projectId: string;
  tutorialVersion: number;
  currentStep: number;
  completed: string[];
  steps: Record<string, StepRecord>;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
}
