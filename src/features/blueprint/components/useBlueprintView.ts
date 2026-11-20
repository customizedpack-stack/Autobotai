import { useEffect, useMemo, useState } from 'react';
import { useSceneStore } from '../../../stores/sceneStore';
import { programsForProject, useProgramStore } from '../../code-studio/storage/programStore';
import { dataOf, useBlueprintStore } from '../blueprintStore';
import { catalogIfLoaded, loadCatalog, type LoadedCatalog } from '../catalog/catalog';
import { buildBom } from '../engine/bom';
import { checkCompatibility, statusByMapping } from '../engine/compatibility';
import { generateGuide } from '../engine/guide';
import { orphanMappings, virtualComponents, type ModelView } from '../engine/virtualComponents';
import { validateWiring } from '../engine/wiring';

export function useCatalog(): { catalog: LoadedCatalog | null; error: string | null } {
  const [catalog, setCatalog] = useState<LoadedCatalog | null>(catalogIfLoaded());
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (catalog) return;
    let alive = true;
    loadCatalog()
      .then((c) => alive && setCatalog(c))
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [catalog]);
  return { catalog, error };
}

/** Everything the Blueprint tabs show, derived from the robot model and the blueprint. */
export function useBlueprintView() {
  const objects = useSceneStore((s) => s.objects);
  const joints = useSceneStore((s) => s.joints);
  const actuators = useSceneStore((s) => s.actuators);
  const controllers = useSceneStore((s) => s.controllers);
  const sensors = useSceneStore((s) => s.sensors);
  const projectId = useSceneStore((s) => s.projectId);
  const blueprint = useBlueprintStore((s) => s.blueprint);
  const programs = useProgramStore((s) => s.programs);
  const { catalog, error } = useCatalog();

  return useMemo(() => {
    const model: ModelView = { objects, joints, actuators, controllers, sensors };
    const data = dataOf(blueprint);
    const vcs = virtualComponents(model, data);
    const orphans = orphanMappings(model, data);
    const checks = checkCompatibility(model, data, catalog?.byId);
    const byMapping = statusByMapping(checks, data);
    const bom = buildBom(model, data, checks);
    const wiring = validateWiring(model, data);
    const programNames = projectId ? programsForProject(programs, projectId).map((p) => p.name) : [];
    const guide = generateGuide({ model, data, checks, wiring, programNames });
    return { model, data, blueprint, vcs, orphans, checks, byMapping, bom, wiring, guide, catalog, catalogError: error };
  }, [objects, joints, actuators, controllers, sensors, blueprint, catalog, error, programs, projectId]);
}

export type BlueprintView = ReturnType<typeof useBlueprintView>;
