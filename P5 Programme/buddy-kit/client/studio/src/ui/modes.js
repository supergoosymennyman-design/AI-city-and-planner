import { Dropdown } from './dropdown.js';

const MODES = [
  { id: 'build', label: '🧱 Build' },
  { id: 'rig', label: '🔧 Rig' },
  { id: 'pose', label: '🧍 Pose' },
  { id: 'fit', label: '🎽 Fit' },
];

export class ModeBar {
  constructor(container, studio) {
    this.studio = studio;
    this.dd = new Dropdown(
      MODES[0].label,
      MODES.map((m) => ({
        label: m.label,
        active: () => studio.mode === m.id,
        fn: () => studio.setMode(m.id),
      })),
      'select',
    );
    container.appendChild(this.dd.el);
    studio.on('mode', (mode) => {
      const m = MODES.find((x) => x.id === mode);
      this.dd.setLabel(m ? m.label : mode);
      this.dd.render();
    });
  }
}
