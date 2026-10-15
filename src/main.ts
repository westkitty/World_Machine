import './styles.css';
import { App } from './app/App';

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2');
  } catch {
    return false;
  }
}

const root = document.getElementById('app')!;
const boot = document.getElementById('boot')!;
if (!webglAvailable()) {
  boot.textContent = 'The World Machine needs WebGL 2. Please use a current version of Chrome, Edge, Firefox or Safari with hardware acceleration enabled.';
} else {
  // Let the boot message paint before world generation blocks the thread.
  // (setTimeout, not requestAnimationFrame: rAF never fires in a hidden tab.)
  setTimeout(() => {
    try {
      const app = new App(root);
      boot.remove();
      app.hud.openTitle();
      (window as unknown as { worldMachine: App }).worldMachine = app;
    } catch (e) {
      boot.textContent = `Failed to start: ${(e as Error).message}`;
      throw e;
    }
  }, 30);
}
