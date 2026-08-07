# Auditoría cruzada de los PDF de la carpeta `App`

Fecha de revisión: 8 de agosto de 2026  
Ámbito: ocho PDF (cuatro cuestionarios y cuatro plantillas), acceso libre, tipo A, convocatorias identificadas por el año de la resolución: 2022, 2023, 2024 y 2025.

## Resultado ejecutivo

- Los cuestionarios contienen exactamente 100 preguntas en 2022, 2023 y 2024, y 80 preguntas en 2025.
- En ninguno de los ocho PDF existe una sección de preguntas de reserva, una numeración adicional de reserva ni una clave para reservas no utilizadas.
- Las plantillas no indican sustituciones. Una pregunta marcada como `ANULADA` debe excluirse sin desplazar la numeración ni incorporar otra en su lugar.
- Todas las preguntas no anuladas tienen una única respuesta oficial, siempre una letra entre A y D. No hay ninguna pregunta con dos o más respuestas aceptadas.
- Banco utilizable: 98 preguntas de 2022, 95 de 2023, 99 de 2024 y 80 de 2025; total, 372 preguntas.
- La puntuación directa aplicable es `D = A - E/4`, donde `A` es el número de aciertos y `E` el número de errores. Las respuestas en blanco y las preguntas anuladas valen cero.
- La calificación oficial en escala 0-10 no puede reproducirse exactamente para un test aleatorio sin el baremo o nota de corte que el Tribunal fija para cada ejercicio. La aplicación debe presentar como dato oficial la puntuación directa y etiquetar cualquier conversión lineal a 0-10 como orientativa.

## Conteo y anulaciones

| Convocatoria | Numeración del cuestionario | Estado que figura en la plantilla local | Preguntas ordinarias originales | Preguntas de reserva identificadas | Anuladas (excluir) | Ordinarias válidas | Sustitución indicada |
|---|---:|---|---:|---:|---|---:|---|
| 2022 | 1-100, sin huecos | `PLANTILLA PROVISIONAL` | 100 | 0 | 43, 82 | 98 | No |
| 2023 | 1-100, sin huecos | `PLANTILLA DEFINITIVA` | 100 | 0 | 20, 24, 25, 30, 42 | 95 | No |
| 2024 | 1-100, sin huecos | `PLANTILLA DEFINITIVA` | 100 | 0 | 73 | 99 | No |
| 2025 | 1-80, sin huecos | `PLANTILLA DEFINITIVA` | 80 | 0 | Ninguna | 80 | No |

### Criterio sobre preguntas de reserva

El término "reserva" puede referirse en las convocatorias a la conservación o reserva de una calificación, pero eso no equivale a preguntas adicionales de reserva. En este corpus:

1. Los cuestionarios terminan exactamente en el número de preguntas ordinarias previsto para el ejercicio.
2. No aparece ningún encabezado del tipo "preguntas de reserva".
3. Las plantillas terminan en el mismo número y no asignan respuestas a preguntas adicionales.
4. Por tanto, no existen reservas no utilizadas con clave oficial que puedan incorporarse al banco.

Decisión para la aplicación: `is_reserve = false` para todas las preguntas importables de estos PDF. No debe inventarse una sustitución para las anuladas. Si en el futuro se añadiera una fuente que sí contuviera reservas, sólo procedería incluirlas cuando la propia fuente oficial les asignase una respuesta, conservando `source_role = reserve` para trazabilidad.

## Claves oficiales contrastadas

Convención: cada posición corresponde consecutivamente al rango indicado. `X` significa `ANULADA` y debe excluirse del banco y del cálculo.

### 2022

```text
01-20: D C C A C C C D D B D D C B D C B A D A
21-40: C C D D B A B A D D B D C B C C D B C A
41-60: C C X D A A C B D B C D A C B A C C D A
61-80: C A B B A D C A C C D B C A B D A B C B
81-100: D X C B B B B A C B C D B C B B B B A C
```

### 2023

```text
01-20: C B C C B B B A D D C A D C B B D A B X
21-40: B D B X X C D A B X C C B D B C D B C B
41-60: A X A C D B D D B A C B B D C A C D A B
61-80: B A C A C C B D B D D C B A A D B A B D
81-100: B D D C C A C C B C C A C D A C C B D D
```

### 2024

```text
01-20: C D D A C C A C B A A A B A A D B B C D
21-40: B A D D A B D B D D D A D D D B C A D B
41-60: C A B A D C B C A A A B A D D B A D C B
61-80: D D C A C B D C C B A A X C C D B D C C
81-100: B D D B D A D D C B A B A D A D D A D D
```

### 2025

```text
01-20: A D D D C A C A B C A C D D D A C A B D
21-40: A B B A D B C D C C C B C D B C A D D A
41-60: B B B C C B B B D D B D B C A D C A A A
61-80: D A C B D C C B D C A D A B D D A B D C
```

## Sistema de puntuación aplicable al primer ejercicio

### Lo que dicen los ocho PDF suministrados

