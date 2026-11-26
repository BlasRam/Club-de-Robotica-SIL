const esc = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

type Stage = { title: string; caption: string; note: string; resistor: boolean; led: boolean; wires: boolean; highlight: 'board' | 'resistor' | 'led' | 'check' | 'code' };

const blinkStages: Stage[] = [
  { title: 'Prepara la placa y la protoboard', caption: 'Ubica las filas numeradas y los grupos de cinco agujeros conectados.', note: 'Deja el cable USB desconectado mientras armas el circuito.', resistor: false, led: false, wires: false, highlight: 'board' },
  { title: 'Coloca la resistencia', caption: 'Pon una pata en la fila 16 y la otra en la fila 22, en el mismo lado de la ranura central.', note: 'La resistencia no tiene polaridad: sus patas se pueden intercambiar.', resistor: true, led: false, wires: false, highlight: 'resistor' },
  { title: 'Añade el LED y los cables', caption: 'Pata larga del LED en fila 22; pata corta en fila 26. D9 va a fila 16 y GND a fila 26.', note: 'Así queda en serie: D9 → resistencia → LED → GND. La fila 22 une resistencia y pata larga.', resistor: true, led: true, wires: true, highlight: 'led' },
  { title: 'Revisa el montaje antes de encender', caption: 'Compara cada conexión con el esquema y confirma la orientación del LED.', note: 'Si algo no coincide, corrígelo con el USB desconectado.', resistor: true, led: true, wires: true, highlight: 'check' },
  { title: 'Carga el programa y observa', caption: 'Conecta el USB solo después de revisar el circuito. Sube el código de la guía.', note: 'El LED debe encenderse medio segundo y apagarse medio segundo.', resistor: true, led: true, wires: true, highlight: 'code' },
];

function circle(x: number, y: number, active: boolean) {
  return `<circle cx="${x}" cy="${y}" r="5.2" fill="${active ? '#fff1bf' : '#d8e2e8'}" stroke="${active ? '#bd3345' : '#8da1af'}" stroke-width="${active ? 2.2 : 1}"/>`;
}

