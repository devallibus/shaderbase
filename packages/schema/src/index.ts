import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { ZodError, z, type ZodIssue } from "zod";

const nonEmptyStringSchema = z.string().trim().min(1);
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const relativePathSchema = z
  .string()
  .min(1)
  .refine((value) => !/^(?:[A-Za-z]:)?[\\/]/.test(value), "Paths must be relative")
  .refine(
    (value) => !value.split(/[\\/]+/).includes(".."),
    "Paths must stay inside the shader directory",
  );

const shaderNameSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const authorSchema = z.object({
  name: nonEmptyStringSchema,
  github: z.string().regex(/^[a-zA-Z0-9-]+$/).optional(),
  url: z.string().url().optional(),
});

const uniformTypeSchema = z.enum([
  "float",
  "int",
  "bool",
  "vec2",
  "vec3",
  "vec4",
  "mat3",
  "mat4",
  "color",
  "sampler2D",
  "samplerCube",
]);

const uniformDefaultValueSchema = z.union([
  z.number(),
  z.boolean(),
  z.string(),
  z.null(),
  z.array(z.number()),
]);

const vectorLengths: Record<
  "vec2" | "vec3" | "vec4" | "mat3" | "mat4" | "color",
  number
> = {
  color: 3,
  mat3: 9,
  mat4: 16,
  vec2: 2,
  vec3: 3,
  vec4: 4,
};

