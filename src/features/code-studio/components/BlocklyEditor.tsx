import { useEffect, useRef } from 'react';
import { Blockly, setupBlockly } from '../blockly/blocklySetup';
import { loadWorkspace, saveWorkspace } from '../blockly/generator';
import { TOOLBOX } from '../blockly/toolbox';
import { editors } from '../editorRegistry';
import { log } from '../../../utils/logger';

let theme: Blockly.Theme | null = null;
function arai(): Blockly.Theme {
  theme ??= Blockly.Theme.defineTheme('arai-dark', {
    name: 'arai-dark',
    base: Blockly.Themes.Classic,
    componentStyles: {
      workspaceBackgroundColour: '#0d0f13',
      toolboxBackgroundColour: '#191d24',
      toolboxForegroundColour: '#e2e8f0',
      flyoutBackgroundColour: '#1e232b',
      flyoutForegroundColour: '#cbd5e1',
      flyoutOpacity: 0.97,
      scrollbarColour: '#303641',
      scrollbarOpacity: 0.7,
      insertionMarkerColour: '#ffffff',
      insertionMarkerOpacity: 0.3,
      cursorColour: '#3b82f6',
    },
    fontStyle: { family: 'Inter, ui-sans-serif, system-ui, sans-serif', size: 11, weight: '500' },
    startHats: true,
  });
  return theme;
}

interface BlocklyEditorProps {
  /** Saved or draft workspace JSON. Remount (key) to load another program. */
  initialSource: string;
  /** Called after loading with the editor's own serialization (the "unchanged" baseline). */
  onLoaded: (serialized: string, missingJoints: string[]) => void;
  /** Called after every user change with the new serialization. */
  onChange: (serialized: string) => void;
}

/** Blockly workspace with the AutoBotAI toolbox. Blockly owns its DOM; React only mounts it. */
export function BlocklyEditor({ initialSource, onLoaded, onChange }: BlocklyEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onLoaded, onChange });
  callbacks.current = { onLoaded, onChange };

  useEffect(() => {
    if (!host.current) return;
    setupBlockly();
    const workspace = Blockly.inject(host.current, {
      toolbox: TOOLBOX,
      // Blockly's icons are served with the app (public/blockly-media), not from static.blockly.com.
      media: `${import.meta.env.BASE_URL}blockly-media/`,
      theme: arai(),
      renderer: 'zelos',
      trashcan: true,
      sounds: false,
      grid: { spacing: 24, length: 2, colour: '#1f2530', snap: true },
      zoom: { controls: true, wheel: true, startScale: 0.75, maxScale: 2, minScale: 0.35, scaleSpeed: 1.15 },
      move: { scrollbars: true, drag: true, wheel: false },
    });
    const loaded = loadWorkspace(workspace, initialSource);
    if (!loaded.ok) log.error('code', `This block program could not be fully loaded: ${loaded.error}`);
    if (loaded.missingJoints.length > 0) {
      log.warning('code', `${loaded.missingJoints.length} block(s) refer to a joint that no longer exists. Choose a joint again before running.`);
    }
    callbacks.current.onLoaded(saveWorkspace(workspace), loaded.missingJoints);
    workspace.scrollCenter();

    const listener = (event: Blockly.Events.Abstract) => {
      if (event.isUiEvent || workspace.isDragging()) return;
      callbacks.current.onChange(saveWorkspace(workspace));
    };
    workspace.addChangeListener(listener);
    editors.setBlockly(workspace);
    if ((window as unknown as { __ARAI_E2E__?: boolean }).__ARAI_E2E__) {
      (window as unknown as Record<string, unknown>).__araiBlockly = { workspace, Blockly };
    }

    const resize = new ResizeObserver(() => Blockly.svgResize(workspace));
    resize.observe(host.current);
    return () => {
      resize.disconnect();
      if (editors.blockly() === workspace) editors.setBlockly(null);
      workspace.removeChangeListener(listener);
      workspace.dispose();
    };
    // Blockly owns the workspace after mount; a new program remounts this component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={host} className="absolute inset-0" data-testid="blockly-editor" data-code-editor="blockly" />;
}
