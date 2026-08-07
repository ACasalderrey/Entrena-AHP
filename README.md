# Entrena AHP

Aplicación web ligera para practicar el primer ejercicio de Agentes de la Hacienda Pública con preguntas históricas de acceso libre, tipo A.

## Banco de preguntas

- 372 preguntas válidas: 98 de 2022, 95 de 2023, 99 de 2024 y 80 de 2025.
- Fuente exclusiva para enunciados y claves: los ocho PDF de la carpeta `App`.
- Anuladas excluidas: 2022 (43, 82), 2023 (20, 24, 25, 30, 42) y 2024 (73).
- No se han inferido preguntas de reserva ni respuestas múltiples.
- El PDF de respuestas de 2022 está rotulado como plantilla provisional; la aplicación conserva exactamente esa clave local.

La auditoría y las extracciones reproducibles están en `data/source`. `scripts/build-question-bank.py` normaliza y valida el banco antes de escribir los datos consumidos por la aplicación.

## Corrección

La aplicación calcula la puntuación directa oficial:

`aciertos - errores / 4`

Las respuestas en blanco valen cero. No se presenta una calificación oficial sobre 10, porque esa transformación depende del baremo de cada tribunal.

## Uso local

```text
npm ci
npm run dev
```

La web es adaptable a ordenador, Android y iPhone. Incluye manifiesto instalable y caché local para poder volver a abrirla tras la primera carga.

## Publicación

El código fuente se mantiene en el repositorio privado de GitHub y la aplicación pública está disponible en:

`https://entrena-ahp-aeat.casalderrey.chatgpt.site/`

Cada cambio en `main` ejecuta `.github/workflows/ci.yml` y comprueba el banco, la puntuación y ambos formatos de compilación.

El proyecto también conserva una compilación estática preparada para GitHub Pages. GitHub Pages desde un repositorio privado requiere GitHub Pro o superior; para probar esa versión localmente:

```text
npm run build:pages
npm run preview:pages
```
