import { z } from 'zod';

/** What kind of control a field is, independent of what it asks. */
export const CONTROL_KINDS = [
  'text',
  'email',
  'tel',
  'url',
  'number',
  'date',
  'textarea',
  'select',
  'combobox',
  'radioGroup',
  'checkbox',
  'checkboxGroup',
  'file',
  'other',
] as const;
export const controlKindSchema = z.enum(CONTROL_KINDS);
export type ControlKind = z.infer<typeof controlKindSchema>;

/**
 * A DOM-free description of one field on an Application Form, as extract/
 * produces it (research §6 step 2). It holds only what the page shows: never
 * the field's current value and never anything from the Profile.
 */
export const fieldDescriptorSchema = z.strictObject({
  /** Stable for the life of one Fill; unique within the form. */
  fieldId: z.string().min(1).max(200),
  label: z.string().max(2000),
  control: controlKindSchema,
  options: z.array(z.string().max(500)).max(1000),
  required: z.boolean(),
  section: z.string().max(500).optional(),
  description: z.string().max(4000).optional(),
  maxLength: z.int().positive().optional(),
});
export type FieldDescriptor = z.infer<typeof fieldDescriptorSchema>;
