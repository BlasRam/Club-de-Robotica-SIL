export type ComponentEntry = {
  id: string;
  name: string;
  type: "Sensor" | "Actuador" | "Control";
  summary: string;
  operation: string;
  connections: string[];
  care: string;
};

// Fichas de referencia para módulos comunes con Arduino Uno y placas compatibles.
export const componentCatalog: ComponentEntry[] = [
  {
    id: "hc-sr04", name: "Sensor ultrasónico HC-SR04", type: "Sensor",
    summary: "Mide distancia usando el tiempo que tarda en regresar un pulso de sonido.",
    operation: "TRIG envía un pulso ultrasónico y ECHO indica cuánto tardó el eco. El programa convierte ese tiempo en distancia.",
    connections: ["VCC → 5V", "GND → GND", "TRIG → D9", "ECHO → D10"],
    care: "Mantén el sensor frente al objeto y evita superficies muy inclinadas o blandas, que reflejan mal el sonido.",
  },
  {
    id: "ldr", name: "Fotoresistencia LDR", type: "Sensor",
    summary: "Detecta cambios de luz; su resistencia baja cuando recibe más iluminación.",
    operation: "Se conecta con una resistencia fija como divisor de voltaje. Arduino lee el punto medio con una entrada analógica.",
    connections: ["5V → LDR → A0", "A0 → resistencia de 10 kΩ → GND"],
    care: "La lectura depende del valor de la resistencia y de la luz del entorno; calibra un umbral para cada proyecto.",
  },
  {
    id: "fc51", name: "Detector infrarrojo FC-51", type: "Sensor",
    summary: "Detecta obstáculos cercanos mediante el reflejo de luz infrarroja.",
    operation: "El receptor compara la luz reflejada con un umbral ajustado en el potenciómetro y cambia su salida digital.",
    connections: ["VCC → 3.3V o 5V según el módulo", "GND → GND", "OUT → D2"],
    care: "Ajusta el alcance con el potenciómetro y evita apuntarlo directamente a una fuente intensa de luz infrarroja.",
  },
  {
    id: "lm35", name: "Sensor analógico LM35", type: "Sensor",
    summary: "Entrega un voltaje proporcional a la temperatura en grados Celsius.",
    operation: "Arduino lee la salida analógica y calcula la temperatura a partir del voltaje medido.",
    connections: ["Vs → 5V", "GND → GND", "Vout → A0"],
    care: "Comprueba el orden de las patas con la cara plana hacia ti: cambia entre el sensor suelto y algunos módulos.",
  },
  {
    id: "dht11", name: "Sensor DHT11", type: "Sensor",
    summary: "Mide temperatura y humedad relativa del ambiente.",
    operation: "Envía ambas mediciones por una señal digital. El módulo de tres pines suele incluir la resistencia necesaria en DATA.",
    connections: ["VCC → 5V (o 3.3V según el módulo)", "GND → GND", "DATA/S → D2"],
    care: "Respeta el orden de pines impreso en tu módulo: puede variar entre fabricantes. No lo expongas al agua.",
  },
  {
    id: "tcrt5000", name: "Seguidor de línea TCRT5000", type: "Sensor",
    summary: "Distingue superficies claras y oscuras mediante luz infrarroja reflejada.",
    operation: "El emisor infrarrojo ilumina el piso y el fototransistor detecta el reflejo. El potenciómetro ajusta el umbral de salida digital.",
    connections: ["VCC → 5V", "GND → GND", "DO → D2 (salida digital)", "AO → A0 si tu módulo la incluye"],
    care: "Ajusta la altura y el potenciómetro sobre la pista real; la luz ambiente y el color del piso alteran la lectura.",
  },
  {
    id: "pir", name: "Sensor de movimiento PIR", type: "Sensor",
    summary: "Detecta cambios de radiación infrarroja causados por personas u objetos calientes en movimiento.",
    operation: "La salida digital cambia cuando el sensor detecta movimiento. Sus controles ajustan sensibilidad y duración de la señal.",
    connections: ["VCC → 5V", "GND → GND", "OUT → D2"],
    care: "Espera el tiempo de estabilización indicado por el fabricante después de encenderlo; no mide distancia exacta.",
  },
  {
    id: "mpu6050", name: "Acelerómetro y giroscopio MPU-6050", type: "Sensor",
    summary: "Registra aceleración e inclinación en tres ejes para detectar movimiento y orientación.",
    operation: "Intercambia datos por el bus I²C. Sus medidas sirven para estimar movimiento; requieren calibración y filtrado.",
    connections: ["VCC → 3.3V (revisa si tu placa admite 5V)", "GND → GND", "SDA → A4 en Uno", "SCL → A5 en Uno"],
    care: "Comprueba el voltaje permitido por tu breakout y fija bien el sensor para que no vibre durante la medición.",
  },
  {
    id: "potenciometro", name: "Potenciómetro de 10 kΩ", type: "Control",
    summary: "Permite ajustar manualmente un valor, por ejemplo velocidad, brillo o ángulo.",
    operation: "Al girar la perilla cambia el voltaje del pin central. Arduino lo lee como un valor analógico.",
    connections: ["Una pata exterior → 5V", "La otra pata exterior → GND", "Pata central → A0"],
    care: "Si el valor aumenta al girar en sentido contrario al esperado, intercambia las dos patas exteriores.",
  },
  {
    id: "joystick", name: "Módulo joystick de dos ejes", type: "Control",
    summary: "Controla dos valores analógicos con una palanca y añade un pulsador central.",
    operation: "Los ejes X e Y varían su voltaje al mover la palanca. SW cambia de estado cuando se presiona.",
    connections: ["VCC → 5V", "GND → GND", "VRx → A0", "VRy → A1", "SW → D2 (opcional)"],
    care: "Lee el centro y los extremos del joystick al iniciar para compensar diferencias entre unidades.",
  },
  {
    id: "pulsador", name: "Pulsador", type: "Control",
    summary: "Añade una entrada manual para iniciar, detener o cambiar el estado de un circuito.",
    operation: "Al presionarlo conecta sus contactos. INPUT_PULLUP permite leerlo sin añadir una resistencia externa.",
    connections: ["Un lado del pulsador → D2", "Lado opuesto → GND", "Configura el pin como INPUT_PULLUP"],
    care: "Coloca el pulsador cruzando la ranura central de la protoboard para evitar unir sus patas del mismo lado.",
  },
  {
    id: "led", name: "LED", type: "Actuador",
    summary: "Convierte corriente eléctrica en luz para indicar un estado o crear señales visuales.",
    operation: "Se enciende cuando la corriente fluye del ánodo al cátodo. La resistencia en serie limita esa corriente.",
    connections: ["D9 → resistencia de 220–330 Ω → pata larga (ánodo)", "Pata corta (cátodo) → GND"],
    care: "Usa una resistencia para cada LED y no lo conectes directamente entre un pin y GND.",
  },
  {
    id: "rgb", name: "LED RGB", type: "Actuador",
    summary: "Combina luz roja, verde y azul para producir distintos colores.",
    operation: "Cada color tiene su propio pin. PWM permite mezclar los brillos. Hay modelos de cátodo común y ánodo común.",
    connections: ["Pines R, G y B → resistencias individuales → D9, D10 y D11", "Terminal común → GND (cátodo común)", "Para ánodo común, el terminal común va a 5V y la lógica se invierte"],
    care: "Identifica el tipo de terminal común y usa una resistencia independiente por color.",
  },
  {
    id: "buzzer", name: "Zumbador", type: "Actuador",
    summary: "Produce avisos sonoros para alarmas, temporizadores o confirmaciones.",
    operation: "Un zumbador activo suena con alimentación continua; uno pasivo necesita una señal de frecuencia como tone().",
    connections: ["Módulo activo: VCC → 5V, GND → GND, S/IN → D8", "Zumbador pasivo: terminal + → D8 mediante etapa adecuada, terminal − → GND"],
    care: "Verifica si es activo o pasivo y no conectes cargas que superen la corriente permitida por el pin.",
  },
  {
    id: "servo-sg90", name: "Microservo SG90", type: "Actuador",
    summary: "Mueve un eje a un ángulo determinado para orientar piezas pequeñas.",
    operation: "Recibe pulsos de control en el cable de señal. El rango de giro real varía entre servos.",
    connections: ["Señal (naranja/amarillo) → D9", "Rojo → fuente de 5V adecuada", "Marrón/negro → GND común con Arduino"],
    care: "Para varios servos usa una fuente externa regulada y une sus tierras con la de Arduino; no fuerces el tope mecánico.",
  },
  {
    id: "motor-dc", name: "Motor DC con transistor", type: "Actuador",
    summary: "Hace girar ruedas o mecanismos; la velocidad puede controlarse con PWM.",
    operation: "Un transistor o MOSFET conmuta la corriente del motor. Un diodo de protección absorbe el voltaje inverso al apagarlo.",
    connections: ["Fuente del motor → motor → drenador/colector del transistor", "Fuente del transistor → GND común", "Pin D5 → resistencia de base o entrada de compuerta", "Diodo en paralelo con el motor, respetando polaridad"],
    care: "Nunca alimentes un motor directamente desde un pin de Arduino. Usa una fuente apropiada y protege el circuito con diodo.",
  },
  {
    id: "l293d", name: "Driver de motores L293D", type: "Actuador",
    summary: "Controla el sentido y la velocidad de uno o dos motores DC pequeños.",
    operation: "El puente H conmuta la polaridad de salida. Las entradas de habilitación admiten control PWM.",
    connections: ["VCC1 → 5V lógico", "VCC2 → fuente del motor según su voltaje", "GND del driver, fuente y Arduino → común", "IN1/IN2 y EN1 → pines digitales/PWM", "OUT1/OUT2 → terminales del motor"],
    care: "Comprueba el límite de corriente y la caída de voltaje del driver; no conectes motores que superen su capacidad.",
  },
  {
    id: "stepper", name: "Motor paso a paso 28BYJ-48", type: "Actuador",
    summary: "Gira en pasos definidos para posicionar mecanismos con movimientos repetibles.",
    operation: "El controlador ULN2003 activa las bobinas en secuencia. La velocidad depende del tiempo entre pasos.",
    connections: ["Motor → conector blanco del módulo ULN2003", "VCC del módulo → fuente indicada para el motor", "GND del módulo → GND común", "IN1–IN4 → pines D8–D11"],
    care: "No conectes las bobinas directamente a Arduino. Evita mantener el motor trabado o energizado innecesariamente.",
  },
  {
    id: "rele", name: "Módulo de relé", type: "Actuador",
    summary: "Abre o cierra un circuito de carga usando una señal de control de bajo voltaje.",
    operation: "La entrada IN activa una bobina que conmuta los contactos COM, NO y NC.",
    connections: ["VCC → voltaje indicado en el módulo", "GND → GND", "IN → D8", "Carga de baja tensión → COM y NO/NC según el comportamiento deseado"],
    care: "Para actividades escolares, trabaja solo con baja tensión. La red eléctrica puede causar lesiones graves y requiere personal calificado.",
  },
];

