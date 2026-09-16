import React, { useState, useEffect, useRef } from "react";
import { Dumbbell, Plus, ChevronRight, ChevronLeft, ArrowLeft, Check, X, Eye, EyeOff, Trophy, Trash2, Star, Pencil, Share2, FolderClock, Download, Save, Copy, Sparkles, ChevronDown, ChevronUp, Timer, Play, Pause, RotateCcw, Calculator, Calendar as CalendarIcon, Medal, Users, UserPlus, Search, GripVertical } from "lucide-react";
import { auth, db } from "./firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  onAuthStateChanged,
  signOut,
} from "firebase/auth";
import { doc, getDoc, setDoc, deleteDoc, collection, getDocs } from "firebase/firestore";

function generateShareCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

const ACCENTS = {
  coral: { name: "Coral", from: "#ff7a54", to: "#e0562f", solid: "#ff7a54", text: "#1a1512" },
  azul: { name: "Azul", from: "#5b8dff", to: "#3457d6", solid: "#5b8dff", text: "#0d1730" },
  verde: { name: "Verde", from: "#3ecf8e", to: "#1f9d68", solid: "#3ecf8e", text: "#07241a" },
  rosa: { name: "Rosa", from: "#ff6fa5", to: "#d93d74", solid: "#ff6fa5", text: "#2a0916" },
  purpura: { name: "Púrpura", from: "#a480ff", to: "#7248d6", solid: "#a480ff", text: "#160b2e" },
  amarillo: { name: "Amarillo", from: "#ffd166", to: "#e0a92e", solid: "#ffd166", text: "#2e2100" },
  turquesa: { name: "Turquesa", from: "#2dd4bf", to: "#0f9488", solid: "#2dd4bf", text: "#04211d" },
  indigo: { name: "Índigo", from: "#818cf8", to: "#4f46e5", solid: "#818cf8", text: "#141a3d" },
  lima: { name: "Lima", from: "#a3e635", to: "#79ba13", solid: "#a3e635", text: "#1c2a04" },
  grafito: { name: "Grafito", from: "#94a3b8", to: "#64748b", solid: "#94a3b8", text: "#12181f" },
};

const ACCENT_STORAGE_KEY = "mirutina_accent";
// Unidad en la que cada quien prefiere ver/registrar el peso. El dato de fondo
// (records[].peso) SIEMPRE se guarda en kg; esta preferencia solo cambia cómo
// se muestra y cómo se interpreta lo que se escribe en el campo de peso.
const WEIGHT_UNIT_STORAGE_KEY = "mirutina_unidad_peso";
// Guarda qué día se está entrenando y qué ejercicios ya se marcaron, para
// que no se pierda si recargas la página o bloqueas el celular a mitad de la rutina.
const TRAINING_STORAGE_KEY = "mirutina_training";

// ---------- Calorías del día ----------
// A propósito NO se guarda en localStorage ni en Firestore: todo vive solo en
// memoria mientras dura la sesión (texto, foto, kcal y macros de cada comida),
// y se borra por completo al tocar "Borrar" o automáticamente al cambiar de día.
const CALORIE_MEALS = [
  { key: "desayuno", label: "Desayuno" },
  { key: "media_manana", label: "Media mañana" },
  { key: "almuerzo", label: "Almuerzo" },
  { key: "media_tarde", label: "Media tarde" },
  { key: "cena", label: "Cena" },
  { key: "otras", label: "Otras comidas" },
];
const CALORIES_AI_DAILY_LIMIT = 2;
// Igual que en apps de nutrición conocidas: carbohidratos en naranja, grasas en
// azul, proteínas en verde. Por ahora se llenan a mano (o con el botón demo de
// IA); cuando haya un backend real, el mismo esquema de campos sirve para lo
// que devuelva el modelo.
const MACRO_FIELDS = [
  { key: "carbos", label: "Carbos", color: "#e0a92e" },
  { key: "grasas", label: "Grasas", color: "#5b8dff" },
  { key: "proteinas", label: "Proteínas", color: "#3ecf8e" },
];
function emptyCaloriesData() {
  const obj = {};
  CALORIE_MEALS.forEach((m) => {
    obj[m.key] = { texto: "", foto: null, kcal: "", carbos: "", grasas: "", proteinas: "" };
  });
  return obj;
}
function mealHasContent(entry) {
  return !!(entry && (entry.texto?.trim() || entry.foto));
}

// ---------- Puntuación nutricional por comida ----------
// Heurística simple mientras no hay IA real: compara qué % de las kcal de la
// comida viene de cada macro (usando 4 kcal/g en carbos y proteína, 9 kcal/g
// en grasa) contra un rango "ideal" aproximado por comida, y entre más se
// aleje de esos rangos, más baja la puntuación. Solo se calcula si la comida
// ya tiene kcal Y al menos un gramo de macro cargado (a mano o con la IA demo).
const MEAL_SCORE_LEVELS = [
  { min: 70, label: "Buena", color: "#3ecf8e" },
  { min: 40, label: "Regular", color: "#e0a92e" },
  { min: 0, label: "Mala", color: "#e0725e" },
];
function mealNutritionScore(data) {
  const kcal = Number(data?.kcal) || 0;
  const carbos = Number(data?.carbos) || 0;
  const grasas = Number(data?.grasas) || 0;
  const proteinas = Number(data?.proteinas) || 0;
  if (kcal <= 0) return null;
  const kcalMacros = carbos * 4 + grasas * 9 + proteinas * 4;
  if (kcalMacros <= 0) return null;
  const pctCarbos = (carbos * 4) / kcalMacros;
  const pctGrasas = (grasas * 9) / kcalMacros;
  const pctProteinas = (proteinas * 4) / kcalMacros;
  const distFromRange = (pct, min, max) => (pct < min ? min - pct : pct > max ? pct - max : 0);
  const totalDist =
    distFromRange(pctCarbos, 0.4, 0.55) + distFromRange(pctGrasas, 0.2, 0.35) + distFromRange(pctProteinas, 0.15, 0.35);
  const score = Math.max(0, Math.min(100, Math.round(100 - totalDist * 150)));
  const level = MEAL_SCORE_LEVELS.find((l) => score >= l.min);
  return { score, ...level };
}

function mealHasAnything(entry) {
  return !!(entry && (entry.texto?.trim() || entry.foto || entry.kcal !== ""));
}

// Historial de cambios que se muestra en "Ver últimas actualizaciones".
// Para agregar uno nuevo, súmalo arriba de la lista (el más reciente primero).
const UPDATES = [
  { date: "13 sept 2026", text: "Nueva sección de Amigos: agrégalos por su usuario y visualiza la insignia semanal que van ganando." },
  { date: "12 sept 2026", text: "Nuevas insignias semanales: entrena 2+ días en la semana y gana una insignia. Elige hasta 2 para mostrar en tu inicio desde 'Mis insignias'." },
  { date: "11 sept 2026", text: "Ahora puedes ver la foto de cada ejercicio del catálogo tocando el ícono junto a él. Los personalizados todavía no tienen foto." },
  { date: "11 sept 2026", text: "Nuevo calendario en tu rutina: marca los días que entrenaste, revisa meses anteriores y usa el botón 'Marcar día' para registrarlo con un toque." },
  { date: "11 sept 2026", text: "Nuevo botón Resumen en tu rutina: te suma cuántas series haces a la semana por categoría." },
  { date: "10 sept 2026", text: "Nuevo temporizador de descanso y calculadora de 1RM dentro de cada ejercicio." },
  { date: "10 sept 2026", text: "Ahora puedes cambiar el color de toda la app y el nombre que se ve en el inicio, desde el lápiz de arriba." },
  { date: "3 sept 2026", text: "Se puede compartir tu rutina con un código para que un amigo la importe." },
  { date: "28 ago 2026", text: "Los ejercicios personalizados ahora se marcan con una estrella." },
];

// Color activo del usuario. Se actualiza al inicio de cada render de <App>
// para que PrimaryButton, DashedButton y PillButton (definidos abajo, fuera
// de App) puedan pintarse con el color elegido sin recibirlo por props.
let CURRENT_ACCENT = ACCENTS.coral;

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function todayDayKey() {
  const map = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
  return map[new Date().getDay()];
}

// ---------- semanas (lunes a domingo) ----------
function mondayOf(date) {
  const dow = date.getDay(); // 0=domingo ... 6=sábado
  const diff = dow === 0 ? 6 : dow - 1;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - diff);
}
function isoOf(date) {
  return date.toISOString().slice(0, 10);
}
function mondayOfCurrentWeekISO() {
  return isoOf(mondayOf(new Date()));
}
function daysTrainedInWeek(completedDays, mondayDate) {
  let count = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(mondayDate.getFullYear(), mondayDate.getMonth(), mondayDate.getDate() + i);
    if (completedDays.has(isoOf(d))) count++;
  }
  return count;
}

// ---------- insignias semanales (orden fijo, se repite cada 7 semanas) ----------
const BADGE_ANIMALS = ["perro", "gato-negro", "mapache", "elefante", "buho", "conejo", "gato"];
// Semana de referencia para contar cuántas semanas han pasado. No cambiar esta fecha:
// si se cambia, se corre el orden de las semanas siguientes.
const BADGE_EPOCH_MONDAY = new Date(2026, 8, 7); // lunes de esta semana (7 sept 2026)

// Animal de una semana: recorre BADGE_ANIMALS en el orden exacto en que está escrito,
// una posición por semana, y al llegar al final vuelve a empezar desde el primero.
// OJO: si más adelante agregas o quitas animales del arreglo, cambia cuántas semanas
// tiene cada vuelta, así que las semanas futuras (no las que ya se vieron) pueden
// recalcularse a otro animal la próxima vez que se abran.
function weekAnimalFor(weekKey) {
  const monday = new Date(weekKey + "T00:00:00");
  const diffDays = Math.round((monday.getTime() - BADGE_EPOCH_MONDAY.getTime()) / 86400000);
  const n = BADGE_ANIMALS.length;
  const weekNum = Math.floor(diffDays / 7);
  const index = ((weekNum % n) + n) % n;
  return BADGE_ANIMALS[index];
}
function badgeImageSrc(animal, tier) {
  return `/badges/${animal}-${tier}.webp`;
}

// ---------- insignias especiales (se le "regalan" a mano a un usuario desde su
// documento en Firestore, no dependen de días entrenados). Para dársela a alguien,
// en Firestore > users > <uid>, agrega el campo specialBadges: ["beta"].
const SPECIAL_BADGES = [
  { id: "beta", label: "Beta" },
  { id: "vip1", label: "VIP" },
  { id: "vip2", label: "VIP" },
];
function specialBadgeImageSrc(id) {
  return `/badges/${id}.webp`;
}
// Devuelve las insignias especiales que el usuario realmente tiene, con un id
// único (prefijo "special:") para no chocar con los weekKey de las semanales.
function ownedSpecialBadges(currentUser) {
  const owned = currentUser?.specialBadges || [];
  return SPECIAL_BADGES.filter((sb) => owned.includes(sb.id)).map((sb) => ({
    id: `special:${sb.id}`,
    label: sb.label,
    src: specialBadgeImageSrc(sb.id),
  }));
}
// Insignia de la semana en curso: solo vista previa en vivo, NO se puede seleccionar
// todavía (se "reparte" recién cuando la semana termina).
function computeCurrentWeekBadge(completedDays) {
  const monday = mondayOf(new Date());
  const count = daysTrainedInWeek(completedDays, monday);
  if (count < 2) return null;
  const weekKey = isoOf(monday);
  return { weekKey, animal: weekAnimalFor(weekKey), tier: Math.min(count, 4), days: count };
}
// Insignias ya "entregadas": una por cada semana pasada (ya terminada) en la que se
// llegó a 3+ días, con el nivel más alto alcanzado esa semana. Se calcula solo a
// partir de completedDays, así que no hay nada que se pueda perder o duplicar.
function computeEarnedBadges(completedDays) {
  const currentMondayTime = mondayOf(new Date()).getTime();
  const weekKeys = new Set();
  completedDays.forEach((iso) => {
    const d = new Date(iso + "T00:00:00");
    const wMonday = mondayOf(d);
    if (wMonday.getTime() >= currentMondayTime) return; // excluye la semana en curso
    weekKeys.add(isoOf(wMonday));
  });
  const badges = [];
  weekKeys.forEach((weekKey) => {
    const wMonday = new Date(weekKey + "T00:00:00");
    const count = daysTrainedInWeek(completedDays, wMonday);
    if (count >= 2) {
      badges.push({ weekKey, animal: weekAnimalFor(weekKey), tier: Math.min(count, 4), days: count });
    }
  });
  badges.sort((a, b) => b.weekKey.localeCompare(a.weekKey));
  return badges;
}

// ---------- calendario de días completados ----------
const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const DIAS_CORTOS = ["L", "M", "M", "J", "V", "S", "D"];

function pad2(n) {
  return n.toString().padStart(2, "0");
}
function fechaKey(y, m, d) {
  return `${y}-${pad2(m + 1)}-${pad2(d)}`;
}

const DAYS = [
  { key: "lunes", label: "Lunes" },
  { key: "martes", label: "Martes" },
  { key: "miercoles", label: "Miércoles" },
  { key: "jueves", label: "Jueves" },
  { key: "viernes", label: "Viernes" },
  { key: "sabado", label: "Sábado" },
  { key: "domingo", label: "Domingo" },
];

const CATEGORIES = [
  { key: "pecho", label: "Pecho", exercises: ["Press plano con barra", "Press plano con mancuernas", "Press inclinado con barra", "Press inclinado con mancuernas", "Press en máquina", "Aperturas", "Cruce de poleas", "Fondos en paralelas"] },
  { key: "espalda", label: "Espalda", exercises: ["Peso muerto espalda", "Dominadas", "Jalón al pecho", "Remo con barra", "Remo con mancuerna", "Pullover en polea", "Hiperextensiones"] },
  { key: "biceps", label: "Bíceps", exercises: ["Curl con barra", "Curl con mancuernas", "Curl martillo", "Curl predicador", "Curl concentrado", "Curl en máquina"] },
  { key: "triceps", label: "Tríceps", exercises: ["Press cerrado", "Fondos para tríceps", "Extensión de tríceps en polea", "Press francés", "Patada de tríceps"] },
  { key: "hombros", label: "Hombros", exercises: ["Press militar con barra", "Press militar con mancuernas", "Press Arnold", "Elevaciones laterales", "Elevaciones frontales", "Pájaros (posterior)", "Face pull en polea"] },
  { key: "cuadriceps", label: "Cuádriceps", exercises: ["Sentadilla libre", "Sentadilla Hack", "Sentadilla Smith", "Prensa", "Extensión de piernas", "Sentadilla frontal", "Zancadas", "Búlgara"] },
  { key: "femorales", label: "Femorales", exercises: ["Peso muerto", "Curl femoral sentado", "Curl femoral acostado", "Curl femoral de pie"] },
  { key: "gluteos", label: "Glúteos", exercises: ["Hip Thrust", "Patada de glúteo en polea", "Adducción", "Abducción", "Sentadilla profunda", "Búlgara"] },
  { key: "abdomen", label: "Abdomen", exercises: ["Crunch", "Elevación de piernas", "Plancha", "Abdominales en polea", "Rueda abdominal", "Crunch en máquina"] },
  { key: "gemelos", label: "Gemelos", exercises: ["Elevación de talones de pie", "Elevación de talones sentado", "Elevación de talones en prensa"] },
  { key: "antebrazo", label: "Antebrazo", exercises: ["Curl de muñeca", "Curl de muñeca inverso", "Farmer walk"] },
  { key: "cardio", label: "Cardio", exercises: ["Cinta", "Bicicleta estática", "Elíptica", "Remo", "Escaladora", "Saltar la cuerda"] },
];

// Igual que CATEGORIES pero con "Otro" al final, para clasificar ejercicios
// personalizados que no encajan en ningún grupo muscular. Solo se usa para
// clasificar ejercicios, no para elegir la rutina de un día.
const EXERCISE_CATEGORIES = [...CATEGORIES, { key: "otro", label: "Otro", exercises: [] }];