| Convocatoria | Mención dentro de los PDF de `App` |
|---|---|
| 2022 | El cuestionario empieza directamente por la pregunta 1 y la plantilla no contiene reglas de puntuación. |
| 2023 | La portada indica 100 preguntas de igual valor, una sola respuesta correcta, penalización de errores y valor cero para preguntas no contestadas o marcas inválidas. No especifica el coeficiente de penalización. |
| 2024 | El cuestionario empieza directamente por la pregunta 1 y la plantilla no contiene reglas de puntuación. |
| 2025 | El cuestionario empieza directamente por la pregunta 1 y la plantilla no contiene reglas de puntuación. |

### Contraste con las convocatorias oficiales

Las cuatro convocatorias oficiales establecen la misma penalización: cada error descuenta un cuarto del valor de un acierto y las respuestas en blanco no penalizan. En 2022 se expresa además la fórmula de forma literal:

```text
Puntuación directa D = Aciertos - (Errores / 4)
```

| Convocatoria | Máximo original | Máximo directo tras anulaciones del corpus | Escala oficial | Observación |
|---|---:|---:|---|---|
| 2022 | 100 | 98 | 0-10; mínimo nominal 5 | El Tribunal fija la nota de corte y transforma la puntuación directa. La nota informativa oficial confirma un máximo obtenible de 98 tras las dos anulaciones. |
| 2023 | 100 | 95 | 0-10; mínimo nominal 5 | El Tribunal fija la puntuación directa mínima y la transformación. |
| 2024 | 100 | 99 | 0-10; mínimo nominal 5 | El Tribunal fija la puntuación directa mínima y la transformación. |
| 2025 | 80 | 80 | 0-10; mínimo nominal 5 | El Tribunal fija la puntuación directa mínima y la transformación. |

Consecuencia para un simulador con un número de preguntas elegido por el usuario:

- Puntuación directa oficial: `aciertos - errores/4`.
- Blancas: cero puntos y cero penalización.
- Anuladas: nunca se muestran y nunca entran en el denominador.
- Para un test de `n` preguntas válidas, el máximo directo es `n`.
- Puede mostrarse `10 * D / n` como nota proporcional de práctica, preferiblemente limitada al intervalo 0-10, pero no debe llamarse "calificación oficial" ni usarse para declarar un aprobado oficial.
- El aprobado oficial histórico requiere el baremo y la nota de corte del Tribunal para ese ejercicio completo, no sólo la fórmula de penalización.

Fuentes oficiales usadas exclusivamente para contrastar el sistema de puntuación:

- [Convocatoria 2022 - BOE-A-2023-70](https://www.boe.es/diario_boe/txt.php?id=BOE-A-2023-70)
- [Portal AEAT de la convocatoria 2022](https://sede.agenciatributaria.gob.es/Sede/trabajar-agencia-tributaria/convocatorias-ofertas-empleo-publico-2022/cuerpo-gral-admvo-esp-agentes-libre.html)
- [Convocatoria 2023 - BOE-A-2024-402](https://www.boe.es/buscar/doc.php?id=BOE-A-2024-402&lang=es)
- [Convocatoria 2024 - BOE-A-2024-27298](https://www.boe.es/diario_boe/txt.php?id=BOE-A-2024-27298)
- [Convocatoria 2025 - BOE-A-2025-27056](https://www.boe.es/diario_boe/txt.php?id=BOE-A-2025-27056)

## Discrepancias y decisiones recomendadas

1. **Rótulo de la plantilla 2022.** El PDF local dice `PLANTILLA PROVISIONAL`. Sin embargo, el portal oficial de la AEAT enlaza como "Plantilla definitiva 1er ejercicio tipo A" un PDF cuyo contenido conserva ese mismo rótulo provisional y la misma clave, incluidas las anulaciones 43 y 82. Parece un error de rotulación del documento oficial, no una diferencia de respuestas. Conviene conservar en los metadatos ambas circunstancias: `document_label = provisional` y `portal_status = definitiva`.
2. **No hay sustituciones.** Ninguna plantilla dice que una pregunta anulada se sustituya por otra. El máximo directo se reduce al número de preguntas válidas.
3. **No hay respuestas múltiples aceptadas.** Todos los registros válidos tienen exactamente una letra A-D. No debe existir un campo de respuestas correctas múltiples para este corpus.
4. **Año del archivo frente a fecha efectiva.** El año usado en los nombres corresponde al año de la resolución de convocatoria. Por ejemplo, la convocatoria 2023 se examinó el 20 de abril de 2024, y la plantilla 2025 se publicó el 9 de abril de 2026. El identificador estable recomendado es `convocatoria-AAAA-tipo-A-pregunta-N`.
5. **Alcance.** Se han auditado únicamente acceso libre y tipo A. No deben mezclarse claves de tipo B, promoción interna ni ejercicios extraordinarios.

## Reglas de validación para el importador

1. Aceptar sólo identificadores de pregunta dentro de 1-100 para 2022-2024 y 1-80 para 2025.
2. Rechazar 43 y 82 de 2022; 20, 24, 25, 30 y 42 de 2023; y 73 de 2024.
3. Exigir una y sólo una respuesta correcta A-D para cada registro importado.
4. Exigir conteos finales por año de 98, 95, 99 y 80; total 372.
5. No etiquetar ninguna pregunta como reserva ni generar sustituciones implícitas.
6. Comprobar que `aciertos + errores + blancas = n` al cerrar cada test.
7. Calcular la puntuación directa con precisión decimal exacta de cuartos de punto.

