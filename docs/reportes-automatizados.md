
# Documentación de Reportes Automatizados

## Visión General

El sistema de generación de reportes mensuales ha sido actualizado para eliminar la redundancia de "Fotos para Reporte" y centralizar toda la información en la **Bitácora de Mantenimiento**. Ahora, los reportes se generan enviando todos los registros (gastos y evidencias) a un webhook externo (o simulado) que procesa la información y devuelve un PDF.

## Flujo de Datos

1.  **Captura de Datos**:
    *   El administrador registra sucesos y gastos en la **Bitácora de Mantenimiento y Gastos** dentro del modal de gestión de la propiedad.
    *   Puede adjuntar imágenes (evidencia) directamente en cada entrada de la bitácora.
    *   Los gastos registrados (`cost`) se suman automáticamente para el balance financiero.

2.  **Generación del Reporte**:
    *   Al hacer clic en "Generar Reporte Mensual", el sistema:
        *   Filtra los registros de la bitácora correspondientes al mes actual.
        *   Calcula el costo total.
        *   Recopila documentos adjuntos del periodo.
        *   Empaqueta esta información en un objeto JSON.

3.  **Webhook**:
    *   El sistema envía el JSON a la URL configurada en la variable de entorno `VITE_REPORT_WEBHOOK_URL`.
    *   **Payload del Webhook**:
        ```json
        {
          "propertyId": "uuid-de-la-propiedad",
          "month": "2023-10",
          "logs": [
            {
              "date": "2023-10-05T10:00:00Z",
              "content": "Mantenimiento de piscina",
              "cost": 50,
              "images": ["url1", "url2"]
            }
          ],
          "documents": [
            { "name": "Factura luz", "type": "invoice", "created_at": "..." }
          ],
          "additionalNotes": "Notas adicionales del admin...",
          "totalCost": 50
        }
        ```
    *   **Respuesta Esperada**:
        ```json
        {
          "success": true,
          "pdfUrl": "data:application/pdf;base64,..." // o URL pública
        }
        ```

## Configuración

Para habilitar la integración real, configure la siguiente variable de entorno en `.env`:

```env
VITE_REPORT_WEBHOOK_URL=https://su-webhook-url.com/generate-report
```

Si esta variable no está definida, el sistema utilizará el modo de simulación (Dev Mode), generando un PDF en blanco de prueba.

## Migración de Datos

La funcionalidad anterior "Fotos para Reporte (Privadas)" utilizaba almacenamiento local temporal y no persistía datos críticos en una estructura separada de base de datos que requiriera migración. Toda la evidencia histórica relevante debe estar contenida en `maintenance_logs` (Bitácora). Se recomienda a los administradores revisar que todas las evidencias importantes estén registradas en la bitácora.