function slugify(str) {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// Mapa inverso: de qué categoría es cada ejercicio "de catálogo" (fx-...),
// para poder sumar series por categoría real del ejercicio, no por la
// categoría del día (un día de Pecho puede tener ejercicios de Tríceps).
const FIXED_EXERCISE_CATEGORY = {};
CATEGORIES.forEach((cat) => {
  cat.exercises.forEach((name) => {
    FIXED_EXERCISE_CATEGORY["fx-" + slugify(name)] = cat.key;
  });
});

// ---------- Calorías gastadas (gasto energético estimado) ----------
// Todo esto es una ESTIMACIÓN, no un cálculo médico exacto: usa fórmulas
// estándar (Mifflin-St Jeor + METs típicos) a partir de datos básicos del
// usuario. Sirve para tener una referencia de déficit/superávit, no para
// sustituir a un profesional.
//
// Metabolismo basal (BMR) con Mifflin-St Jeor, y un factor fijo de actividad
// "sedentaria" (1.2) para el gasto base del día — el extra de entrenar se
// suma aparte, solo si el día está marcado como día de ejercicio.
const BASE_ACTIVITY_FACTOR = 1.2;
function hasCalorieProfile(user) {
  return !!(user && user.edad && user.sexo && user.estaturaCm && user.pesoCorporalKg);
}
function calcBMR({ pesoKg, estaturaCm, edad, sexo }) {
  const base = 10 * Number(pesoKg) + 6.25 * Number(estaturaCm) - 5 * Number(edad);
  return Math.round(sexo === "F" ? base - 161 : base + 5);
}
// Estima las kcal quemadas en el entrenamiento del día a partir del plan de
// ejercicios de ese día (series, y si el ejercicio es cardio o de fuerza),
// usando METs típicos y un estimado de minutos por serie (trabajo + descanso).
function estimateWorkoutKcal(pesoKg, plan, exercisesMap) {
  let kcal = 0;
  (plan || []).forEach((p) => {
    const catKey = FIXED_EXERCISE_CATEGORY[p.exerciseId] || exercisesMap[p.exerciseId]?.category || "otro";
    const isCardio = catKey === "cardio";
    const sets = Number(p.sets) || 3;
    const met = isCardio ? 7 : 5; // MET aproximado: cardio moderado vs. entrenamiento de fuerza
    const minPerSet = isCardio ? 6 : 3.5; // minutos estimados por serie, incluyendo descanso
    const minutos = sets * minPerSet;
    kcal += ((met * 3.5 * Number(pesoKg)) / 200) * minutos;
  });
  return Math.round(kcal);
}

// ---------- buscador avanzado de ejercicios: equipo y tipo de movimiento ----------
// Quita tildes y pasa a minúsculas, para que buscar "biceps" también encuentre
// "Bíceps" sin importar mayúsculas ni acentos.
function normalizeText(str) {
  return (str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

const EQUIPMENT_OPTIONS = [
  { key: "barra", label: "Barra" },
  { key: "mancuernas", label: "Mancuernas" },
  { key: "maquina", label: "Máquina" },
  { key: "polea", label: "Polea" },
  { key: "peso_corporal", label: "Peso corporal" },
];

const MOVEMENT_OPTIONS = [
  { key: "compuesto", label: "Compuesto" },
  { key: "aislamiento", label: "Aislamiento" },
  { key: "cardio", label: "Cardio" },
];

// Equipo y tipo de cada ejercicio fijo del catálogo, para poder filtrar el
// buscador. Los ejercicios personalizados no tienen esta info (el usuario no
// la define), así que igual se encuentran por nombre o por músculo, pero no
// aparecen si se filtra por equipo o tipo de movimiento.
const EXERCISE_META_BY_NAME = {
  "Press plano con barra": { equipo: "barra", tipo: "compuesto" },
  "Press plano con mancuernas": { equipo: "mancuernas", tipo: "compuesto" },
  "Press inclinado con barra": { equipo: "barra", tipo: "compuesto" },
  "Press inclinado con mancuernas": { equipo: "mancuernas", tipo: "compuesto" },
  "Press en máquina": { equipo: "maquina", tipo: "compuesto" },
  "Aperturas": { equipo: "mancuernas", tipo: "aislamiento" },
  "Cruce de poleas": { equipo: "polea", tipo: "aislamiento" },
  "Fondos en paralelas": { equipo: "peso_corporal", tipo: "compuesto" },

  "Peso muerto espalda": { equipo: "barra", tipo: "compuesto" },
  "Dominadas": { equipo: "peso_corporal", tipo: "compuesto" },
  "Jalón al pecho": { equipo: "polea", tipo: "compuesto" },
  "Remo con barra": { equipo: "barra", tipo: "compuesto" },
  "Remo con mancuerna": { equipo: "mancuernas", tipo: "compuesto" },
  "Pullover en polea": { equipo: "polea", tipo: "aislamiento" },
  "Hiperextensiones": { equipo: "peso_corporal", tipo: "aislamiento" },

  "Curl con barra": { equipo: "barra", tipo: "aislamiento" },
  "Curl con mancuernas": { equipo: "mancuernas", tipo: "aislamiento" },
  "Curl martillo": { equipo: "mancuernas", tipo: "aislamiento" },
  "Curl predicador": { equipo: "barra", tipo: "aislamiento" },
  "Curl concentrado": { equipo: "mancuernas", tipo: "aislamiento" },
  "Curl en máquina": { equipo: "maquina", tipo: "aislamiento" },

  "Press cerrado": { equipo: "barra", tipo: "compuesto" },
  "Fondos para tríceps": { equipo: "peso_corporal", tipo: "compuesto" },
  "Extensión de tríceps en polea": { equipo: "polea", tipo: "aislamiento" },
  "Press francés": { equipo: "barra", tipo: "aislamiento" },
  "Patada de tríceps": { equipo: "mancuernas", tipo: "aislamiento" },

  "Press militar con barra": { equipo: "barra", tipo: "compuesto" },
  "Press militar con mancuernas": { equipo: "mancuernas", tipo: "compuesto" },
  "Press Arnold": { equipo: "mancuernas", tipo: "compuesto" },
  "Elevaciones laterales": { equipo: "mancuernas", tipo: "aislamiento" },
  "Elevaciones frontales": { equipo: "mancuernas", tipo: "aislamiento" },
  "Pájaros (posterior)": { equipo: "mancuernas", tipo: "aislamiento" },
  "Face pull en polea": { equipo: "polea", tipo: "aislamiento" },

  "Sentadilla libre": { equipo: "barra", tipo: "compuesto" },
  "Sentadilla Hack": { equipo: "maquina", tipo: "compuesto" },
  "Sentadilla Smith": { equipo: "maquina", tipo: "compuesto" },
  "Prensa": { equipo: "maquina", tipo: "compuesto" },
  "Extensión de piernas": { equipo: "maquina", tipo: "aislamiento" },
  "Sentadilla frontal": { equipo: "barra", tipo: "compuesto" },
  "Zancadas": { equipo: "mancuernas", tipo: "compuesto" },
  "Búlgara": { equipo: "mancuernas", tipo: "compuesto" },

  "Peso muerto": { equipo: "barra", tipo: "compuesto" },
  "Curl femoral sentado": { equipo: "maquina", tipo: "aislamiento" },
  "Curl femoral acostado": { equipo: "maquina", tipo: "aislamiento" },
  "Curl femoral de pie": { equipo: "maquina", tipo: "aislamiento" },

  "Hip Thrust": { equipo: "barra", tipo: "compuesto" },
  "Patada de glúteo en polea": { equipo: "polea", tipo: "aislamiento" },
  "Adducción": { equipo: "maquina", tipo: "aislamiento" },
  "Abducción": { equipo: "maquina", tipo: "aislamiento" },
  "Sentadilla profunda": { equipo: "barra", tipo: "compuesto" },

  "Crunch": { equipo: "peso_corporal", tipo: "aislamiento" },
  "Elevación de piernas": { equipo: "peso_corporal", tipo: "aislamiento" },
  "Plancha": { equipo: "peso_corporal", tipo: "aislamiento" },
  "Abdominales en polea": { equipo: "polea", tipo: "aislamiento" },
  "Rueda abdominal": { equipo: "peso_corporal", tipo: "compuesto" },
  "Crunch en máquina": { equipo: "maquina", tipo: "aislamiento" },

  "Elevación de talones de pie": { equipo: "maquina", tipo: "aislamiento" },
  "Elevación de talones sentado": { equipo: "maquina", tipo: "aislamiento" },
  "Elevación de talones en prensa": { equipo: "maquina", tipo: "aislamiento" },

  "Curl de muñeca": { equipo: "mancuernas", tipo: "aislamiento" },
  "Curl de muñeca inverso": { equipo: "mancuernas", tipo: "aislamiento" },
  "Farmer walk": { equipo: "mancuernas", tipo: "compuesto" },

  "Cinta": { equipo: "maquina", tipo: "cardio" },
  "Bicicleta estática": { equipo: "maquina", tipo: "cardio" },
  "Elíptica": { equipo: "maquina", tipo: "cardio" },
  "Remo": { equipo: "maquina", tipo: "cardio" },
  "Escaladora": { equipo: "maquina", tipo: "cardio" },
  "Saltar la cuerda": { equipo: "peso_corporal", tipo: "cardio" },
};

const FIXED_EXERCISE_META = {};
CATEGORIES.forEach((cat) => {
  cat.exercises.forEach((name) => {
    const meta = EXERCISE_META_BY_NAME[name];
    if (meta) FIXED_EXERCISE_META["fx-" + slugify(name)] = meta;
  });
});

// Ruta de la foto de un ejercicio del catálogo (fx-...). Los personalizados
// (cx-...) nunca tienen foto, así que ni se llama a esta función para ellos.
// El nombre del archivo debe ser el mismo slug que ya usamos para el
// exerciseId: minúsculas, sin tildes, con guiones. Ej: "jalon-al-pecho.webp".
function exercisePhotoSrc(exerciseId) {
  const slug = exerciseId.replace(/^fx-/, "");
  return `/exercises/${slug}.webp`;
}

function categoryLabel(key) {
  if (key === "descanso") return "Descanso";
  if (key === "personalizada") return "Personalizada";
  return CATEGORIES.find((c) => c.key === key)?.label || "";
}

function prOf(ex) {
  const recs = ex.records || [];
  if (!recs.length) return null;
  return Math.max(...recs.map((r) => Number(r.peso) || 0));
}

// ---------- unidad de peso (kg/lb) ----------
const KG_TO_LB = 2.20462;
// Convierte un peso guardado en kg a la unidad que se está mostrando (kg o lb).
function kgToUnit(kg, unit) {
  const n = Number(kg) || 0;
  const val = unit === "lb" ? n * KG_TO_LB : n;
  return Math.round(val * 10) / 10;
}
// Convierte lo que la persona escribió (en la unidad activa) de vuelta a kg,
// que es como se guarda siempre en Firestore.
function unitToKg(value, unit) {
  const n = Number(value) || 0;
  return unit === "lb" ? n / KG_TO_LB : n;
}

function sortByFecha(arr) {
  return [...arr].sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
}

const REST_PRESETS = [60, 90, 120];

function epley1RM(weight, reps) {
  const w = Number(weight) || 0;
  const r = Number(reps) || 0;
  if (w <= 0 || r <= 0) return null;
  if (r === 1) return w;
  return w * (1 + r / 30);
}

function fmtSeconds(s) {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

// ---------- small UI atoms ----------
// Envuelve cualquier contenido con el mismo gesto de "deslizar para borrar"
// que ya se usa en la tarjeta de un amigo: no hay bote de basura fijo a la
// vista, aparece al deslizar hacia la izquierda.
const PILL_SWIPE_REVEAL = 64;
function SwipeToDelete({ onDelete, radius, children }) {
  const [open, setOpen] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startXRef = useRef(0);
  const movedRef = useRef(false);

  function onPointerDown(e) {
    setDragging(true);
    movedRef.current = false;
    startXRef.current = e.clientX;
  }
  function onPointerMove(e) {
    if (!dragging) return;
    const delta = e.clientX - startXRef.current;
    if (Math.abs(delta) > 4) movedRef.current = true;
    const base = open ? -PILL_SWIPE_REVEAL : 0;
    setDragX(Math.min(0, Math.max(-PILL_SWIPE_REVEAL - 16, base + delta)));
  }
  function onPointerUp() {
    if (!dragging) return;
    setDragging(false);
    if (!movedRef.current && open) {
      setOpen(false);
      setDragX(0);
      return;
    }
    if (dragX <= -PILL_SWIPE_REVEAL / 2) {
      setOpen(true);
      setDragX(-PILL_SWIPE_REVEAL);
    } else {
      setOpen(false);
      setDragX(0);
    }
  }
  const translate = dragging ? dragX : open ? -PILL_SWIPE_REVEAL : 0;

  return (
    <div style={{ position: "relative", borderRadius: radius, overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: PILL_SWIPE_REVEAL, background: "#a4483a", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <button
          onClick={onDelete}
          aria-label="Eliminar"
          style={{ width: "100%", height: "100%", border: "none", background: "none", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <Trash2 size={17} />
        </button>
      </div>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => dragging && onPointerUp()}
        style={{ position: "relative", transform: `translateX(${translate}px)`, transition: dragging ? "none" : "transform 0.2s ease", touchAction: "pan-y" }}
      >
        {children}
      </div>
    </div>
  );
}

// Lista con arrastrar-y-soltar (pointer events, funciona con dedo o mouse).
// Cada elemento se mueve visualmente mientras se arrastra desde su "handle";
// al cruzar la mitad de otro elemento, intercambian de lugar en el arreglo.
// onReorder recibe el arreglo ya reordenado (no guarda nada por sí sola).
function ReorderableList({ items, renderItem, onReorder }) {
  const itemRefs = useRef([]);
  const [dragIndex, setDragIndex] = useState(null);
  const [dragY, setDragY] = useState(0);
  const startYRef = useRef(0);
  const itemHeightRef = useRef(60);

  function onHandlePointerDown(e, index) {
    e.preventDefault();
    startYRef.current = e.clientY;
    setDragY(0);
    setDragIndex(index);
    const el = itemRefs.current[index];
    if (el) itemHeightRef.current = el.getBoundingClientRect().height + 8;
    try {
      e.target.setPointerCapture?.(e.pointerId);
    } catch {
      // algunos navegadores viejos no soportan setPointerCapture — no es crítico.
    }
  }

  function onPointerMove(e) {
    if (dragIndex === null) return;
    const delta = e.clientY - startYRef.current;
    setDragY(delta);
    const steps = Math.round(delta / itemHeightRef.current);
    if (steps !== 0) {
      const newIndex = Math.min(items.length - 1, Math.max(0, dragIndex + steps));
      if (newIndex !== dragIndex) {
        const next = [...items];
        const [moved] = next.splice(dragIndex, 1);
        next.splice(newIndex, 0, moved);
        onReorder(next);
        setDragIndex(newIndex);
        startYRef.current = e.clientY;
        setDragY(0);
      }
    }
  }

  function endDrag() {
    setDragIndex(null);
    setDragY(0);
  }

  return (
    <div onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag}>
      {items.map((item, i) => (
        <div
          key={item.exerciseId}
          ref={(el) => (itemRefs.current[i] = el)}
          style={{
            transform: dragIndex === i ? `translateY(${dragY}px)` : "none",
            position: "relative",
            zIndex: dragIndex === i ? 2 : 1,
            transition: dragIndex === i ? "none" : "transform 0.15s ease",
          }}
        >
          {renderItem(item, i, (e) => onHandlePointerDown(e, i))}
        </div>
      ))}
    </div>
  );
}

function PillButton({ children, onClick, subtitle, compact, muted, starred, onEdit, onDelete, onCheck, onPhoto, checked, highlighted }) {
  const btn = (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: compact ? "11px 16px" : "16px 18px",
        borderRadius: compact ? 16 : 999,
        border: checked ? `1px solid ${CURRENT_ACCENT.solid}` : highlighted ? `1.5px solid ${CURRENT_ACCENT.solid}` : "1px solid #33312e",
        background: checked ? `${CURRENT_ACCENT.solid}26` : highlighted ? "#2a1d15" : "#1f1e1c",
        color: "#f2ede6",
        fontSize: 16,
        fontWeight: 500,
        textAlign: "left",
        cursor: "pointer",
      }}
    >
      <span style={{ flex: 1, minWidth: 0 }}>
        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6 }}>
          {starred && <Star size={13} color={CURRENT_ACCENT.solid} fill={CURRENT_ACCENT.solid} style={{ flexShrink: 0 }} />}
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{children}</span>
        </div>
        {subtitle && (
          <div style={{ fontSize: 12.5, color: muted ? "#6e6a65" : "#a39d95", marginTop: 3 }}>{subtitle}</div>
        )}
      </span>
      <ChevronRight size={18} color="#6e6a65" style={{ flexShrink: 0 }} />
    </button>
  );
  if (!onEdit && !onDelete && !onCheck && !onPhoto) return <div style={{ marginBottom: compact ? 8 : 10 }}>{btn}</div>;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2, marginBottom: compact ? 8 : 10 }}>
      {onCheck && (
        <button
          onClick={onCheck}
          style={{
            width: 38,
            height: 38,
            flexShrink: 0,
            borderRadius: "50%",
            border: checked ? "none" : "1.5px solid #4a4640",
            background: checked ? CURRENT_ACCENT.solid : "transparent",
            color: checked ? CURRENT_ACCENT.text : "#5c5851",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Check size={16} strokeWidth={3} />
        </button>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        {onDelete ? (
          <SwipeToDelete onDelete={onDelete} radius={compact ? 16 : 999}>
            {btn}
          </SwipeToDelete>
        ) : (
          btn
        )}
      </div>
      {onPhoto && (
        <button
          onClick={onPhoto}
          aria-label="Ver foto del ejercicio"
          style={{ width: 32, flexShrink: 0, border: "none", background: "transparent", color: "#5c5851", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <Eye size={16} />
        </button>
      )}
      {onEdit && (
        <button
          onClick={onEdit}
          style={{ width: 32, flexShrink: 0, border: "none", background: "transparent", color: "#5c5851", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <Pencil size={14} />
        </button>
      )}
    </div>
  );
}

// Chip de filtro (músculo / equipo / tipo de movimiento) para el buscador
// avanzado de ejercicios. Se puede tocar para activar/desactivar.
function FilterChip({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "7px 13px",
        borderRadius: 999,
        border: active ? `1px solid ${CURRENT_ACCENT.solid}` : "1px solid #33312e",
        background: active ? `${CURRENT_ACCENT.solid}26` : "#1a1917",
        color: active ? CURRENT_ACCENT.solid : "#a39d95",
        fontSize: 12.5,
        fontWeight: 600,
        cursor: "pointer",
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}

function Field({ label, ...props }) {
  return (
    <label style={{ display: "block", marginBottom: 14 }}>
      <div style={{ fontSize: 12.5, color: "#a39d95", marginBottom: 6, fontWeight: 500, letterSpacing: 0.2 }}>{label}</div>
      <input
        {...props}
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: "13px 14px",
          borderRadius: 12,
          border: "1px solid #35322e",
          background: "#1a1917",
          color: "#f2ede6",
          fontSize: 15.5,
          outline: "none",
        }}
      />
    </label>
  );
}

function SelectField({ label, value, onChange, options }) {
  return (
    <label style={{ display: "block", marginBottom: 14 }}>
      <div style={{ fontSize: 12.5, color: "#a39d95", marginBottom: 6, fontWeight: 500, letterSpacing: 0.2 }}>{label}</div>
      <select
        value={value}
        onChange={onChange}
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: "13px 14px",
          borderRadius: 12,
          border: "1px solid #35322e",
          background: "#1a1917",
          color: "#f2ede6",
          fontSize: 15.5,
          outline: "none",
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function PrimaryButton({ children, onClick, disabled, style }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: "100%",
        padding: "14px 18px",
        borderRadius: 999,
        border: "none",
        background: disabled ? "#4a3a30" : CURRENT_ACCENT.solid,
        color: CURRENT_ACCENT.text,
        fontSize: 16,
        fontWeight: 600,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.6 : 1,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function DashedButton({ children, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: "13px 18px",
        borderRadius: 999,
        border: "1.5px dashed #4a4640",
        background: "transparent",
        color: CURRENT_ACCENT.solid,
        fontSize: 14.5,
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

// Tarjeta de una comida en la pantalla de Calorías. Se resalta con el color de
// acento (como el día de hoy en el calendario) en cuanto tiene texto, foto o
// kcal, y se mantiene resaltada aunque se abra otra comida.
function CalorieMealCard({ meal, data, isOpen, onToggle, onTextChange, onKcalChange, onMacroChange, onPickPhoto, onRemovePhoto }) {
  const accent = CURRENT_ACCENT;
  const hasContent = mealHasAnything(data);
  const score = mealNutritionScore(data);
  return (
    <div
      style={{
        borderRadius: 18,
        border: hasContent ? `1.5px solid ${accent.solid}` : "1px solid #2c2924",
        background: hasContent ? `${accent.solid}1f` : "#1f1e1c",
        marginBottom: 10,
        overflow: "hidden",
        transition: "border 0.15s ease, background 0.15s ease",
      }}
    >
      <button
        onClick={onToggle}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "15px 16px",
          background: "none",
          border: "none",
          color: "#f2ede6",
          textAlign: "left",
          cursor: "pointer",
        }}
      >
        <span
          style={{
            width: 9,
            height: 9,
            borderRadius: "50%",
            flexShrink: 0,
            background: hasContent ? accent.solid : "#4a4640",
          }}
        />
        <span style={{ flex: 1, fontSize: 15.5, fontWeight: 600 }}>{meal.label}</span>
        {data.kcal !== "" && (
          <span style={{ fontSize: 12.5, color: accent.solid, fontWeight: 700, flexShrink: 0 }}>{data.kcal} kcal</span>
        )}
        {score && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: score.color,
              background: `${score.color}22`,
              padding: "3px 8px",
              borderRadius: 999,
              flexShrink: 0,
            }}
          >
            {score.label}
          </span>
        )}
        {isOpen ? <ChevronUp size={17} color="#8a8580" /> : <ChevronDown size={17} color="#8a8580" />}
      </button>

      {isOpen && (
        <div style={{ padding: "0 16px 16px" }}>
          <textarea
            value={data.texto}
            onChange={(e) => onTextChange(e.target.value)}
            placeholder="Ej. arroz, pollo y ensalada"
            rows={2}
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "11px 12px",
              borderRadius: 12,
              border: "1px solid #35322e",
              background: "#1a1917",
              color: "#f2ede6",
              fontSize: 14.5,
              outline: "none",
              resize: "none",
              fontFamily: "inherit",
              marginBottom: 10,
            }}
          />

          {data.foto ? (
            <div style={{ position: "relative", marginBottom: 10, width: 92 }}>
              <img src={data.foto} alt={meal.label} style={{ width: 92, height: 92, borderRadius: 12, objectFit: "cover", display: "block" }} />
              <button
                onClick={onRemovePhoto}
                aria-label="Quitar foto"
                style={{
                  position: "absolute",
                  top: -7,
                  right: -7,
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  border: "none",
                  background: "#141311",
                  color: "#f2ede6",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                }}
              >
                <X size={13} />
              </button>
            </div>
          ) : (
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "9px 14px",
                borderRadius: 999,
                border: "1.5px dashed #4a4640",
                color: accent.solid,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                marginBottom: 10,
              }}
            >
              <Plus size={14} /> Subir foto
              <input type="file" accept="image/*" onChange={onPickPhoto} style={{ display: "none" }} />
            </label>
          )}

          <label style={{ display: "block", marginBottom: 12 }}>
            <div style={{ fontSize: 11.5, color: "#a39d95", marginBottom: 5, fontWeight: 500 }}>Kcal</div>
            <input
              type="number"
              min="0"
              inputMode="numeric"
              value={data.kcal}
              onChange={(e) => onKcalChange(e.target.value)}
              placeholder="Ej. 450"
              style={{
                width: 120,
                boxSizing: "border-box",
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #35322e",
                background: "#1a1917",
                color: "#f2ede6",
                fontSize: 14.5,
                outline: "none",
              }}
            />
          </label>

          <div style={{ display: "flex", gap: 8 }}>
            {MACRO_FIELDS.map((mf) => (
              <label key={mf.key} style={{ display: "block", flex: 1 }}>
                <div style={{ fontSize: 11.5, color: mf.color, marginBottom: 5, fontWeight: 600 }}>{mf.label} (g)</div>
                <input
                  type="number"
                  min="0"
                  inputMode="numeric"
                  value={data[mf.key]}
                  onChange={(e) => onMacroChange(mf.key, e.target.value)}
                  placeholder="0"
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid #35322e",
                    background: "#1a1917",
                    color: "#f2ede6",
                    fontSize: 14.5,
                    outline: "none",
                  }}
                />
              </label>
            ))}
          </div>

          {score ? (
            <div style={{ marginTop: 14 }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 11.5, color: "#a39d95", fontWeight: 500 }}>Puntuación nutricional</span>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: score.color }}>
                  {score.label} · {score.score}
                </span>
              </div>
              <div style={{ height: 6, borderRadius: 999, background: "#2c2924", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${score.score}%`, background: score.color, borderRadius: 999 }} />
              </div>
            </div>
          ) : (
            data.kcal !== "" && (
              <div style={{ fontSize: 11, color: "#6e6a65", marginTop: 12 }}>
                Agrega los gramos de carbos, grasas y proteínas para ver la puntuación de esta comida.
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

// Tarjeta de "Calorías gastadas hoy" en la pantalla de Calorías. Si falta el
// perfil (edad/peso/sexo/estatura) muestra el formulario para cargarlo; si ya
// está, muestra el gasto estimado (basal + ejercicio si el día está marcado)
// y lo compara contra lo consumido para decir si hay déficit o superávit.
function CalorieExpenditureCard({
  user,
  consumedKcal,
  isTrainingDay,
  workoutKcal,
  editing,
  form,
  onChangeForm,
  onStartEdit,
  onSave,
  onCancel,
  error,
}) {
  const accent = CURRENT_ACCENT;
  const profileComplete = hasCalorieProfile(user);

  if (editing || !profileComplete) {
    return (
      <div style={{ borderRadius: 18, border: "1px solid #2c2924", background: "#1f1e1c", padding: "16px", marginBottom: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 3 }}>Calorías gastadas hoy</div>
        <div style={{ fontSize: 12.5, color: "#8a8580", marginBottom: 14, lineHeight: 1.4 }}>
          Con tu edad, peso, sexo y estatura calculo un estimado de tu gasto energético diario (no es exacto, es una referencia).
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1 }}>
            <Field label="Edad" type="number" min="10" max="100" inputMode="numeric" value={form.edad} onChange={(e) => onChangeForm({ edad: e.target.value })} placeholder="Ej. 28" />
          </div>
          <div style={{ flex: 1 }}>
            <Field label="Peso (kg)" type="number" min="30" step="0.5" inputMode="decimal" value={form.peso} onChange={(e) => onChangeForm({ peso: e.target.value })} placeholder="Ej. 70" />
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1 }}>
            <Field label="Estatura (cm)" type="number" min="100" max="230" inputMode="numeric" value={form.estatura} onChange={(e) => onChangeForm({ estatura: e.target.value })} placeholder="Ej. 170" />
          </div>
          <div style={{ flex: 1 }}>
            <SelectField
              label="Sexo"
              value={form.sexo}
              onChange={(e) => onChangeForm({ sexo: e.target.value })}
              options={[{ value: "M", label: "Hombre" }, { value: "F", label: "Mujer" }]}
            />
          </div>
        </div>
        {error && <div style={{ color: "#e0725e", fontSize: 13, marginBottom: 10 }}>{error}</div>}
        <div style={{ display: "flex", gap: 8 }}>
          <PrimaryButton onClick={onSave} style={{ flex: 1 }}>Guardar</PrimaryButton>
          {profileComplete && (
            <button
              onClick={onCancel}
              style={{ padding: "0 18px", borderRadius: 999, border: "1px solid #35322e", background: "transparent", color: "#a39d95", fontSize: 14, cursor: "pointer" }}
            >
              Cancelar
            </button>
          )}
        </div>
      </div>
    );
  }

  const bmr = calcBMR({ pesoKg: user.pesoCorporalKg, estaturaCm: user.estaturaCm, edad: user.edad, sexo: user.sexo });
  const basal = Math.round(bmr * BASE_ACTIVITY_FACTOR);
  const totalGastado = basal + (isTrainingDay ? workoutKcal : 0);
  const balance = consumedKcal - totalGastado;
  const isDeficit = balance < -20;
  const isSuperavit = balance > 20;
  const balanceColor = isDeficit ? "#3ecf8e" : isSuperavit ? "#e0a92e" : "#8a8580";
  const balanceLabel = isDeficit ? "Déficit" : isSuperavit ? "Superávit" : "Equilibrado";

  return (
    <div style={{ borderRadius: 18, border: "1px solid #2c2924", background: "#1f1e1c", padding: "16px", marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Calorías gastadas hoy</div>
        <button onClick={onStartEdit} aria-label="Editar datos" style={{ background: "none", border: "none", color: "#8a8580", cursor: "pointer", padding: 2, flexShrink: 0 }}>
          <Pencil size={14} />
        </button>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1 }}>{totalGastado}</div>
          <div style={{ fontSize: 11, color: "#8a8580", marginTop: 4 }}>kcal gastadas (estimado)</div>
        </div>
        <div style={{ width: 1, background: "#2c2924" }} />
        <div style={{ flex: 1, textAlign: "right" }}>
          <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1, color: balanceColor }}>{balance > 0 ? "+" : ""}{balance}</div>
          <div style={{ fontSize: 11, color: "#8a8580", marginTop: 4 }}>{balanceLabel} de kcal</div>
        </div>
      </div>

      <div style={{ fontSize: 11.5, color: "#6e6a65", lineHeight: 1.5 }}>
        Basal + reposo: {basal} kcal
        {isTrainingDay ? ` · Ejercicio de hoy: +${workoutKcal} kcal` : " · Hoy no está marcado como día de ejercicio"}
      </div>
    </div>
  );
}

// Calendario desplegable de días completados. Maneja su propio mes en pantalla;
// completedDays (Set de "YYYY-MM-DD") y onToggleDay vienen de <App>.
// El día marcado se pinta con el color de acento del usuario (el mismo que
// el botón "Marcar día de hoy"), para que todo el "día completado" se vea
// consistente en toda la app.
function RoutineCalendar({ completedDays, onToggleDay }) {
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const today = todayISO();
  const isCurrentMonth = viewYear === now.getFullYear() && viewMonth === now.getMonth();

  const goPrev = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else setViewMonth((m) => m - 1);
  };
  const goNext = () => {
    if (isCurrentMonth) return;
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else setViewMonth((m) => m + 1);
  };

  const firstDay = new Date(viewYear, viewMonth, 1);
  const startOffset = (firstDay.getDay() + 6) % 7; // lunes=0 ... domingo=6
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div style={{ marginTop: 10, padding: "16px 14px", borderRadius: 18, border: "1px solid #2a2824", background: "#1a1917" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <button
          onClick={goPrev}
          style={{ width: 30, height: 30, borderRadius: "50%", border: "1px solid #33312e", background: "#1f1e1c", color: "#f2ede6", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
        >
          <ChevronLeft size={16} />
        </button>
        <div style={{ fontSize: 14.5, fontWeight: 700, color: "#f2ede6" }}>
          {MESES[viewMonth]} {viewYear}
        </div>
        <button
          onClick={goNext}
          disabled={isCurrentMonth}
          style={{
            width: 30,
            height: 30,
            borderRadius: "50%",
            border: "1px solid #33312e",
            background: isCurrentMonth ? "#181715" : "#1f1e1c",
            color: isCurrentMonth ? "#4a463f" : "#f2ede6",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: isCurrentMonth ? "default" : "pointer",
          }}
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 6 }}>
        {DIAS_CORTOS.map((d, i) => (
          <div key={i} style={{ textAlign: "center", fontSize: 11, color: "#6e6a65", fontWeight: 600 }}>
            {d}
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
        {cells.map((d, i) => {
          if (d === null) return <div key={i} />;
          const key = fechaKey(viewYear, viewMonth, d);
          const isFuture = key > today;
          const isPastWeek = key < mondayOfCurrentWeekISO();
          const isToday = key === today;
          const isDone = completedDays.has(key);
          const isDisabled = isFuture || isPastWeek;
          return (
            <button
              key={i}
              disabled={isDisabled}
              onClick={() => onToggleDay(key)}
              style={{
                aspectRatio: "1 / 1",
                borderRadius: 10,
                border: isToday && !isDone ? `1.5px solid ${CURRENT_ACCENT.solid}` : "1px solid transparent",
                background: isDone ? CURRENT_ACCENT.solid : "transparent",
                color: isDisabled ? "#4a463f" : isDone ? CURRENT_ACCENT.text : "#d7d2ca",
                fontSize: 13,
                fontWeight: isDone ? 700 : 500,
                cursor: isDisabled ? "default" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {d}
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 14, fontSize: 11.5, color: "#8a8580" }}>
        <div style={{ width: 10, height: 10, borderRadius: 4, background: CURRENT_ACCENT.solid }} />
        Toca cualquier día pasado o de hoy para marcarlo o desmarcarlo
      </div>
    </div>
  );
}

function TopBar({ title, onBack, right }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22, minHeight: 30 }}>
      {onBack && (
        <button onClick={onBack} style={{ background: "none", border: "none", color: "#c9c4bd", cursor: "pointer", padding: 4, display: "flex" }}>
          <ArrowLeft size={22} />
        </button>
      )}
      {title && <div style={{ fontSize: 15, fontWeight: 600, color: "#c9c4bd", flex: 1, minWidth: 0 }}>{title}</div>}
      {right}
    </div>
  );
}

// Selector kg/lb: se puede tocar en cualquier momento para cambiar cómo se
// ve el peso en esa pantalla (PR y registro). No pregunta nada, cambia al toque.
function UnitToggle({ unit, onChange }) {
  return (
    <div style={{ display: "flex", background: "#1a1917", border: "1px solid #33312e", borderRadius: 999, padding: 3, gap: 2, flexShrink: 0 }}>
      {["kg", "lb"].map((u) => (
        <button
          key={u}
          onClick={() => onChange(u)}
          style={{
            border: "none",
            background: unit === u ? CURRENT_ACCENT.solid : "transparent",
            color: unit === u ? CURRENT_ACCENT.text : "#a39d95",
            fontSize: 12.5,
            fontWeight: 700,
            padding: "6px 13px",
            borderRadius: 999,
            cursor: "pointer",
          }}
        >
          {u}
        </button>
      ))}
    </div>
  );
}

// Imagen de insignia con reemplazo si todavía no subiste ese archivo (ej. niveles
// intermedios que aún no has generado en ChatGPT).
// Ajusta estos dos números si la insignia necesita recortarse más o menos:
// BADGE_ZOOM > 1 agranda la imagen dentro del círculo (recorta bordes).
// BADGE_SHIFT_UP_PCT sube la imagen para tapar el espacio vacío de arriba (más alto = sube más).
const BADGE_ZOOM = 1.05;
const BADGE_SHIFT_UP_PCT = 4;

function BadgeImg({ animal, tier, size, src }) {
  const [failed, setFailed] = useState(false);
  const imgSrc = src || badgeImageSrc(animal, tier);
  if (failed) {
    return (
      <div style={{ width: size, height: size, borderRadius: "50%", background: "#232019", border: "1px solid #33312e", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Medal size={Math.round(size * 0.45)} color="#8a8580" />
      </div>
    );
  }
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", overflow: "hidden", flexShrink: 0 }}>
      <img
        src={imgSrc}
        alt={animal ? `${animal} ${tier} días` : "insignia"}
        onError={() => setFailed(true)}
        style={{
          width: `${BADGE_ZOOM * 100}%`,
          height: `${BADGE_ZOOM * 100}%`,
          objectFit: "cover",
          display: "block",
          transform: `translateY(-${BADGE_SHIFT_UP_PCT}%)`,
        }}
      />
    </div>
  );
}

// Tarjeta de un amigo en la pantalla "Amigos": insignia de la semana en curso
// (si ya entrenó 2+ días) y las insignias que eligió destacar. No se muestra
// el conteo de días porque la insignia ya lo representa.
const SWIPE_REVEAL = 68;

function FriendCard({ friend, accent, onRemove, onSelect }) {
  const [open, setOpen] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startXRef = useRef(0);
  const movedRef = useRef(false);

  const currentWeekBadge = computeCurrentWeekBadge(friend.completedDays);
  const earnedBadges = computeEarnedBadges(friend.completedDays);
  const specialBadges = ownedSpecialBadges(friend);
  const selectable = [
    ...earnedBadges.map((b) => ({ id: b.weekKey, animal: b.animal, tier: b.tier })),
    ...specialBadges,
  ];
  const badgeSlots = (friend.selectedBadges || []).map((id) => selectable.find((b) => b.id === id)).filter(Boolean);
  const friendAccent = ACCENTS[friend.accentColor] || ACCENTS.coral;

  function onPointerDown(e) {
    setDragging(true);
    movedRef.current = false;
    startXRef.current = e.clientX;
  }
  function onPointerMove(e) {
    if (!dragging) return;
    const delta = e.clientX - startXRef.current;
    if (Math.abs(delta) > 4) movedRef.current = true;
    const base = open ? -SWIPE_REVEAL : 0;
    setDragX(Math.min(0, Math.max(-SWIPE_REVEAL - 16, base + delta)));
  }
  function onPointerUp() {
    if (!dragging) return;
    setDragging(false);
    if (!movedRef.current && open) {
      setOpen(false);
      setDragX(0);
      return;
    }
    if (dragX <= -SWIPE_REVEAL / 2) {
      setOpen(true);
      setDragX(-SWIPE_REVEAL);
    } else {
      setOpen(false);
      setDragX(0);
    }
  }

  const translate = dragging ? dragX : open ? -SWIPE_REVEAL : 0;

  return (
    <div style={{ position: "relative", borderRadius: 22, overflow: "hidden", marginBottom: 14 }}>
      <div style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: SWIPE_REVEAL, background: "#a4483a", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <button
          onClick={() => onRemove(friend)}
          aria-label="Eliminar amigo"
          style={{ width: "100%", height: "100%", border: "none", background: "none", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <X size={19} strokeWidth={2.5} />
        </button>
      </div>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => dragging && onPointerUp()}
        style={{
          position: "relative",
          transform: `translateX(${translate}px)`,
          transition: dragging ? "none" : "transform 0.2s ease",
          border: "1px solid #2c2924",
          background: "#1a1917",
          padding: "16px 18px",
          touchAction: "pan-y",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSelect(friend);
              }}
              aria-label={`Ver detalle de ${friend.displayName || friend.username}`}
              style={{
                width: 42,
                height: 42,
                borderRadius: "50%",
                border: "none",
                padding: 0,
                cursor: "pointer",
                background: `linear-gradient(145deg, ${friendAccent.from} 0%, ${friendAccent.to} 100%)`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                fontWeight: 800,
                fontSize: 16,
                color: friendAccent.text,
              }}
            >
              {(friend.displayName || friend.username || "?")[0].toUpperCase()}
            </button>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#f2ede6" }}>{friend.displayName || friend.username}</div>
              <div style={{ fontSize: 12.5, color: "#6e6a65", marginTop: 2 }}>@{friend.username}</div>
            </div>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSelect(friend);
            }}
            aria-label={`Ver detalle de ${friend.displayName || friend.username}`}
            style={{ flexShrink: 0, background: "none", border: "none", padding: 0, cursor: "pointer" }}
          >
            <BadgeImg animal={currentWeekBadge?.animal} tier={currentWeekBadge?.tier} size={54} />
          </button>
        </div>

        <div style={{ height: 1, background: "#2a2824", margin: "14px 0 12px" }} />

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 12, color: "#8a8580", fontWeight: 600 }}>Insignias destacadas</span>
          {badgeSlots.length === 0 ? (
            <span style={{ fontSize: 12, color: "#6e6a65" }}>Aún ninguna</span>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSelect(friend);
              }}
              aria-label={`Ver detalle de ${friend.displayName || friend.username}`}
              style={{ display: "flex", gap: 8, background: "none", border: "none", padding: 0, cursor: "pointer" }}
            >
              {badgeSlots.map((b, i) => (
                <BadgeImg key={i} animal={b.animal} tier={b.tier} src={b.src} size={54} />
              ))}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Vista ampliada de un amigo: se abre al tocar su avatar en la tarjeta.
// Muestra la insignia de la semana y las destacadas en grande (mismo tamaño
// entre ellas), para poder verlas bien sin tener que entrecerrar los ojos.
const FRIEND_DETAIL_BADGE_SIZE = 110;

function FriendDetailOverlay({ friend, accent, onClose }) {
  const currentWeekBadge = computeCurrentWeekBadge(friend.completedDays);
  const earnedBadges = computeEarnedBadges(friend.completedDays);
  const specialBadges = ownedSpecialBadges(friend);
  const selectable = [
    ...earnedBadges.map((b) => ({ id: b.weekKey, animal: b.animal, tier: b.tier })),
    ...specialBadges,
  ];
  const badgeSlots = (friend.selectedBadges || []).map((id) => selectable.find((b) => b.id === id)).filter(Boolean);
  const friendAccent = ACCENTS[friend.accentColor] || ACCENTS.coral;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(15,14,13,0.94)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
        padding: "0 20px",
        zIndex: 50,
      }}
    >
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: "50%",
          background: `linear-gradient(145deg, ${friendAccent.from} 0%, ${friendAccent.to} 100%)`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 800,
          fontSize: 26,
          color: friendAccent.text,
        }}
      >
        {(friend.displayName || friend.username || "?")[0].toUpperCase()}
      </div>

      <div style={{ textAlign: "center", marginTop: -6 }}>
        <div style={{ fontSize: 19, fontWeight: 700, color: "#f2ede6" }}>{friend.displayName || friend.username}</div>
        <div style={{ fontSize: 13, color: "#6e6a65", marginTop: 2 }}>@{friend.username}</div>
      </div>

      <BadgeImg animal={currentWeekBadge?.animal} tier={currentWeekBadge?.tier} size={FRIEND_DETAIL_BADGE_SIZE} />

      {badgeSlots.length > 0 && (
        <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
          {badgeSlots.map((b, i) => (
            <BadgeImg key={i} animal={b.animal} tier={b.tier} src={b.src} size={FRIEND_DETAIL_BADGE_SIZE} />
          ))}
        </div>
      )}

      <button
        onClick={onClose}
        aria-label="Cerrar"
        style={{
          marginTop: 6,
          width: 44,
          height: 44,
          borderRadius: "50%",
          border: "1px solid #33312e",
          background: "#1f1e1c",
          color: "#c9c4bd",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
        }}
      >
        <X size={20} />
      </button>
    </div>
  );
}

// Una fila de solicitud de amistad, reutilizada en la vista corta y en "Ver todas".
function FriendRequestRow({ req, accent, onAccept, onReject }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, borderRadius: 16, border: "1px solid #2c2924", background: "#1a1917", padding: "12px 14px", marginBottom: 10 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 700, color: "#f2ede6" }}>{req.fromDisplayName}</div>
        <div style={{ fontSize: 12, color: "#8a8580" }}>@{req.fromUsername}</div>
      </div>
      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        <button
          onClick={() => onReject(req)}
          aria-label="Rechazar"
          style={{ width: 34, height: 34, borderRadius: "50%", border: "1px solid #33312e", background: "#141311", color: "#a39d95", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <X size={16} />
        </button>
        <button
          onClick={() => onAccept(req)}
          aria-label="Aceptar"
          style={{ width: 34, height: 34, borderRadius: "50%", border: "none", background: accent.solid, color: accent.text, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <Check size={16} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}

function BadgeCelebrationOverlay({ animal, tier, onClose }) {
  const [stage, setStage] = useState(0); // 0: entrando, 1: badge visible, 2: texto visible
  useEffect(() => {
    const t1 = setTimeout(() => setStage(1), 60);
    const t2 = setTimeout(() => setStage(2), 420);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,14,13,0.92)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        zIndex: 60,
        textAlign: "center",
        padding: "0 24px",
      }}
    >
      <div
        style={{
          width: 132,
          height: 132,
          opacity: stage >= 1 ? 1 : 0,
          transform: stage >= 1 ? "scale(1)" : "scale(0.4)",
          transition: "opacity 0.35s ease, transform 0.5s cubic-bezier(.34,1.56,.64,1)",
        }}
      >
        <BadgeImg animal={animal} tier={tier} size={132} />
      </div>

      <div style={{ opacity: stage >= 2 ? 1 : 0, transition: "opacity 0.4s ease", marginTop: 6 }}>
        <div style={{ fontSize: 19, fontWeight: 700, color: "#f2ede6", marginBottom: 4 }}>¡Nueva insignia!</div>
        <div style={{ fontSize: 14, color: "#a39d95" }}>{tier} días seguidos esta semana</div>
      </div>

      <button
        onClick={onClose}
        style={{
          opacity: stage >= 2 ? 1 : 0,
          transition: "opacity 0.4s ease",
          marginTop: 14,
          padding: "9px 22px",
          borderRadius: 999,
          border: "1px solid #33312e",
          background: "#1f1e1c",
          color: "#f2ede6",
          fontSize: 13.5,
          cursor: "pointer",
        }}
      >
        Genial
      </button>
    </div>
  );
}

function ExercisePhotoOverlay({ name, src, onClose }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prevOverflow; };
  }, []);
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,14,13,0.94)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        zIndex: 50,
        padding: "0 24px",
        boxSizing: "border-box",
      }}
    >
      {failed ? (
        <div style={{ width: "100%", maxWidth: 320, aspectRatio: "1", borderRadius: 18, border: "1px solid #2a2824", background: "#1a1917", display: "flex", alignItems: "center", justifyContent: "center", color: "#6e6a65", fontSize: 13, textAlign: "center", padding: 20, boxSizing: "border-box" }}>
          Todavía no subiste la foto de este ejercicio
        </div>
      ) : (
        <img
          src={src}
          alt={name}
          onError={() => setFailed(true)}
          style={{ width: "100%", maxWidth: 320, borderRadius: 18, border: "1px solid #2a2824", background: "#1a1917" }}
        />
      )}
      <div style={{ color: "#f2ede6", fontSize: 16, fontWeight: 500, textAlign: "center" }}>{name}</div>

      <button
        onClick={onClose}
        aria-label="Cerrar"
        style={{
          marginTop: 4,
          width: 44,
          height: 44,
          borderRadius: "50%",
          border: "1px solid #33312e",
          background: "#1f1e1c",
          color: "#c9c4bd",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
        }}
      >
        <X size={20} />
      </button>
    </div>
  );
}

function RestTimerOverlay({ accent, presetIndex, onPickPreset, secondsLeft, running, onToggleRunning, onReset, onClose }) {
  const total = REST_PRESETS[presetIndex];
  const progress = total > 0 ? (total - secondsLeft) / total : 0;
  const radius = 42;
  const circ = 2 * Math.PI * radius;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(15,14,13,0.92)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
        zIndex: 50,
      }}
    >
      <div style={{ display: "flex", gap: 8 }}>
        {REST_PRESETS.map((p, i) => (
          <button
            key={p}
            onClick={() => onPickPreset(i)}
            style={{
              padding: "5px 12px",
              borderRadius: 999,
              border: i === presetIndex ? `1px solid ${accent.solid}` : "1px solid #33312e",
              background: i === presetIndex ? "#2a1d15" : "transparent",
              color: i === presetIndex ? accent.solid : "#8a8580",
              fontSize: 12.5,
              cursor: "pointer",
            }}
          >
            {p}s
          </button>
        ))}
      </div>

      <div style={{ position: "relative", width: 160, height: 160 }}>
        <svg width="160" height="160" style={{ transform: "rotate(-90deg)" }}>
          <circle cx="80" cy="80" r={radius} fill="none" stroke="#2a2824" strokeWidth="8" />
          <circle
            cx="80"
            cy="80"
            r={radius}
            fill="none"
            stroke={accent.solid}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={circ * (1 - progress)}
            style={{ transition: "stroke-dashoffset 1s linear" }}
          />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, fontWeight: 700 }}>
          {fmtSeconds(secondsLeft)}
        </div>
      </div>

      <div style={{ display: "flex", gap: 12 }}>
        <button
          onClick={onReset}
          style={{ width: 46, height: 46, borderRadius: "50%", border: "1px solid #33312e", background: "#1f1e1c", color: "#c9c4bd", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
        >
          <RotateCcw size={18} />
        </button>
        <button
          onClick={onToggleRunning}
          style={{ width: 62, height: 62, borderRadius: "50%", border: "none", background: accent.solid, color: accent.text, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
        >
          {running ? <Pause size={24} /> : <Play size={24} />}
        </button>
      </div>

      <button
        onClick={onClose}
        aria-label="Cerrar"
        style={{
          width: 44,
          height: 44,
          borderRadius: "50%",
          border: "1px solid #33312e",
          background: "#1f1e1c",
          color: "#c9c4bd",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
        }}
      >
        <X size={20} />
      </button>
    </div>
  );
}

function Calc1RMOverlay({ accent, weight, reps, onWeightChange, onRepsChange, onClose }) {
  const est = epley1RM(weight, reps);
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(15,14,13,0.92)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "0 26px",
        zIndex: 50,
      }}
    >
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 18 }}>Calculadora de 1RM</div>

      <label style={{ display: "block", marginBottom: 14 }}>
        <div style={{ fontSize: 12.5, color: "#a39d95", marginBottom: 6 }}>Peso usado (kg)</div>
        <input
          type="number"
          value={weight}
          onChange={(e) => onWeightChange(e.target.value)}
          placeholder="Ej. 70"
          style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 14, border: "1px solid #33312e", background: "#1a1917", color: "#f2ede6", fontSize: 15 }}
        />
      </label>
      <label style={{ display: "block", marginBottom: 18 }}>
        <div style={{ fontSize: 12.5, color: "#a39d95", marginBottom: 6 }}>Repeticiones hechas</div>
        <input
          type="number"
          value={reps}
          onChange={(e) => onRepsChange(e.target.value)}
          placeholder="Ej. 8"
          style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 14, border: "1px solid #33312e", background: "#1a1917", color: "#f2ede6", fontSize: 15 }}
        />
      </label>

      <div style={{ borderRadius: 16, background: "#1f1e1c", border: "1px solid #2a2824", padding: "16px 18px", textAlign: "center" }}>
        <div style={{ fontSize: 11.5, color: "#8a8580", marginBottom: 4 }}>1RM estimado</div>
        <div style={{ fontSize: 26, fontWeight: 800, color: est ? accent.solid : "#5c5851" }}>{est ? `${est.toFixed(1)} kg` : "—"}</div>
      </div>
      <div style={{ fontSize: 11, color: "#6e6a65", marginTop: 10, textAlign: "center" }}>Fórmula de Epley: estimado, no un máximo real.</div>

      <button
        onClick={onClose}
        aria-label="Cerrar"
        style={{
          marginTop: 20,
          alignSelf: "center",
          width: 44,
          height: 44,
          borderRadius: "50%",
          border: "1px solid #33312e",
          background: "#1f1e1c",
          color: "#c9c4bd",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
        }}
      >
        <X size={20} />
      </button>
    </div>
  );
}

function SuccessOverlay({ message }) {
  return (
    <div style={{ position: "absolute", inset: 0, background: "rgba(15,14,13,0.88)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, zIndex: 50, animation: "fadeIn 0.18s ease-out" }}>
      <div style={{ width: 64, height: 64, borderRadius: "50%", background: CURRENT_ACCENT.solid, display: "flex", alignItems: "center", justifyContent: "center", animation: "popIn 0.35s cubic-bezier(.34,1.56,.64,1)" }}>
        <Check size={32} color={CURRENT_ACCENT.text} strokeWidth={3} />
      </div>
      <div style={{ color: "#f2ede6", fontSize: 15, fontWeight: 500 }}>{message}</div>
      <style>{`
        @keyframes popIn { 0% { transform: scale(0.4); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
        @keyframes fadeIn { 0% { opacity: 0; } 100% { opacity: 1; } }
      `}</style>
    </div>
  );
}

function NewRecordOverlay({ exerciseName, before, after, unit = "kg" }) {
  // "before" y "after" llegan en kg (así se guardan); se convierten aquí
  // nada más para mostrarlos en la unidad activa.
  const beforeDisplay = kgToUnit(before, unit);
  const afterDisplay = kgToUnit(after, unit);
  const diff = Math.round((afterDisplay - beforeDisplay) * 10) / 10;
  return (
    <div style={{ position: "absolute", inset: 0, background: "rgba(15,14,13,0.92)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, zIndex: 50, animation: "fadeIn 0.18s ease-out", textAlign: "center", padding: "0 24px" }}>
      <div style={{ width: 84, height: 84, borderRadius: "50%", background: `${CURRENT_ACCENT.solid}22`, border: `1.5px solid ${CURRENT_ACCENT.solid}`, display: "flex", alignItems: "center", justifyContent: "center", animation: "popIn 0.4s cubic-bezier(.34,1.56,.64,1)", marginBottom: 8 }}>
        <Trophy size={38} color={CURRENT_ACCENT.solid} />
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color: CURRENT_ACCENT.solid }}>¡Nuevo récord!</div>
      <div style={{ fontSize: 14.5, color: "#a39d95", marginBottom: 4 }}>{exerciseName}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <span style={{ fontSize: 16, color: "#8a8580", textDecoration: "line-through" }}>{beforeDisplay} {unit}</span>
        <span style={{ color: "#6e6a65", fontSize: 15 }}>→</span>
        <span style={{ fontSize: 26, fontWeight: 700, color: "#f2ede6" }}>{afterDisplay} {unit}</span>
      </div>
      <div style={{ marginTop: 4, padding: "4px 12px", borderRadius: 999, background: `${CURRENT_ACCENT.solid}22`, color: CURRENT_ACCENT.solid, fontSize: 13, fontWeight: 700 }}>
        +{diff} {unit}
      </div>
      <style>{`
        @keyframes popIn { 0% { transform: scale(0.4); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
        @keyframes fadeIn { 0% { opacity: 0; } 100% { opacity: 1; } }
      `}</style>
    </div>
  );
}

export default function App() {
  const [screen, setScreen] = useState("login");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(null);
  const [recordCelebration, setRecordCelebration] = useState(null); // { exerciseName, before, after }
  const [showPw, setShowPw] = useState(false);
  const [accentPickerOpen, setAccentPickerOpen] = useState(false);
  const [editingDisplayName, setEditingDisplayName] = useState(false);
  const [displayNameValue, setDisplayNameValue] = useState("");
  const [updatesOpen, setUpdatesOpen] = useState(false);
  const [allUpdatesOpen, setAllUpdatesOpen] = useState(false);
  const updatesButtonRef = useRef(null);

  const [photoExercise, setPhotoExercise] = useState(null); // ejercicio cuya foto se está mostrando en el overlay

  // Reordenar ejercicios de un día arrastrando, en vez de editar el "orden" uno por uno.
  const [reorderMode, setReorderMode] = useState(false);
  const [reorderList, setReorderList] = useState([]);

  // Buscador avanzado de "Agregar ejercicio": texto libre + filtros por
  // músculo, equipo y tipo de movimiento (compuesto/aislamiento/cardio).
  // Se abre con el ícono de lupa en la barra de arriba (como en la referencia).
  const [exerciseSearchOpen, setExerciseSearchOpen] = useState(false);
  const [exerciseSearchQuery, setExerciseSearchQuery] = useState("");
  const [exerciseFiltersOpen, setExerciseFiltersOpen] = useState(false);
  const [exerciseFilterMuscles, setExerciseFilterMuscles] = useState(() => new Set());
  const [exerciseFilterEquipo, setExerciseFilterEquipo] = useState(() => new Set());
  const [exerciseFilterTipo, setExerciseFilterTipo] = useState(() => new Set());
  // Pestañas de la librería de ejercicios: "musculo" muestra tarjetas por
  // músculo (2 columnas); "todos" muestra la lista completa sin agrupar.
  // libraryMuscleKey guarda en qué músculo se hizo clic para ver su detalle.
  const [libraryTab, setLibraryTab] = useState("musculo");
  const [libraryMuscleKey, setLibraryMuscleKey] = useState(null);
  function toggleInSet(setState, key) {
    setState((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const [restTimerOpen, setRestTimerOpen] = useState(false);
  const [restPresetIndex, setRestPresetIndex] = useState(1);
  const [restSecondsLeft, setRestSecondsLeft] = useState(REST_PRESETS[1]);
  const [restRunning, setRestRunning] = useState(false);
  const restIntervalRef = useRef(null);

  const [calc1rmOpen, setCalc1rmOpen] = useState(false);
  const [calcWeight, setCalcWeight] = useState("");
  const [calcReps, setCalcReps] = useState("");

  // Calorías del día: todo en memoria, nada se guarda ni se sube a ningún lado.
  const [caloriesDay, setCaloriesDay] = useState(() => todayISO());
  const [caloriesData, setCaloriesData] = useState(() => emptyCaloriesData());
  const [caloriesOpenMeal, setCaloriesOpenMeal] = useState(CALORIE_MEALS[0].key);
  const [caloriesAiUsesLeft, setCaloriesAiUsesLeft] = useState(CALORIES_AI_DAILY_LIMIT);
  const [caloriesAiLoading, setCaloriesAiLoading] = useState(false);
  // Perfil (edad/peso/sexo/estatura) para estimar el gasto energético. Se
  // guarda en Firestore junto con el resto del perfil del usuario.
  const [calorieProfileForm, setCalorieProfileForm] = useState({ edad: "", sexo: "M", estatura: "", peso: "" });
  const [calorieProfileEditing, setCalorieProfileEditing] = useState(false);
  const [calorieProfileError, setCalorieProfileError] = useState("");

  // Unidad de peso (kg/lb) para las pantallas de PR y registro. Se guarda en
  // el celular (no en Firestore) para que cada quien vea lo que prefiere.
  const [weightUnit, setWeightUnit] = useState(() => {
    try {
      return localStorage.getItem(WEIGHT_UNIT_STORAGE_KEY) === "lb" ? "lb" : "kg";
    } catch {
      return "kg";
    }
  });
  function changeWeightUnit(u) {
    setWeightUnit(u);
    try {
      localStorage.setItem(WEIGHT_UNIT_STORAGE_KEY, u);
    } catch {
      // localStorage no disponible — no es crítico.
    }
  }

  const [currentUser, setCurrentUser] = useState(null);
  const [rutina, setRutina] = useState({});
  const [exercisesMap, setExercisesMap] = useState({});
  const [customRoutinesMap, setCustomRoutinesMap] = useState({});
  const [currentDayKey, setCurrentDayKey] = useState(null);
  const [changingCategory, setChangingCategory] = useState(false);
  const [customLabelInput, setCustomLabelInput] = useState("");
  const [renamingRoutineId, setRenamingRoutineId] = useState(null);
  const [currentExercise, setCurrentExercise] = useState(null);
  const [pendingExerciseName, setPendingExerciseName] = useState(null);
  const [pendingExerciseId, setPendingExerciseId] = useState(null);
  const [editExercise, setEditExercise] = useState(false);
  const [editRecordId, setEditRecordId] = useState(null);
  const [trainingDayKey, setTrainingDayKey] = useState(() => {
    try {
      const raw = localStorage.getItem(TRAINING_STORAGE_KEY);
      return raw ? JSON.parse(raw).dayKey || null : null;
    } catch {
      return null;
    }
  });
  const [trainingCompleted, setTrainingCompleted] = useState(() => {
    try {
      const raw = localStorage.getItem(TRAINING_STORAGE_KEY);
      return raw ? new Set(JSON.parse(raw).completed || []) : new Set();
    } catch {
      return new Set();
    }
  });

  const [savedRoutinesMap, setSavedRoutinesMap] = useState({});
  const [openSavedId, setOpenSavedId] = useState(null);
  const [showWeekSummary, setShowWeekSummary] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const summaryButtonRef = useRef(null);
  const calendarButtonRef = useRef(null);
  const [completedDays, setCompletedDays] = useState(new Set());
  const [newBadgeCelebration, setNewBadgeCelebration] = useState(null); // { animal, tier } o null
  const [renamingSavedId, setRenamingSavedId] = useState(null);
  const [renameSavedValue, setRenameSavedValue] = useState("");
  const [savingCurrent, setSavingCurrent] = useState(false);
  const [saveNameValue, setSaveNameValue] = useState("");
  const [importCode, setImportCode] = useState("");
  const [importMsg, setImportMsg] = useState("");
  const [shareCode, setShareCode] = useState(null);
  const [sharing, setSharing] = useState(false);

  const [friendsList, setFriendsList] = useState([]);
  const [selectedFriend, setSelectedFriend] = useState(null);
  const [friendRequests, setFriendRequests] = useState([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [friendSearchQuery, setFriendSearchQuery] = useState("");
  const [friendSearchResult, setFriendSearchResult] = useState(null);
  const [friendSearchError, setFriendSearchError] = useState("");
  const [friendSearchLoading, setFriendSearchLoading] = useState(false);
  const [allFriendRequestsOpen, setAllFriendRequestsOpen] = useState(false);
  const [friendRequestsOpen, setFriendRequestsOpen] = useState(false);

  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [registerForm, setRegisterForm] = useState({ email: "", username: "", password: "", confirm: "" });
  const [recoverForm, setRecoverForm] = useState({ username: "" });
  const [exerciseForm, setExerciseForm] = useState({ nombre: "", categoria: "pecho", orden: "", series: "", repeticiones: "" });
  const [customExerciseMode, setCustomExerciseMode] = useState(false);
  const [recordForm, setRecordForm] = useState({ fecha: todayISO(), peso: "", series: "", repeticiones: "" });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        const profileSnap = await getDoc(doc(db, "users", fbUser.uid));
        const profile = profileSnap.exists() ? profileSnap.data() : { username: fbUser.email };
        const user = { uid: fbUser.uid, email: fbUser.email, username: profile.username, accentColor: profile.accentColor || "coral", displayName: profile.displayName || profile.username, selectedBadges: profile.selectedBadges || [], specialBadges: profile.specialBadges || [], edad: profile.edad || null, sexo: profile.sexo || null, estaturaCm: profile.estaturaCm || null, pesoCorporalKg: profile.pesoCorporalKg || null };
        setCurrentUser(user);
        await loadRutina(user);
        loadFriendRequests(user); // no bloquea el ingreso, solo alimenta el puntito de "Amigos"
        setScreen((s) => (s === "login" || s === "register" ? "home" : s));
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (restRunning) {
      restIntervalRef.current = setInterval(() => {
        setRestSecondsLeft((s) => {
          if (s <= 1) {
            clearInterval(restIntervalRef.current);
            setRestRunning(false);
            if (navigator.vibrate) navigator.vibrate(200);
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    }
    return () => clearInterval(restIntervalRef.current);
  }, [restRunning]);

  // Cierra los paneles desplegables ("Ver últimas actualizaciones", "Resumen",
  // "Calendario") al salir de la pantalla donde viven, para que no sigan
  // abiertos si el usuario se va a otra sección y vuelve.
  useEffect(() => {
    if (screen !== "home") {
      setUpdatesOpen(false);
      setAllUpdatesOpen(false);
    }
    if (screen !== "days") {
      setShowWeekSummary(false);
      setShowCalendar(false);
    }
  }, [screen]);

  function openExercisePhoto(ex) {
    setPhotoExercise(ex);
  }
  function closeExercisePhoto() {
    setPhotoExercise(null);
  }

  function openRestTimer() {
    setRestSecondsLeft(REST_PRESETS[restPresetIndex]);
    setRestRunning(true);
    setRestTimerOpen(true);
  }
  function pickRestPreset(i) {
    setRestPresetIndex(i);
    setRestSecondsLeft(REST_PRESETS[i]);
    setRestRunning(restTimerOpen); // si ya está abierto, sigue corriendo con el nuevo preset
  }
  function resetRestTimer() {
    setRestSecondsLeft(REST_PRESETS[restPresetIndex]);
    setRestRunning(false);
  }
  function openCalc1RM() {
    setCalcWeight("");
    setCalcReps("");
    setCalc1rmOpen(true);
  }

  function flashSuccess(message, next) {
    setSuccess(message);
    setTimeout(() => {
      setSuccess(null);
      if (next) next();
    }, 1000);
  }

  // ---------- Calorías ----------
  // Si cambió el día (medianoche, o volviste después de dormir el celular),
  // se borra todo automáticamente — respaldo del botón "Borrar".
  useEffect(() => {
    const today = todayISO();
    if (caloriesDay !== today) {
      setCaloriesDay(today);
      setCaloriesData(emptyCaloriesData());
      setCaloriesAiUsesLeft(CALORIES_AI_DAILY_LIMIT);
    }
  }, [screen, caloriesDay]);

  function updateCalorieMeal(mealKey, patch) {
    setCaloriesData((prev) => ({ ...prev, [mealKey]: { ...prev[mealKey], ...patch } }));
  }

  function openCalorieProfileEdit() {
    setCalorieProfileForm({
      edad: currentUser?.edad ? String(currentUser.edad) : "",
      sexo: currentUser?.sexo || "M",
      estatura: currentUser?.estaturaCm ? String(currentUser.estaturaCm) : "",
      peso: currentUser?.pesoCorporalKg ? String(currentUser.pesoCorporalKg) : "",
    });
    setCalorieProfileError("");
    setCalorieProfileEditing(true);
  }

  function cancelCalorieProfileEdit() {
    setCalorieProfileError("");
    setCalorieProfileEditing(false);
  }

  async function saveCalorieProfile() {
    const { edad, sexo, estatura, peso } = calorieProfileForm;
    if (!edad || !estatura || !peso) {
      setCalorieProfileError("Completa edad, peso y estatura.");
      return;
    }
    const patch = { edad: Number(edad), sexo, estaturaCm: Number(estatura), pesoCorporalKg: Number(peso) };
    setCurrentUser((prev) => ({ ...prev, ...patch }));
    setCalorieProfileError("");
    setCalorieProfileEditing(false);
    await setDoc(doc(db, "users", currentUser.uid), patch, { merge: true });
  }

  function handleCaloriePhoto(mealKey, e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => updateCalorieMeal(mealKey, { foto: reader.result });
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  function handleCaloriesClear() {
    if (!window.confirm("¿Borrar todo lo de calorías de hoy? No se guardó nada en ningún lado, así que no se puede recuperar.")) return;
    setCaloriesData(emptyCaloriesData());
    setCaloriesAiUsesLeft(CALORIES_AI_DAILY_LIMIT);
    flashSuccess("Borrado");
  }

  // Simulado: en la app real esto llama a un backend (Firebase Functions u otro)
  // que recibe texto/foto y consulta un modelo con visión (Gemini/Claude) para
  // estimar las kcal. Aquí solo se resta el uso y se llena con un estimado de
  // ejemplo, para probar el límite de 2 veces al día.
  function handleCaloriesCalcularIA() {
    if (caloriesAiUsesLeft <= 0 || caloriesAiLoading) return;
    const pending = CALORIE_MEALS.filter((m) => mealHasContent(caloriesData[m.key]) && caloriesData[m.key].kcal === "");
    if (pending.length === 0) return;
    setCaloriesAiLoading(true);
    setTimeout(() => {
      setCaloriesData((prev) => {
        const next = { ...prev };
        pending.forEach((m) => {
          const estimate = 250 + Math.round(Math.random() * 350);
          // Demo: reparte el estimado en macros con una proporción típica
          // (40% carbos, 30% grasas, 30% proteína) usando 4/4/9 kcal por gramo.
          const carbos = Math.round((estimate * 0.4) / 4);
          const grasas = Math.round((estimate * 0.3) / 9);
          const proteinas = Math.round((estimate * 0.3) / 4);
          next[m.key] = { ...next[m.key], kcal: String(estimate), carbos: String(carbos), grasas: String(grasas), proteinas: String(proteinas) };
        });
        return next;
      });
      setCaloriesAiUsesLeft((n) => Math.max(0, n - 1));
      setCaloriesAiLoading(false);
    }, 900);
  }

  async function loadRutina(user) {
    const [rutinaSnap, exercisesSnap, routinesSnap, savedRoutinesSnap, completedDaysSnap] = await Promise.all([
      getDocs(collection(db, "users", user.uid, "rutina")),
      getDocs(collection(db, "users", user.uid, "exercises")),
      getDocs(collection(db, "users", user.uid, "customRoutines")),
      getDocs(collection(db, "users", user.uid, "savedRoutines")),
      getDocs(collection(db, "users", user.uid, "completedDays")),
    ]);
    const data = {};
    rutinaSnap.docs.forEach((d) => {
      data[d.id] = d.data();
    });
    setRutina(data);
    const exData = {};
    exercisesSnap.docs.forEach((d) => {
      exData[d.id] = d.data();
    });
    setExercisesMap(exData);
    const routinesData = {};
    routinesSnap.docs.forEach((d) => {
      routinesData[d.id] = d.data();
    });
    setCustomRoutinesMap(routinesData);
    const savedData = {};
    savedRoutinesSnap.docs.forEach((d) => {
      savedData[d.id] = d.data();
    });
    setSavedRoutinesMap(savedData);
    const completedSet = new Set();
    completedDaysSnap.docs.forEach((d) => completedSet.add(d.id));
    setCompletedDays(completedSet);
  }

  // ---------- amigos ----------
  // Solicitudes pendientes que ME llegaron (viven en mi propio documento, en
  // users/{miUid}/friendRequests/{uidDeQuienLaEnvió}).
  async function loadFriendRequests(user) {
    const snap = await getDocs(collection(db, "users", user.uid, "friendRequests"));
    setFriendRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }

  // Trae la lista de amigos ya aceptados y, para cada uno, sus días entrenados
  // (para calcular su insignia de la semana) y su perfil (nombre, insignias
  // destacadas), igual que se calcula para ti mismo en "Mis insignias".
  async function loadFriends(user) {
    const snap = await getDocs(collection(db, "users", user.uid, "friends"));
    const friendIds = snap.docs.map((d) => d.id);
    const details = await Promise.all(
      friendIds.map(async (fid) => {
        const [profileSnap, completedSnap] = await Promise.all([
          getDoc(doc(db, "users", fid)),
          getDocs(collection(db, "users", fid, "completedDays")),
        ]);
        const profile = profileSnap.exists() ? profileSnap.data() : {};
        const completedSet = new Set();
        completedSnap.docs.forEach((d) => completedSet.add(d.id));
        return {
          uid: fid,
          username: profile.username || "usuario",
          displayName: profile.displayName || profile.username || "Usuario",
          accentColor: profile.accentColor || "coral",
          selectedBadges: profile.selectedBadges || [],
          specialBadges: profile.specialBadges || [],
          completedDays: completedSet,
        };
      })
    );
    setFriendsList(details);
  }

  async function openFriendsScreen() {
    setScreen("friends");
    setFriendSearchQuery("");
    setFriendSearchResult(null);
    setFriendSearchError("");
    setAllFriendRequestsOpen(false);
    setFriendRequestsOpen(false);
    setSelectedFriend(null);
    setFriendsLoading(true);
    await Promise.all([loadFriends(currentUser), loadFriendRequests(currentUser)]);
    setFriendsLoading(false);
  }

  // Busca a alguien por su usuario (igual que el login) antes de dejarte enviar
  // la solicitud, y avisa si ya son amigos o si ya hay una solicitud de por medio.
  async function handleFriendSearch() {
    const usernameLower = friendSearchQuery.trim().toLowerCase();
    setFriendSearchError("");
    setFriendSearchResult(null);
    if (!usernameLower) return;
    if (currentUser?.username && usernameLower === currentUser.username.toLowerCase()) {
      return setFriendSearchError("Ese usuario eres tú.");
    }
    setFriendSearchLoading(true);
    try {
      const nameSnap = await getDoc(doc(db, "usernames", usernameLower));
      if (!nameSnap.exists()) {
        setFriendSearchError("No encontramos ese usuario.");
        return;
      }
      const { uid: targetUid } = nameSnap.data();
      if (friendsList.some((f) => f.uid === targetUid)) {
        setFriendSearchError("Ya son amigos.");
        return;
      }
      const [outgoingSnap, incomingSnap, profileSnap] = await Promise.all([
        getDoc(doc(db, "users", targetUid, "friendRequests", currentUser.uid)),
        getDoc(doc(db, "users", currentUser.uid, "friendRequests", targetUid)),
        getDoc(doc(db, "users", targetUid)),
      ]);
      if (outgoingSnap.exists()) {
        setFriendSearchError("Ya le enviaste una solicitud.");
        return;
      }
      if (incomingSnap.exists()) {
        setFriendSearchError("Ese usuario ya te envió una solicitud, acéptala abajo.");
        return;
      }
      const profile = profileSnap.exists() ? profileSnap.data() : {};
      setFriendSearchResult({
        uid: targetUid,
        username: profile.username || usernameLower,
        displayName: profile.displayName || profile.username || usernameLower,
      });
    } catch (e) {
      setFriendSearchError("No se pudo buscar. Intenta de nuevo.");
    } finally {
      setFriendSearchLoading(false);
    }
  }

  async function sendFriendRequest(target) {
    await setDoc(doc(db, "users", target.uid, "friendRequests", currentUser.uid), {
      fromUid: currentUser.uid,
      fromUsername: currentUser.username,
      fromDisplayName: currentUser.displayName || currentUser.username,
      createdAt: Date.now(),
    });
    setFriendSearchResult(null);
    setFriendSearchQuery("");
    flashSuccess("Solicitud enviada");
  }

  // Al aceptar, cada uno queda guardado en la subcolección "friends" del otro,
  // así ambos se ven mutuamente en su lista sin pasos extra.
  async function acceptFriendRequest(req) {
    await Promise.all([
      setDoc(doc(db, "users", currentUser.uid, "friends", req.fromUid), {
        uid: req.fromUid,
        username: req.fromUsername,
        displayName: req.fromDisplayName,
        since: Date.now(),
      }),
      setDoc(doc(db, "users", req.fromUid, "friends", currentUser.uid), {
        uid: currentUser.uid,
        username: currentUser.username,
        displayName: currentUser.displayName || currentUser.username,
        since: Date.now(),
      }),
      deleteDoc(doc(db, "users", currentUser.uid, "friendRequests", req.fromUid)),
    ]);
    setFriendRequests((prev) => prev.filter((r) => r.id !== req.id));
    await loadFriends(currentUser);
  }

  async function rejectFriendRequest(req) {
    await deleteDoc(doc(db, "users", currentUser.uid, "friendRequests", req.fromUid));
    setFriendRequests((prev) => prev.filter((r) => r.id !== req.id));
  }

  // Elimina la amistad en ambos sentidos (de tu lista y de la suya).
  async function removeFriend(friend) {
    await Promise.all([
      deleteDoc(doc(db, "users", currentUser.uid, "friends", friend.uid)),
      deleteDoc(doc(db, "users", friend.uid, "friends", currentUser.uid)),
    ]);
    setFriendsList((prev) => prev.filter((f) => f.uid !== friend.uid));
    flashSuccess("Amigo eliminado");
  }

  // ---------- auth ----------
  async function handleLogin() {
    setError("");
    const { username, password } = loginForm;
    if (!username || !password) return setError("Ingresa usuario y contraseña.");
    try {
      const usernameLower = username.trim().toLowerCase();
      const nameSnap = await getDoc(doc(db, "usernames", usernameLower));
      if (!nameSnap.exists()) return setError("Ese usuario no existe.");
      const { email } = nameSnap.data();
      await signInWithEmailAndPassword(auth, email, password);
    } catch (e) {
      setError("Usuario o contraseña incorrectos.");
    }
  }

  async function handleRegister() {
    setError("");
    const { email, username, password, confirm } = registerForm;
    if (!email || !username || !password) return setError("Completa todos los campos.");
    if (password !== confirm) return setError("Las contraseñas no coinciden.");
    const usernameLower = username.trim().toLowerCase();
    try {
      const nameSnap = await getDoc(doc(db, "usernames", usernameLower));
      if (nameSnap.exists()) return setError("Ese usuario ya existe, elige otro.");
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await setDoc(doc(db, "users", cred.user.uid), { username, email });
      await setDoc(doc(db, "usernames", usernameLower), { uid: cred.user.uid, email });
      const user = { uid: cred.user.uid, email, username };
      flashSuccess("Cuenta creada", async () => {
        setCurrentUser(user);
        await loadRutina(user);
        setScreen("home");
      });
    } catch (e) {
      if (e.code === "auth/email-already-in-use") setError("Ese correo ya está registrado.");
      else if (e.code === "auth/weak-password") setError("La contraseña debe tener al menos 6 caracteres.");
      else setError("No se pudo crear la cuenta.");
    }
  }

  async function handleRecover() {
    setError("");
    const { username } = recoverForm;
    if (!username) return setError("Ingresa tu usuario.");
    try {
      const usernameLower = username.trim().toLowerCase();
      const nameSnap = await getDoc(doc(db, "usernames", usernameLower));
      if (!nameSnap.exists()) return setError("Ese usuario no existe.");
      const { email } = nameSnap.data();
      await sendPasswordResetEmail(auth, email);
      flashSuccess("Enlace enviado a tu correo", () => {
        setRecoverForm({ username: "" });
        setScreen("login");
      });
    } catch (e) {
      setError("No se pudo enviar el enlace.");
    }
  }

  async function logout() {
    await signOut(auth);
    setCurrentUser(null);
    setRutina({});
    setExercisesMap({});
    setCustomRoutinesMap({});
    setSavedRoutinesMap({});
    setLoginForm({ username: "", password: "" });
    setTrainingDayKey(null);
    setTrainingCompleted(new Set());
    persistTraining(null, new Set());
    setScreen("login");
  }

  // ---------- rutina helpers ----------
  function getDay(dayKey) {
    return rutina[dayKey] || { category: null, plan: [] };
  }

  async function saveDay(dayKey, dayData) {
    await setDoc(doc(db, "users", currentUser.uid, "rutina", dayKey), dayData);
    setRutina((prev) => ({ ...prev, [dayKey]: dayData }));
    return dayData;
  }

  // Marca/desmarca una fecha ("YYYY-MM-DD") como día completado. Se guarda por
  // fecha real (no por nombre del día), así que "Marcar día" siempre apunta a
  // la fecha de hoy y queda disponible de nuevo al día siguiente.
  async function toggleCompletedDay(dateKey) {
    const wasDone = completedDays.has(dateKey);
    setCompletedDays((prev) => {
      const wasDonePrev = prev.has(dateKey);
      const badgeBefore = computeCurrentWeekBadge(prev);
      const next = new Set(prev);
      if (wasDonePrev) next.delete(dateKey);
      else next.add(dateKey);
      // Si al marcar el día sube el nivel de la insignia de esta semana (o se
      // gana la primera vez), disparamos la celebración con el resultado nuevo.
      // Ojo: el tier se topa en 5 (ver computeCurrentWeekBadge), así que pasar
      // de 5 a 6+ días da el mismo tier y NO vuelve a disparar la animación.
      if (!wasDonePrev) {
        const badgeAfter = computeCurrentWeekBadge(next);
        if (badgeAfter && (!badgeBefore || badgeAfter.tier > badgeBefore.tier)) {
          setNewBadgeCelebration(badgeAfter);
        }
      }
      return next;
    });
    try {
      if (wasDone) {
        await deleteDoc(doc(db, "users", currentUser.uid, "completedDays", dateKey));
      } else {
        await setDoc(doc(db, "users", currentUser.uid, "completedDays", dateKey), { done: true });
      }
    } catch (e) {
      // si falla el guardado, revertimos el estado local para no mentir en pantalla
      setCompletedDays((prev) => {
        const next = new Set(prev);
        if (wasDone) next.add(dateKey);
        else next.delete(dateKey);
        return next;
      });
    }
  }

  async function saveExercise(exerciseId, exData) {
    await setDoc(doc(db, "users", currentUser.uid, "exercises", exerciseId), exData);
    setExercisesMap((prev) => ({ ...prev, [exerciseId]: exData }));
    return exData;
  }

  async function updateAccentColor(key) {
    setCurrentUser((prev) => ({ ...prev, accentColor: key }));
    try {
      localStorage.setItem(ACCENT_STORAGE_KEY, key);
    } catch (e) {
      // localStorage no disponible (modo privado, etc.) — no es crítico.
    }
    await setDoc(doc(db, "users", currentUser.uid), { accentColor: key }, { merge: true });
  }

  async function toggleSelectedBadge(weekKey) {
    const current = currentUser?.selectedBadges || [];
    let next;
    if (current.includes(weekKey)) {
      next = current.filter((k) => k !== weekKey);
    } else {
      if (current.length >= 2) return; // máximo 2
      next = [...current, weekKey];
    }
    setCurrentUser((prev) => ({ ...prev, selectedBadges: next }));
    await setDoc(doc(db, "users", currentUser.uid), { selectedBadges: next }, { merge: true });
  }

  async function updateDisplayName(name) {
    const trimmed = name.trim().slice(0, 14);
    if (!trimmed) return;
    setCurrentUser((prev) => ({ ...prev, displayName: trimmed }));
    await setDoc(doc(db, "users", currentUser.uid), { displayName: trimmed }, { merge: true });
  }

  async function saveCustomRoutine(id, data) {
    await setDoc(doc(db, "users", currentUser.uid, "customRoutines", id), data);
    setCustomRoutinesMap((prev) => ({ ...prev, [id]: data }));
    return data;
  }

  // ---------- rutinas guardadas: compartir / importar ----------
  function buildRoutineSnapshot() {
    const days = {};
    DAYS.forEach((d) => {
      const day = getDay(d.key);
      days[d.key] = {
        category: day.category || null,
        customLabel: day.category === "personalizada" ? dayRoutineLabel(day) : null,
        plan: (day.plan || []).map((p) => {
          const ex = exercisesMap[p.exerciseId] || {};
          return { exerciseId: p.exerciseId, order: p.order, sets: p.sets, reps: p.reps, name: ex.name || "", custom: !!ex.custom };
        }),
      };
    });
    return days;
  }

  async function saveCurrentAsRoutine(name) {
    const id = "sr-" + uid();
    const data = { name: name.trim() || "Mi rutina", source: "propio", days: buildRoutineSnapshot(), createdAt: Date.now() };
    await setDoc(doc(db, "users", currentUser.uid, "savedRoutines", id), data);
    setSavedRoutinesMap((prev) => ({ ...prev, [id]: data }));
    return id;
  }

  async function renameSavedRoutine(id, newName) {
    const existing = savedRoutinesMap[id];
    if (!existing) return;
    const updated = { ...existing, name: newName.trim() || existing.name };
    await setDoc(doc(db, "users", currentUser.uid, "savedRoutines", id), updated);
    setSavedRoutinesMap((prev) => ({ ...prev, [id]: updated }));
  }

  async function updateSavedRoutine(id) {
    const existing = savedRoutinesMap[id];
    if (!existing) return;
    const updated = { ...existing, days: buildRoutineSnapshot() };
    await setDoc(doc(db, "users", currentUser.uid, "savedRoutines", id), updated);
    setSavedRoutinesMap((prev) => ({ ...prev, [id]: updated }));
    flashSuccess("Rutina actualizada");
  }

  async function deleteSavedRoutine(id) {
    await deleteDoc(doc(db, "users", currentUser.uid, "savedRoutines", id));
    setSavedRoutinesMap((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (openSavedId === id) setOpenSavedId(null);
  }

  async function activateSavedRoutine(id) {
    const routine = savedRoutinesMap[id];
    if (!routine) return;
    const remappedDays = {};
    for (const d of DAYS) {
      const snap = routine.days[d.key] || { category: null, customLabel: null, plan: [] };
      const newPlan = [];
      const newPlanWithMeta = [];
      for (const item of snap.plan) {
        let exerciseId = item.exerciseId;
        if (!exercisesMap[exerciseId]) {
          if (item.custom) exerciseId = "cx-" + uid();
          await saveExercise(exerciseId, { name: item.name, custom: !!item.custom, records: [] });
        }
        newPlan.push({ exerciseId, order: item.order, sets: item.sets, reps: item.reps });
        newPlanWithMeta.push({ exerciseId, order: item.order, sets: item.sets, reps: item.reps, name: item.name, custom: item.custom });
      }
      const dayData = { category: snap.category, plan: newPlan };
      if (snap.category === "personalizada") dayData.customLabel = snap.customLabel;
      await saveDay(d.key, dayData);
      remappedDays[d.key] = { category: snap.category, customLabel: snap.customLabel, plan: newPlanWithMeta };
    }
    if (routine.source === "importado") {
      const updated = { ...routine, days: remappedDays };
      await setDoc(doc(db, "users", currentUser.uid, "savedRoutines", id), updated);
      setSavedRoutinesMap((prev) => ({ ...prev, [id]: updated }));
    }
    setOpenSavedId(null);
    flashSuccess("Rutina activada");
    setScreen("days");
  }

  async function shareCurrentRoutine() {
    setSharing(true);
    try {
      const code = generateShareCode();
      const data = { ownerUid: currentUser.uid, ownerName: currentUser.username, days: buildRoutineSnapshot(), createdAt: Date.now() };
      await setDoc(doc(db, "sharedRoutines", code), data);
      setShareCode(code);
    } catch (e) {
      setImportMsg("error:No se pudo generar el código.");
    } finally {
      setSharing(false);
    }
  }

  async function importRoutineByCode() {
    setImportMsg("");
    const code = importCode.trim().toUpperCase();
    if (!code) {
      setImportMsg("error:Escribe un código.");
      return;
    }
    try {
      const snap = await getDoc(doc(db, "sharedRoutines", code));
      if (!snap.exists()) {
        setImportMsg("error:Ese código no existe.");
        return;
      }
      const shared = snap.data();
      const id = "sr-" + uid();
      const data = { name: `Rutina de ${shared.ownerName || "un amigo"}`, source: "importado", days: shared.days, createdAt: Date.now() };
      await setDoc(doc(db, "users", currentUser.uid, "savedRoutines", id), data);
      setSavedRoutinesMap((prev) => ({ ...prev, [id]: data }));
      setImportCode("");
      setImportMsg("ok:¡Rutina importada! Ábrela y dale Activar.");
    } catch (e) {
      setImportMsg("error:No se pudo importar.");
    }
  }

  function combinedDayExercises(dayKey) {
    const day = getDay(dayKey);
    return [...(day.plan || [])]
      .map((p) => {
        const ex = exercisesMap[p.exerciseId] || { name: "(eliminado)", custom: false, records: [] };
        return { exerciseId: p.exerciseId, order: p.order, sets: p.sets, reps: p.reps, name: ex.name, custom: ex.custom, records: ex.records || [] };
      })
      .sort((a, b) => (a.order || 0) - (b.order || 0));
  }

  function startReorder(dayKey) {
    setReorderList(combinedDayExercises(dayKey));
    setReorderMode(true);
  }

  function cancelReorder() {
    setReorderMode(false);
    setReorderList([]);
  }

  async function saveReorder(dayKey) {
    const day = getDay(dayKey);
    const orderByExerciseId = {};
    reorderList.forEach((it, i) => {
      orderByExerciseId[it.exerciseId] = i + 1;
    });
    const updatedPlan = (day.plan || []).map((p) => ({ ...p, order: orderByExerciseId[p.exerciseId] ?? p.order }));
    await saveDay(dayKey, { ...day, plan: updatedPlan });
    setReorderMode(false);
    setReorderList([]);
    flashSuccess("Orden actualizado");
  }

  function openDay(dayKey) {
    setCurrentDayKey(dayKey);
    setReorderMode(false);
    setReorderList([]);
    const day = getDay(dayKey);
    setScreen(day.category ? "dayDetail" : "chooseCategory");
  }

  async function chooseCategory(catKey) {
    setError("");
    try {
      const day = getDay(currentDayKey);
      const updated = { ...day, category: catKey };
      delete updated.customRoutineId;

      await saveDay(currentDayKey, updated);

      if (changingCategory) {
        setChangingCategory(false);
        setScreen("dayDetail");
      } else {
        setScreen("addExercise");
      }
    } catch (e) {
      console.error("Error al cambiar de rutina:", e);
      setError(`No se pudo cambiar la rutina: ${e?.message || "error desconocido"}`);
    }
  }

  async function selectCustomRoutine(routineId) {
    const day = getDay(currentDayKey);
    const updated = { ...day, category: "personalizada", customRoutineId: routineId };
    await saveDay(currentDayKey, updated);
    if (changingCategory) {
      setChangingCategory(false);
      setScreen("dayDetail");
    } else {
      setScreen("addExercise");
    }
  }

  function openPersonalizadaName() {
    setRenamingRoutineId(null);
    setCustomLabelInput("");
    setError("");
    setScreen("personalizadaName");
  }

  function openRenameRoutine(id, currentName) {
    setRenamingRoutineId(id);
    setCustomLabelInput(currentName);
    setError("");
    setScreen("personalizadaName");
  }

  async function confirmPersonalizada() {
    if (!customLabelInput.trim()) return setError("Ponle un nombre a tu rutina.");
    if (renamingRoutineId) {
      const existing = customRoutinesMap[renamingRoutineId] || { name: customLabelInput.trim(), hidden: false };
      await saveCustomRoutine(renamingRoutineId, { ...existing, name: customLabelInput.trim() });
      setRenamingRoutineId(null);
      setError("");
      setScreen("chooseCategory");
      return;
    }
    const routineId = "cr-" + uid();
    await saveCustomRoutine(routineId, { name: customLabelInput.trim(), hidden: false });
    setError("");
    await selectCustomRoutine(routineId);
  }

  async function hideCustomRoutine(id, name) {
    if (!window.confirm(`¿Ocultar "${name}" de la lista? Los días que ya la usan la seguirán mostrando.`)) return;
    const existing = customRoutinesMap[id] || { name, hidden: false };
    await saveCustomRoutine(id, { ...existing, hidden: true });
  }

  function dayRoutineLabel(day) {
    if (day.category === "personalizada") {
      return customRoutinesMap[day.customRoutineId]?.name || day.customLabel || "Personalizada";
    }
    return categoryLabel(day.category);
  }

  function openAddExercise() {
    setError("");
    setExerciseSearchOpen(false);
    setExerciseSearchQuery("");
    setExerciseFiltersOpen(false);
    setExerciseFilterMuscles(new Set());
    setExerciseFilterEquipo(new Set());
    setExerciseFilterTipo(new Set());
    setLibraryTab("musculo");
    setLibraryMuscleKey(null);
    setScreen("addExercise");
  }

  function openExerciseForm(name, exerciseId) {
    const day = getDay(currentDayKey);
    setPendingExerciseName(name);
    setPendingExerciseId(exerciseId);
    setExerciseForm({ nombre: name, categoria: "pecho", orden: String((day.plan || []).length + 1), series: "", repeticiones: "" });
    setEditExercise(false);
    setCustomExerciseMode(false);
    setError("");
    setScreen("exerciseForm");
  }

  function openCustomExerciseForm() {
    const day = getDay(currentDayKey);
    setPendingExerciseName(null);
    setPendingExerciseId(null);
    setExerciseForm({ nombre: "", categoria: "pecho", orden: String((day.plan || []).length + 1), series: "", repeticiones: "" });
    setEditExercise(false);
    setCustomExerciseMode(true);
    setError("");
    setScreen("exerciseForm");
  }

  function openEditExercisePlan(ex) {
    setCurrentExercise(ex);
    setPendingExerciseName(ex.name);
    setPendingExerciseId(ex.exerciseId);
    setExerciseForm({ nombre: ex.name, categoria: ex.category || "pecho", orden: String(ex.order || ""), series: String(ex.sets || ""), repeticiones: String(ex.reps || "") });
    setEditExercise(true);
    setCustomExerciseMode(!!ex.custom);
    setError("");
    setScreen("exerciseForm");
  }

  async function handleSaveExercisePlan() {
    setError("");
    const { nombre, categoria, orden, series, repeticiones } = exerciseForm;
    if (customExerciseMode && !nombre.trim()) return setError("Escribe el nombre del ejercicio.");
    if (!orden || !series || !repeticiones) return setError("Completa series y repeticiones.");
    const day = getDay(currentDayKey);
    const name = customExerciseMode ? nombre.trim() : pendingExerciseName;

    let exerciseId;
    if (editExercise && currentExercise) {
      exerciseId = currentExercise.exerciseId;
      if (customExerciseMode) {
        const existing = exercisesMap[exerciseId] || { name, custom: true, records: [] };
        await saveExercise(exerciseId, { ...existing, name, category: categoria });
      }
    } else if (pendingExerciseId) {
      exerciseId = pendingExerciseId;
      if (!exercisesMap[exerciseId]) {
        const exerciseData = {
          name,
          custom: customExerciseMode,
          records: []
        };
        if (customExerciseMode) exerciseData.category = categoria;
        await saveExercise(exerciseId, exerciseData);
      }
    } else {
      exerciseId = "cx-" + uid();
      await saveExercise(exerciseId, { name, custom: true, category: categoria, records: [] });
    }

    let updatedPlan;
    if (editExercise && currentExercise) {
      updatedPlan = (day.plan || []).map((p) => (p.exerciseId === exerciseId ? { ...p, order: Number(orden), sets: Number(series), reps: Number(repeticiones) } : p));
    } else {
      updatedPlan = [...(day.plan || []), { exerciseId, order: Number(orden), sets: Number(series), reps: Number(repeticiones) }];
    }
    await saveDay(currentDayKey, { ...day, plan: updatedPlan });

    if (editExercise) {
      setCurrentExercise({ ...currentExercise, name, order: Number(orden), sets: Number(series), reps: Number(repeticiones) });
    }
    flashSuccess("Plan guardado", () => {
      setEditExercise(false);
      setScreen(editExercise ? "exerciseDetail" : "dayDetail");
    });
  }

  async function handleDeleteExercisePlan() {
    if (!window.confirm(`¿Quitar ${currentExercise.name} del plan de este día? Tu historial de PR se conserva.`)) return;
    const day = getDay(currentDayKey);
    const updatedPlan = (day.plan || []).filter((p) => p.exerciseId !== currentExercise.exerciseId);
    await saveDay(currentDayKey, { ...day, plan: updatedPlan });
    setCurrentExercise(null);
    setScreen("dayDetail");
  }

  async function quickDeleteExercise(ex) {
    if (!window.confirm(`¿Quitar ${ex.name} del plan de este día? Tu historial de PR se conserva.`)) return;
    const day = getDay(currentDayKey);
    const updatedPlan = (day.plan || []).filter((p) => p.exerciseId !== ex.exerciseId);
    await saveDay(currentDayKey, { ...day, plan: updatedPlan });
  }

  async function deleteCustomExercise(exerciseId, name) {
    if (!window.confirm(`¿Eliminar "${name}" de tus ejercicios personalizados? Se borrará su historial de PR. Si está en algún día, aparecerá como "(eliminado)".`)) return;
    await deleteDoc(doc(db, "users", currentUser.uid, "exercises", exerciseId));
    setExercisesMap((prev) => {
      const next = { ...prev };
      delete next[exerciseId];
      return next;
    });
  }

  function persistTraining(dayKey, completedSet) {
    try {
      if (!dayKey) localStorage.removeItem(TRAINING_STORAGE_KEY);
      else localStorage.setItem(TRAINING_STORAGE_KEY, JSON.stringify({ dayKey, completed: [...completedSet] }));
    } catch {
      // localStorage no disponible — no es crítico.
    }
  }

  function toggleTraining() {
    const nextDayKey = trainingDayKey === currentDayKey ? null : currentDayKey;
    setTrainingDayKey(nextDayKey);
    setTrainingCompleted(new Set());
    persistTraining(nextDayKey, new Set());
  }

  function toggleExerciseDone(exerciseId) {
    setTrainingCompleted((prev) => {
      const next = new Set(prev);
      if (next.has(exerciseId)) next.delete(exerciseId);
      else next.add(exerciseId);
      persistTraining(trainingDayKey, next);
      return next;
    });
  }

  function openExercise(ex) {
    setCurrentExercise(ex);
    setScreen("exerciseDetail");
  }

  function openNewRecord() {
    const last = sortByFecha(currentExercise.records || [])[0];
    setRecordForm({
      fecha: todayISO(),
      peso: last ? String(kgToUnit(last.peso, weightUnit)) : "",
      series: String(currentExercise.sets || (last ? last.series : "") || ""),
      repeticiones: String(currentExercise.reps || (last ? last.repeticiones : "") || ""),
    });
    setEditRecordId(null);
    setError("");
    setScreen("addRecord");
  }

  function openEditRecord(r) {
    setRecordForm({ fecha: r.fecha, peso: String(kgToUnit(r.peso, weightUnit)), series: String(r.series || ""), repeticiones: String(r.repeticiones || "") });
    setEditRecordId(r.id);
    setError("");
    setScreen("addRecord");
  }

  async function handleSaveRecord() {
    setError("");
    const { fecha, peso, series, repeticiones } = recordForm;

    if (!fecha || !peso) return setError("Ingresa la fecha y el peso.");
    if (!series || !repeticiones) return setError("Completa series y repeticiones.");

    try {
      const exerciseId = currentExercise.exerciseId;
      const exData = exercisesMap[exerciseId] || {
        name: currentExercise.name,
        custom: !!currentExercise.custom,
        records: []
      };

      const currentRecords = exData.records || [];
      const previousPR = currentRecords.length ? Math.max(...currentRecords.map((r) => Number(r.peso) || 0)) : null;
      // El campo "peso" se escribió en la unidad activa (kg o lb); se guarda
      // siempre en kg, que es la unidad canónica en Firestore.
      const newWeight = unitToKg(peso, weightUnit);
      let updatedRecords;

      if (editRecordId) {
        updatedRecords = currentRecords.map((r) =>
          r.id === editRecordId
            ? {
                ...r,
                fecha,
                peso: newWeight,
                series: Number(series),
                repeticiones: Number(repeticiones)
              }
            : r
        );
      } else {
        updatedRecords = [
          {
            id: uid(),
            fecha,
            peso: newWeight,
            series: Number(series),
            repeticiones: Number(repeticiones)
          },
          ...currentRecords
        ];
      }

      await saveExercise(exerciseId, {
        ...exData,
        records: updatedRecords
      });

      setCurrentExercise({
        ...currentExercise,
        records: updatedRecords
      });

      const isNewPR = !editRecordId && previousPR !== null && newWeight > previousPR;

      if (isNewPR) {
        setRecordCelebration({
          exerciseName: currentExercise.name,
          before: previousPR,
          after: newWeight
        });
        setTimeout(() => {
          setRecordCelebration(null);
          setEditRecordId(null);
          setScreen("exerciseDetail");
        }, 2200);
      } else {
        flashSuccess("Registro guardado", () => {
          setEditRecordId(null);
          setScreen("exerciseDetail");
        });
      }
    } catch (e) {
      console.error("Error al guardar registro:", e);
      setError(`No se pudo guardar el registro: ${e?.message || "error desconocido"}`);
    }
  }

  async function handleDeleteRecord() {
    if (!window.confirm("¿Eliminar este registro?")) return;
    const exerciseId = currentExercise.exerciseId;
    const exData = exercisesMap[exerciseId] || { name: currentExercise.name, custom: currentExercise.custom, records: [] };
    const updatedRecords = (exData.records || []).filter((r) => r.id !== editRecordId);
    await saveExercise(exerciseId, { ...exData, records: updatedRecords });
    setCurrentExercise({ ...currentExercise, records: updatedRecords });
    setEditRecordId(null);
    setScreen("exerciseDetail");
  }

  // ---------- color activo ----------
  let savedAccentKey = "coral";
  try {
    savedAccentKey = localStorage.getItem(ACCENT_STORAGE_KEY) || "coral";
  } catch (e) {
    // localStorage no disponible — usamos el valor por defecto.
  }
  const accentKey = currentUser?.accentColor || savedAccentKey;
  const accent = ACCENTS[accentKey] || ACCENTS.coral;
  CURRENT_ACCENT = accent;

  // ---------- shared shell ----------
  const shell = {
    minHeight: "100vh",
    width: "100%",
    background: "#141311",
    color: "#f2ede6",
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    boxSizing: "border-box",
    padding: "28px 20px 40px",
    position: "relative",
    maxWidth: 480,
    margin: "0 auto",
  };

  if (loading) return <div style={shell} />;

  // ---------- LOGIN ----------
  if (screen === "login") {
    return (
      <div style={shell}>
        <div
          style={{
            position: "relative",
            borderRadius: 28,
            padding: "34px 26px",
            marginBottom: 30,
            marginTop: 20,
            background: `linear-gradient(145deg, ${accent.from} 0%, ${accent.to} 100%)`,
            overflow: "hidden",
          }}
        >
          <div style={{ position: "absolute", top: -50, right: -30, width: 160, height: 160, borderRadius: "50%", background: "rgba(255,255,255,0.10)" }} />
          <div style={{ position: "absolute", bottom: -60, left: -30, width: 130, height: 130, borderRadius: "50%", background: "rgba(255,255,255,0.07)" }} />
          <div style={{ position: "relative" }}>
            <div style={{ width: 44, height: 44, borderRadius: 14, background: "rgba(255,255,255,0.18)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
              <Dumbbell size={22} color={accent.text} />
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, color: accent.text }}>MiRutina</div>
            <div style={{ fontSize: 13.5, color: accent.text, opacity: 0.7, marginTop: 4 }}>Inicia sesión para continuar</div>
          </div>
        </div>
        <label style={{ display: "block", marginBottom: 14 }}>
          <div style={{ fontSize: 12.5, color: "#a39d95", marginBottom: 6, fontWeight: 500, letterSpacing: 0.2 }}>Usuario</div>
          <input
            value={loginForm.username}
            onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
            placeholder="tu_usuario"
            style={{ width: "100%", boxSizing: "border-box", padding: "13px 14px", borderRadius: 14, border: "1px solid #2f2c28", background: "#1a1917", color: "#f2ede6", fontSize: 15.5, outline: "none" }}
          />
        </label>
        <label style={{ display: "block", marginBottom: 22, position: "relative" }}>
          <div style={{ fontSize: 12.5, color: "#a39d95", marginBottom: 6, fontWeight: 500, letterSpacing: 0.2 }}>Contraseña</div>
          <input
            type={showPw ? "text" : "password"}
            value={loginForm.password}
            onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
            placeholder="••••••••"
            style={{ width: "100%", boxSizing: "border-box", padding: "13px 14px", borderRadius: 14, border: "1px solid #2f2c28", background: "#1a1917", color: "#f2ede6", fontSize: 15.5, outline: "none" }}
          />
          <button onClick={() => setShowPw(!showPw)} style={{ position: "absolute", right: 14, top: 32, background: "none", border: "none", color: "#8a8580", cursor: "pointer" }}>
            {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </label>
        {error && <div style={{ color: "#e0725e", fontSize: 13.5, marginBottom: 12 }}>{error}</div>}
        <button
          onClick={handleLogin}
          style={{ width: "100%", padding: "15px 18px", borderRadius: 16, border: "none", background: accent.solid, color: accent.text, fontSize: 16, fontWeight: 700, cursor: "pointer" }}
        >
          Iniciar sesión
        </button>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 22, fontSize: 13.5 }}>
          <button onClick={() => { setError(""); setScreen("register"); }} style={{ background: "none", border: "none", color: accent.solid, cursor: "pointer", padding: 0, fontWeight: 600 }}>
            Crear cuenta nueva
          </button>
          <button onClick={() => { setError(""); setScreen("recover"); }} style={{ background: "none", border: "none", color: "#8a8580", cursor: "pointer", padding: 0 }}>
            Recuperar contraseña
          </button>
        </div>
      </div>
    );
  }

  // ---------- REGISTER ----------
  if (screen === "register") {
    return (
      <div style={shell}>
        {success && <SuccessOverlay message={success} />}
        <TopBar title="Nueva cuenta" onBack={() => setScreen("login")} />
        <Field label="Usuario" value={registerForm.username} onChange={(e) => setRegisterForm({ ...registerForm, username: e.target.value })} placeholder="Elige un nombre" />
        <Field label="Correo electrónico" type="email" value={registerForm.email} onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })} placeholder="tu@correo.com" />
        <div style={{ fontSize: 12, color: "#8a8580", marginTop: -8, marginBottom: 16 }}>Solo se usa para recuperar tu contraseña.</div>
        <Field label="Contraseña" type="password" value={registerForm.password} onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })} placeholder="••••••••" />
        <Field label="Confirmar contraseña" type="password" value={registerForm.confirm} onChange={(e) => setRegisterForm({ ...registerForm, confirm: e.target.value })} placeholder="••••••••" />
        {error && <div style={{ color: "#e0725e", fontSize: 13.5, marginBottom: 12 }}>{error}</div>}
        <PrimaryButton onClick={handleRegister}>Crear cuenta</PrimaryButton>
      </div>
    );
  }

  // ---------- RECOVER ----------
  if (screen === "recover") {
    return (
      <div style={shell}>
        {success && <SuccessOverlay message={success} />}
        <TopBar title="Recuperar contraseña" onBack={() => setScreen("login")} />
        <Field label="Usuario" value={recoverForm.username} onChange={(e) => setRecoverForm({ username: e.target.value })} placeholder="tu_usuario" />
        {error && <div style={{ color: "#e0725e", fontSize: 13.5, marginBottom: 12 }}>{error}</div>}
        <PrimaryButton onClick={handleRecover}>Enviar enlace de recuperación</PrimaryButton>
      </div>
    );
  }

  // ---------- HOME ----------
  if (screen === "home") {
    const currentWeekBadge = computeCurrentWeekBadge(completedDays);
    const earnedBadges = computeEarnedBadges(completedDays);
    const selectableBadges = [
      ...earnedBadges.map((b) => ({ id: b.weekKey, animal: b.animal, tier: b.tier })),
      ...ownedSpecialBadges(currentUser),
    ];
    const badgeSlots = (currentUser?.selectedBadges || []).map((id) => selectableBadges.find((b) => b.id === id)).filter(Boolean);
    while (badgeSlots.length < 2) badgeSlots.push(null);
    return (
      <div style={shell}>
        {success && <SuccessOverlay message={success} />}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, position: "relative" }}>
          <button
            onClick={() => {
              setAccentPickerOpen((v) => {
                const next = !v;
                if (next) setDisplayNameValue(currentUser?.displayName || currentUser?.username || "");
                return next;
              });
            }}
            aria-label="Cambiar color de la app"
            style={{
              width: 30,
              height: 30,
              borderRadius: "50%",
              border: "1px solid #2f2c28",
              background: "#1f1e1c",
              color: accent.solid,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
            }}
          >
            <Pencil size={13} />
          </button>
          <button onClick={logout} style={{ background: "none", border: "none", color: "#6e6a65", fontSize: 13, cursor: "pointer" }}>
            Salir
          </button>

          {accentPickerOpen && (
            <div
              style={{
                position: "absolute",
                top: 36,
                left: 0,
                background: "#1f1e1c",
                border: "1px solid #2f2c28",
                borderRadius: 16,
                padding: 10,
                display: "flex",
                flexDirection: "column",
                gap: 10,
                width: 190,
                zIndex: 10,
                boxShadow: "0 8px 20px rgba(0,0,0,0.35)",
              }}
            >
              <div>
                <div style={{ fontSize: 11, color: "#8a8580", marginBottom: 4 }}>Nombre para mostrar</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    value={displayNameValue}
                    onChange={(e) => setDisplayNameValue(e.target.value)}
                    maxLength={14}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      background: "#141311",
                      border: "1px solid #33312e",
                      borderRadius: 10,
                      color: "#f2ede6",
                      fontSize: 13,
                      padding: "6px 8px",
                    }}
                  />
                  <button
                    onClick={() => {
                      updateDisplayName(displayNameValue);
                      setAccentPickerOpen(false);
                    }}
                    style={{ flexShrink: 0, border: "none", borderRadius: 10, background: accent.solid, color: accent.text, fontSize: 12, fontWeight: 600, padding: "0 10px", cursor: "pointer" }}
                  >
                    Guardar
                  </button>
                </div>
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {Object.entries(ACCENTS).map(([key, opt]) => (
                <button
                  key={key}
                  onClick={() => {
                    updateAccentColor(key);
                    setAccentPickerOpen(false);
                  }}
                  aria-label={opt.name}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    border: accentKey === key ? "2px solid #f2ede6" : "2px solid transparent",
                    padding: 2,
                    background: "transparent",
                    cursor: "pointer",
                  }}
                >
                  <span
                    style={{
                      display: "block",
                      width: "100%",
                      height: "100%",
                      borderRadius: "50%",
                      background: `linear-gradient(145deg, ${opt.from} 0%, ${opt.to} 100%)`,
                    }}
                  />
                </button>
              ))}
              </div>
            </div>
          )}
        </div>

        <div
          style={{
            position: "relative",
            borderRadius: 28,
            padding: "34px 26px 38px",
            marginBottom: 22,
            background: `linear-gradient(145deg, ${accent.from} 0%, ${accent.to} 100%)`,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: -50,
              right: -30,
              width: 160,
              height: 160,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.10)",
            }}
          />
          <div
            style={{
              position: "absolute",
              bottom: -60,
              left: -30,
              width: 130,
              height: 130,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.07)",
            }}
          />
          <div style={{ position: "relative" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 28 }}>
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 12,
                  background: "rgba(255,255,255,0.18)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Dumbbell size={18} color={accent.text} />
              </div>
              <div style={{ fontSize: 13.5, color: accent.text, opacity: 0.75, fontWeight: 600 }}>Hola</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <div>
                <div style={{ fontSize: 26, fontWeight: 800, color: accent.text, lineHeight: 1.1 }}>{currentUser?.displayName || currentUser?.username || ""}</div>
                <div style={{ fontSize: 13.5, color: accent.text, opacity: 0.65, marginTop: 4 }}>MiRutina App</div>
              </div>
              {currentWeekBadge && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, flexShrink: 0, marginRight: 70 }}>
                  <BadgeImg animal={currentWeekBadge.animal} tier={currentWeekBadge.tier} size={112} />
                </div>
              )}
            </div>

            <div style={{ height: 1, background: "rgba(255,255,255,0.2)", marginTop: 14, marginBottom: 12 }} />
            <button
              onClick={() => setScreen("badges")}
              style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", background: "none", border: "none", padding: 0, cursor: "pointer" }}
            >
              <span style={{ fontSize: 12, color: accent.text, opacity: 0.85, fontWeight: 600 }}>Mis insignias</span>
              <span style={{ display: "flex", gap: 8 }}>
                {badgeSlots.map((b, i) =>
                  b ? (
                    <BadgeImg key={i} animal={b.animal} tier={b.tier} src={b.src} size={50} />
                  ) : (
                    <span key={i} style={{ width: 50, height: 50, borderRadius: "50%", border: "1.5px dashed rgba(255,255,255,0.55)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Plus size={19} color={accent.text} />
                    </span>
                  )
                )}
              </span>
            </button>
          </div>

          <button
            onClick={openFriendsScreen}
            aria-label="Amigos"
            style={{
              position: "absolute",
              top: 26,
              right: 16,
              width: 32,
              height: 32,
              borderRadius: "50%",
              border: "none",
              background: "rgba(255,255,255,0.16)",
              color: accent.text,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Users size={15} />
            {friendRequests.length > 0 && (
              <span
                style={{
                  position: "absolute",
                  top: -3,
                  right: -3,
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  background: accent.solid,
                  border: "2px solid " + accent.from,
                }}
              />
            )}
          </button>
        </div>

        <button
          onClick={() => setScreen("days")}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: "18px 20px",
            borderRadius: 20,
            border: "1px solid #2c2924",
            background: "#1f1e1c",
            color: "#f2ede6",
            cursor: "pointer",
          }}
        >
          <span style={{ flex: 1, textAlign: "left", fontSize: 16.5, fontWeight: 600 }}>Mi rutina</span>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: "50%",
              background: accent.solid,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <ChevronRight size={17} color={accent.text} strokeWidth={2.5} />
          </div>
        </button>

        <button
          onClick={() => setScreen("calories")}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: "18px 20px",
            borderRadius: 20,
            border: "1px solid #2c2924",
            background: "#1f1e1c",
            color: "#f2ede6",
            cursor: "pointer",
            marginTop: 10,
          }}
        >
          <span style={{ flex: 1, textAlign: "left", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16.5, fontWeight: 600 }}>Calorías</span>
            <span
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: 0.3,
                color: "#a39d95",
                background: "#2a2824",
                borderRadius: 999,
                padding: "3px 8px",
              }}
            >
              Beta · sin IA
            </span>
          </span>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: "50%",
              background: accent.solid,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <ChevronRight size={17} color={accent.text} strokeWidth={2.5} />
          </div>
        </button>

        <button
          ref={updatesButtonRef}
          onClick={() => {
            setUpdatesOpen((v) => {
              const next = !v;
              if (next) {
                setTimeout(() => {
                  updatesButtonRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                }, 60);
              }
              return next;
            });
          }}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            padding: "10px 0 4px",
            marginTop: 10,
            background: "none",
            border: "none",
            color: "#8a8580",
            fontSize: 12.5,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          <Sparkles size={13} color={accent.solid} />
          Ver últimas actualizaciones
          {updatesOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {updatesOpen && (
          <div style={{ marginTop: 8, border: "1px solid #2a2824", borderRadius: 16, overflow: "hidden" }}>
            {UPDATES.slice(0, 5).map((u, i) => (
              <div key={i} style={{ padding: "12px 14px", borderTop: i === 0 ? "none" : "1px solid #232019", display: "flex", gap: 10 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: accent.solid, marginTop: 6, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 11, color: "#6e6a65", marginBottom: 2 }}>{u.date}</div>
                  <div style={{ fontSize: 13, color: "#d7d2ca", lineHeight: 1.4 }}>{u.text}</div>
                </div>
              </div>
            ))}
            {UPDATES.length > 5 && (
              <button
                onClick={() => setAllUpdatesOpen(true)}
                style={{
                  width: "100%",
                  padding: "11px 14px",
                  border: "none",
                  borderTop: "1px solid #232019",
                  background: "none",
                  color: accent.solid,
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Ver todas ({UPDATES.length})
              </button>
            )}
          </div>
        )}

        {allUpdatesOpen && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(15,14,13,0.96)",
              zIndex: 50,
              display: "flex",
              flexDirection: "column",
              padding: "28px 20px 40px",
              boxSizing: "border-box",
            }}
          >
            <div style={{ marginBottom: 18, flexShrink: 0 }}>
              <span style={{ fontSize: 16, fontWeight: 600 }}>Todas las actualizaciones</span>
            </div>
            <div style={{ overflowY: "auto", border: "1px solid #2a2824", borderRadius: 16 }}>
              {UPDATES.map((u, i) => (
                <div key={i} style={{ padding: "12px 14px", borderTop: i === 0 ? "none" : "1px solid #232019", display: "flex", gap: 10 }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: accent.solid, marginTop: 6, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 11, color: "#6e6a65", marginBottom: 2 }}>{u.date}</div>
                    <div style={{ fontSize: 13, color: "#d7d2ca", lineHeight: 1.4 }}>{u.text}</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "center", paddingTop: 16, flexShrink: 0 }}>
              <button
                onClick={() => setAllUpdatesOpen(false)}
                aria-label="Cerrar"
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: "50%",
                  border: "1px solid #33312e",
                  background: "#1f1e1c",
                  color: "#c9c4bd",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                }}
              >
                <X size={20} />
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ---------- CALORÍAS ----------
  if (screen === "calories") {
    const totalKcal = CALORIE_MEALS.reduce((sum, m) => sum + (Number(caloriesData[m.key]?.kcal) || 0), 0);
    const totalMacros = MACRO_FIELDS.map((mf) => ({
      ...mf,
      total: CALORIE_MEALS.reduce((sum, m) => sum + (Number(caloriesData[m.key]?.[mf.key]) || 0), 0),
    }));
    const pendingForIA = CALORIE_MEALS.filter((m) => mealHasContent(caloriesData[m.key]) && caloriesData[m.key].kcal === "");
    const anyContent = CALORIE_MEALS.some((m) => mealHasAnything(caloriesData[m.key]));
    const isTrainingDay = completedDays.has(todayISO());
    const todayPlan = getDay(todayDayKey()).plan || [];
    const workoutKcal =
      isTrainingDay && hasCalorieProfile(currentUser) ? estimateWorkoutKcal(currentUser.pesoCorporalKg, todayPlan, exercisesMap) : 0;
    return (
      <div style={shell}>
        {success && <SuccessOverlay message={success} />}
        <TopBar
          title="Calorías"
          onBack={() => setScreen("home")}
          right={
            <button
              onClick={handleCaloriesClear}
              disabled={!anyContent}
              style={{
                padding: "7px 14px",
                borderRadius: 999,
                border: "1px solid #3a2b26",
                background: "transparent",
                color: anyContent ? "#e0725e" : "#5c5851",
                fontSize: 12.5,
                fontWeight: 600,
                cursor: anyContent ? "pointer" : "default",
                display: "flex",
                alignItems: "center",
                gap: 5,
                flexShrink: 0,
              }}
            >
              <Trash2 size={13} /> Borrar
            </button>
          }
        />

        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1 }}>{totalKcal}</div>
            <div style={{ fontSize: 12, color: "#8a8580", marginTop: 4 }}>kcal registradas hoy</div>
          </div>
          <div style={{ fontSize: 12, color: "#8a8580" }}>
            IA: <span style={{ color: accent.solid, fontWeight: 700 }}>{caloriesAiUsesLeft}/{CALORIES_AI_DAILY_LIMIT}</span> hoy
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {totalMacros.map((tm) => (
            <div
              key={tm.key}
              style={{
                flex: 1,
                borderRadius: 14,
                border: "1px solid #2c2924",
                background: "#1f1e1c",
                padding: "10px 12px",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 16, fontWeight: 700, color: tm.color }}>{tm.total}g</div>
              <div style={{ fontSize: 10.5, color: "#8a8580", marginTop: 2 }}>{tm.label}</div>
            </div>
          ))}
        </div>

        <CalorieExpenditureCard
          user={currentUser}
          consumedKcal={totalKcal}
          isTrainingDay={isTrainingDay}
          workoutKcal={workoutKcal}
          editing={calorieProfileEditing}
          form={calorieProfileForm}
          onChangeForm={(patch) => setCalorieProfileForm((prev) => ({ ...prev, ...patch }))}
          onStartEdit={openCalorieProfileEdit}
          onSave={saveCalorieProfile}
          onCancel={cancelCalorieProfileEdit}
          error={calorieProfileError}
        />

        {CALORIE_MEALS.map((m) => (
          <CalorieMealCard
            key={m.key}
            meal={m}
            data={caloriesData[m.key]}
            isOpen={caloriesOpenMeal === m.key}
            onToggle={() => setCaloriesOpenMeal((v) => (v === m.key ? null : m.key))}
            onTextChange={(v) => updateCalorieMeal(m.key, { texto: v })}
            onKcalChange={(v) => updateCalorieMeal(m.key, { kcal: v })}
            onMacroChange={(macroKey, v) => updateCalorieMeal(m.key, { [macroKey]: v })}
            onPickPhoto={(e) => handleCaloriePhoto(m.key, e)}
            onRemovePhoto={() => updateCalorieMeal(m.key, { foto: null })}
          />
        ))}

        <div style={{ marginTop: 8 }}>
          <button
            onClick={handleCaloriesCalcularIA}
            disabled={caloriesAiUsesLeft <= 0 || pendingForIA.length === 0 || caloriesAiLoading}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              padding: "14px 18px",
              borderRadius: 999,
              border: "none",
              background: caloriesAiUsesLeft <= 0 || pendingForIA.length === 0 ? "#332e29" : accent.solid,
              color: caloriesAiUsesLeft <= 0 || pendingForIA.length === 0 ? "#8a8580" : accent.text,
              fontSize: 15.5,
              fontWeight: 700,
              cursor: caloriesAiUsesLeft <= 0 || pendingForIA.length === 0 || caloriesAiLoading ? "default" : "pointer",
              opacity: caloriesAiLoading ? 0.7 : 1,
            }}
          >
            <Calculator size={17} />
            {caloriesAiLoading ? "Calculando..." : "Calcular"}
          </button>
          <div style={{ fontSize: 11.5, color: "#6e6a65", textAlign: "center", marginTop: 8, lineHeight: 1.4 }}>
            {caloriesAiUsesLeft <= 0
              ? "Ya usaste la IA las 2 veces de hoy. Puedes seguir escribiendo el kcal a mano."
              : pendingForIA.length === 0
              ? "Escribe o sube foto en alguna comida sin kcal para poder calcularla con IA."
              : `Estima kcal y macros con IA de las comidas con texto o foto que aún no tengan kcal (demo — la app real conecta un backend con IA).`}
          </div>
        </div>
      </div>
    );
  }

  // ---------- DAYS LIST ----------
  if (screen === "days") {
    const today = todayDayKey();
    return (
      <div style={shell}>
        <TopBar title="Mi rutina" onBack={() => setScreen("home")} />
        {success && <SuccessOverlay message={success} />}
        {DAYS.map((d) => {
          const day = getDay(d.key);
          const isToday = d.key === today;
          return (
            <div key={d.key} style={{ marginBottom: 8 }}>
              <button
                onClick={() => openDay(d.key)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 14px",
                  borderRadius: 18,
                  border: isToday ? `1.5px solid ${accent.solid}` : "1px solid #2f2c28",
                  background: isToday ? "#2a1d15" : "#1a1917",
                  color: "#f2ede6",
                  fontSize: 16,
                  fontWeight: 500,
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  <div>{d.label}</div>
                  <div style={{ fontSize: 12.5, color: day.category ? "#a39d95" : "#6e6a65", marginTop: 2 }}>
                    {day.category ? dayRoutineLabel(day) : "Sin rutina asignada"}
                  </div>
                </span>
                <div
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: "50%",
                    background: isToday ? accent.solid : "#2a2824",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <ChevronRight size={15} color={isToday ? accent.text : "#8a8580"} strokeWidth={2.5} />
                </div>
              </button>
            </div>
          );
        })}

        {(() => {
          const totals = {};
          DAYS.forEach((d) => {
            const day = getDay(d.key);
            if (day.category === "descanso") return;
            (day.plan || []).forEach((p) => {
              const catKey = FIXED_EXERCISE_CATEGORY[p.exerciseId] || exercisesMap[p.exerciseId]?.category || "otro";
              totals[catKey] = (totals[catKey] || 0) + (Number(p.sets) || 0);
            });
          });
          const rows = EXERCISE_CATEGORIES.filter((c) => c.key !== "cardio" && c.key !== "otro" && totals[c.key]).map((c) => ({ key: c.key, label: c.label, total: totals[c.key] }));
          return (
            <div style={{ marginTop: 18 }}>
              <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                {rows.length > 0 && (
                  <button
                    ref={summaryButtonRef}
                    onClick={() => {
                      setShowWeekSummary((v) => {
                        const next = !v;
                        if (next) {
                          setTimeout(() => {
                            summaryButtonRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                          }, 60);
                        }
                        return next;
                      });
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "7px 14px",
                      borderRadius: 999,
                      border: "1px solid #33312e",
                      background: "none",
                      color: "#a39d95",
                      fontSize: 12.5,
                      fontWeight: 500,
                      cursor: "pointer",
                    }}
                  >
                    {showWeekSummary ? "Ocultar resumen" : "Resumen"}
                    <ChevronDown size={13} style={{ transform: showWeekSummary ? "rotate(180deg)" : "none" }} />
                  </button>
                )}
                <button
                  ref={calendarButtonRef}
                  onClick={() => {
                    setShowCalendar((v) => {
                      const next = !v;
                      if (next) {
                        setTimeout(() => {
                          calendarButtonRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                        }, 60);
                      }
                      return next;
                    });
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "7px 14px",
                    borderRadius: 999,
                    border: `1px solid ${showCalendar ? accent.solid : "#33312e"}`,
                    background: "none",
                    color: showCalendar ? accent.solid : "#a39d95",
                    fontSize: 12.5,
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  <CalendarIcon size={13} />
                  Calendario
                  <ChevronDown size={13} style={{ transform: showCalendar ? "rotate(180deg)" : "none" }} />
                </button>
              </div>
              {showWeekSummary && rows.length > 0 && (
                <div style={{ marginTop: 10, padding: "14px 16px", borderRadius: 16, border: "1px solid #2a2824", background: "#1a1917" }}>
                  <div style={{ fontSize: 12, color: "#8a8580", fontWeight: 700, letterSpacing: 0.5, marginBottom: 10 }}>RESUMEN DE LA SEMANA</div>
                  {rows.map((r) => (
                    <div key={r.key} style={{ display: "flex", justifyContent: "space-between", fontSize: 14, padding: "6px 0" }}>
                      <span style={{ color: "#c9c4bd" }}>{r.label}</span>
                      <span style={{ color: "#f2ede6", fontWeight: 600 }}>{r.total} series</span>
                    </div>
                  ))}
                </div>
              )}
              {showCalendar && <RoutineCalendar completedDays={completedDays} onToggleDay={toggleCompletedDay} />}
            </div>
          );
        })()}

        <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
          <button
            onClick={() => {
              setShareCode(null);
              shareCurrentRoutine();
            }}
            disabled={sharing}
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              padding: "9px 12px",
              borderRadius: 999,
              border: "1px solid #2f2c28",
              background: "transparent",
              color: "#8a8580",
              fontSize: 12.5,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            <Share2 size={13} /> {sharing ? "Generando..." : "Compartir"}
          </button>
          <button
            onClick={() => setScreen("savedRoutines")}
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              padding: "9px 12px",
              borderRadius: 999,
              border: "1px solid #2f2c28",
              background: "transparent",
              color: "#8a8580",
              fontSize: 12.5,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            <FolderClock size={13} /> Rutinas guardadas
          </button>
        </div>

        {shareCode && (
          <div
            style={{
              marginTop: 12,
              padding: "12px 14px",
              borderRadius: 14,
              border: "1px solid #2a2824",
              background: "#1a1917",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            <div>
              <div style={{ fontSize: 11.5, color: "#8a8580" }}>Tu código para compartir</div>
              <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: 2 }}>{shareCode}</div>
            </div>
            <button
              onClick={() => {
                if (navigator.clipboard) navigator.clipboard.writeText(shareCode);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 12px",
                borderRadius: 999,
                border: "none",
                background: accent.solid,
                color: accent.text,
                fontSize: 12.5,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <Copy size={13} /> Copiar
            </button>
          </div>
        )}

        {newBadgeCelebration && (
          <BadgeCelebrationOverlay
            animal={newBadgeCelebration.animal}
            tier={newBadgeCelebration.tier}
            onClose={() => setNewBadgeCelebration(null)}
          />
        )}
      </div>
    );
  }

  // ---------- RUTINAS GUARDADAS ----------
  if (screen === "savedRoutines") {
    const savedList = Object.entries(savedRoutinesMap).sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0));
    const openRoutine = openSavedId ? savedRoutinesMap[openSavedId] : null;
    return (
      <div style={shell}>
        <TopBar title="Rutinas guardadas" onBack={() => setScreen("days")} />
        {success && <SuccessOverlay message={success} />}

        {savedList.length === 0 && (
          <div style={{ color: "#8a8580", fontSize: 14, marginBottom: 16 }}>Aún no tienes rutinas guardadas.</div>
        )}

        {savedList.map(([id, r]) => (
          <div key={id} style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <button
                onClick={() => setOpenSavedId(id === openSavedId ? null : id)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "14px 16px",
                  borderRadius: 18,
                  border: "1px solid #33312e",
                  background: "#1f1e1c",
                  color: "#f2ede6",
                  fontSize: 15.5,
                  fontWeight: 500,
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.source === "importado" && <Star size={12} color={accent.solid} fill={accent.solid} style={{ flexShrink: 0 }} />}
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "#8a8580", marginTop: 3 }}>{r.source === "importado" ? "Importada" : "Guardada por ti"}</div>
                </span>
                <ChevronRight size={17} color="#6e6a65" style={{ flexShrink: 0 }} />
              </button>
            </div>
            <button
              onClick={() => deleteSavedRoutine(id)}
              style={{ width: 44, height: 44, flexShrink: 0, border: "none", background: "transparent", color: "#5c5851", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}

        {openRoutine && (
          <div style={{ background: "#1a1917", border: "1px solid #2a2824", borderRadius: 16, padding: "14px 16px", marginBottom: 18 }}>
            {renamingSavedId === openSavedId ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <input
                  autoFocus
                  value={renameSavedValue}
                  onChange={(e) => setRenameSavedValue(e.target.value)}
                  style={{ flex: 1, background: "#141311", border: "1px solid #3a3630", borderRadius: 10, color: "#f2ede6", padding: "10px 12px", fontSize: 14.5 }}
                />
                <button
                  onClick={async () => {
                    await renameSavedRoutine(openSavedId, renameSavedValue);
                    setRenamingSavedId(null);
                  }}
                  style={{ width: 40, height: 40, flexShrink: 0, border: "none", borderRadius: 10, background: "#3fa863", color: "#0f1a12", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                >
                  <Check size={17} />
                </button>
                <button
                  onClick={() => setRenamingSavedId(null)}
                  style={{ width: 40, height: 40, flexShrink: 0, border: "1px solid #35322e", borderRadius: 10, background: "transparent", color: "#a39d95", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                >
                  <X size={17} />
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: "#8a8580", fontWeight: 700, letterSpacing: 0.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {openRoutine.name.toUpperCase()}
                  </div>
                  <button
                    onClick={() => {
                      setRenamingSavedId(openSavedId);
                      setRenameSavedValue(openRoutine.name);
                    }}
                    style={{ width: 32, height: 32, flexShrink: 0, border: "1px solid #35322e", borderRadius: 9, background: "transparent", color: "#c9c4bd", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                  >
                    <Pencil size={14} />
                  </button>
                </div>
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  {openRoutine.source !== "importado" && (
                    <button
                      onClick={() => {
                        if (window.confirm(`¿Sobrescribir "${openRoutine.name}" con tu rutina actual? Esto reemplaza lo que tenías guardado ahí.`)) {
                          updateSavedRoutine(openSavedId);
                        }
                      }}
                      style={{ fontSize: 12, fontWeight: 600, color: "#f2ede6", background: "#1f1e1c", border: "1px solid #33312e", borderRadius: 999, padding: "8px 14px", cursor: "pointer" }}
                    >
                      Actualizar
                    </button>
                  )}
                  <button
                    onClick={() => activateSavedRoutine(openSavedId)}
                    style={{ fontSize: 12, fontWeight: 600, color: accent.text, background: accent.solid, border: "none", borderRadius: 999, padding: "8px 14px", cursor: "pointer" }}
                  >
                    Activar
                  </button>
                </div>
              </div>
            )}            {DAYS.map((d) => {
              const snap = openRoutine.days[d.key] || { category: null, customLabel: null };
              const label = snap.category === "personalizada" ? snap.customLabel : categoryLabel(snap.category);
              return (
                <div key={d.key} style={{ fontSize: 12.5, color: "#a39d95", marginBottom: 2 }}>
                  <span style={{ color: "#d7d2ca" }}>{d.label}</span>: {snap.category ? label : "Descanso"}
                </div>
              );
            })}
          </div>
        )}

        {savingCurrent ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 26 }}>
            <input
              autoFocus
              value={saveNameValue}
              onChange={(e) => setSaveNameValue(e.target.value)}
              placeholder="Nombre de la rutina"
              style={{ flex: 1, padding: "12px 14px", borderRadius: 12, border: "1px solid #35322e", background: "#1a1917", color: "#f2ede6", fontSize: 14.5, outline: "none" }}
            />
            <button
              onClick={async () => {
                if (!saveNameValue.trim()) return;
                await saveCurrentAsRoutine(saveNameValue);
                setSaveNameValue("");
                setSavingCurrent(false);
              }}
              style={{ width: 44, height: 44, flexShrink: 0, border: "none", borderRadius: 12, background: "#3fa863", color: "#0f1a12", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
            >
              <Check size={18} />
            </button>
            <button
              onClick={() => {
                setSavingCurrent(false);
                setSaveNameValue("");
              }}
              style={{ width: 44, height: 44, flexShrink: 0, border: "1px solid #35322e", borderRadius: 12, background: "transparent", color: "#a39d95", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
            >
              <X size={18} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setSavingCurrent(true)}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              padding: "12px 18px",
              borderRadius: 999,
              border: "1.5px dashed #4a4640",
              background: "transparent",
              color: accent.solid,
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              marginBottom: 26,
            }}
          >
            <Save size={16} /> Guardar rutina actual
          </button>
        )}

        <div style={{ paddingTop: 20, borderTop: "1px solid #2a2824" }}>
          <div style={{ fontSize: 13, color: "#a39d95", marginBottom: 10 }}>¿Un amigo te compartió su rutina?</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input
              value={importCode}
              onChange={(e) => setImportCode(e.target.value)}
              placeholder="Código, ej. FIT7K2"
              style={{ flex: 1, padding: "12px 14px", borderRadius: 12, border: "1px solid #35322e", background: "#1a1917", color: "#f2ede6", fontSize: 14.5, outline: "none" }}
            />
            <button
              onClick={importRoutineByCode}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 16px", borderRadius: 12, border: "none", background: accent.solid, color: accent.text, fontWeight: 600, fontSize: 14, cursor: "pointer" }}
            >
              <Download size={15} /> Agregar
            </button>
          </div>
          {importMsg && <div style={{ fontSize: 12.5, color: importMsg.startsWith("ok") ? "#3fa863" : "#e0725e" }}>{importMsg.split(":")[1]}</div>}
        </div>
      </div>
    );
  }

  // ---------- CHOOSE CATEGORY ----------
  if (screen === "chooseCategory" && currentDayKey) {
    const dayLabel = DAYS.find((d) => d.key === currentDayKey)?.label;
    const visibleRoutines = Object.entries(customRoutinesMap).filter(([id, r]) => !r.hidden);
    return (
      <div style={shell}>
        <TopBar title={dayLabel} onBack={() => { setChangingCategory(false); setScreen(getDay(currentDayKey).category ? "dayDetail" : "days"); }} />
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>¿Qué vas a entrenar?</div>
        {CATEGORIES.map((c) => (
          <PillButton key={c.key} compact onClick={() => chooseCategory(c.key)}>
            {c.label}
          </PillButton>
        ))}
        <div style={{ marginTop: 10, marginBottom: 20 }}>
          <PillButton compact muted onClick={() => chooseCategory("descanso")} subtitle="Día libre, sin ejercicios">
            Descanso
          </PillButton>
        </div>

        <div style={{ fontSize: 12, color: "#8a8580", fontWeight: 700, letterSpacing: 0.4, marginBottom: 8 }}>PERSONALIZADA</div>
        {visibleRoutines.map(([id, r]) => (
          <PillButton
            key={id}
            compact
            onClick={() => selectCustomRoutine(id)}
            onEdit={() => openRenameRoutine(id, r.name)}
            onDelete={() => hideCustomRoutine(id, r.name)}
          >
            {r.name}
          </PillButton>
        ))}
        <DashedButton onClick={openPersonalizadaName}>
          <Plus size={17} /> Nueva rutina personalizada
        </DashedButton>
      </div>
    );
  }

  // ---------- NOMBRE DE RUTINA PERSONALIZADA ----------
  if (screen === "personalizadaName" && currentDayKey) {
    const dayLabel = DAYS.find((d) => d.key === currentDayKey)?.label;
    return (
      <div style={shell}>
        <TopBar title={dayLabel} onBack={() => setScreen("chooseCategory")} />
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>{renamingRoutineId ? "Renombra tu rutina" : "Nombra tu rutina"}</div>
        <Field label="Nombre de la rutina" value={customLabelInput} onChange={(e) => setCustomLabelInput(e.target.value)} placeholder="Ej. Superior" />
        {error && <div style={{ color: "#e0725e", fontSize: 13.5, marginBottom: 12 }}>{error}</div>}
        <PrimaryButton onClick={confirmPersonalizada}>{renamingRoutineId ? "Guardar" : "Continuar"}</PrimaryButton>
      </div>
    );
  }

  // ---------- DAY DETAIL ----------
  if (screen === "dayDetail" && currentDayKey) {
    const dayLabel = DAYS.find((d) => d.key === currentDayKey)?.label;
    const day = getDay(currentDayKey);
    const exercises = combinedDayExercises(currentDayKey);
    const isRestDay = day.category === "descanso";
    const isTraining = trainingDayKey === currentDayKey;
    return (
      <div style={shell}>
        <TopBar title={dayLabel} onBack={() => { cancelReorder(); setScreen("days"); }} />
        <button
          onClick={() => { setChangingCategory(true); setScreen("chooseCategory"); }}
          style={{ background: "none", border: "none", color: "#6e6a65", fontSize: 12, cursor: "pointer", padding: 0, marginBottom: 20, display: "block" }}
        >
          Rutina: {dayRoutineLabel(day)} · cambiar
        </button>

        {isRestDay ? (
          <div style={{ color: "#a39d95", fontSize: 14.5, textAlign: "center", padding: "30px 0" }}>Día de descanso 🛌</div>
        ) : (
          <>
            {exercises.length === 0 ? (
              <div style={{ color: "#8a8580", fontSize: 14, marginBottom: 16 }}>Aún no has agregado ejercicios.</div>
            ) : reorderMode ? (
              <>
                <div style={{ fontSize: 12.5, color: "#8a8580", marginBottom: 14 }}>
                  Mantén presionado <GripVertical size={12} style={{ verticalAlign: "-2px" }} /> y arrastra para cambiar el orden.
                </div>
                <ReorderableList
                  items={reorderList}
                  onReorder={setReorderList}
                  renderItem={(item, i, onHandleDown) => (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "12px 14px",
                        marginBottom: 8,
                        borderRadius: 14,
                        border: "1px solid #33312e",
                        background: "#1f1e1c",
                      }}
                    >
                      <button
                        onPointerDown={onHandleDown}
                        aria-label="Arrastrar para reordenar"
                        style={{ background: "none", border: "none", color: "#6e6a65", cursor: "grab", display: "flex", padding: 4, touchAction: "none" }}
                      >
                        <GripVertical size={18} />
                      </button>
                      <div style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#f2ede6", fontSize: 15, fontWeight: 500 }}>
                        {item.name}
                      </div>
                      <div
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: "50%",
                          background: "#141312",
                          color: "#a39d95",
                          fontSize: 12,
                          fontWeight: 700,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        {i + 1}
                      </div>
                    </div>
                  )}
                />
                <div style={{ display: "flex", gap: 8, marginTop: 14, marginBottom: 18 }}>
                  <button
                    onClick={cancelReorder}
                    style={{ flex: 1, padding: "12px", borderRadius: 999, border: "1px solid #33312e", background: "transparent", color: "#a39d95", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => saveReorder(currentDayKey)}
                    style={{ flex: 1, padding: "12px", borderRadius: 999, border: "none", background: accent.solid, color: accent.text, fontSize: 14, fontWeight: 700, cursor: "pointer" }}
                  >
                    Guardar orden
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                  <button
                    onClick={toggleTraining}
                    style={{
                      padding: "7px 18px",
                      borderRadius: 999,
                      border: "none",
                      background: isTraining ? "#e0725e" : accent.solid,
                      color: isTraining ? "#1a1512" : accent.text,
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {isTraining ? "Terminar" : "Empezar"}
                  </button>
                  <button
                    onClick={openRestTimer}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "7px 16px",
                      borderRadius: 999,
                      border: "1px solid #33312e",
                      background: "#1f1e1c",
                      color: "#f2ede6",
                      fontSize: 13.5,
                      fontWeight: 500,
                      cursor: "pointer",
                    }}
                  >
                    <Timer size={15} color={accent.solid} /> Descansar
                  </button>
                  {exercises.length > 1 && (
                    <button
                      onClick={() => startReorder(currentDayKey)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "7px 16px",
                        borderRadius: 999,
                        border: "1px solid #33312e",
                        background: "#1f1e1c",
                        color: "#f2ede6",
                        fontSize: 13.5,
                        fontWeight: 500,
                        cursor: "pointer",
                      }}
                    >
                      <GripVertical size={15} color={accent.solid} /> Reordenar
                    </button>
                  )}
                </div>

                {exercises.map((ex, i) => {
                  const pr = prOf(ex);
                  return (
                    <div key={ex.exerciseId} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ width: 20, flexShrink: 0, textAlign: "center", fontSize: 13, fontWeight: 600, color: "#6e6a65" }}>
                        {i + 1}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <PillButton
                          starred={ex.custom}
                          onClick={() => openExercise(ex)}
                          onDelete={() => quickDeleteExercise(ex)}
                          onPhoto={!ex.custom ? () => openExercisePhoto(ex) : undefined}
                          onCheck={isTraining ? () => toggleExerciseDone(ex.exerciseId) : undefined}
                          checked={trainingCompleted.has(ex.exerciseId)}
                          subtitle={`${pr !== null ? `PR: ${kgToUnit(pr, weightUnit)} ${weightUnit}` : "Sin PR"} · ${ex.sets}x${ex.reps} reps`}
                        >
                          {ex.name}
                        </PillButton>
                      </div>
                    </div>
                  );
                })}
              </>
            )}

            {!reorderMode && currentDayKey === todayDayKey() && (
              <div style={{ marginTop: 10, marginBottom: 18 }}>
                {completedDays.has(todayISO()) ? (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      padding: "13px 18px",
                      borderRadius: 999,
                      border: "none",
                      // Mismo color de acento que el calendario y que el botón
                      // "Marcar día de hoy", para que se vea consistente.
                      background: accent.solid,
                      color: accent.text,
                      fontSize: 14.5,
                      fontWeight: 700,
                    }}
                  >
                    <Check size={16} strokeWidth={3} />
                    Día marcado 🔥
                  </div>
                ) : (
                  <button
                    onClick={() => toggleCompletedDay(todayISO())}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      padding: "15px 18px",
                      borderRadius: 999,
                      border: "none",
                      background: accent.solid,
                      color: accent.text,
                      fontSize: 15.5,
                      fontWeight: 700,
                      letterSpacing: 0.2,
                      boxShadow: `0 4px 16px ${accent.solid}45`,
                      cursor: "pointer",
                    }}
                  >
                    Marcar día de hoy
                  </button>
                )}
                {completedDays.has(todayISO()) && (
                  <div style={{ fontSize: 11.5, color: "#6e6a65", marginTop: 8, textAlign: "center" }}>
                    ¿Te equivocaste? Desmárcalo desde el Calendario en "Mi rutina".
                  </div>
                )}
              </div>
            )}

            {!reorderMode && (
              <div style={{ marginTop: 6 }}>
                <DashedButton onClick={openAddExercise}>
                  <Plus size={17} /> Agregar ejercicio
                </DashedButton>
              </div>
            )}
          </>
        )}

        {restTimerOpen && (
          <RestTimerOverlay
            accent={accent}
            presetIndex={restPresetIndex}
            onPickPreset={pickRestPreset}
            secondsLeft={restSecondsLeft}
            running={restRunning}
            onToggleRunning={() => setRestRunning((v) => !v)}
            onReset={resetRestTimer}
            onClose={() => setRestTimerOpen(false)}
          />
        )}

        {newBadgeCelebration && (
          <BadgeCelebrationOverlay
            animal={newBadgeCelebration.animal}
            tier={newBadgeCelebration.tier}
            onClose={() => setNewBadgeCelebration(null)}
          />
        )}

        {photoExercise && (
          <ExercisePhotoOverlay
            name={photoExercise.name}
            src={exercisePhotoSrc(photoExercise.exerciseId)}
            onClose={closeExercisePhoto}
          />
        )}
      </div>
    );
  }

  // ---------- MIS INSIGNIAS ----------
  if (screen === "badges") {
    const earnedBadges = computeEarnedBadges(completedDays);
    const specialBadges = ownedSpecialBadges(currentUser);
    const selected = currentUser?.selectedBadges || [];
    const hasAny = earnedBadges.length > 0 || specialBadges.length > 0;
    return (
      <div style={shell}>
        <TopBar title="Mis insignias" onBack={() => setScreen("home")} />
        <div style={{ fontSize: 13, color: "#a39d95", marginBottom: 18, lineHeight: 1.5 }}>
          Elige hasta 2 para mostrar en tu inicio. Cada semana que entrenas 2 días o más gana una insignia nueva, apenas la semana termina.
        </div>

        {!hasAny ? (
          <div style={{ border: "1px dashed #33312e", borderRadius: 16, padding: "28px 16px", textAlign: "center", color: "#8a8580", fontSize: 13.5 }}>
            Todavía no tienes insignias. Entrena 2 días o más en una semana para ganar la primera.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            {specialBadges.map((b) => {
              const isSelected = selected.includes(b.id);
              return (
                <button
                  key={b.id}
                  onClick={() => toggleSelectedBadge(b.id)}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 6,
                    padding: "12px 6px",
                    borderRadius: 16,
                    border: isSelected ? `1.5px solid ${accent.solid}` : "1.5px solid #2a2824",
                    background: "#1a1917",
                    cursor: "pointer",
                  }}
                >
                  <BadgeImg src={b.src} size={78} />
                  <div style={{ fontSize: 11, color: "#f2ede6", fontWeight: 600 }}>{b.label}</div>
                  <div style={{ fontSize: 10, color: "#8a8580" }}>Especial</div>
                </button>
              );
            })}
            {earnedBadges.map((b) => {
              const isSelected = selected.includes(b.weekKey);
              return (
                <button
                  key={b.weekKey}
                  onClick={() => toggleSelectedBadge(b.weekKey)}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 6,
                    padding: "12px 6px",
                    borderRadius: 16,
                    border: isSelected ? `1.5px solid ${accent.solid}` : "1.5px solid #2a2824",
                    background: "#1a1917",
                    cursor: "pointer",
                  }}
                >
                  <BadgeImg animal={b.animal} tier={b.tier} size={78} />
                  <div style={{ fontSize: 11, color: "#f2ede6", fontWeight: 600, textTransform: "capitalize" }}>{b.animal}</div>
                  <div style={{ fontSize: 10, color: "#8a8580" }}>{b.days} días</div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ---------- AMIGOS ----------
  if (screen === "friends") {
    return (
      <div style={shell}>
        {success && <SuccessOverlay message={success} />}
        {selectedFriend && <FriendDetailOverlay friend={selectedFriend} accent={accent} onClose={() => setSelectedFriend(null)} />}
        <TopBar title="Amigos" onBack={() => setScreen("home")} />

        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, padding: "12px 14px", borderRadius: 14, border: "1px solid #35322e", background: "#1a1917" }}>
            <Search size={15} color="#6e6a65" />
            <input
              value={friendSearchQuery}
              onChange={(e) => {
                setFriendSearchQuery(e.target.value);
                setFriendSearchError("");
                setFriendSearchResult(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && handleFriendSearch()}
              placeholder="Buscar amigos"
              style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none", color: "#f2ede6", fontSize: 14.5 }}
            />
          </div>
          <button
            onClick={handleFriendSearch}
            disabled={friendSearchLoading}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "0 16px",
              borderRadius: 14,
              border: "none",
              background: accent.solid,
              color: accent.text,
              fontWeight: 600,
              fontSize: 13.5,
              cursor: friendSearchLoading ? "default" : "pointer",
              opacity: friendSearchLoading ? 0.7 : 1,
            }}
          >
            <UserPlus size={15} /> Buscar
          </button>
        </div>

        {friendSearchError && <div style={{ color: "#e0725e", fontSize: 13, marginBottom: 14 }}>{friendSearchError}</div>}

        {friendSearchResult && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, borderRadius: 16, border: "1px solid #2c2924", background: "#1a1917", padding: "12px 14px", marginBottom: 18 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 700, color: "#f2ede6" }}>{friendSearchResult.displayName}</div>
              <div style={{ fontSize: 12, color: "#8a8580" }}>@{friendSearchResult.username}</div>
            </div>
            <button
              onClick={() => sendFriendRequest(friendSearchResult)}
              style={{ flexShrink: 0, border: "none", borderRadius: 12, background: accent.solid, color: accent.text, fontSize: 13, fontWeight: 600, padding: "9px 14px", cursor: "pointer" }}
            >
              Enviar solicitud
            </button>
          </div>
        )}

        {friendRequests.length > 0 && (
          <>
            <button
              onClick={() => setFriendRequestsOpen((v) => !v)}
              style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 2px", marginBottom: friendRequestsOpen ? 10 : 16, background: "none", border: "none", cursor: "pointer" }}
            >
              <span style={{ fontSize: 12, color: "#8a8580", fontWeight: 700, letterSpacing: 0.4 }}>
                SOLICITUDES ({friendRequests.length})
              </span>
              {friendRequestsOpen ? <ChevronUp size={15} color="#8a8580" /> : <ChevronDown size={15} color="#8a8580" />}
            </button>
            {friendRequestsOpen && (
              <>
                {friendRequests.slice(0, 3).map((req) => (
                  <FriendRequestRow key={req.id} req={req} accent={accent} onAccept={acceptFriendRequest} onReject={rejectFriendRequest} />
                ))}
                {friendRequests.length > 3 && (
                  <button
                    onClick={() => setAllFriendRequestsOpen(true)}
                    style={{ width: "100%", padding: "10px 0", marginBottom: 10, background: "none", border: "none", color: accent.solid, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
                  >
                    Ver todas ({friendRequests.length})
                  </button>
                )}
                <div style={{ height: 8 }} />
              </>
            )}
          </>
        )}

        <div style={{ fontSize: 12, color: "#8a8580", fontWeight: 700, letterSpacing: 0.4, marginBottom: 10 }}>TUS AMIGOS</div>

        {friendsLoading ? (
          <div style={{ color: "#8a8580", fontSize: 13.5 }}>Cargando...</div>
        ) : friendsList.length === 0 ? (
          <div style={{ border: "1px dashed #33312e", borderRadius: 16, padding: "28px 16px", textAlign: "center", color: "#8a8580", fontSize: 13.5 }}>
            Todavía no tienes amigos agregados. Búscalos por su usuario arriba.
          </div>
        ) : (
          friendsList.map((f) => <FriendCard key={f.uid} friend={f} accent={accent} onRemove={removeFriend} onSelect={setSelectedFriend} />)
        )}

        {allFriendRequestsOpen && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(15,14,13,0.96)",
              zIndex: 50,
              display: "flex",
              flexDirection: "column",
              padding: "28px 20px 40px",
              boxSizing: "border-box",
            }}
          >
            <div style={{ marginBottom: 18, flexShrink: 0 }}>
              <span style={{ fontSize: 16, fontWeight: 600 }}>Todas las solicitudes</span>
            </div>
            <div style={{ overflowY: "auto" }}>
              {friendRequests.map((req) => (
                <FriendRequestRow
                  key={req.id}
                  req={req}
                  accent={accent}
                  onAccept={(r) => {
                    acceptFriendRequest(r);
                    if (friendRequests.length <= 1) setAllFriendRequestsOpen(false);
                  }}
                  onReject={(r) => {
                    rejectFriendRequest(r);
                    if (friendRequests.length <= 1) setAllFriendRequestsOpen(false);
                  }}
                />
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "center", paddingTop: 16, flexShrink: 0 }}>
              <button
                onClick={() => setAllFriendRequestsOpen(false)}
                aria-label="Cerrar"
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: "50%",
                  border: "1px solid #33312e",
                  background: "#1f1e1c",
                  color: "#c9c4bd",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                }}
              >
                <X size={20} />
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ---------- ADD EXERCISE (todas las categorías) ----------
  if (screen === "addExercise" && currentDayKey) {
    const day = getDay(currentDayKey);
    const alreadyIds = new Set((day.plan || []).map((p) => p.exerciseId));

    // Todos los ejercicios disponibles (fijos + personalizados), con su
    // músculo, equipo y tipo de movimiento, para poder filtrarlos.
    const allItems = EXERCISE_CATEGORIES.flatMap((cat) => {
      const fixed = cat.exercises
        .filter((name) => !alreadyIds.has("fx-" + slugify(name)))
        .map((name) => {
          const id = "fx-" + slugify(name);
          const meta = FIXED_EXERCISE_META[id] || {};
          return { id, name, custom: false, categoryKey: cat.key, categoryLabel: cat.label, equipo: meta.equipo, tipo: meta.tipo };
        });
      const customs = Object.entries(exercisesMap)
        .filter(([id, ex]) => ex.custom && !alreadyIds.has(id) && (ex.category === cat.key || (cat.key === "otro" && !ex.category)))
        .map(([id, ex]) => ({ id, name: ex.name, custom: true, categoryKey: cat.key, categoryLabel: cat.label, equipo: null, tipo: null }));
      return [...fixed, ...customs];
    });

    const queryNorm = normalizeText(exerciseSearchQuery.trim());
    const activeFilterCount = exerciseFilterMuscles.size + exerciseFilterEquipo.size + exerciseFilterTipo.size;
    const hasActiveSearch = exerciseSearchOpen && (!!queryNorm || activeFilterCount > 0);

    const filteredItems = hasActiveSearch
      ? allItems.filter((it) => {
          if (queryNorm && !normalizeText(it.name).includes(queryNorm)) return false;
          if (exerciseFilterMuscles.size > 0 && !exerciseFilterMuscles.has(it.categoryKey)) return false;
          if (exerciseFilterEquipo.size > 0 && (!it.equipo || !exerciseFilterEquipo.has(it.equipo))) return false;
          if (exerciseFilterTipo.size > 0 && (!it.tipo || !exerciseFilterTipo.has(it.tipo))) return false;
          return true;
        })
      : [];

    // Vista agrupada por músculo de siempre, solo cuando no hay búsqueda ni filtros activos.
    const sections = hasActiveSearch
      ? []
      : EXERCISE_CATEGORIES.map((cat) => {
          const fixed = cat.exercises.filter((name) => !alreadyIds.has("fx-" + slugify(name))).map((name) => ({ id: "fx-" + slugify(name), name, custom: false }));
          const customs = Object.entries(exercisesMap)
            .filter(([id, ex]) => ex.custom && !alreadyIds.has(id) && (ex.category === cat.key || (cat.key === "otro" && !ex.category)))
            .map(([id, ex]) => ({ id, name: ex.name, custom: true }));
          return { key: cat.key, label: cat.label, items: [...fixed, ...customs] };
        }).filter((s) => s.items.length > 0);

    return (
      <div style={shell}>
        <TopBar
          title="Agregar ejercicio"
          onBack={() => setScreen("dayDetail")}
          right={
            <button
              onClick={() => setExerciseSearchOpen((v) => !v)}
              aria-label="Buscar ejercicio"
              style={{
                width: 34,
                height: 34,
                flexShrink: 0,
                borderRadius: "50%",
                border: `1px solid ${exerciseSearchOpen ? accent.solid : "#33312e"}`,
                background: exerciseSearchOpen ? `${accent.solid}26` : "#1f1e1c",
                color: exerciseSearchOpen ? accent.solid : "#c9c4bd",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
              }}
            >
              <Search size={16} />
            </button>
          }
        />

        {exerciseSearchOpen && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 14px", borderRadius: 14, border: "1px solid #35322e", background: "#1a1917", marginBottom: 10 }}>
              <Search size={15} color="#6e6a65" />
              <input
                autoFocus
                value={exerciseSearchQuery}
                onChange={(e) => setExerciseSearchQuery(e.target.value)}
                placeholder="Buscar por nombre..."
                style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none", color: "#f2ede6", fontSize: 14.5 }}
              />
              {exerciseSearchQuery && (
                <button onClick={() => setExerciseSearchQuery("")} aria-label="Borrar búsqueda" style={{ background: "none", border: "none", color: "#6e6a65", cursor: "pointer", display: "flex", padding: 0 }}>
                  <X size={15} />
                </button>
              )}
            </div>

            <button
              onClick={() => setExerciseFiltersOpen((v) => !v)}
              style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: activeFilterCount > 0 ? accent.solid : "#a39d95", fontSize: 13, fontWeight: 600, padding: "2px 2px 14px", cursor: "pointer" }}
            >
              Filtros{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""} {exerciseFiltersOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>

            {exerciseFiltersOpen && (
              <div style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 11, color: "#8a8580", fontWeight: 700, letterSpacing: 0.4, marginBottom: 8 }}>MÚSCULO</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 16 }}>
                  {CATEGORIES.map((c) => (
                    <FilterChip key={c.key} active={exerciseFilterMuscles.has(c.key)} onClick={() => toggleInSet(setExerciseFilterMuscles, c.key)}>
                      {c.label}
                    </FilterChip>
                  ))}
                </div>
                <div style={{ fontSize: 11, color: "#8a8580", fontWeight: 700, letterSpacing: 0.4, marginBottom: 8 }}>EQUIPO</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 16 }}>
                  {EQUIPMENT_OPTIONS.map((eq) => (
                    <FilterChip key={eq.key} active={exerciseFilterEquipo.has(eq.key)} onClick={() => toggleInSet(setExerciseFilterEquipo, eq.key)}>
                      {eq.label}
                    </FilterChip>
                  ))}
                </div>
                <div style={{ fontSize: 11, color: "#8a8580", fontWeight: 700, letterSpacing: 0.4, marginBottom: 8 }}>TIPO DE MOVIMIENTO</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 8 }}>
                  {MOVEMENT_OPTIONS.map((m) => (
                    <FilterChip key={m.key} active={exerciseFilterTipo.has(m.key)} onClick={() => toggleInSet(setExerciseFilterTipo, m.key)}>
                      {m.label}
                    </FilterChip>
                  ))}
                </div>
                {activeFilterCount > 0 && (
                  <button
                    onClick={() => {
                      setExerciseFilterMuscles(new Set());
                      setExerciseFilterEquipo(new Set());
                      setExerciseFilterTipo(new Set());
                    }}
                    style={{ background: "none", border: "none", color: "#e07856", fontSize: 12.5, fontWeight: 600, padding: 0, marginTop: 2, marginBottom: 10, cursor: "pointer" }}
                  >
                    Limpiar filtros
                  </button>
                )}
              </div>
            )}
          </>
        )}

        {hasActiveSearch ? (
          filteredItems.length === 0 ? (
            <div style={{ color: "#8a8580", fontSize: 14, marginBottom: 16 }}>No encontramos ejercicios con esa búsqueda o esos filtros.</div>
          ) : (
            <div style={{ marginBottom: 18 }}>
              {filteredItems.map((it) => (
                <PillButton
                  key={it.id}
                  compact
                  starred={it.custom}
                  subtitle={[it.categoryLabel, EQUIPMENT_OPTIONS.find((e) => e.key === it.equipo)?.label, MOVEMENT_OPTIONS.find((m) => m.key === it.tipo)?.label].filter(Boolean).join(" · ")}
                  onClick={() => openExerciseForm(it.name, it.id)}
                  onDelete={it.custom ? () => deleteCustomExercise(it.id, it.name) : undefined}
                  onPhoto={!it.custom ? () => openExercisePhoto({ exerciseId: it.id, name: it.name }) : undefined}
                >
                  {it.name}
                </PillButton>
              ))}
            </div>
          )
        ) : (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
              <button
                onClick={() => {
                  setLibraryTab("musculo");
                  setLibraryMuscleKey(null);
                }}
                style={{
                  flex: 1,
                  padding: "10px 0",
                  borderRadius: 999,
                  border: `1px solid ${libraryTab === "musculo" ? accent.solid : "#33312e"}`,
                  background: libraryTab === "musculo" ? accent.solid : "#1f1e1c",
                  color: libraryTab === "musculo" ? accent.text : "#a39d95",
                  fontSize: 13.5,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Por músculo
              </button>
              <button
                onClick={() => {
                  setLibraryTab("todos");
                  setLibraryMuscleKey(null);
                }}
                style={{
                  flex: 1,
                  padding: "10px 0",
                  borderRadius: 999,
                  border: `1px solid ${libraryTab === "todos" ? accent.solid : "#33312e"}`,
                  background: libraryTab === "todos" ? accent.solid : "#1f1e1c",
                  color: libraryTab === "todos" ? accent.text : "#a39d95",
                  fontSize: 13.5,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Todos
              </button>
            </div>

            {libraryTab === "musculo" && libraryMuscleKey === null && (
              sections.length === 0 ? (
                <div style={{ color: "#8a8580", fontSize: 14, marginBottom: 16 }}>Ya agregaste todos los ejercicios disponibles.</div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 18 }}>
                  {sections.map((s) => (
                    <button
                      key={s.key}
                      onClick={() => setLibraryMuscleKey(s.key)}
                      style={{
                        textAlign: "left",
                        padding: "14px",
                        borderRadius: 14,
                        border: "1px solid #2a2824",
                        background: "#1a1917",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#f2ede6", marginBottom: 3 }}>{s.label}</div>
                      <div style={{ fontSize: 12, color: "#8a8580" }}>
                        {s.items.length} ejercicio{s.items.length === 1 ? "" : "s"}
                      </div>
                    </button>
                  ))}
                </div>
              )
            )}

            {libraryTab === "musculo" && libraryMuscleKey !== null && (() => {
              const section = sections.find((s) => s.key === libraryMuscleKey);
              return (
                <div style={{ marginBottom: 18 }}>
                  <button
                    onClick={() => setLibraryMuscleKey(null)}
                    style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", color: "#a39d95", fontSize: 13, fontWeight: 600, padding: 0, marginBottom: 14, cursor: "pointer" }}
                  >
                    <ChevronLeft size={16} /> {section?.label || ""}
                  </button>
                  {!section || section.items.length === 0 ? (
                    <div style={{ color: "#8a8580", fontSize: 14 }}>Ya agregaste todos los ejercicios de este músculo.</div>
                  ) : (
                    section.items.map((it) => (
                      <PillButton
                        key={it.id}
                        compact
                        starred={it.custom}
                        onClick={() => openExerciseForm(it.name, it.id)}
                        onDelete={it.custom ? () => deleteCustomExercise(it.id, it.name) : undefined}
                        onPhoto={!it.custom ? () => openExercisePhoto({ exerciseId: it.id, name: it.name }) : undefined}
                      >
                        {it.name}
                      </PillButton>
                    ))
                  )}
                </div>
              );
            })()}

            {libraryTab === "todos" && (
              sections.length === 0 ? (
                <div style={{ color: "#8a8580", fontSize: 14, marginBottom: 16 }}>Ya agregaste todos los ejercicios disponibles.</div>
              ) : (
                sections.map((s) => (
                  <div key={s.key} style={{ marginBottom: 18 }}>
                    <div style={{ fontSize: 12, color: "#8a8580", fontWeight: 700, letterSpacing: 0.4, marginBottom: 8 }}>{s.label.toUpperCase()}</div>
                    {s.items.map((it) => (
                      <PillButton
                        key={it.id}
                        compact
                        starred={it.custom}
                        onClick={() => openExerciseForm(it.name, it.id)}
                        onDelete={it.custom ? () => deleteCustomExercise(it.id, it.name) : undefined}
                        onPhoto={!it.custom ? () => openExercisePhoto({ exerciseId: it.id, name: it.name }) : undefined}
                      >
                        {it.name}
                      </PillButton>
                    ))}
                  </div>
                ))
              )
            )}
          </>
        )}

        <DashedButton onClick={openCustomExerciseForm}>
          <Plus size={17} /> Ejercicio personalizado nuevo
        </DashedButton>

        {photoExercise && (
          <ExercisePhotoOverlay
            name={photoExercise.name}
            src={exercisePhotoSrc(photoExercise.exerciseId)}
            onClose={closeExercisePhoto}
          />
        )}
      </div>
    );
  }

  // ---------- EXERCISE FORM (orden, series, reps) ----------
  if (screen === "exerciseForm") {
    return (
      <div style={shell}>
        {success && <SuccessOverlay message={success} />}
        <TopBar title={customExerciseMode ? "Ejercicio personalizado" : pendingExerciseName} onBack={() => setScreen(editExercise ? "exerciseDetail" : "addExercise")} />
        {customExerciseMode && (
          <>
            <Field label="Nombre del ejercicio" value={exerciseForm.nombre} onChange={(e) => setExerciseForm({ ...exerciseForm, nombre: e.target.value })} placeholder="Ej. Pecho barra amarilla" />
            <SelectField
              label="Categoría"
              value={exerciseForm.categoria}
              onChange={(e) => setExerciseForm({ ...exerciseForm, categoria: e.target.value })}
              options={EXERCISE_CATEGORIES.map((c) => ({ value: c.key, label: c.label }))}
            />
          </>
        )}
        <Field label="Series" type="number" min="1" value={exerciseForm.series} onChange={(e) => setExerciseForm({ ...exerciseForm, series: e.target.value })} placeholder="Ej. 3" />
        <Field label="Repeticiones" type="number" min="1" value={exerciseForm.repeticiones} onChange={(e) => setExerciseForm({ ...exerciseForm, repeticiones: e.target.value })} placeholder="Ej. 10" />
        {error && <div style={{ color: "#e0725e", fontSize: 13.5, marginBottom: 12 }}>{error}</div>}
        <PrimaryButton onClick={handleSaveExercisePlan}>{editExercise ? "Guardar cambios" : "Agregar a mi rutina"}</PrimaryButton>
        {editExercise && (
          <button onClick={handleDeleteExercisePlan} style={{ width: "100%", padding: "12px", marginTop: 10, background: "transparent", border: "none", color: "#e07856", fontSize: 14, cursor: "pointer" }}>
            Quitar del plan de este día
          </button>
        )}
      </div>
    );
  }

  // ---------- EXERCISE DETAIL (PR + records) ----------
  if (screen === "exerciseDetail" && currentExercise) {
    const pr = prOf(currentExercise);
    const records = sortByFecha(currentExercise.records || []);
    return (
      <div style={shell}>
        {success && <SuccessOverlay message={success} />}
        {recordCelebration && <NewRecordOverlay {...recordCelebration} unit={weightUnit} />}
        <TopBar title={currentExercise.name} onBack={() => setScreen("dayDetail")} right={<UnitToggle unit={weightUnit} onChange={changeWeightUnit} />} />

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#2a2320", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Trophy size={19} color={accent.solid} />
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{pr !== null ? `${kgToUnit(pr, weightUnit)} ${weightUnit}` : "Sin registros aún"}</div>
            <div style={{ fontSize: 12, color: "#8a8580" }}>Récord personal (PR)</div>
          </div>
        </div>

        <button onClick={() => openEditExercisePlan(currentExercise)} style={{ background: "none", border: "none", color: "#a39d95", fontSize: 12.5, cursor: "pointer", padding: 0, marginBottom: 20 }}>
          Plan: {currentExercise.sets}x{currentExercise.reps} reps · editar
        </button>

        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          <button
            onClick={openCalc1RM}
            style={{
              flex: "0 0 auto",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              padding: "11px 10px",
              borderRadius: 14,
              border: "1px solid #33312e",
              background: "#1f1e1c",
              color: "#f2ede6",
              fontSize: 13.5,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            <Calculator size={15} color={accent.solid} /> Calcular 1RM
          </button>
        </div>

        {records.length === 0 ? (
          <div style={{ color: "#8a8580", fontSize: 14, marginBottom: 20 }}>Sin registros aún.</div>
        ) : (
          <div style={{ border: "1px solid #2a2824", borderRadius: 16, overflow: "hidden", marginBottom: 20 }}>
            <div style={{ display: "flex", padding: "10px 14px", background: "#1a1917", fontSize: 11, color: "#8a8580", fontWeight: 700, letterSpacing: 0.5 }}>
              <div style={{ flex: 1.2 }}>FECHA</div>
              <div style={{ flex: 0.8, textAlign: "right" }}>PESO</div>
              <div style={{ flex: 1, textAlign: "right" }}>SERIES x REPS</div>
            </div>
            {records.map((r) => (
              <div key={r.id} onClick={() => openEditRecord(r)} style={{ display: "flex", padding: "12px 14px", fontSize: 13.5, borderTop: "1px solid #232019", color: "#d7d2ca", cursor: "pointer" }}>
                <div style={{ flex: 1.2 }}>{r.fecha}</div>
                <div style={{ flex: 0.8, textAlign: "right", color: r.peso === pr ? accent.solid : "#d7d2ca", fontWeight: r.peso === pr ? 700 : 400 }}>{kgToUnit(r.peso, weightUnit)} {weightUnit}</div>
                <div style={{ flex: 1, textAlign: "right", color: "#a39d95" }}>{r.series}x{r.repeticiones}</div>
              </div>
            ))}
          </div>
        )}

        <DashedButton onClick={openNewRecord}>
          <Plus size={17} /> Nuevo registro
        </DashedButton>

        {restTimerOpen && (
          <RestTimerOverlay
            accent={accent}
            presetIndex={restPresetIndex}
            onPickPreset={pickRestPreset}
            secondsLeft={restSecondsLeft}
            running={restRunning}
            onToggleRunning={() => setRestRunning((v) => !v)}
            onReset={resetRestTimer}
            onClose={() => setRestTimerOpen(false)}
          />
        )}

        {calc1rmOpen && (
          <Calc1RMOverlay
            accent={accent}
            weight={calcWeight}
            reps={calcReps}
            onWeightChange={setCalcWeight}
            onRepsChange={setCalcReps}
            onClose={() => setCalc1rmOpen(false)}
          />
        )}
      </div>
    );
  }

  // ---------- ADD RECORD ----------
  if (screen === "addRecord" && currentExercise) {
    return (
      <div style={shell}>
        {success && <SuccessOverlay message={success} />}
        {recordCelebration && <NewRecordOverlay {...recordCelebration} unit={weightUnit} />}
        <TopBar title={editRecordId ? "Editar registro" : "Nuevo registro"} onBack={() => setScreen("exerciseDetail")} right={<UnitToggle unit={weightUnit} onChange={changeWeightUnit} />} />
        {!editRecordId && sortByFecha(currentExercise.records || [])[0] && (
          <div style={{ fontSize: 12.5, color: "#8a8580", marginTop: -10, marginBottom: 14 }}>
            Última vez: {kgToUnit(sortByFecha(currentExercise.records || [])[0].peso, weightUnit)} {weightUnit} · ya lo dejé precargado, ajústalo si cambió.
          </div>
        )}
        <Field label="Fecha" type="date" value={recordForm.fecha} onChange={(e) => setRecordForm({ ...recordForm, fecha: e.target.value })} />
        <Field label={`Peso (${weightUnit})`} type="number" min="0" step="0.5" value={recordForm.peso} onChange={(e) => setRecordForm({ ...recordForm, peso: e.target.value })} placeholder="Ej. 80" />
        <Field label="Series" type="number" min="1" value={recordForm.series} onChange={(e) => setRecordForm({ ...recordForm, series: e.target.value })} placeholder="Ej. 3" />
        <Field label="Repeticiones" type="number" min="1" value={recordForm.repeticiones} onChange={(e) => setRecordForm({ ...recordForm, repeticiones: e.target.value })} placeholder="Ej. 10" />
        {error && <div style={{ color: "#e0725e", fontSize: 13.5, marginBottom: 12 }}>{error}</div>}
        <PrimaryButton onClick={handleSaveRecord}>{editRecordId ? "Guardar cambios" : "Guardar registro"}</PrimaryButton>
        {editRecordId && (
          <button onClick={handleDeleteRecord} style={{ width: "100%", padding: "12px", marginTop: 10, background: "transparent", border: "none", color: "#e07856", fontSize: 14, cursor: "pointer" }}>
            Eliminar registro
          </button>
        )}
      </div>
    );
  }

  return <div style={shell} />;
}
