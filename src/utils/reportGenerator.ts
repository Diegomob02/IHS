export interface ReportData {
  propertyId: string;
  month: string;
  logs: any[];
  documents: any[];
  additionalNotes?: string;
  totalCost: number;
}

export interface WebhookResponse {
  success: boolean;
  pdfUrl?: string; // URL if the webhook generates and returns a PDF
  message?: string;
}

/**
 * Prepares the report data from the dashboard state
 */
export const prepareReportData = (
  property: any,
  maintenanceLogs: any[],
  propertyDocs: any[],
  reportText: string
): ReportData => {
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  
  const monthlyLogs = maintenanceLogs.filter((l: any) => {
    const d = l?.log_date ? new Date(l.log_date) : new Date(l?.created_at);
    return d >= monthStart;
  });

  const totalMaintenanceCost = monthlyLogs.reduce((sum: number, item: any) => sum + (Number(item.cost) || 0), 0);

  return {
    propertyId: property.id,
    month: monthStart.toISOString().slice(0, 7), // YYYY-MM
    logs: monthlyLogs.map(l => ({
      date: l.log_date || l.created_at,
      content: l.content,
      cost: Number(l.cost) || 0,
      images: l.images || []
    })),
    documents: propertyDocs.map(d => ({
      name: d.name,
      type: d.type,
      created_at: d.created_at
    })),
    additionalNotes: reportText,
    totalCost: totalMaintenanceCost
  };
};

/**
 * Sends the report data to the webhook
 */
export const sendReportToWebhook = async (data: ReportData): Promise<WebhookResponse> => {
  const webhookUrl = import.meta.env.VITE_REPORT_WEBHOOK_URL;

  // Fallback for demo/development if no webhook is configured
  if (!webhookUrl) {
    console.warn('VITE_REPORT_WEBHOOK_URL not set. Simulating webhook response.');
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Generate a mock PDF (Blank PDF Base64)
    const mockPdfBase64 = "data:application/pdf;base64,JVBERi0xLjcKCjEgMCBvYmogICUgZW50cnkgcG9pbnQKPDwKICAvVHlwZSAvQ2F0YWxvZwogIC9QYWdlcyAyIDAgUgo+PgplbmRvYmoKCjIgMCBvYmogICUgcGFnZXMKPDwKICAvVHlwZSAvUGFnZXwKICAvTWVkaWFCb3ggWyAwIDAgMjAwIDIwMCBdCiAgL0NvdW50IDEKICAvS2lkcyBbIDMgMCBSIF0KPj4KZW5kb2JqCgozIDAgb2JqICAlIHBhZ2UgMQo8PAogIC9UeXBlIC9QYWdlCiAgL1BhcmVudCAyIDAgUHwKICAvUmVzb3VyY2VzIDw8CiAgICAvRm9udCA8PAogICAgICAvRjEgNCAwIFIKICAgID4+CiAgPj4KICAvQ29udGVudHMgNSAwIFIKPj4KZW5kb2JqCgo0IDAgb2JqICAlIGZvbnQKPDwKICAvVHlwZSAvRm9udAogIC9TdWJ0eXBlIC9UeXBlMQogIC9CYXNlRm9udCAvVGltZXMtUm9tYW4KPj4KZW5kb2JqCgo1IDAgb2JqICAlIHBhZ2UgY29udGVudAo8PAogIC9MZW5ndGggNDQKPj4Kc3RyZWFtCkJUCjcwIDUwIFRECi9GMSAxMiBUZgooSGVsbG8sIHdvcmxkISkgVGoKRVQKZW5kc3RyZWFtCmVuZG9iagoKeHJlZgowIDYKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDEwIDAwMDAwIG4gCjAwMDAwMDAwNjAgMDAwMDAgbiAKMDAwMDAwMDE1NyAwMDAwMCBuIAowMDAwMDAwMjU1IDAwMDAwIG4gCjAwMDAwMDAzNDQgMDAwMDAgbiAKdHJhaWxlcgo8PAogIC9TaXplIDYKICAvUm9vdCAxIDAgUgo+PgpzdGFydHhyZWYKNDQxCiUlRU9FCg==";

    return {
      success: true,
      pdfUrl: mockPdfBase64,
      message: 'Reporte generado (Simulación)'
    };
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`Webhook error: ${response.statusText}`);
    }

    const result = await response.json();
    return {
      success: true,
      pdfUrl: result.pdfUrl || result.url, // Adapt based on actual webhook response structure
      message: 'Reporte generado correctamente'
    };
  } catch (error: any) {
    console.error('Error calling report webhook:', error);
    throw error;
  }
};