const uniformSchema = z
  .object({
    name: nonEmptyStringSchema,
    type: uniformTypeSchema,
    defaultValue: uniformDefaultValueSchema,
    description: nonEmptyStringSchema,
    min: z.number().optional(),
    max: z.number().optional(),
  })
  .superRefine((uniform, ctx) => {
    if (typeof uniform.min === "number" && typeof uniform.max === "number" && uniform.min > uniform.max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "min cannot be greater than max",
        path: ["min"],
      });
    }

    switch (uniform.type) {
      case "float":
        if (typeof uniform.defaultValue !== "number") {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "float uniforms require a numeric defaultValue",
            path: ["defaultValue"],
          });
        }
        break;
      case "int":
        if (!Number.isInteger(uniform.defaultValue)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "int uniforms require an integer defaultValue",
            path: ["defaultValue"],
          });
        }
        break;
      case "bool":
        if (typeof uniform.defaultValue !== "boolean") {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "bool uniforms require a boolean defaultValue",
            path: ["defaultValue"],
          });
        }
        break;
      case "sampler2D":
      case "samplerCube":
        if (uniform.defaultValue !== null && typeof uniform.defaultValue !== "string") {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "sampler uniforms require a string path or null defaultValue",
            path: ["defaultValue"],
          });
        }
        break;
      default: {
        const expectedLength = vectorLengths[uniform.type];

        if (
          !Array.isArray(uniform.defaultValue) ||
          uniform.defaultValue.length !== expectedLength ||
          uniform.defaultValue.some((value) => typeof value !== "number")
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${uniform.type} uniforms require ${expectedLength} numeric entries in defaultValue`,
            path: ["defaultValue"],
          });
        }
      }
    }
  });

const inputKindSchema = z.enum([
  "uv",
  "position",
  "normal",
  "time",
  "resolution",
  "texture",
  "mouse",
]);

const outputKindSchema = z.enum([
  "color",
  "alpha",
  "emissive",
  "position-offset",
  "normal-perturbation",
]);

const inputSchema = z.object({
  name: nonEmptyStringSchema,
  kind: inputKindSchema,
  description: nonEmptyStringSchema,
  required: z.boolean().default(true),
});

const outputSchema = z.object({
  name: nonEmptyStringSchema,
  kind: outputKindSchema,
  description: nonEmptyStringSchema,
});

const capabilityRequirementSchema = z.enum([
  "uv",
  "time",
  "resolution",
  "mouse",
  "normals",
  "world-position",
  "input-texture",
  "camera",
  "screen-space",
]);

const capabilityProfileSchema = z.object({
  pipeline: z.enum(["surface", "postprocessing", "geometry", "utility"]),
  stage: z.enum(["fragment", "vertex", "vertex-and-fragment", "fullscreen-pass"]),
  requires: z.array(capabilityRequirementSchema).default([]),
  outputs: z.array(outputKindSchema).min(1),
});

const compatibilitySchema = z.object({
  three: nonEmptyStringSchema,
  renderers: z.array(z.enum(["webgl1", "webgl2", "webgpu"])).min(1),
  material: z.enum([
    "shader-material",
    "raw-shader-material",
    "post-processing-pass",
    "custom",
  ]),
  environments: z.array(z.enum(["three", "react-three-fiber"])).min(1),
});

const fileReferencesSchema = z.object({
  vertex: relativePathSchema,
  fragment: relativePathSchema,
  includes: z.array(relativePathSchema).default([]),
});

const recipePlaceholderSchema = z.object({
  name: nonEmptyStringSchema,
  kind: z.enum(["uniform", "color", "number", "texture", "mesh", "time-source"]),
  description: nonEmptyStringSchema,
  required: z.boolean().default(true),
  example: nonEmptyStringSchema.optional(),
});

const recipeRequirementSchema = z.enum([
  "three-scene",
  "mesh",
  "animation-loop",
  "canvas",
  "texture-input",
  "effect-composer",
]);

const recipeTargetSchema = z.enum(["three", "r3f"]);
const previewFormatSchema = z.enum(["png", "jpg", "jpeg", "webp", "svg"]);

const recipeSchema = z.object({
  target: recipeTargetSchema,
  path: relativePathSchema,
  exportName: nonEmptyStringSchema,
  summary: nonEmptyStringSchema,
  placeholders: z.array(recipePlaceholderSchema).default([]),
  requirements: z.array(recipeRequirementSchema).default([]),
});

const previewSchema = z
  .object({
    path: relativePathSchema,
    format: previewFormatSchema,
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    deterministic: z.boolean().default(true),
  })
  .superRefine((preview, ctx) => {
    const extension = extname(preview.path).replace(".", "").toLowerCase();

    if (extension.length > 0 && extension !== preview.format) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `preview path extension "${extension}" does not match format "${preview.format}"`,
        path: ["path"],
      });
      }
    });

const provenanceSourceSchema = z
  .object({
    name: nonEmptyStringSchema,
    kind: z.enum(["file", "repository", "demo", "article", "algorithm"]),
    url: z.string().url(),
    repositoryUrl: z.string().url().optional(),
    revision: nonEmptyStringSchema.optional(),
    retrievedAt: isoDateSchema,
    license: nonEmptyStringSchema,
    authors: z.array(nonEmptyStringSchema).min(1),
    copyrightNotice: nonEmptyStringSchema.optional(),
    notes: nonEmptyStringSchema.optional(),
  })
  .superRefine((source, ctx) => {
    if (source.kind === "file" && !source.repositoryUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "repositoryUrl is required for file sources",
        path: ["repositoryUrl"],
      });
    }
  });

const attributionSchema = z.object({
  summary: nonEmptyStringSchema,
  requiredNotice: nonEmptyStringSchema.optional(),
});

const provenanceSchema = z
  .object({
    sourceKind: z.enum(["original", "adapted", "ported"]),
    sources: z.array(provenanceSourceSchema).default([]),
    attribution: attributionSchema,
    notes: nonEmptyStringSchema.optional(),
  })
  .superRefine((provenance, ctx) => {
    if (provenance.sourceKind !== "original" && provenance.sources.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "adapted or ported shaders must include at least one source reference",
        path: ["sources"],
      });
    }

    if (provenance.sourceKind !== "original" && !provenance.attribution.requiredNotice) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "adapted or ported shaders must include a requiredNotice for downstream attribution",
        path: ["attribution", "requiredNotice"],
      });
    }

    const seenUrls = new Set<string>();

    provenance.sources.forEach((source, index) => {
      if (seenUrls.has(source.url)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate provenance source "${source.url}"`,
          path: ["sources", index, "url"],
        });
      }

      seenUrls.add(source.url);

      if (provenance.sourceKind !== "original" && !source.revision) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "adapted or ported shaders must record an upstream revision or snapshot marker",
          path: ["sources", index, "revision"],
        });
      }
    });
  });

