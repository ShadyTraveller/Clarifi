import type { ServiceKey } from '@yavamo/core';

export const services = {
  doors: 'Doors', security_film: 'Security film', locksmith: 'Locksmith', skincare: 'Red-light skincare',
} satisfies Record<ServiceKey, string>;
export const serviceKeys = Object.keys(services) as ServiceKey[];
export const roles = ['owner', 'admin', 'dispatcher', 'technician', 'office'] as const;
export type Role = typeof roles[number];
export type Membership = {
  id: string; organization_id: string; user_id: string; role: Role;
  display_name: string | null; organizationName: string;
};
export type DashboardJob = {
  id: string; request: string; status: 'lead' | 'estimate' | 'active' | 'completed';
  service: ServiceKey; scheduled_start: string; scheduled_end: string | null;
  assigned_to: string | null; technician_id: string | null; client_id: string;
  clientName: string; address: string | null;
};
export type DashboardData = { jobs: DashboardJob[]; unassigned: number | null; alerts: number | null; checkedAt: Date };
export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (roles as readonly string[]).includes(value);
}
