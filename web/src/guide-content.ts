export const learningRoute = [
  { title: '1 · Primeros circuitos', ids: ['led-intermitente', 'luz-con-pulsador', 'semaforo-tres-luces', 'mezclador-rgb'] },
  { title: '2 · Aprende a medir', ids: ['lampara-con-ldr', 'medidor-ultrasonico', 'termometro-lm35'] },
  { title: '3 · Combina y construye', ids: ['servo-con-potenciometro', 'alarma-de-proximidad', 'juego-de-reflejos'] },
];
// Un registro por unión. Las resistencias se representan en serie en el destino.
const wiring: Record<string, string> = {
  'led-intermitente': 'D9|220 Ω → ánodo LED|señal\nGND|Cátodo LED|tierra',
  'semaforo-tres-luces': 'D8|220 Ω → ánodo rojo|señal\nD9|220 Ω → ánodo amarillo|señal\nD10|220 Ω → ánodo verde|señal\nGND|Los tres cátodos|tierra',
  'luz-con-pulsador': 'D2 (INPUT_PULLUP)|Pata del pulsador|señal\nGND|Pata del lado opuesto|tierra\nD13|LED integrado (sin cable)|señal',
  'lampara-con-ldr': '5 V|Un extremo de LDR|alimentación\nA0|Otro extremo LDR + 10 kΩ|señal\nGND|Otro extremo de 10 kΩ|tierra\nD9|220 Ω → ánodo LED|señal\nGND|Cátodo LED|tierra',
  'medidor-ultrasonico': '5 V|HC-SR04: VCC|alimentación\nGND|HC-SR04: GND|tierra\nD9|HC-SR04: TRIG|señal\nD10|HC-SR04: ECHO|señal',
  'servo-con-potenciometro': '5 V|Extremo potenciómetro|alimentación\nGND|Otro extremo potenciómetro|tierra\nA0|Terminal central potenciómetro|señal\nD9|Servo: señal|señal\n5 V|Servo: rojo (sin carga)|alimentación\nGND|Servo: marrón/negro|tierra',
  'alarma-de-proximidad': '5 V|HC-SR04: VCC|alimentación\nGND|HC-SR04: GND|tierra\nD9|HC-SR04: TRIG|señal\nD10|HC-SR04: ECHO|señal\nD6|Zumbador pasivo: +|señal\nGND|Zumbador: −|tierra',
  'termometro-lm35': '5 V|LM35DZ: pin 1 (izquierdo)|alimentación\nA0|LM35DZ: pin 2 (centro)|señal\nGND|LM35DZ: pin 3 (derecho)|tierra',
  'mezclador-rgb': 'D9|220 Ω → rojo|señal\nD10|220 Ω → verde|señal\nD11|220 Ω → azul|señal\nGND|Cátodo común RGB|tierra',
  'juego-de-reflejos': 'D2 (INPUT_PULLUP)|Pata del pulsador|señal\nGND|Pata del lado opuesto|tierra\nD13|LED integrado (sin cable)|señal',
};
const troubleshooting: Record<string, string> = {
  'led-intermitente': 'No enciende|Desconecta el USB y comprueba ánodo, cátodo y que la resistencia esté en serie.\nSe queda encendido|Comprueba que conectaste D9 y que cargaste el programa en la placa correcta.',
  'semaforo-tres-luces': 'Colores en orden incorrecto|Relaciona cada LED con D8, D9 y D10.\nUna luz no enciende|Revisa su polaridad, resistencia y retorno a GND.',
  'luz-con-pulsador': 'LED siempre encendido|El botón puede estar conectado por dos patas del mismo lado. Usa lados opuestos.\nNo responde|Revisa D2, GND y INPUT_PULLUP; al presionar se lee LOW.',
  'lampara-con-ldr': 'Se activa con demasiada luz|Mide A0 con la LDR tapada y destapada; elige un umbral intermedio.\nSiempre 0 o 1023|Revisa el nodo común entre LDR, resistencia de 10 kΩ y A0.',
  'medidor-ultrasonico': 'Sin eco|Revisa VCC, GND, TRIG y ECHO. Prueba con una superficie plana a 20 cm.\nLecturas inestables|Evita telas, bordes y objetos demasiado cerca; espera entre mediciones.',
  'servo-con-potenciometro': 'La placa se reinicia|Alimenta el servo desde una fuente regulada externa de 5 V y une los GND; no unas su positivo al USB.\nVibra o fuerza el tope|Retira la carga y limita el rango de ángulos. No fuerces el eje.\nNo sigue la perilla|Verifica que A0 llegue al terminal central del potenciómetro.',
  'alarma-de-proximidad': 'No suena|Comprueba que el zumbador sea pasivo y esté conectado a D6 y GND.\nSuena sin objeto cerca|Comprueba primero las lecturas con la guía Medidor de distancia.',
  'termometro-lm35': 'Temperatura imposible|Desconecta y verifica el pinout exacto del LM35DZ; no lo confundas con TMP36.\nLectura algo diferente|La referencia de 5 V y la resolución del Uno limitan la precisión. Compara con un termómetro.\nSensor caliente|Desconecta inmediatamente; revisa polaridad antes de volver a alimentar.',
  'mezclador-rgb': 'Colores invertidos|Comprueba si el LED es de cátodo común. El de ánodo común requiere otro cableado y lógica.\nFalta un color|Revisa su pata, resistencia y pin PWM.',
  'juego-de-reflejos': 'Tiempo cercano a cero|No mantengas pulsado durante la espera; suelta antes de cada ronda.\nEl juego espera sin avanzar|Pulsa el botón y comprueba que D2 se conecte a GND.\nMonitor serie ilegible|Selecciona 9600 baudios.',
};
export function enrichGuide<T extends { id: string }>(item: T): T & { diagrama: string; erroresFrecuentes: string } {
  return { diagrama: wiring[item.id] || '', erroresFrecuentes: troubleshooting[item.id] || '', ...item };
}
const esc = (v: string) => v.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
function normalize(value: string): string {
  return value.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function wireColor(kind: string): string {
  return kind === 'alimentación' ? '#bd3345' : kind === 'tierra' ? '#46566b' : kind === 'sin cable' ? '#7957a8' : '#087bb5';
}

function componentSymbol(target: string): string {
  const value = normalize(target);
  if (value.includes('hc-sr04') || value.includes('trig') || value.includes('echo')) {
    return '<rect x="5" y="7" width="38" height="27" rx="4" fill="#236c70" stroke="#174c50" stroke-width="2"/><circle cx="16" cy="19" r="7" fill="#d9e6e2" stroke="#9cb9b1" stroke-width="2"/><circle cx="33" cy="19" r="7" fill="#d9e6e2" stroke="#9cb9b1" stroke-width="2"/><path d="M10 36v4m9-4v4m9-4v4m9-4v4" stroke="#d59b36" stroke-width="2"/>';
  }
  if (value.includes('ldr')) {
    if (value.includes('10 k') || value.includes('resistencia')) {
      return '<circle cx="14" cy="20" r="10" fill="#f4e6a8" stroke="#aa7a2b" stroke-width="2"/><path d="M10 19l4-4 4 4-4 4-4-4zm-2-14 4 4m-8 3 5 1" fill="none" stroke="#536b83" stroke-width="1.7"/><path d="M14 30v9m8-19h4m0 0 3-6 4 12 3-6h6" fill="none" stroke="#b77938" stroke-width="2"/><path d="M20 20h2m-8 10v9m16 0v2" stroke="#65778a" stroke-width="2"/>';
    }
    return '<circle cx="23" cy="20" r="12" fill="#f4e6a8" stroke="#aa7a2b" stroke-width="2"/><path d="M18 19l4-4 4 4-4 4-4-4zm-5-12l4 4m-8 3 5 1m24-8-4 4m8 3-5 1" fill="none" stroke="#536b83" stroke-width="2" stroke-linecap="round"/><path d="M19 32v7m8-7v7" stroke="#626c78" stroke-width="2"/>';
  }
  if (value.includes('lm35') || value.includes('termometro')) {
    return '<path d="M14 8h18v18c0 7-4 10-9 10s-9-3-9-10V8z" fill="#253444" stroke="#111d29" stroke-width="2"/><path d="M18 11h10" stroke="#8194a5" stroke-width="2"/><path d="M18 36v4m7-4v4m7-4v4" stroke="#d6a64d" stroke-width="2"/>';
  }
  if (value.includes('servo')) {
    return '<rect x="8" y="12" width="32" height="23" rx="5" fill="#41648a" stroke="#294969" stroke-width="2"/><circle cx="24" cy="12" r="4" fill="#e8edf0" stroke="#8695a3" stroke-width="2"/><path d="M24 12l11-7m-11 7L12 5m12 7v-9" stroke="#dce4eb" stroke-width="2.5" stroke-linecap="round"/><path d="M15 36v4m18-4v4" stroke="#d49a38" stroke-width="2"/>';
  }
  if (value.includes('potenciometro') || value.includes('terminal central')) {
    return '<circle cx="24" cy="20" r="14" fill="#40536a" stroke="#293a50" stroke-width="2"/><circle cx="24" cy="20" r="7" fill="#dce4ea"/><path d="M24 20l7-7m-16 21v5m18-5v5m-9-5v5" stroke="#d69c3f" stroke-width="2.5" stroke-linecap="round"/>';
  }
  if (value.includes('zumbador') || value.includes('buzzer')) {
    return '<circle cx="19" cy="21" r="13" fill="#2e3947" stroke="#111b27" stroke-width="2"/><circle cx="19" cy="21" r="4" fill="#8393a2"/><path d="M33 15q8 6 0 12m4-17q12 11 0 22" fill="none" stroke="#087bb5" stroke-width="2" stroke-linecap="round"/><path d="M14 35v5m10-5v5" stroke="#d49a38" stroke-width="2"/>';
  }
  if (value.includes('pulsador') || value.includes('pata del lado')) {
    return '<rect x="8" y="12" width="32" height="22" rx="5" fill="#53677e" stroke="#26384c" stroke-width="2"/><rect x="16" y="7" width="16" height="12" rx="4" fill="#d94656" stroke="#a72e3d" stroke-width="2"/><path d="M13 34v6m22-6v6" stroke="#d49a38" stroke-width="2"/>';
  }
  if (value.includes('rgb') || value.includes('comun')) {
    return '<path d="M13 25a11 11 0 1 1 22 0v5H13z" fill="#df5972" stroke="#95405a" stroke-width="2"/><path d="M16 30v10m6-10v10m6-10v10m6-10v10" stroke="#c59642" stroke-width="2"/><path d="M16 10l-4-4m15 1V2m8 9 5-4" stroke="#e09b42" stroke-width="2"/>';
  }
  if (value.includes('220') || value.includes('10 k') || value.includes('resistencia')) {
    if (value.includes('led') || value.includes('anodo') || value.includes('catodo') || /rojo|verde|amarillo/.test(value)) {
      const color = value.includes('rojo') ? '#ed6570' : value.includes('verde') ? '#4ebd89' : '#f2bd56';
      return '<path d="M1 22h5m15 0h4m17 0h5" stroke="#65778a" stroke-width="2"/><path d="M6 22l2-5 3 10 3-10 3 10 4-5" fill="none" stroke="#b77938" stroke-width="2.5" stroke-linejoin="round"/><path d="M24 15a8 8 0 1 1 0 14" fill="' + color + '" stroke="#a96f23" stroke-width="2"/><path d="M25 14v16" stroke="#a96f23" stroke-width="1.8"/><path d="M31 12l6-6m-3 1 3-1-1 3m-4 10 6-6m-3 1 3-1-1 3" fill="none" stroke="#087bb5" stroke-width="1.7"/><path d="M28 30v9m8-9v9" stroke="#65778a" stroke-width="2"/>';
    }
    return '<path d="M3 20h7m28 0h7" stroke="#65778a" stroke-width="2"/><path d="M10 20l4-8 5 16 5-16 5 16 5-16 4 8" fill="none" stroke="#b77938" stroke-width="3" stroke-linejoin="round"/>';
  }
  if (value.includes('led') || value.includes('anodo') || value.includes('catodo') || value.includes('13') || /rojo|verde|amarillo/.test(value)) {
    const color = value.includes('rojo') ? '#ed6570' : value.includes('verde') ? '#4ebd89' : '#f6c457';
    return '<path d="M14 25a10 10 0 1 1 20 0v5H14z" fill="' + color + '" stroke="#ad7428" stroke-width="2"/><path d="M18 30v10m12-10v10m-8-25 1 5m5-4-2 5" stroke="#66788b" stroke-width="2"/><path d="M8 8l5 4m-8 4 6 1m28-9-5 4m8 4-6 1" stroke="#087bb5" stroke-width="1.7"/>';
  }
  return '<rect x="7" y="11" width="34" height="20" rx="5" fill="#dce8ee" stroke="#5c7486" stroke-width="2"/><path d="M13 35v5m22-5v5" stroke="#d49a38" stroke-width="2"/>';
}

function componentIcon(target: string): string {
  return '<svg class="gw-wire-icon" viewBox="0 0 48 44" aria-hidden="true" focusable="false">' + componentSymbol(target) + '</svg>';
}

function wrapSvgLabel(value: string, maxCharacters = 24): string[] {
  const words = value.split(/\s+/);
  const result: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? line + ' ' + word : word;
    if (next.length > maxCharacters && line) { result.push(line); line = word; }
    else line = next;
  }
  if (line) result.push(line);
  return result.slice(0, 2);
}

