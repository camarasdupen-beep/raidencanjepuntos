# Raiden · Canjes — lista para configurar en Netlify

Aplicación instalable (PWA) para el equipo. Incluye usuarios individuales, permisos de administración, premios editables, búsqueda en Loyverse, descuento de puntos e historial. Premio inicial: **1.000 puntos por 5% OFF**. La empleada aplica el descuento manualmente en el ticket: la app solo modifica puntos.

## Publicación

El proyecto necesita funciones de servidor y una base PostgreSQL para compartir usuarios, premios e historial. **No funciona subiendo solo el HTML ni arrastrando el ZIP a Netlify Drop.** Usar repositorio conectado o Netlify CLI para compilar las funciones.

1. Descomprimir el proyecto y cargar su contenido en un repositorio privado de GitHub.
2. Crear un proyecto en Netlify importando ese repositorio. Se detecta `netlify.toml`: comando `npm run build`, publicación `public`, funciones `netlify/functions`, Node 22.
3. Crear una base PostgreSQL dedicada, por ejemplo en Neon, y obtener su cadena de conexión con TLS (`sslmode=require`). No guardar credenciales en Git.
4. En las variables de entorno del proyecto Netlify agregar `DATABASE_URL` (conexión PostgreSQL) y `LOYVERSE_TOKEN` (token con lectura y escritura de clientes). Deben estar disponibles para las Functions. Nunca poner el token en `public`.
5. Inicializar la base una vez en una terminal segura con Node 22. Definir las variables de entorno `DATABASE_URL`, `ADMIN_USERNAME`, `ADMIN_PASSWORD` (12 a 128 caracteres) y opcionalmente `ADMIN_NAME`. Usar el administrador de secretos de tu plataforma/terminal, sin guardar contraseñas en archivos de este proyecto. Ejecutar:

   ```sh
   npm ci
   node scripts/setup.mjs
   ```

   El script crea tablas, administrador y premio de ejemplo. No sobrescribe usuarios existentes ni imprime contraseñas. No dejar ADMIN_PASSWORD en variables permanentes de compilación.
6. Desplegar. Entrar con el administrador, abrir **Equipo** y crear Soraya y Natalia con sus contraseñas individuales. Cambiar permisos, contraseñas o desactivar accesos desde ese panel.

Alternativa: con Netlify CLI, iniciar sesión y vincular el sitio, configurar variables y base, ejecutar `npm ci` y `npx netlify-cli deploy --build --prod` desde esta carpeta.

## Instalar en celulares

Abrir la URL HTTPS publicada en **Chrome en Android**. Tocar **Instalar app** cuando aparezca; también puede instalarse desde el menú ⋮ de Chrome → **Instalar aplicación / Agregar a pantalla principal**. Aparece un ícono de Raiden y abre en ventana propia. Cada empleada inicia sesión con su cuenta. En iPhone: Safari → Compartir → Agregar a pantalla de inicio.

La instalación requiere publicar la app primero. El ZIP no se instala directamente. Se incluyen manifest, íconos PNG 192/512, modo standalone y service worker. El botón depende de la disponibilidad de instalación del navegador. No se almacenan saldos, clientes, API ni sesiones en caché offline. **Canjear requiere internet.** Sesión de 10 horas, luego se vuelve a ingresar. No usa Play Store.

## Uso

Buscar por nombre/documento → elegir cliente → elegir premio → confirmar → esperar **Canje realizado** → cargar el beneficio manualmente en el ticket de venta.

- El documento se busca en `customer_code` (código de cliente). También busca nombre y teléfono. Si el DNI está en otro campo en tu cuenta, adaptar el mapeo antes del uso real.
- La búsqueda recorre todos los clientes con paginación, muestra hasta 50 coincidencias y admite hasta 7.500 clientes. Si se supera ese límite, se informa sin mostrar resultados parciales; se necesita un índice sincronizado para agendas mayores.
- Premio configurable con nombre, puntos, indicación para caja y estado activo/inactivo. Sin equivalencia obligatoria entre pesos y puntos.
- Administración ve últimos 200 canjes del equipo; cada empleada ve últimos 200 propios. El historial conserva premio e instrucción originales aunque se edite el catálogo.
- Antes de confirmar, verificar nombre y documento para evitar confundir clientes.

## Seguridad y doble toque

Contraseñas con scrypt y salt, sesión en cookie HttpOnly/Secure/SameSite, verificación de permisos en el servidor, protección de origen y límite de intentos de acceso. Token de Loyverse solo en Functions.

Cada canje tiene identificador único y registro durable antes de modificar Loyverse. Las solicitudes internas por cliente se serializan y se bloquean nuevos canjes durante 30 segundos. Si hay caída, timeout o resultado incierto, queda **pendiente/en revisión**, bloquea nuevos canjes de ese cliente y no se reintenta automáticamente. Revisar historial, nunca probar de nuevo a ciegas.

Administración puede marcar aplicado/no aplicado tras revisar Loyverse y el ticket, con explicación obligatoria. La resolución solo se permite luego de 2 minutos para evitar interferir con una solicitud en curso. **Resolver no modifica puntos**. Si la venta se cancela luego de canjear, revisar y reintegrar puntos manualmente en Loyverse. Esta versión no tiene devolución automática de puntos.

**Limitación importante de integración:** Loyverse documenta la escritura de un saldo absoluto, sin resta atómica/condicional documentada. La app coordina sus propios canjes, pero no puede bloquear ventas ni modificaciones hechas desde otras terminales o apps. Durante el canje no realizar otra venta/cambio de puntos del mismo cliente. La verificación posterior detecta algunas discrepancias, pero no puede garantizar detectar un saldo simultáneo sobrescrito. Para eliminar ese riesgo se requiere canje nativo o un registro de puntos propio.

No usar además “Canjear puntos” nativo de Loyverse, porque descontaría dos veces. La app no sabe si la empleada efectivamente aplicó el beneficio en caja: la operación del ticket sigue siendo manual.

## Pruebas

`npm test` valida contraseñas, saldos e identificadores. `npm run build` valida sintaxis y archivos de instalación. No necesita Vite.

Antes del uso real, con una base y cliente de prueba, verificar conexión, login administrador/empleadas, DNI, saldo insuficiente, canje exitoso, doble toque, timeout, historial, resolución y acceso desde dos dispositivos. Instalar desde la URL HTTPS y comprobar apertura en ventana propia. No se hicieron operaciones sobre clientes reales.

Entrega de código sin credenciales, sin despliegue activo ni conexión real verificada. Hace falta configurar Netlify, PostgreSQL y la API para ponerla en funcionamiento.
