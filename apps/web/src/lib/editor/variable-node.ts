import type { TemplateVariableContext } from '@/services/medical-records';

const VARIABLE_REGEX = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
const VARIABLE_REGEX_TEST = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/;

function replaceInString(value: string, context: TemplateVariableContext): string {
  return value.replace(VARIABLE_REGEX, (_match, key: string) => {
    const resolved = context[key];
    return typeof resolved === 'string' ? resolved : '';
  });
}

function replaceInUnknown(value: unknown, context: TemplateVariableContext): unknown {
  if (typeof value === 'string') {
    return replaceInString(value, context);
  }

  if (Array.isArray(value)) {
    return value.map((item) => replaceInUnknown(item, context));
  }

  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      output[key] = replaceInUnknown(nested, context);
    }
    return output;
  }

  return value;
}

export function resolveTemplateVariables(content: unknown, context: TemplateVariableContext): unknown {
  return replaceInUnknown(content, context);
}

export function hasTemplateVariables(content: unknown): boolean {
  if (typeof content === 'string') {
    return VARIABLE_REGEX_TEST.test(content);
  }

  if (Array.isArray(content)) {
    return content.some((item) => hasTemplateVariables(item));
  }

  if (content && typeof content === 'object') {
    return Object.values(content as Record<string, unknown>).some((value) => hasTemplateVariables(value));
  }

  return false;
}

export function createTemplateVariableContext(
  base: TemplateVariableContext,
  options?: { locale?: string }
): TemplateVariableContext {
  const locale = options?.locale?.trim() || undefined;

  return {
    date: new Date().toLocaleDateString(locale),
    ...base,
  };
}
