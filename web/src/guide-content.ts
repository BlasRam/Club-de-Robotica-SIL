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
export function wiringMarkup(source: string): string {
  const lines = source.split('\n').filter(Boolean).slice(0, 24);
  if (!lines.length) return '';
  const rows = lines.map((line, i) => {
    const [from = '', to = '', kind = 'señal'] = line.split('|').map(value => value.trim());
    const color = kind === 'alimentación' ? '#ae2736' : kind === 'tierra' ? '#445469' : '#096eb0';
    const y = 48 + i * 66;
    return '<g><rect x="8" y="' + (y - 19) + '" width="210" height="38" rx="7" fill="#edf3f8"/><text x="18" y="' + (y + 5) + '" fill="#14354e">' + esc(from) + '</text><path d="M220 ' + y + ' H300" stroke="' + color + '" stroke-width="4"/><text x="225" y="' + (y - 10) + '" fill="' + color + '" font-size="10">' + esc(kind) + '</text><rect x="302" y="' + (y - 19) + '" width="330" height="38" rx="7" fill="#edf3f8"/><text x="312" y="' + (y + 5) + '" fill="#14354e">' + esc(to) + '</text></g>';
  }).join('');
  const mobile = lines.map(line => {
    const [from = '', to = '', kind = 'señal'] = line.split('|').map(value => value.trim());
    const color = kind === 'alimentación' ? '#ae2736' : kind === 'tierra' ? '#445469' : '#096eb0';
    return '<div class="gw-wire-row"><span>' + esc(from) + '</span><b aria-hidden="true" style="color:' + color + '">→</b><span>' + esc(to) + '</span><small style="color:' + color + '">' + esc(kind) + '</small></div>';
  }).join('');
  return '<figure class="gl-wiring"><figcaption>Mapa de conexiones · cada línea representa una unión</figcaption><div class="gw-wiring-svg" tabindex="0" aria-label="Diagrama de conexiones desplazable"><svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Mapa de pines y componentes" viewBox="0 0 640 ' + (lines.length * 66 + 24) + '" style="font:13px sans-serif">' + rows + '</svg></div><div class="gw-wiring-mobile">' + mobile + '</div><small>Conecta con la alimentación desconectada. Los colores distinguen alimentación, tierra y señales; las etiquetas indican los pines. Confirma la orientación física en la guía.</small></figure>';
}
