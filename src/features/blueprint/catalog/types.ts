/**
 * Phase 9: Real-World Parts Library types.
 *
 * Rule: a field that the source does not state is left `undefined` and shown as
 * "Unknown". Nothing is estimated. Every part names the document it was taken
 * from and the date it was checked.
 */

export type PartCategory = 'mechanical' | 'motor' | 'controller' | 'driver' | 'sensor' | 'camera' | 'power';

export const PART_CATEGORIES: readonly { id: PartCategory; label: string; covers: string }[] = [
  { id: 'mechanical', label: 'Mechanical', covers: 'Chassis, wheels, casters, bearings, shafts, brackets, plates, screws, gears' },
  { id: 'motor', label: 'Motors', covers: 'DC geared motors, servo motors, stepper motors, linear actuators' },
  { id: 'controller', label: 'Controllers', covers: 'ESP32, Arduino, Raspberry Pi, Jetson' },
  { id: 'driver', label: 'Motor drivers', covers: 'TB6612FNG, L298N, BTS7960, stepper drivers' },
  { id: 'sensor', label: 'Sensors', covers: 'Ultrasonic, time-of-flight, IMU, encoders, IR, GPS, LiDAR' },
  { id: 'camera', label: 'Cameras', covers: 'USB cameras, Raspberry Pi cameras, depth cameras' },
  { id: 'power', label: 'Power', covers: 'Batteries, regulators, DC-DC converters, distribution, BMS' },
];

/** What kind of part inside its category. Used by the compatibility engine. */
export type PartRole =
  | 'wheel'
  | 'caster'
  | 'bracket'
  | 'dc-gearmotor'
  | 'dual-motor-driver'
  | 'microcontroller-board'
  | 'single-board-computer'
  | 'distance-sensor'
  | 'battery-cell'
  | 'battery-holder'
  | 'step-down-regulator';

/** How the data was verified. */
export type VerificationLevel =
  /** Every listed field was read on the manufacturer's own page or datasheet. */
  | 'verified'
  /** Listed fields come from the manufacturer, but some were taken from a reseller copy of the manufacturer's table, or many fields are unknown. */
  | 'partial'
  /** Generic or unbranded part: the specs come from one datasheet and clones can differ. */
  | 'unverified';

export interface PartSource {
  /** Page the data was read from (https only). */
  url: string;
  kind: 'manufacturer' | 'manufacturer-datasheet' | 'reseller-copy' | 'generic-datasheet';
  /** ISO date (YYYY-MM-DD) the data was checked. */
  verifiedAt: string;
  note?: string;
}

export interface VerifiedPrice {
  amount: number;
  currency: 'USD';
  /** Price for this many units bought together (1 = single unit price). */
  forQuantity: number;
  /** Page that showed the price. */
  url: string;
  checkedAt: string;
}

/**
 * Specifications. Every field is optional: absent = unknown.
 * Units are in the field name. Text fields quote the source.
 */
export interface PartSpecs {
  // Physical
  lengthMm?: number;
  widthMm?: number;
  heightMm?: number;
  weightG?: number;
  // Electrical supply
  supplyVoltageMinV?: number;
  supplyVoltageMaxV?: number;
  nominalVoltageV?: number;
  typicalCurrentA?: number;
  maxCurrentA?: number;
  powerW?: number;
  // Logic and signals
  logicVoltageV?: number;
  logicVoltageMinV?: number;
  logicVoltageMaxV?: number;
  /** Highest voltage a GPIO input accepts. */
  gpioMaxInputV?: number;
  /** Voltage of the signal the part outputs (for example an echo pin). */
  signalOutputV?: number;
  gpioCount?: number;
  pwmCount?: number;
  gpioCurrentMaxA?: number;
  interfaces?: string[];
  // Motors
  ratedVoltageV?: number;
  noLoadCurrentA?: number;
  stallCurrentA?: number;
  noLoadSpeedRpm?: number;
  stallTorqueKgCm?: number;
  gearRatio?: string;
  // Shafts, wheels, mounting
  shaftDiameterMm?: number;
  shaftType?: 'D' | 'round';
  boreDiameterMm?: number;
  boreType?: 'D' | 'round';
  wheelDiameterMm?: number;
  mountingHoleSpacingMm?: number;
  screwSize?: string;
  // Drivers
  channels?: number;
  motorVoltageMinV?: number;
  motorVoltageMaxV?: number;
  continuousCurrentPerChannelA?: number;
  peakCurrentPerChannelA?: number;
  // Power
  outputVoltageV?: number;
  outputCurrentMaxA?: number;
  inputVoltageMinV?: number;
  inputVoltageMaxV?: number;
  cellCount?: number;
  cellType?: string;
  capacityMah?: number;
  // Sensors
  rangeMinCm?: number;
  rangeMaxCm?: number;
}

export interface CatalogPart {
  /** Stable id: `<manufacturer>-<part number>`. Projects reference parts by this id. */
  id: string;
  manufacturer: string;
  /** Manufacturer part number (null = not verified). */
  mpn: string | null;
  name: string;
  category: PartCategory;
  role: PartRole;
  description: string;
  datasheetUrl: string | null;
  officialUrl: string | null;
  specs: PartSpecs;
  /** Units in one purchasable item (for example 2 for a wheel pair). */
  packQuantity: number;
  /** Mounting notes quoted from the source, or null when unknown. */
  mounting: string | null;
  /** Extra source lines shown verbatim in the part details. */
  notes: string[];
  price: VerifiedPrice | null;
  /** Why the price is missing, when it is. */
  priceNote?: string;
  /** Availability is never claimed. Only the manufacturer's lifecycle status, when it was shown. */
  lifecycleStatus: string | null;
  /** No image is bundled: none of the sources grant an image license. */
  imageUrl: null;
  source: PartSource;
  verification: VerificationLevel;
}

