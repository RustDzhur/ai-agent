import { z } from 'zod';

const email = z.string().trim().email().max(254).transform((value) => value.toLowerCase());
const personName = z.string().trim().min(1).max(120);
const organizationName = z.string().trim().min(2).max(160);

export const registerSchema = z.object({
  fullName: personName,
  email,
  password: z.string().min(12).max(128),
  organizationName,
}).strict();

export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(128),
}).strict();

export const createOrganizationSchema = z.object({
  name: organizationName,
}).strict();

export const selectOrganizationSchema = z.object({
  organizationId: z.string().uuid(),
}).strict();

export const updateOrganizationSchema = z.object({
  name: organizationName,
}).strict();

export const openAiCredentialSchema = z.object({
  apiKey: z.string().trim().min(20).max(512).regex(/^sk-[A-Za-z0-9_-]+$/),
}).strict();

export const assistantRunSchema = z.object({
  prompt: z.string().trim().min(1).max(6_000),
}).strict();

export const tenantAgentStatusSchema = z.object({
  status: z.enum(['active', 'paused']),
}).strict();

const workflowId = z.string().regex(/^[a-z0-9-]{1,48}$/);
const workflowTriggerNode = z.object({ id: workflowId, type: z.literal('trigger'), label: z.string().trim().min(2).max(80) }).strict();
const workflowAgentNode = z.object({
  id: workflowId,
  type: z.literal('agent'),
  label: z.string().trim().min(2).max(80),
  agentSlug: workflowId,
}).strict();
const workflowApprovalNode = z.object({ id: workflowId, type: z.literal('approval'), label: z.string().trim().min(2).max(80) }).strict();

export const workflowSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(600).default(''),
  nodes: z.array(z.discriminatedUnion('type', [workflowTriggerNode, workflowAgentNode, workflowApprovalNode])).min(2).max(12),
}).strict().superRefine((workflow, context) => {
  if (workflow.nodes[0]?.type !== 'trigger') context.addIssue({ code: 'custom', message: 'A workflow must start with a trigger', path: ['nodes', 0] });
  if (!workflow.nodes.some((node) => node.type === 'agent')) context.addIssue({ code: 'custom', message: 'A workflow must contain an agent step', path: ['nodes'] });
  if (new Set(workflow.nodes.map((node) => node.id)).size !== workflow.nodes.length) context.addIssue({ code: 'custom', message: 'Workflow node IDs must be unique', path: ['nodes'] });
});

export const workflowStatusSchema = z.object({ status: z.enum(['draft', 'active', 'paused']) }).strict();
