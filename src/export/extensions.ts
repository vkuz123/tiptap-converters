import { Node, mergeAttributes } from "@tiptap/core";

export const ComponentRefSchema = Node.create({
  name: "componentRef",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      componentId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-component-id"),
        renderHTML: (attributes) => ({
          "data-component-id": attributes.componentId,
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="component-ref"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "component-ref" }),
    ];
  },
});

export const InlineComponentRefSchema = Node.create({
  name: "inlineComponentRef",
  group: "inline",
  inline: true,
  atom: true,

  addAttributes() {
    return {
      componentId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-component-id"),
        renderHTML: (attributes) => ({
          "data-component-id": attributes.componentId,
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="inline-component-ref"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { "data-type": "inline-component-ref" }),
    ];
  },
});

export const TopicLinkSchema = Node.create({
  name: "topicLink",
  group: "inline",
  inline: true,
  atom: true,

  addAttributes() {
    return {
      topicId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-topic-id"),
        renderHTML: (attributes) => ({
          "data-topic-id": attributes.topicId,
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="topic-link"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { "data-type": "topic-link" }),
    ];
  },
});

export const ConditionalBlockSchema = Node.create({
  name: "conditionalBlock",
  group: "block",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      dimensionId: { default: null },
      dimensionName: { default: "" },
      valueIds: { default: [] },
      valueLabels: { default: [] },
      color: { default: "#6366f1" },
      logic: { default: "include" },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="conditional-block"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "conditional-block" }),
      0,
    ];
  },
});

export const VariableTokenSchema = Node.create({
  name: "variableToken",
  group: "inline",
  inline: true,
  atom: true,

  addAttributes() {
    return {
      key: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-variable-key"),
        renderHTML: (attributes) => ({
          "data-variable-key": attributes.key,
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="variable-token"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { "data-type": "variable-token" }),
    ];
  },
});

const CALLOUT_VARIANT_STYLES: Record<string, string> = {
  info: "background:#eff6ff;border-left:4px solid #3b82f6;padding:1rem;border-radius:0.5rem;margin:0.5rem 0;",
  warning: "background:#fefce8;border-left:4px solid #eab308;padding:1rem;border-radius:0.5rem;margin:0.5rem 0;",
  danger: "background:#fef2f2;border-left:4px solid #ef4444;padding:1rem;border-radius:0.5rem;margin:0.5rem 0;",
  success: "background:#f0fdf4;border-left:4px solid #22c55e;padding:1rem;border-radius:0.5rem;margin:0.5rem 0;",
};

export const CalloutSchema = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      variant: {
        default: "info",
        parseHTML: (element) => element.getAttribute("data-callout") || "info",
        renderHTML: (attributes) => ({
          "data-callout": attributes.variant,
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-callout]" }];
  },

  renderHTML({ HTMLAttributes }) {
    const variant = (HTMLAttributes["data-callout"] as string) || "info";
    const style = CALLOUT_VARIANT_STYLES[variant] || CALLOUT_VARIANT_STYLES.info;
    return [
      "div",
      mergeAttributes(HTMLAttributes, { class: "callout", style }),
      0,
    ];
  },
});

export const DefinitionListSchema = Node.create({
  name: "definitionList",
  group: "block",
  content: "definitionItem+",
  defining: true,

  parseHTML() {
    return [{ tag: "dl" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["dl", mergeAttributes(HTMLAttributes), 0];
  },
});

export const DefinitionItemSchema = Node.create({
  name: "definitionItem",
  content: "definitionTerm definitionDescription",

  parseHTML() {
    return [{ tag: 'div[data-type="definition-item"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "definition-item" }),
      0,
    ];
  },
});

export const DefinitionTermSchema = Node.create({
  name: "definitionTerm",
  content: "inline*",

  parseHTML() {
    return [{ tag: "dt" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["dt", mergeAttributes(HTMLAttributes), 0];
  },
});

export const DefinitionDescriptionSchema = Node.create({
  name: "definitionDescription",
  content: "block+",

  parseHTML() {
    return [{ tag: "dd" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["dd", mergeAttributes(HTMLAttributes), 0];
  },
});

export const CodeGroupSchema = Node.create({
  name: "codeGroup",
  group: "block",
  content: "codeBlock+",
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-type="code-group"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "code-group",
        class: "code-group",
      }),
      0,
    ];
  },
});
