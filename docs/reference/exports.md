# Exportar agenda y notas

[Índice de documentación](../README.md)

Las exportaciones son archivos locales con datos accesibles de tu cuenta. Se guardan por defecto en `exports/`, dentro de `UP_MCP_DOWNLOAD_DIR` o `~/Downloads/upacifico-mcp`. `outputDir` permite una subcarpeta relativa. Cada operación crea un nombre único, no sobrescribe copias anteriores y aplica un límite de 5 MiB por exportación y la cuota de la raíz de descargas.

## Agenda en iCalendar

`blackboard_export_course_agenda` consulta la agenda de una sección entre `since` y `until` (hasta 112 días), y devuelve `destination`, `eventCount`, `complete` y `warnings`.

```json
{
  "courseId": "_12345_1",
  "since": "2026-10-05T00:00:00-05:00",
  "until": "2026-10-12T00:00:00-05:00",
  "outputDir": "calendarios"
}
```

El archivo `.ics` usa eventos `VEVENT`, fechas UTC, UTF-8, escapes de texto y líneas plegadas siguiendo [RFC 5545](https://www.rfc-editor.org/rfc/rfc5545). Los identificadores son estables para la misma combinación de curso, fuente, ID y fecha. Puedes importar el archivo en un cliente que acepte iCalendar; la importación no se realiza automáticamente.

Es una copia de las fechas devueltas por la consulta. No genera reglas de recurrencia, amplía repeticiones, crea recordatorios, mantiene suscripciones ni sincroniza cambios posteriores. Un vencimiento puede estar representado tanto en el calendario como en una actividad; se conservan ambas fuentes. Si cambia una fecha, una importación nueva no elimina por sí sola los eventos de copias anteriores.

Las fuentes fallidas bloquean la exportación por defecto. Consulta primero `blackboard_get_course_agenda` para revisar sus avisos. Si deseas una copia parcial, indica `allowPartial: true`; el resultado y el archivo señalan que la consulta quedó incompleta.

## Notas en CSV

`blackboard_export_course_grades` consulta las notas de la cuenta autenticada y sus columnas; devuelve `destination`, `rowCount`, `complete` y `warnings`. `courseId` es obligatorio; `outputDir` y `allowPartial` son opcionales.

Los campos conservan los valores publicados: ID/nombre del curso y de columna, `score`, `display_score`, `column_possible`, `display_possible`, texto de nota, estado, exención y comentarios. Las variantes de puntaje y escala se mantienen separadas, conforme a los campos documentados en la [API de notas de Blackboard](https://docs.blackboard.com/docs/blackboard/rest-apis/hands-on/pulling-gradebook-data-and-assessment-grades).

Una nota cero se conserva como cero; un valor no publicado queda vacío. También se preservan notas cuya columna no aparece en los metadatos recibidos. No se calculan medias, porcentajes del sílabo ni certificaciones. El CSV usa coma, comillas escapadas, UTF-8 con BOM y campos de texto potencialmente interpretables como fórmulas se preceden con un apóstrofo. Los puntajes numéricos mantienen su valor.

Si no se pueden consultar las columnas, `allowPartial: true` permite exportar las notas disponibles con metadatos ausentes y un aviso. Si falla la consulta de notas o aparecen notas identificadas con otra cuenta, no se genera el archivo.

## Privacidad

Los archivos exportados contienen información académica privada y no forman parte de las distribuciones del código. Revísalos antes de compartirlos. No se suben a calendarios, correo ni servicios externos. Las pruebas verifican datos ficticios y el formato generado; la importación en cada cliente de calendario no está comprobada. Los reportes de pruebas con cuentas reales se conservan fuera del repositorio.

Los IDs del ejemplo son ficticios. Usa los IDs reales devueltos por las herramientas.

Las exportaciones de varias secciones, asistencia, estructura, resumen y comprobantes se detallan en [usage.md](../guide/usage.md).
