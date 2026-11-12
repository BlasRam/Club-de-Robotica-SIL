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
  if (value.includes('integrado')) {
    return '<rect x="5" y="8" width="38" height="27" rx="5" fill="#1d3b4d" stroke="#132b3a" stroke-width="2"/><circle cx="35" cy="14" r="3" fill="#efba4b"/><text x="24" y="27" fill="#dce8eb" text-anchor="middle" font-size="7">LED D13</text>';
  }
  if (value.includes('220') && (value.includes('led') || value.includes('anodo') || /rojo|verde|amarillo/.test(value))) {
    return '<image href="/components/resistencia.png" x="2" y="6" width="14" height="34" preserveAspectRatio="xMidYMid meet"/><image href="/components/Led.png" x="18" y="0" width="28" height="42" preserveAspectRatio="xMidYMid meet"/>';
  }
  if (value.includes('220') || value.includes('resistencia')) {
    return '<image href="/components/resistencia.png" x="14" y="1" width="20" height="42" preserveAspectRatio="xMidYMid meet"/>';
  }
  if (value.includes('led') || value.includes('anodo') || value.includes('catodo')) {
    return '<image href="/components/Led.png" x="9" y="0" width="30" height="44" preserveAspectRatio="xMidYMid meet"/>';
  }
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
  if (value.includes('13')) {
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
  const protoX = 270;
  const protoHeight = height - 60;
  const protoWidth = Math.round(protoHeight * 975 / 657);
  const componentX = protoX + protoWidth + 12;
  const viewWidth = componentX + 242;
  const wires = lines.map(({ color }, i) => {
    const y = top + i * rowGap;
    if (lines[i].kind === 'sin cable') return '';
    return '<path d="M252 ' + y + ' C' + (protoX + 30) + ' ' + y + ' ' + (componentX - 70) + ' ' + y + ' ' + componentX + ' ' + y + '" fill="none" stroke="' + color + '" stroke-width="4" stroke-linecap="round"/><circle cx="252" cy="' + y + '" r="5" fill="' + color + '"/><circle cx="' + componentX + '" cy="' + y + '" r="5" fill="' + color + '"/>';
  }).join('');
  const pins = lines.map(({ from }, i) => {
    const y = top + i * rowGap;
    return '<g><text x="39" y="' + (y + 4) + '" fill="#f5fbff" font-size="11" font-weight="700">' + esc(from) + '</text><circle cx="235" cy="' + y + '" r="7" fill="#ddc179" stroke="#21384b" stroke-width="2"/></g>';
  }).join('');
  const components = lines.map(({ to, kind }, i) => {
    const y = top + i * rowGap;
    const labels = wrapSvgLabel(to);
    const label = labels.map((line, index) => '<tspan x="' + (componentX + 52) + '" dy="' + (index === 0 ? 0 : 11) + '">' + esc(line) + '</tspan>').join('');
    return '<g><rect x="' + componentX + '" y="' + (y - 20) + '" width="230" height="40" rx="9" fill="#ffffff" stroke="#d7e0e7"/><svg x="' + (componentX + 7) + '" y="' + (y - 19) + '" width="38" height="36" viewBox="0 0 48 44">' + componentSymbol(to) + '</svg><text x="' + (componentX + 52) + '" y="' + (y - (labels.length > 1 ? 6 : -2)) + '" fill="#18354d" font-size="11" font-weight="700">' + label + '</text><text x="' + (componentX + 52) + '" y="' + (y + 17) + '" fill="' + wireColor(kind) + '" font-size="9">' + esc(kind) + '</text></g>';
  }).join('');
  const breadboard = '<image href="/components/protoboard.png" x="' + protoX + '" y="30" width="' + protoWidth + '" height="' + protoHeight + '" preserveAspectRatio="none"/>';
  const board = '<image href="/components/arduino.png" x="-100" y="20" width="360" height="191" preserveAspectRatio="none"/>';
  const mobile = lines.map(({ from, to, kind, color }) => '<div class="gw-wire-row"><span class="gw-wire-from"><small>ARDUINO UNO</small><b>' + esc(from) + '</b></span><b class="gw-wire-arrow" aria-hidden="true" style="color:' + color + '">' + (kind === 'sin cable' ? '•' : '→') + '</b><span class="gw-wire-target">' + componentIcon(to) + '<span><small>COMPONENTE</small><b>' + esc(to) + '</b></span></span><small class="gw-wire-kind" style="color:' + color + '">' + esc(kind) + '</small></div>').join('');
  const mobileScene = '<div class="gw-wiring-mobile-scene"><figure><img src="/components/arduino.png" alt="Arduino Uno aportado por el club" loading="lazy"/><figcaption>Arduino Uno</figcaption></figure><span aria-hidden="true">→</span><figure><img src="/components/protoboard.png" alt="Protoboard aportada por el club" loading="lazy"/><figcaption>Protoboard</figcaption></figure></div>';
  return '<figure class="gl-wiring"><figcaption>Montaje del circuito · Arduino Uno, protoboard y componentes</figcaption><div class="gw-wiring-svg" tabindex="0" aria-label="Diagrama del circuito, desplazable horizontalmente"><svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Montaje del circuito con imágenes de los componentes aportadas por el club" viewBox="0 0 ' + viewWidth + ' ' + height + '" style="font:13px sans-serif;width:' + viewWidth + 'px"><rect width="' + viewWidth + '" height="' + height + '" fill="#f5f8fa"/>' + breadboard + wires + board + pins + components + '</svg></div>' + mobileScene + '<div class="gw-wiring-mobile">' + mobile + '</div><div class="gw-wire-legend"><span><i class="power"></i>Alimentación</span><span><i class="ground"></i>Tierra</span><span><i class="signal"></i>Señal</span><span><i class="internal"></i>Componente integrado</span></div><small>Referencias visuales compartidas por el club. Las conexiones se basan en el mapa de cada guía; desconecta la placa antes de montar y confirma el pinout del componente.</small></figure>';
}