/** Spec rows shown in the UI, with labels and units. Order matters. */
export const SPEC_LABELS: readonly { key: keyof PartSpecs; label: string; unit: string }[] = [
  { key: 'lengthMm', label: 'Length', unit: 'mm' },
  { key: 'widthMm', label: 'Width', unit: 'mm' },
  { key: 'heightMm', label: 'Height', unit: 'mm' },
  { key: 'weightG', label: 'Weight', unit: 'g' },
  { key: 'ratedVoltageV', label: 'Rated voltage', unit: 'V' },
  { key: 'nominalVoltageV', label: 'Nominal voltage', unit: 'V' },
  { key: 'supplyVoltageMinV', label: 'Supply voltage min', unit: 'V' },
  { key: 'supplyVoltageMaxV', label: 'Supply voltage max', unit: 'V' },
  { key: 'typicalCurrentA', label: 'Typical current', unit: 'A' },
  { key: 'maxCurrentA', label: 'Max current', unit: 'A' },
  { key: 'powerW', label: 'Power', unit: 'W' },
  { key: 'logicVoltageV', label: 'Logic voltage', unit: 'V' },
  { key: 'logicVoltageMinV', label: 'Logic voltage min', unit: 'V' },
  { key: 'logicVoltageMaxV', label: 'Logic voltage max', unit: 'V' },
  { key: 'gpioMaxInputV', label: 'GPIO max input', unit: 'V' },
  { key: 'signalOutputV', label: 'Signal output level', unit: 'V' },
  { key: 'gpioCount', label: 'Digital I/O pins', unit: '' },
  { key: 'pwmCount', label: 'PWM pins', unit: '' },
  { key: 'gpioCurrentMaxA', label: 'Current per I/O pin', unit: 'A' },
  { key: 'noLoadCurrentA', label: 'No-load current', unit: 'A' },
  { key: 'stallCurrentA', label: 'Stall current', unit: 'A' },
  { key: 'noLoadSpeedRpm', label: 'No-load speed', unit: 'rpm' },
  { key: 'stallTorqueKgCm', label: 'Stall torque', unit: 'kg·cm' },
  { key: 'gearRatio', label: 'Gear ratio', unit: '' },
  { key: 'shaftDiameterMm', label: 'Shaft diameter', unit: 'mm' },
  { key: 'shaftType', label: 'Shaft type', unit: '' },
  { key: 'boreDiameterMm', label: 'Bore (shaft hole)', unit: 'mm' },
  { key: 'boreType', label: 'Bore type', unit: '' },
  { key: 'wheelDiameterMm', label: 'Wheel diameter', unit: 'mm' },
  { key: 'mountingHoleSpacingMm', label: 'Mounting hole spacing', unit: 'mm' },
  { key: 'screwSize', label: 'Screw size', unit: '' },
  { key: 'channels', label: 'Motor channels', unit: '' },
  { key: 'motorVoltageMinV', label: 'Motor voltage min', unit: 'V' },
  { key: 'motorVoltageMaxV', label: 'Motor voltage max', unit: 'V' },
  { key: 'continuousCurrentPerChannelA', label: 'Continuous current / channel', unit: 'A' },
  { key: 'peakCurrentPerChannelA', label: 'Peak current / channel', unit: 'A' },
  { key: 'inputVoltageMinV', label: 'Input voltage min', unit: 'V' },
  { key: 'inputVoltageMaxV', label: 'Input voltage max', unit: 'V' },
  { key: 'outputVoltageV', label: 'Output voltage', unit: 'V' },
  { key: 'outputCurrentMaxA', label: 'Output current max', unit: 'A' },
  { key: 'cellCount', label: 'Cells', unit: '' },
  { key: 'cellType', label: 'Cell type', unit: '' },
  { key: 'capacityMah', label: 'Capacity (min)', unit: 'mAh' },
  { key: 'rangeMinCm', label: 'Range min', unit: 'cm' },
  { key: 'rangeMaxCm', label: 'Range max', unit: 'cm' },
  { key: 'interfaces', label: 'Interfaces', unit: '' },
];

/** Spec keys the engines need per role. Missing ones are listed as "missing information". */
export const IMPORTANT_SPECS: Record<PartRole, (keyof PartSpecs)[]> = {
  wheel: ['wheelDiameterMm', 'boreDiameterMm', 'weightG'],
  caster: ['heightMm', 'mountingHoleSpacingMm', 'weightG'],
  bracket: ['weightG', 'mountingHoleSpacingMm'],
  'dc-gearmotor': ['ratedVoltageV', 'stallCurrentA', 'noLoadCurrentA', 'shaftDiameterMm', 'weightG', 'lengthMm'],
  'dual-motor-driver': ['motorVoltageMinV', 'motorVoltageMaxV', 'continuousCurrentPerChannelA', 'peakCurrentPerChannelA', 'logicVoltageMinV', 'logicVoltageMaxV'],
  'microcontroller-board': ['logicVoltageV', 'gpioMaxInputV', 'gpioCount', 'interfaces', 'weightG'],
  'single-board-computer': ['logicVoltageV', 'gpioMaxInputV', 'gpioCount', 'interfaces', 'weightG'],
  'distance-sensor': ['supplyVoltageMinV', 'supplyVoltageMaxV', 'typicalCurrentA', 'signalOutputV', 'interfaces'],
  'battery-cell': ['nominalVoltageV', 'capacityMah', 'maxCurrentA'],
  'battery-holder': ['cellCount', 'cellType'],
  'step-down-regulator': ['inputVoltageMinV', 'inputVoltageMaxV', 'outputVoltageV', 'outputCurrentMaxA'],
};
