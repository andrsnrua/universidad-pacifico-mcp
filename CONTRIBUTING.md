# Contribuir

El proyecto se mantiene enfocado en Aula Virtual de la Universidad del Pacífico, Perú. Las contribuciones deben conservar el transporte stdio, el acceso con cuenta propia y la restricción de lectura remota.

## Preparar el entorno

```sh
npm ci --ignore-scripts
npm run check
```

Las pruebas usan datos sintéticos. No conviertas respuestas con nombres, notas, documentos o cookies reales en fixtures. Para probar una nueva consulta, simula el endpoint e incluye casos de permisos, paginación y respuesta incompleta cuando correspondan.

## Antes de proponer un cambio

- Explica el problema y el comportamiento observable que cambia.
- Mantén el dominio UP fijo y los secretos fuera de stdout y archivos públicos.
- No añadas métodos HTTP de escritura, contraseñas en herramientas o desactivación de controles de acceso.
- Revisa si el dato existe realmente en la API: no deduzcas ponderaciones o fechas desde campos insuficientes.
- Documenta esquemas y errores de cualquier herramienta nueva.
- Ejecuta `npm run check` y adjunta el resultado sanitizado.

No se requiere una cuenta UP para revisar un PR o ejecutar el pipeline. La validación real debe indicar su alcance sin mostrar información académica.
