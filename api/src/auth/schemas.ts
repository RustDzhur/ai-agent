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
