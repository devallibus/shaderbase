import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared lightweight types
// ---------------------------------------------------------------------------

export const registryUniformSummarySchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
});

export type RegistryUniformSummary = z.infer<typeof registryUniformSummarySchema>;

// ---------------------------------------------------------------------------
// Index entry — searchable metadata per shader (used in the registry index)
// ---------------------------------------------------------------------------

export const registryIndexEntrySchema = z.object({
  name: z.string().min(1),
  displayName: z.string().min(1),
  version: z.string().min(1),
  summary: z.string().min(1),
  tags: z.array(z.string().min(1)).min(1),
  category: z.string().min(1),
  pipeline: z.string().min(1),
  stage: z.string().min(1),
  environments: z.array(z.string().min(1)).min(1),
  renderers: z.array(z.string().min(1)).min(1),
  sourceKind: z.string().min(1),
  uniforms: z.array(registryUniformSummarySchema),
  language: z.string().min(1),
});

export type RegistryIndexEntry = z.infer<typeof registryIndexEntrySchema>;

// ---------------------------------------------------------------------------
// Registry index — the top-level manifest listing all shaders
// ---------------------------------------------------------------------------

export const registryIndexSchema = z.object({
  version: z.literal("0.2.0"),
  generatedAt: z.string().min(1),
  shaders: z.array(registryIndexEntrySchema),
});

export type RegistryIndex = z.infer<typeof registryIndexSchema>;

// ---------------------------------------------------------------------------
// Full uniform (used in shader bundle, extends summary with more detail)
// ---------------------------------------------------------------------------

export const registryUniformFullSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  defaultValue: z.union([z.number(), z.boolean(), z.string(), z.null(), z.array(z.number())]),
  description: z.string().min(1),
  min: z.number().optional(),
  max: z.number().optional(),
});

export type RegistryUniformFull = z.infer<typeof registryUniformFullSchema>;

// ---------------------------------------------------------------------------
// Recipe bundle — recipe with inlined source code
// ---------------------------------------------------------------------------

export const registryRecipePlaceholderSchema = z.object({
  name: z.string().min(1),
  kind: z.string().min(1),
  description: z.string().min(1),
  required: z.boolean(),
  example: z.string().min(1).optional(),
});

export type RegistryRecipePlaceholder = z.infer<typeof registryRecipePlaceholderSchema>;

export const registryRecipeBundleSchema = z.object({
  exportName: z.string().min(1),
  summary: z.string().min(1),
  code: z.string().min(1),
  placeholders: z.array(registryRecipePlaceholderSchema),
  requirements: z.array(z.string().min(1)),
  relPath: z.string().min(1).optional(),
});

export type RegistryRecipeBundle = z.infer<typeof registryRecipeBundleSchema>;

// ---------------------------------------------------------------------------
// Input / Output schemas for the bundle
// ---------------------------------------------------------------------------

export const registryInputSchema = z.object({
  name: z.string().min(1),
  kind: z.string().min(1),
  description: z.string().min(1),
  required: z.boolean(),
});

export type RegistryInput = z.infer<typeof registryInputSchema>;

export const registryOutputSchema = z.object({
  name: z.string().min(1),
  kind: z.string().min(1),
  description: z.string().min(1),
});

export type RegistryOutput = z.infer<typeof registryOutputSchema>;

// ---------------------------------------------------------------------------
// Provenance (lightweight version for the bundle)
// ---------------------------------------------------------------------------

export const registryProvenanceSourceSchema = z.object({
  name: z.string().min(1),
  kind: z.string().min(1).optional(),
  url: z.string().url(),
  repositoryUrl: z.string().url().optional(),
  revision: z.string().min(1).optional(),
  retrievedAt: z.string().min(1).optional(),
  license: z.string().min(1),
  authors: z.array(z.string().min(1)).min(1),
  copyrightNotice: z.string().min(1).optional(),
  notes: z.string().min(1).optional(),
});

export type RegistryProvenanceSource = z.infer<typeof registryProvenanceSourceSchema>;

export const registryProvenanceSchema = z.object({
  sourceKind: z.string().min(1),
  sources: z.array(registryProvenanceSourceSchema),
  attribution: z.object({
    summary: z.string().min(1),
    requiredNotice: z.string().min(1).optional(),
  }),
  notes: z.string().min(1).optional(),
});

export type RegistryProvenance = z.infer<typeof registryProvenanceSchema>;

// ---------------------------------------------------------------------------
// Capability profile (for the bundle)
// ---------------------------------------------------------------------------

export const registryCapabilityProfileSchema = z.object({
  pipeline: z.string().min(1),
  stage: z.string().min(1),
  requires: z.array(z.string().min(1)),
  outputs: z.array(z.string().min(1)).min(1),
});

export type RegistryCapabilityProfile = z.infer<typeof registryCapabilityProfileSchema>;

// ---------------------------------------------------------------------------
// Compatibility (for the bundle)
// ---------------------------------------------------------------------------

export const registryCompatibilitySchema = z.object({
  three: z.string().min(1),
  renderers: z.array(z.string().min(1)).min(1),
  material: z.string().min(1),
  environments: z.array(z.string().min(1)).min(1),
});

export type RegistryCompatibility = z.infer<typeof registryCompatibilitySchema>;

// ---------------------------------------------------------------------------
// Shader bundle — full detail for a single shader (served by MCP / CLI add)
// ---------------------------------------------------------------------------

// Base fields shared by all bundles
const registryShaderBundleBaseFields = {
  name: z.string().min(1),
  displayName: z.string().min(1),
  version: z.string().min(1),
  summary: z.string().min(1),
  tags: z.array(z.string().min(1)).min(1),
  category: z.string().min(1),
  pipeline: z.string().min(1),
  stage: z.string().min(1),
  environments: z.array(z.string().min(1)).min(1),
  renderers: z.array(z.string().min(1)).min(1),
  sourceKind: z.string().min(1),
  uniforms: z.array(registryUniformSummarySchema),
  language: z.string().min(1),

  // Extended fields
  description: z.string().min(1),
  author: z.object({
    name: z.string().min(1),
    github: z.string().optional(),
    url: z.string().optional(),
  }),
  license: z.string().min(1),
  compatibility: registryCompatibilitySchema,
  capabilityProfile: registryCapabilityProfileSchema,
  uniformsFull: z.array(registryUniformFullSchema),
  inputs: z.array(registryInputSchema),
  outputs: z.array(registryOutputSchema),
  recipes: z.record(z.string(), registryRecipeBundleSchema),
  provenance: registryProvenanceSchema,
};

const registryGlslBundleSchema = z.object({
  ...registryShaderBundleBaseFields,
  language: z.literal("glsl"),
  vertexSource: z.string().min(1),
  fragmentSource: z.string().min(1),
});

const registryTslBundleSchema = z.object({
  ...registryShaderBundleBaseFields,
  language: z.literal("tsl"),
  tslSource: z.string().min(1),
});

export const registryShaderBundleSchema = z.discriminatedUnion("language", [
  registryGlslBundleSchema,
  registryTslBundleSchema,
]);

export type RegistryGlslBundle = z.infer<typeof registryGlslBundleSchema>;
export type RegistryTslBundle = z.infer<typeof registryTslBundleSchema>;
export type RegistryShaderBundle = z.infer<typeof registryShaderBundleSchema>;
