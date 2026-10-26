import { z } from 'zod'

import {
  AGENCIES,
  APPLICATION_STAGES,
  EARLY_WARNING_TYPES,
  INCIDENT_STAGES,
  INCIDENT_TYPES,
  PROFESSIONAL_BACKGROUNDS,
  type ApplicationStatus,
} from '@/lib/fixtures'
import { STATES } from '@/lib/nigeria'
import { ageFromDateOfBirth, validNigerianPhone } from './security.server'

const stateNames = new Set(STATES.map((state) => state.name))

const dateOfBirth = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date of birth.')
  .refine((value) => ageFromDateOfBirth(value) >= 18, 'YEGO volunteers must be at least 18 years old.')

const phone = z.string().refine(validNigerianPhone, 'Enter a valid Nigerian mobile number.')

export const applicationInput = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(3, 'Enter your full name.')
      .max(120)
      .refine((value) => value.split(/\s+/).length >= 2, 'Enter your first and last name.'),
    gender: z.enum(['Female', 'Male']),
    dateOfBirth,
    phone,
    whatsapp: phone,
    nin: z.string().regex(/^\d{11}$/, 'NIN must be exactly 11 digits.'),
    email: z.string().trim().email('Enter a valid email address.'),
    stateOfOrigin: z.string().refine((value) => stateNames.has(value), 'Select a valid state of origin.'),
    stateOfResidence: z.string().refine((value) => stateNames.has(value), 'Select a valid state of residence.'),
    lga: z.string().min(2).max(120),
    ward: z.string().trim().min(2, 'Enter your ward or registration area.').max(160),
    pollingUnit: z.string().trim().max(300).optional(),
    background: z.string().refine((value) => PROFESSIONAL_BACKGROUNDS.includes(value), 'Select your background.'),
    experience: z.string().trim().max(2000).optional().default(''),
    photo: z
      .string()
      .min(100)
      .max(2_500_000, 'The photograph is too large. Please choose a smaller image.')
      .refine((value) => value.startsWith('data:image/'), 'Upload a valid photograph.'),
    nonPartisan: z.literal(true),
    codeOfConduct: z.literal(true),
    dataConsent: z.literal(true),
  })
  .superRefine((value, ctx) => {
    const state = STATES.find((item) => item.name === value.stateOfResidence)
    if (!state || !state.lgas.includes(value.lga)) {
      ctx.addIssue({ code: 'custom', path: ['lga'], message: 'Select an LGA in your state of residence.' })
    }
  })

export type ApplicationInput = z.infer<typeof applicationInput>

export const lookupInput = z.object({
  applicationId: z.string().trim().min(4).max(40),
  phone,
})

export const confirmWhatsAppInput = z.object({
  applicationId: z.string().trim().min(4).max(40),
  phone,
})

export const verifyEmailInput = z.object({
  token: z.string().trim().min(20).max(120),
})

export const loginCommandInput = z.object({
  email: z.string().trim().email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.').max(200),
})

export const loginGuardInput = z.object({
  applicationId: z.string().trim().min(4).max(40),
  phone,
})

const evidenceInput = z.object({
  kind: z.enum(['photo', 'video', 'document']),
  name: z.string().trim().min(1).max(200),
})

export const incidentInput = z.object({
  type: z.string().refine((value) => (INCIDENT_TYPES as readonly string[]).includes(value), 'Select an incident type.'),
  description: z.string().trim().min(3, 'Describe what happened.').max(4000),
  severity: z.enum(['Low', 'Medium', 'High', 'Critical']),
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
  occurredAt: z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'Enter a valid time.'),
  evidence: z.array(evidenceInput).max(6).default([]),
  electionDay: z.boolean().default(true),
})

export const incidentStatusInput = z.object({
  incidentId: z.string().trim().min(4).max(40),
  status: z.enum(INCIDENT_STAGES),
  note: z.string().trim().max(2000).optional(),
  category: z.string().trim().max(120).optional(),
})

export const incidentNoteInput = z.object({
  incidentId: z.string().trim().min(4).max(40),
  action: z.string().trim().min(2).max(120),
  note: z.string().trim().min(2).max(2000),
})

export const referralInput = z.object({
  incidentId: z.string().trim().min(4).max(40),
  agencies: z
    .array(z.string().refine((code) => AGENCIES.some((agency) => agency.code === code), 'Unknown agency.'))
    .min(1, 'Choose at least one agency.')
    .max(AGENCIES.length),
  note: z.string().trim().max(2000).optional(),
})

export const applicationStatusInput = z.object({
  applicationId: z.string().trim().min(4).max(40),
  status: z.enum([...APPLICATION_STAGES, 'Not Approved'] as [ApplicationStatus, ...ApplicationStatus[]]),
  note: z.string().trim().max(2000).optional(),
})

