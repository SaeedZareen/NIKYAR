import type { Access, FormSchema, Values } from "@/core/forms/types";

export type WorkItemRow = {
  id: number; name: string; status: string; status_display: string; is_read: boolean; instance_id: number;
  tracking_code: string; instance_title: string; process_title: string; initiator_name: string;
  created_at: string; due_at: string | null; overdue: boolean; completed_at: string | null; completed_by_name: string; outcome: string;
};
export type Outcome = { code: string; title: string; style?: "primary" | "danger" | "default" };
export type TaskDetail = WorkItemRow & {
  schema: FormSchema; access: Access; outcomes: Outcome[]; documentation: string; values: Values; can_act: boolean;
  summary: { key: string; label: string; display: unknown }[];
};
export type InstanceRow = {
  id: number; tracking_code: string; title: string; process_title: string; status: string; status_display: string;
  initiator_name: string; started_at: string; ended_at: string | null; current_tasks: string[];
};
export type InstanceDetail = InstanceRow & {
  version: number; xml: string; active_elements: string[]; completed_elements: string[]; schema: FormSchema; values: Values;
  events: { id: number; kind: string; kind_display: string; message: string; at: string }[];
  work_items: (WorkItemRow & { candidates: string[] })[]; can_cancel: boolean;
};
