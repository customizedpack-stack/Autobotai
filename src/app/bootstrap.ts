/**
 * Runs before any store is created (imported first by main.tsx), so that
 * messages logged during store hydration and migration reach the console.
 */
import { connectBlueprintHistory } from '../features/blueprint/blueprintHistory';
import { connectProgramStore } from '../features/code-studio/storage/programStore';
import { connectHardwareRuntime } from '../features/hardware/connectionManager';
import { connectCommandBus } from '../features/controls/commandBus';
import { connectRobotModelConnector } from '../features/robot-model/robotModelConnector';
import { connectConsoleToBus } from '../stores/consoleStore';

connectConsoleToBus();
connectRobotModelConnector();
connectCommandBus();
connectProgramStore();
connectBlueprintHistory();
connectHardwareRuntime();
