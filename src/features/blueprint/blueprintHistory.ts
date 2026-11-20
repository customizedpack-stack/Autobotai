import { bus } from '../../core/bus/connectorBus';
import { useSceneStore } from '../../stores/sceneStore';
import { useProgramStore } from '../code-studio/storage/programStore';
import { useBlueprintStore } from './blueprintStore';

/**
 * Build History from robot model and Code Studio events.
 *
 * Only discrete design events are recorded (one entry per change). Physics
 * ticks, sensor readings, camera frames and simulation state changes are never
 * recorded, so the log stays small (it is also capped at 1000 entries).
 */

let connected = false;

const nameOfObject = (id: string) => useSceneStore.getState().objects.find((o) => o.id === id)?.name ?? id;
const nameOfJoint = (id: string) => useSceneStore.getState().joints.find((j) => j.id === id)?.name ?? id;
const nameOfActuator = (id: string) => useSceneStore.getState().actuators.find((a) => a.id === id)?.name ?? id;
const record = useBlueprintStore.getState;

export function connectBlueprintHistory(): void {
  if (connected) return;
  connected = true;
  bus.subscribe('robotModel.componentAdded', (e) => record().record([{ type: 'component.added', component: e.name, previous: '', next: '', note: '' }]));
  bus.subscribe('robotModel.componentRemoved', (e) => {
    const mapped = record().blueprint.mappings.some((m) => m.targetKind === 'component' && m.targetId === e.componentId);
    record().record([{ type: 'component.removed', component: e.name, previous: '', next: '', note: mapped ? 'Its real-part mapping is kept and flagged in Real Parts.' : '' }]);
  });
  bus.subscribe('robotModel.jointCreated', (e) => record().record([{ type: 'joint.changed', component: nameOfJoint(e.jointId), previous: '', next: `${e.type} joint created`, note: `${nameOfObject(e.parentId)} → ${nameOfObject(e.childId)}` }]));
  bus.subscribe('robotModel.jointUpdated', (e) => record().record([{ type: 'joint.changed', component: nameOfJoint(e.jointId), previous: '', next: `Changed: ${e.changed.join(', ')}`, note: '' }]));
  bus.subscribe('robotModel.jointDeleted', (e) => record().record([{ type: 'joint.changed', component: `${nameOfObject(e.parentId)} → ${nameOfObject(e.childId)}`, previous: 'Joint', next: 'Deleted', note: '' }]));
  bus.subscribe('robotModel.actuatorCreated', (e) => record().record([{ type: 'motor.changed', component: nameOfActuator(e.actuatorId), previous: '', next: `${e.type} created`, note: '' }]));
  bus.subscribe('robotModel.actuatorUpdated', (e) => record().record([{ type: 'motor.changed', component: nameOfActuator(e.actuatorId), previous: '', next: `Changed: ${e.changed.join(', ')}`, note: '' }]));
  bus.subscribe('robotModel.actuatorDeleted', (e) => record().record([{ type: 'motor.changed', component: e.actuatorId, previous: 'Motor', next: 'Deleted', note: '' }]));
  bus.subscribe('robotModel.sensorChanged', (e) => {
    const sensor = useSceneStore.getState().sensors.find((s) => s.id === e.sensorId);
    record().record([{ type: 'sensor.changed', component: sensor?.name ?? e.sensorId, previous: e.previousId ?? '', next: e.change, note: '' }]);
  });
  bus.subscribe('codeStudio.programChanged', (e) => {
    if (e.projectId !== record().projectId) return;
    const program = useProgramStore.getState().programs[e.programId];
    record().record([{ type: 'program.changed', component: program?.name ?? 'Program', previous: '', next: e.change, note: '' }]);
  });
  bus.subscribe('codeStudio.execution', (e) => {
    if (e.state !== 'completed') return;
    const program = useProgramStore.getState().programs[e.programId];
    record().record([{ type: 'simulation.completed', component: program?.name ?? 'Program', previous: '', next: 'Completed', note: 'Code Studio run finished in the simulator.' }]);
  });
}
