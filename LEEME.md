# MiRutina — guía para subirla gratis

## 1. Crear el proyecto de Firebase (backend gratis)
1. Ve a https://console.firebase.google.com y crea un proyecto nuevo (nómbralo MiRutina).
2. En el menú lateral entra a **Compilación > Authentication** > pestaña "Sign-in method" > habilita **Correo electrónico/contraseña**.
3. Entra a **Compilación > Firestore Database** > **Crear base de datos** > modo producción > elige una región cercana (ej. us-central).
4. Dentro de Firestore, pestaña **Reglas**, pega el contenido del archivo `firestore.rules` de esta carpeta y publica.
5. Ve a **Configuración del proyecto** (ícono de engranaje) > baja hasta "Tus apps" > clic en el ícono `</>` (Web) > registra la app (nombre: MiRutina) > copia el objeto `firebaseConfig` que te muestra.
6. Abre `src/firebase.js` en este proyecto y reemplaza los valores de ejemplo con los que copiaste.

## 2. Preparar el proyecto en tu computador
1. Instala Node.js si no lo tienes: https://nodejs.org (versión LTS).
2. Descomprime esta carpeta.
3. Abre una terminal dentro de la carpeta `mirutina-app` y ejecuta:
   ```
   npm install
   npm run dev
   ```
4. Abre la URL que te muestre (normalmente http://localhost:5173) para probarla en tu computador antes de subirla.

## 3. Subir a un hosting gratis (Vercel, recomendado)
1. Crea una cuenta gratis en https://vercel.com (puedes entrar con GitHub).
2. Sube esta carpeta a un repositorio de GitHub (o usa "Deploy" arrastrando la carpeta si Vercel te lo permite).
3. En Vercel: **Add New Project** > selecciona el repositorio > Vercel detecta automáticamente que es un proyecto Vite > clic en **Deploy**.
4. En unos minutos te da una URL pública tipo `mirutina-app.vercel.app`. Ábrela en tu celular y listo, ya está en línea.

### Alternativa: Netlify
1. Crea cuenta gratis en https://netlify.com.
2. Ejecuta `npm run build` en tu computador (genera la carpeta `dist`).
3. Arrastra la carpeta `dist` a la página de Netlify (sección "Deploys" > "Drag and drop").
4. Te da una URL pública al instante.

## Cómo funciona la app
- **Mi rutina** te lleva a la lista de los 7 días de la semana.
- La primera vez que entras a un día, eliges qué vas a entrenar (Pecho, Espalda, Bíceps, Tríceps, Cuádriceps, Femorales o Glúteos). Ese día queda marcado en la lista con el nombre de la rutina elegida.
- Dentro del día puedes **agregar ejercicio**: eliges uno de la lista de esa rutina y defines el orden, las series y las repeticiones (ej. 3x10).
- Cada ejercicio queda como un botón que muestra tu PR (el peso más alto registrado) y tu plan de series x reps.
- Al entrar a un ejercicio puedes agregar un **nuevo registro** con fecha, peso, series y repeticiones. El PR se calcula solo, tomando el peso más alto de tus registros.
- Puedes cambiar la rutina de un día o editar el plan de un ejercicio en cualquier momento con los enlaces "cambiar" / "editar".
- Cada cuenta ve únicamente su propia rutina.
- El plan gratis de Firebase (Spark) alcanza sin problema para uso personal.
