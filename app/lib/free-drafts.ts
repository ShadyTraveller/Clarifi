import { squareFeet, type ClientInfo, type Service } from './domain';

/** Deterministic drafts: only explicitly labelled contact information is extracted. */
export function freeRequest(text: string, service: Service) {
  const field = (...labels: string[]) => {
    for (const label of labels) {
      const match = text.match(new RegExp(`^\\s*${label}\\s*:\\s*(.+)$`, 'im'));
      if (match) return match[1].trim();
    }
    return '';
  };
  const roleText = field('role', 'property role').toLowerCase().replaceAll(' ', '_');
  const role: ClientInfo['role'] = ['owner', 'tenant', 'property_management', 'commercial'].includes(roleText) ? roleText as ClientInfo['role'] : 'other';
  return {
    client: { name: field('name', 'client', 'client name'), role, phone: field('phone', 'telephone'), email: field('email'), address: field('address') },
    title: field('title', 'job') || `${service} service request`,
    details: `${text.trim()}\n\n### Confirm before dispatch\nConfirm contact details, site access, scope and measurements with the client.`,
  };
}

export function freeEstimate(text: string, service: Service, template: { name?: string; description?: string }, width: number, height: number, count: number) {
  const area = squareFeet(width, height, count);
  const measured = area > 0 && ['Windows', 'Security Film'].includes(service);
  return {
    scope: `# ${template.name || `${service} Service Call`}\n\n${template.description || 'Service call and supplies as confirmed.'}\n\n## Technician notes\n${text.trim() || 'Confirm scope with the technician.'}\n\n## Measurements\n${area > 0 ? `${width} × ${height} inches × ${count} ÷ 144 = ${area.toFixed(2)} sq ft.` : 'Dimensions must be confirmed before ordering.'}\n\n## Confirm before approval\nConfirm materials, labour, access, disposal and exclusions.`,
    template_name: template.name || `${service} Service Call`,
    lines: [
      { name: 'Installation / service labour', quantity: 1, unit: 'hour', cost: null, price: null },
      { name: 'Supplies', quantity: measured ? area : 1, unit: measured ? 'sq ft' : 'each', cost: null, price: null },
    ],
    products: [],
    notes: 'Free rules draft. Confirm supplier options and enter prices manually. Photos have not been assessed.',
  };
}
