# Entrena AHP

Aplicación web ligera para practicar el primer ejercicio de Agentes de la Hacienda Pública con preguntas históricas de acceso libre.

## Banco de preguntas

- 372 preguntas válidas: 98 de 2022, 95 de 2023, 99 de 2024 y 80 de 2025.
- Fuente exclusiva para enunciados y claves: los ocho PDF de la carpeta `App`.
- Anuladas excluidas: 2022 (43, 82), 2023 (20, 24, 25, 30, 42) y 2024 (73).
- No se han inferido preguntas de reserva ni respuestas múltiples.
- Las plantillas de respuestas utilizadas son las definitivas, incluida la de 2022.

La auditoría y las extracciones reproducibles están en `data/source`. `scripts/build-question-bank.py` normaliza y valida el banco antes de escribir los datos consumidos por la aplicación.

## Corrección

La aplicación calcula la puntuación directa oficial:

`aciertos - errores / 4`

Las respuestas en blanco valen cero.

El resultado también se expresa como nota proporcional de práctica sobre 10: `máx(0, mín(10, 10 × puntuación directa / preguntas del test))`. Utiliza la penalización oficial, pero no sustituye la transformación ni la nota de corte que determine el Tribunal.

Cada test registra el tiempo empleado y una referencia máxima proporcional a los 90 minutos oficiales para 80 preguntas. Durante el test el tiempo solo se muestra si el estudiante decide consultarlo; no hay cuenta atrás, alarmas ni cierre automático.

## Explicaciones y progreso

- Cada una de las 372 preguntas incluye una explicación breve y un fundamento normativo para revisar los errores.
- El panel guarda los resultados, resume aciertos, errores y preguntas en blanco, y muestra la evolución de los últimos tests.
- Las preguntas falladas que todavía no se han corregido forman automáticamente un test de repaso.
- El progreso se guarda bajo un identificador anónimo. El código de recuperación permite abrir el mismo historial en otro navegador o dispositivo; no se solicitan nombre, correo ni cuenta de usuario.
- El navegador mantiene una copia completa por perfil para mostrar el panel aunque Sites no esté disponible.
- El panel permite exportar e importar una copia JSON versionada con el historial, el código anónimo y los intentos aún pendientes de sincronización.

La persistencia autoritativa de la versión publicada utiliza una base D1. Si falta temporalmente la conexión, el historial sigue disponible desde la copia local, los nuevos intentos se conservan en el navegador y se sincronizan al recuperarla. Una respuesta remota regresiva nunca sustituye una copia local con más tests.

## Uso local

```text
npm ci
npm run dev
```

La web es adaptable a ordenador, Android y iPhone. Incluye manifiesto instalable y caché local para poder volver a abrirla tras la primera carga.

## Publicación

El frontend está preparado para publicarse en GitHub Pages en:

`https://acasalderrey.github.io/Entrena-AHP/`

Cada cambio en `main` ejecuta las pruebas y, mediante `.github/workflows/pages.yml`, construye y publica `dist-pages`. Para activar la publicación por primera vez hay que seleccionar **GitHub Actions** como origen en **Settings > Pages**. GitHub Pages está disponible gratuitamente si el repositorio es público.

GitHub Pages sirve contenido estático, por lo que el historial y la recuperación entre dispositivos siguen utilizando el endpoint D1 de la publicación de Sites. La API solo permite peticiones de navegador procedentes de `https://acasalderrey.github.io`; la aplicación no solicita nombre, correo ni cuenta de usuario.

La versión de Sites puede mantenerse durante la transición en:

`https://entrena-ahp-aeat.casalderrey.chatgpt.site/`

Para probar la compilación estática localmente:

```text
npm run build:pages
npm run preview:pages
```
