import type { JointType } from '../../types/joint';

/** Marker and badge colors per joint type (shared by viewport, tree and inspector). */
export const JOINT_COLORS: Record<JointType, string> = {
  revolute: '#A855F7',
  prismatic: '#06B6D4',
  fixed: '#94A3B8',
};
