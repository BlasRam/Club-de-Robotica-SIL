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