export const shaderManifestSchema = z
  .object({
    schemaVersion: z.literal("0.1.0"),
    name: shaderNameSchema,
    displayName: nonEmptyStringSchema,
    version: nonEmptyStringSchema,
    summary: nonEmptyStringSchema,
    description: nonEmptyStringSchema,
    author: authorSchema,
    license: nonEmptyStringSchema,
    tags: z.array(nonEmptyStringSchema).min(1),
    category: nonEmptyStringSchema,
    capabilityProfile: capabilityProfileSchema,
    compatibility: compatibilitySchema,
    uniforms: z.array(uniformSchema),
    inputs: z.array(inputSchema).default([]),
    outputs: z.array(outputSchema).min(1),
    files: fileReferencesSchema,
    recipes: z.array(recipeSchema).min(1),
    preview: previewSchema,
    provenance: provenanceSchema,
  })
  .superRefine((manifest, ctx) => {
    const recipeTargets = new Set<string>();

    manifest.recipes.forEach((recipe, index) => {
      if (recipeTargets.has(recipe.target)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate recipe target "${recipe.target}"`,
          path: ["recipes", index, "target"],
        });
      }

      recipeTargets.add(recipe.target);

      if (recipe.target === "three" && !manifest.compatibility.environments.includes("three")) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "compatibility.environments must include \"three\" when a Three.js recipe exists",
          path: ["compatibility", "environments"],
        });
      }

      if (recipe.target === "r3f" && !manifest.compatibility.environments.includes("react-three-fiber")) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "compatibility.environments must include \"react-three-fiber\" when an R3F recipe exists",
          path: ["compatibility", "environments"],
        });
      }
    });
  });

export type ShaderManifest = z.infer<typeof shaderManifestSchema>;
export type Uniform = z.infer<typeof uniformSchema>;
export type RecipeReference = z.infer<typeof recipeSchema>;

export function parseShaderManifest(input: unknown): ShaderManifest {
  return shaderManifestSchema.parse(input);
}

export function readShaderManifestFile(filePath: string): ShaderManifest {
  const raw = readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw) as unknown;

  return parseShaderManifest(parsed);
}

function makeMissingFileIssue(path: Array<string | number>, referencedPath: string): ZodIssue {
  return {
    code: z.ZodIssueCode.custom,
    message: `Referenced file does not exist: ${referencedPath}`,
    path,
  };
}

export function collectReferencedFiles(manifest: ShaderManifest) {
  return [
    { path: manifest.files.vertex, zodPath: ["files", "vertex"] as Array<string | number> },
    { path: manifest.files.fragment, zodPath: ["files", "fragment"] as Array<string | number> },
    ...manifest.files.includes.map((path, index) => ({
      path,
      zodPath: ["files", "includes", index] as Array<string | number>,
    })),
    { path: manifest.preview.path, zodPath: ["preview", "path"] as Array<string | number> },
    ...manifest.recipes.map((recipe, index) => ({
      path: recipe.path,
      zodPath: ["recipes", index, "path"] as Array<string | number>,
    })),
  ];
}

export function validateShaderManifestFile(filePath: string): ShaderManifest {
  const manifest = readShaderManifestFile(filePath);
  const shaderDirectory = dirname(filePath);
  const missingFiles = collectReferencedFiles(manifest)
    .filter((entry) => !existsSync(resolve(shaderDirectory, entry.path)))
    .map((entry) => makeMissingFileIssue(entry.zodPath, entry.path));

  if (missingFiles.length > 0) {
    throw new ZodError(missingFiles);
  }

  return manifest;
}