function blinkDiagram(stage: Stage, index: number): string {
  const rowY = (row: number) => 92 + (row - 14) * 13.5;
  const cols = [286, 307, 328, 349, 370];
  const holes = Array.from({ length: 15 }, (_, i) => {
    const row = i + 14;
    return cols.map((x, j) => circle(x, rowY(row), (stage.highlight === 'board' && [16, 22, 26].includes(row)) || (stage.highlight !== 'board' && [16, 22, 26].includes(row) && [0, 4].includes(j)))).join('');
  }).join('');
  const rowTraces = Array.from({ length: 15 }, (_, i) => {
    const row = i + 14;
    return `<path d="M286 ${rowY(row)} H370" stroke="${[16, 22, 26].includes(row) ? '#d9c89d' : '#d5e0e6'}" stroke-width="1.5"/>`;
  }).join('');
  const board = `<rect x="260" y="52" width="166" height="250" rx="13" fill="#edf2f5" stroke="#a9bac5"/><text x="343" y="72" text-anchor="middle" fill="#233f54" font-size="11" font-weight="700">PROTOBOARD · VISTA SUPERIOR</text><text x="269" y="87" fill="#617789" font-size="8">FILA</text>${Array.from({ length: 15 }, (_, i) => `<text x="269" y="${rowY(i + 14) + 3}" fill="#617789" font-size="9">${i + 14}</text>`).join('')}${['A','B','C','D','E'].map((v, i) => `<text x="${cols[i]}" y="85" text-anchor="middle" fill="#617789" font-size="9">${v}</text>`).join('')}<rect x="384" y="82" width="9" height="203" rx="4" fill="#d2dce2"/><text x="388" y="296" text-anchor="middle" fill="#617789" font-size="7">RANURA</text>${rowTraces}${holes}`;
  const pathD9 = stage.wires ? `<path d="M107 160 H230 V${rowY(16)} H286" fill="none" stroke="#d44c56" stroke-width="4"/><circle cx="286" cy="${rowY(16)}" r="6" fill="#d44c56"/>` : '';
  const pathGnd = stage.wires ? `<path d="M187 190 H246 V${rowY(26)} H286" fill="none" stroke="#334d63" stroke-width="4"/><circle cx="286" cy="${rowY(26)}" r="6" fill="#334d63"/>` : '';
  const resistor = stage.resistor ? `<path d="M370 ${rowY(16)} V${rowY(17)} M370 ${rowY(21)} V${rowY(22)}" stroke="#5f6e7a" stroke-width="2.5"/><rect x="364" y="${rowY(17)}" width="12" height="${rowY(21)-rowY(17)}" rx="4" fill="#d7b17a" stroke="#8e673f" stroke-width="1.5"/><path d="M365 ${rowY(18)}h10m-10 5h10m-10 5h10" stroke="#7a3f32" stroke-width="2"/>` : '';
  const led = stage.led ? `<path d="M286 ${rowY(22)} V${rowY(23)} M286 ${rowY(25)} V${rowY(26)}" stroke="#697986" stroke-width="2.5"/><path d="M278 ${rowY(23)} Q286 ${rowY(21)} 294 ${rowY(23)} V${rowY(25)} Q286 ${rowY(27)} 278 ${rowY(25)} Z" fill="#e84d5d" stroke="#a52f3c" stroke-width="1.5"/><path d="M282 ${rowY(22.2)}l-3-4m8 4 3-4" stroke="#e0a33a" stroke-width="1.7"/><text x="296" y="${rowY(24) + 3}" fill="#8d2c38" font-size="8">LED</text>` : '';
  const badge = stage.highlight === 'check' ? `<rect x="24" y="270" width="190" height="30" rx="8" fill="#e6f4ec"/><text x="37" y="289" fill="#246342" font-size="11" font-weight="700">✓ USB desconectado · conexiones revisadas</text>` : stage.highlight === 'code' ? `<rect x="24" y="270" width="190" height="30" rx="8" fill="#e9f3fb"/><text x="37" y="289" fill="#205983" font-size="11" font-weight="700">✓ Ahora puedes conectar y cargar el código</text>` : '';
  const callouts = stage.highlight === 'resistor' ? `<text x="399" y="${rowY(19) + 3}" fill="#8e673f" font-size="9">220 Ω</text>` : stage.highlight === 'led' ? `<text x="305" y="${rowY(22) + 4}" fill="#9a3340" font-size="9">pata larga (+)</text><text x="295" y="${rowY(26) + 4}" fill="#334d63" font-size="9">pata corta (−)</text>` : '';
  return `<figure class="gl-assembly-step"><div class="gl-assembly-heading"><span>ETAPA ${index + 1} DE ${blinkStages.length}</span><h4>${esc(stage.title)}</h4></div><div class="gl-assembly-canvas"><svg viewBox="0 0 470 320" role="img" aria-label="${esc(stage.caption)}"><rect width="470" height="320" rx="12" fill="#f7fafc"/><rect x="24" y="112" width="178" height="105" rx="12" fill="#174b72"/><text x="113" y="137" text-anchor="middle" fill="#fff" font-size="12" font-weight="700">ARDUINO UNO</text><rect x="42" y="148" width="65" height="26" rx="5" fill="#f8fbfd"/><text x="74" y="165" text-anchor="middle" fill="#233f54" font-size="11" font-weight="700">D9</text><rect x="122" y="178" width="65" height="26" rx="5" fill="#f8fbfd"/><text x="154" y="195" text-anchor="middle" fill="#233f54" font-size="11" font-weight="700">GND</text>${board}${pathD9}${pathGnd}${resistor}${led}${callouts}${badge}<text x="24" y="31" fill="#536b7c" font-size="10">ESQUEMA DE UBICACIÓN · NO A ESCALA</text></svg></div><p>${esc(stage.caption)}</p><small>${esc(stage.note)}</small></figure>`;
}

export function assemblyStepMarkup(guideId: string, index: number): string {
  if (guideId !== 'led-intermitente' || !Number.isInteger(index) || index < 0 || index >= blinkStages.length) return '';
  return blinkDiagram(blinkStages[index], index);
}
