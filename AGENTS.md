# Guía operativa

## Contexto y arquitectura

- Esta es una aplicación genérica de votaciones, utilizada inicialmente por GB Lorchos.
- Stack actual: Next.js con App Router, TypeScript y npm.
- Mantener una única aplicación full-stack. Cuando se añada persistencia, usar PostgreSQL con Drizzle ORM.
- No usar Tailwind. Mantener un CSS propio y sencillo; la base visual vivirá en `src/styles/tokens.css` y `src/styles/global.css` cuando se creen.
- Para trabajo visual, consultar `docs/brand/STYLE_GUIDE.md` cuando exista. No inventar reglas de marca.

## Interfaz

- El idioma principal de la interfaz es gallego.
- Diseñar mobile-first, especialmente el flujo de voto.
- Incorporar accesibilidad desde el principio: HTML semántico, navegación por teclado, foco visible, labels reales, contraste suficiente y ARIA solo cuando el HTML nativo no baste.
- Priorizar, en este orden: claridad, seguridad, comprensión del estado, accesibilidad, identidad y estética.
- Evitar estética SaaS genérica, glassmorphism, degradados decorativos, glows, sombras gratuitas, exceso de tarjetas y animaciones sin utilidad.

## Implementación y seguridad

- Evitar dependencias innecesarias, abstracciones prematuras, archivos gigantes, estado duplicado y comentarios triviales.
- No debilitar ni reinterpretar por cuenta propia reglas sobre tokens, anonimato, votos, autorización, prevención del doble voto, resultados o concurrencia. Implementar cambios sensibles solo según requisitos explícitos.
- No crear nunca una relación entre la identidad o credencial del votante y la papeleta anónima, salvo que una especificación posterior cambie esta regla explícitamente.
- Limitar los cambios al objetivo solicitado y evitar refactors no relacionados.
- No hacer commits automáticamente.

## Cierre de tareas

- Antes de terminar una tarea de código, ejecutar los comandos de validación que existan realmente en `package.json`: como mínimo `lint` y `build` si están disponibles, y tests cuando exista un script para ellos.
- Al terminar, reportar los archivos modificados, un resumen de los cambios y el resultado de la validación.
