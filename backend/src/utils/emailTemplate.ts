/// Extraído de alertas.service.ts (era privado ali) pra poder ser reaproveitado
/// por outros módulos sem criar import circular (alertas.service.ts importa de
/// diagnostico.service.ts, então um alerta que vive dentro do módulo
/// diagnostico não pode importar de alertas.service.ts de volta).
export function emailTemplate(titulo: string, cor: string, conteudo: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#040507;font-family:'Segoe UI',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#040507;padding:32px 16px">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#0b0d12;border:1px solid #1e2330;border-radius:12px;overflow:hidden">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#0b0d12,${cor});padding:22px 32px;border-bottom:1px solid #1e2330">
            <p style="margin:0;font-size:11px;color:#00f0ff;letter-spacing:.12em;text-transform:uppercase;font-weight:700">Canaã Performance</p>
            <h1 style="margin:6px 0 0;color:#f0f3ff;font-size:19px;font-weight:700">${titulo}</h1>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:28px 32px;color:#8a99b8;font-size:14px;line-height:1.65">
            ${conteudo}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:16px 32px;background:#0b0d12;border-top:1px solid #1e2330">
            <p style="margin:0;font-size:11px;color:#707c98">
              Email automático gerado pelo sistema Canaã Performance.<br>
              Data/hora: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