export const componentUsage: Record<string, string[]> = {
  "hc-sr04": [
    "Coloca el módulo firme y orienta sus dos transductores hacia el área que quieres medir.",
    "Envía un pulso de unos 10 microsegundos por TRIG y mide cuánto permanece activa la señal ECHO.",
    "Calcula la distancia aproximada en centímetros con: duración del eco × 0,034 ÷ 2.",
    "Compara varias lecturas y usa un umbral para decidir si un objeto está cerca; deja un intervalo entre mediciones.",
  ],
  ldr: [
    "Arma el divisor de voltaje con la LDR y una resistencia de 10 kΩ antes de conectarlo a Arduino.",
    "Carga un programa que lea A0 con analogRead y muestra el resultado por el monitor serial.",
    "Registra lecturas con mucha luz y con poca luz para conocer el rango de tu montaje.",
    "Elige un umbral entre esos valores para encender un LED o activar otra acción; añade histéresis si el estado parpadea.",
  ],
  fc51: [
    "Monta el módulo mirando al área que quieres vigilar y mantén libres el emisor y el receptor infrarrojos.",
    "Enciéndelo y gira lentamente el potenciómetro hasta que la salida cambie al acercar un objeto.",
    "Lee OUT como entrada digital y observa el indicador LED del módulo para confirmar la detección.",
    "Prueba a distintas distancias y con distintos objetos: el alcance depende del color, la forma y la luz del ambiente.",
  ],
  lm35: [
    "Identifica Vs, Vout y GND en la hoja técnica o en el módulo; no adivines el orden de las patas.",
    "Conecta Vout a A0 y carga una lectura con analogRead para obtener el voltaje medido.",
    "En el Arduino Uno, convierte el valor a voltaje y luego a temperatura: voltaje en voltios × 100 ≈ °C.",
    "Compara la lectura con un termómetro de referencia y evita tocar o calentar las patas eléctricas.",
  ],
  dht11: [
    "Comprueba si tienes el sensor suelto o un módulo: el orden de pines y la resistencia DATA pueden cambiar.",
    "Conecta DATA a D2 y usa una biblioteca compatible con DHT11 en el programa.",
    "Inicializa el sensor, espera una lectura válida y consulta temperatura y humedad con al menos un segundo entre lecturas.",
    "Colócalo en un lugar ventilado, lejos de agua, calor directo y del aire caliente de la placa.",
  ],
  tcrt5000: [
    "Fija el módulo mirando hacia abajo, a una altura constante y cerca de la superficie que seguirá.",
    "Conecta DO para una detección digital; usa AO si tu módulo ofrece lectura analógica.",
    "Mueve el módulo sobre las zonas claras y oscuras de la pista y ajusta el potenciómetro hasta distinguirlas.",
    "Verifica las lecturas con la iluminación real del lugar antes de instalarlo en el robot.",
  ],
  pir: [
    "Instala el sensor con la cúpula apuntando al espacio donde esperas movimiento.",
    "Conecta OUT a D2 y espera el tiempo de estabilización indicado por el fabricante al encenderlo.",
    "Lee OUT como una señal digital y prueba caminando dentro y fuera del campo de detección.",
    "Ajusta sensibilidad y duración con sus controles; el PIR detecta cambios de movimiento, no mide distancia.",
  ],
  mpu6050: [
    "Monta el módulo firme en la pieza cuyo movimiento quieres medir y comprueba el voltaje permitido por tu breakout.",
    "Conecta SDA y SCL al bus I²C; en Arduino Uno clásico son A4 y A5.",
    "Inicia una biblioteca compatible, comprueba que el módulo responde en I²C y deja el sensor quieto durante la calibración.",
    "Lee acelerómetro y giroscopio, calibra el sesgo y suaviza las lecturas antes de usarlas para estimar inclinación o giro.",
  ],
  potenciometro: [
    "Conecta las patas exteriores a 5V y GND, y la central a A0.",
    "Lee A0 con analogRead mientras giras lentamente la perilla.",
    "Usa map para convertir la lectura, normalmente de 0–1023, al rango que necesite tu proyecto.",
    "Si el sentido de giro está invertido, intercambia las patas exteriores; no conectes la pata central directamente a 5V.",
  ],
  joystick: [
    "Conecta VRx y VRy a entradas analógicas distintas y SW a una entrada digital si usarás el pulsador.",
    "Lee ambos ejes con analogRead y registra sus valores con la palanca centrada.",
    "Define una zona muerta alrededor del centro para que pequeñas variaciones no muevan el robot.",
    "Usa SW como pulsador con INPUT_PULLUP y verifica si el módulo entrega LOW o HIGH al presionarlo.",
  ],
  pulsador: [
    "Coloca el pulsador cruzando la ranura central de la protoboard para separar sus contactos.",
    "Conecta un lado a D2 y el otro a GND; configura el pin como INPUT_PULLUP.",
    "Lee LOW cuando está presionado y HIGH cuando está suelto.",
    "Si la lectura cambia varias veces por una sola pulsación, añade antirrebote por software.",
  ],
  led: [
    "Identifica el ánodo, normalmente la pata larga, y el cátodo, normalmente la pata corta.",
    "Conecta el pin digital al ánodo mediante una resistencia de 220–330 Ω y el cátodo a GND.",
    "Configura el pin como OUTPUT y usa HIGH para encenderlo y LOW para apagarlo.",
    "Para variar el brillo usa un pin PWM y analogWrite; mantén siempre la resistencia en serie.",
  ],
  rgb: [
    "Identifica si el terminal común del LED RGB es ánodo común o cátodo común.",
    "Conecta cada canal R, G y B a un pin PWM mediante su propia resistencia.",
    "Prueba cada canal por separado y luego mezcla sus niveles PWM para crear colores.",
    "En un modelo de ánodo común, invierte los niveles de control; no compartas una sola resistencia entre los tres canales.",
  ],
  buzzer: [
    "Comprueba si el zumbador es activo (suena con alimentación continua) o pasivo (necesita una frecuencia).",
    "Conecta el módulo siguiendo sus marcas de VCC, GND y señal; usa D8 como pin de control.",
    "Para un activo usa HIGH/LOW; para uno pasivo genera una frecuencia con tone y detén el sonido con noTone.",
    "Si el modelo consume más corriente de la permitida por el pin, utiliza un transistor o un módulo driver.",
  ],
  "servo-sg90": [
    "Conecta la señal al pin D9 y confirma el código de colores de los cables de tu servo.",
    "Inicia la biblioteca Servo, asocia el pin y prueba primero con un ángulo pequeño.",
    "Usa write para moverlo gradualmente dentro del rango que soporte tu mecanismo; no lo fuerces contra un tope.",
    "Si la alimentación viene de una fuente externa, une su GND con el GND de Arduino y verifica que entregue corriente suficiente.",
  ],
  "motor-dc": [
    "Elige un transistor o MOSFET adecuado y conecta el motor a una fuente externa del voltaje correcto.",
    "Añade un diodo de protección en paralelo con el motor y conecta las tierras de la fuente y Arduino.",
    "Usa un pin PWM a través de la resistencia de control para regular la velocidad.",
    "Para invertir el sentido de giro usa un puente H; no alimentes el motor directamente desde un pin de Arduino.",
  ],
  l293d: [
    "Coloca el driver con la muesca orientada como indica su diagrama y conecta por separado alimentación lógica y de motor.",
    "Une las tierras del driver, la fuente del motor y Arduino; conecta el motor a un par de salidas OUT.",
    "Usa IN1 e IN2 para elegir el sentido; activa EN1 y aplica PWM ahí para regular la velocidad.",
    "Prueba sin carga y revisa corriente y temperatura: el L293D tiene límites y pierde parte del voltaje de alimentación.",
  ],
  stepper: [
    "Conecta el motor al conector del ULN2003 y las entradas IN1–IN4 a cuatro pines digitales.",
    "Alimenta el motor desde una fuente adecuada para el modelo y comparte GND con Arduino.",
    "Usa una secuencia de pasos compatible con el 28BYJ-48 y una velocidad moderada para evitar que pierda pasos.",
    "Comprueba el sentido y el recorrido sin carga; corta la alimentación del motor cuando no necesite mantener posición.",
  ],
  rele: [
    "Trabaja únicamente con circuitos de baja tensión en las actividades del club y verifica el voltaje de la bobina.",
    "Conecta VCC, GND e IN según las marcas del módulo y usa una salida digital para activar la entrada.",
    "Con la fuente desconectada, conecta la carga a COM y NO si quieres que normalmente esté apagada, o a COM y NC si corresponde.",
    "Prueba primero con una carga pequeña y confirma el estado del relé; nunca manipules tensión de red sin personal calificado.",
  ],
};
