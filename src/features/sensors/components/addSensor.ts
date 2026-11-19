import { useSceneStore } from '../../../stores/sceneStore';
import type { RobotSensor, SensorType } from '../../../types/sensor';
import { robotModel } from '../../robot-model/robotModelConnector';
import { defaultDistance, defaultEncoder, defaultImu, uniqueSensorId } from '../config/sensorConfig';

/** A new sensor of `type` with sensible defaults for this robot (null when nothing fits). */
function newSensor(type: SensorType, partId?: string): RobotSensor | null {
  const { objects, joints, sensors, controllers } = useSceneStore.getState();
  const root = controllers[0] ? objects.find((o) => o.id === controllers[0]!.rootComponentId) : objects.find((o) => o.parentId === null && o.category !== 'joint');
  if (type === 'distance') {
    const part = partId ?? objects.find((o) => o.category === 'sensor')?.id ?? root?.id;
    return part ? defaultDistance(part, uniqueSensorId('distance', sensors), 'Distance Sensor') : null;
  }
  if (type === 'imu') {
    const part = partId ?? objects.find((o) => o.metadata.componentId === 'sensor-imu')?.id ?? root?.id;
    return part ? defaultImu(part, uniqueSensorId('imu', sensors), 'IMU') : null;
  }
  const joint = joints.find((j) => j.type === 'revolute' && (!partId || j.childId === partId) && !sensors.some((s) => s.type === 'encoder' && s.jointId === j.id));
  return joint ? defaultEncoder(joint.id, uniqueSensorId('encoder', sensors), `${joint.name} Encoder`) : null;
}

export function addSensorOfType(type: SensorType, partId?: string): string | null {
  if (type === 'camera') {
    const result = robotModel.addCamera(partId);
    return result.ok ? null : result.errors.join(' ');
  }
  const sensor = newSensor(type, partId);
  if (!sensor) return type === 'encoder' ? 'No revolute joint without an encoder.' : 'Add a part first.';
  const result = robotModel.addSensor(sensor);
  return result.ok ? null : result.errors.join(' ');
}