export const assignPollingUnitInput = z.object({
  applicationId: z.string().trim().min(4).max(40),
  ward: z.string().trim().min(2).max(160),
  pollingUnit: z.string().trim().min(2).max(200),
})

export const trainingQuizInput = z.object({
  moduleId: z.string().trim().min(1).max(40),
  answers: z.array(z.number().int().min(0).max(20)).min(1).max(20),
})

export const warningInput = z.object({
  type: z.string().refine((value) => (EARLY_WARNING_TYPES as readonly string[]).includes(value), 'Select a risk type.'),
  title: z.string().trim().min(4, 'Add a headline.').max(160),
  summary: z.string().trim().min(10, 'Add a short description.').max(2000),
  evidenceCount: z.number().int().min(0).max(20).default(0),
})

export const announcementInput = z.object({
  kind: z.enum(['Announcement', 'Operational instruction', 'Alert', 'Training', 'Emergency']),
  title: z.string().trim().min(4).max(160),
  body: z.string().trim().min(4).max(4000),
  audience: z.string().trim().min(2).max(120).optional(),
})

export const notificationsReadInput = z.object({
  ids: z.array(z.string().uuid()).max(100),
})

export const checkInInput = z.object({
  lat: z.number().finite().optional(),
  lng: z.number().finite().optional(),
})


/** Validate untrusted input and surface a human-readable error. */
export function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input)
  if (!result.success) {
    const message = result.error.issues
      .map((issue) => {
        const field = issue.path.length ? `${issue.path.join('.')}: ` : ''
        return `${field}${issue.message}`
      })
      .join(' ')
    throw new Error(message || 'Invalid input.')
  }
  return result.data
}

export const pollingUnitsQuery = z.object({
  state: z.string().refine((value) => stateNames.has(value), 'Select a valid state.'),
  lga: z.string().trim().min(2).max(120),
  ward: z.string().trim().min(2).max(160),
})

export const commandIncidentInput = z.object({
  state: z.string().refine((value) => stateNames.has(value), 'Select a valid state.'),
  lga: z.string().trim().min(2).max(120),
  ward: z.string().trim().min(2).max(160),
  pollingUnit: z.string().trim().max(300).optional(),
  type: z.string().refine((value) => (INCIDENT_TYPES as readonly string[]).includes(value), 'Select an incident type.'),
  severity: z.enum(['Low', 'Medium', 'High', 'Critical']),
  description: z.string().trim().min(3, 'Describe what happened.').max(4000),
  occurredAt: z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'Enter a valid time.'),
  electionDay: z.boolean().default(false),
})

export const messageApplicantInput = z.object({
  applicationId: z.string().trim().min(4).max(40),
  title: z.string().trim().min(3).max(160).optional(),
  body: z.string().trim().min(4, 'Write a message.').max(2000),
})

export const trainingProgressInput = z.object({
  applicationId: z.string().trim().min(4).max(40),
  progress: z.number().int().min(0).max(100),
  note: z.string().trim().max(2000).optional(),
})

export const warningLevelInput = z.object({
  warningId: z.string().trim().min(4).max(40),
  level: z.enum(['Watch', 'Alert', 'Urgent']),
  note: z.string().trim().max(2000).optional(),
})

export const warningResolveInput = z.object({
  warningId: z.string().trim().min(4).max(40),
  note: z.string().trim().max(2000).optional(),
})

export const warningPublishInput = z.object({
  warningId: z.string().trim().min(4).max(40),
  access: z.enum(['Command only', 'State coordinators', 'All Guards in area']),
})

export const createCommandUserInput = z.object({
  email: z.string().trim().email('Enter a valid email address.').max(200),
  name: z.string().trim().min(3, 'Enter the full name.').max(120),
  role: z.enum([
    'Super Administrator',
    'National YEGO Administrator',
    'Regional Coordinator',
    'State Coordinator',
    'LGA Coordinator',
    'Verification Officer',
    'Training Officer',
  ]),
  scopeZone: z.string().trim().max(60).optional(),
  scopeState: z.string().trim().max(60).optional(),
  scopeLga: z.string().trim().max(120).optional(),
  password: z.string().min(10, 'Use a password of at least 10 characters.').max(200).optional(),
})

export const setUserActiveInput = z.object({
  userId: z.string().uuid(),
  active: z.boolean(),
})

export const setUserRoleInput = z.object({
  userId: z.string().uuid(),
  role: z.enum([
    'Super Administrator',
    'National YEGO Administrator',
    'Regional Coordinator',
    'State Coordinator',
    'LGA Coordinator',
    'Verification Officer',
    'Training Officer',
  ]),
  scopeZone: z.string().trim().max(60).optional(),
  scopeState: z.string().trim().max(60).optional(),
  scopeLga: z.string().trim().max(120).optional(),
})