export function wiringMarkup(source: string): string {
  const lines = source.split('\n').filter(Boolean).slice(0, 24).map(line => {
    const [from = '', to = '', kind = 'señal'] = line.split('|').map(value => value.trim());
    const connectionKind = to.toLocaleLowerCase('es').includes('sin cable') ? 'sin cable' : kind;
    return { from, to, kind: connectionKind, color: wireColor(connectionKind) };
  });
  if (!lines.length) return '';
  const top = 142;
  const rowGap = 50;
  const height = top + lines.length * rowGap + 20;
  const wires = lines.map(({ color }, i) => {
    const y = top + i * rowGap;
    if (lines[i].kind === 'sin cable') return '';
    return '<path d="M252 ' + y + ' C365 ' + y + ' 515 ' + y + ' 656 ' + y + '" fill="none" stroke="' + color + '" stroke-width="4" stroke-linecap="round"/><circle cx="252" cy="' + y + '" r="5" fill="' + color + '"/><circle cx="656" cy="' + y + '" r="5" fill="' + color + '"/>';
  }).join('');
  const pins = lines.map(({ from }, i) => {
    const y = top + i * rowGap;
    return '<g><text x="39" y="' + (y + 4) + '" fill="#f5fbff" font-size="11" font-weight="700">' + esc(from) + '</text><circle cx="235" cy="' + y + '" r="7" fill="#ddc179" stroke="#21384b" stroke-width="2"/></g>';
  }).join('');
  const components = lines.map(({ to, kind }, i) => {
    const y = top + i * rowGap;
    const labels = wrapSvgLabel(to);
    const label = labels.map((line, index) => '<tspan x="718" dy="' + (index === 0 ? 0 : 11) + '">' + esc(line) + '</tspan>').join('');
    return '<g><rect x="666" y="' + (y - 20) + '" width="230" height="40" rx="9" fill="#ffffff" stroke="#d7e0e7"/><svg x="674" y="' + (y - 19) + '" width="38" height="36" viewBox="0 0 48 44">' + componentSymbol(to) + '</svg><text x="718" y="' + (y - (labels.length > 1 ? 6 : -2)) + '" fill="#18354d" font-size="11" font-weight="700">' + label + '</text><text x="718" y="' + (y + 17) + '" fill="' + wireColor(kind) + '" font-size="9">' + esc(kind) + '</text></g>';
  }).join('');
  const holes: string[] = [];
  for (let y = 0; y < height - 170; y += 18) {
    for (let x = 0; x < 5; x++) {
      const hy = 96 + y;
      holes.push('<circle cx="' + (375 + x * 14) + '" cy="' + hy + '" r="2.1" fill="#9daeb6"/><circle cx="' + (493 + x * 14) + '" cy="' + hy + '" r="2.1" fill="#9daeb6"/>');
    }
  }
  const breadboard = '<g><rect x="350" y="30" width="280" height="' + (height - 60) + '" rx="12" fill="#fff" stroke="#bdcbd2" stroke-width="2"/><rect x="360" y="40" width="260" height="8" rx="4" fill="#e9edf0"/><rect x="360" y="54" width="260" height="3" fill="#d84649"/><rect x="360" y="' + (height - 57) + '" width="260" height="3" fill="#2879b9"/><rect x="360" y="' + (height - 44) + '" width="260" height="8" rx="4" fill="#e9edf0"/>' + holes.join('') + '<rect x="470" y="96" width="16" height="' + Math.max(10, height - 184) + '" fill="#f0f2f2"/><text x="365" y="70" fill="#ca3b42" font-size="8" font-weight="700">+ · ALIMENTACIÓN</text><text x="365" y="' + (height - 30) + '" fill="#286f9e" font-size="8" font-weight="700">− · TIERRA</text></g>';
  const board = '<g><rect x="20" y="24" width="232" height="' + (height - 40) + '" rx="18" fill="#087c70" stroke="#07534e" stroke-width="3"/><circle cx="39" cy="43" r="5" fill="#d5c18b"/><circle cx="232" cy="43" r="5" fill="#d5c18b"/><circle cx="39" cy="' + (height - 35) + '" r="5" fill="#d5c18b"/><circle cx="232" cy="' + (height - 35) + '" r="5" fill="#d5c18b"/><rect x="2" y="63" width="33" height="42" rx="5" fill="#bdc8cd" stroke="#71818a" stroke-width="2"/><rect x="69" y="50" width="94" height="51" rx="7" fill="#19364a" stroke="#102333" stroke-width="2"/><text x="116" y="70" text-anchor="middle" fill="#f6fbfd" font-size="12" font-weight="700">ARDUINO</text><text x="116" y="87" text-anchor="middle" fill="#b8d7d5" font-size="10">UNO · R3</text><rect x="178" y="51" width="43" height="30" rx="4" fill="#183246"/><text x="199" y="69" text-anchor="middle" fill="#dcebf0" font-size="7">ATmega</text><rect x="179" y="88" width="34" height="15" rx="3" fill="#214258"/><circle cx="64" cy="115" r="7" fill="#b9c7ca" stroke="#536976" stroke-width="2"/><text x="76" y="119" fill="#d7f0e8" font-size="8">POWER</text><text x="37" y="137" fill="#d7f0e8" font-size="9" font-weight="700">PINES DE CONEXIÓN</text><rect x="36" y="' + (height - 68) + '" width="96" height="24" rx="4" fill="#1b5060"/><text x="84" y="' + (height - 52) + '" text-anchor="middle" fill="#e5f2f4" font-size="8">USB / ENERGÍA</text><rect x="155" y="' + (height - 70) + '" width="27" height="26" rx="4" fill="#344e58" stroke="#779197"/><text x="168" y="' + (height - 54) + '" text-anchor="middle" fill="#e5f2f4" font-size="7">DC</text><text x="29" y="' + (height - 35) + '" fill="#d8eeee" font-size="7">ARDUINO UNO · 5 V</text></g>';
  const mobile = lines.map(({ from, to, kind, color }) => '<div class="gw-wire-row"><span class="gw-wire-from"><small>ARDUINO UNO</small><b>' + esc(from) + '</b></span><b class="gw-wire-arrow" aria-hidden="true" style="color:' + color + '">' + (kind === 'sin cable' ? '•' : '→') + '</b><span class="gw-wire-target">' + componentIcon(to) + '<span><small>COMPONENTE</small><b>' + esc(to) + '</b></span></span><small class="gw-wire-kind" style="color:' + color + '">' + esc(kind) + '</small></div>').join('');
  return '<figure class="gl-wiring"><figcaption>Montaje del circuito · Arduino Uno, protoboard y componentes</figcaption><div class="gw-wiring-svg" tabindex="0" aria-label="Diagrama del circuito, desplazable horizontalmente"><svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Montaje ilustrado de Arduino Uno en protoboard con sus conexiones y componentes" viewBox="0 0 910 ' + height + '" style="font:13px sans-serif"><rect width="910" height="' + height + '" fill="#f5f8fa"/>' + breadboard + wires + board + pins + components + '</svg></div><div class="gw-wiring-mobile">' + mobile + '</div><div class="gw-wire-legend"><span><i class="power"></i>Alimentación</span><span><i class="ground"></i>Tierra</span><span><i class="signal"></i>Señal</span><span><i class="internal"></i>Componente integrado</span></div><small>Ilustración esquemática estilo simulador. Desconecta la placa antes de montar y confirma el pinout del componente.</small></figure>';
}
