import { Accordion, Accordions } from "fumadocs-ui/components/accordion";
import { Callout } from "fumadocs-ui/components/callout";
import { Card, Cards } from "fumadocs-ui/components/card";
import { File, Files, Folder } from "fumadocs-ui/components/files";
import { Step, Steps } from "fumadocs-ui/components/steps";
import { Tab, Tabs } from "fumadocs-ui/components/tabs";
import { TypeTable } from "fumadocs-ui/components/type-table";
import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";
import React from "react";
import { Mermaid } from "@/components/mdx/mermaid";

function extractTextContent(node: React.ReactNode): string {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractTextContent).join("");
  if (React.isValidElement(node)) {
    const props = node.props as { children?: React.ReactNode };
    return extractTextContent(props.children);
  }
  return "";
}

function CustomPre(
  props: React.ComponentProps<"pre"> & { "data-language"?: string },
) {
  const { children } = props;

  let isMermaid = props["data-language"] === "mermaid";
  let chartCode = "";

  if (React.isValidElement(children)) {
    const childProps = children.props as {
      className?: string;
      "data-language"?: string;
      children?: React.ReactNode;
    };

    if (
      childProps["data-language"] === "mermaid" ||
      childProps.className?.includes("language-mermaid") ||
      childProps.className?.includes("mermaid")
    ) {
      isMermaid = true;
    }

    if (isMermaid) {
      chartCode = extractTextContent(childProps.children);
    }
  } else if (isMermaid) {
    chartCode = extractTextContent(children);
  }

  if (isMermaid && chartCode.trim()) {
    return <Mermaid chart={chartCode.trim()} />;
  }

  const DefaultPre = defaultMdxComponents.pre;
  return <DefaultPre {...props} />;
}

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    pre: CustomPre,
    Mermaid,
    Card,
    Cards,
    Callout,
    Steps,
    Step,
    Tab,
    Tabs,
    Accordion,
    Accordions,
    Files,
    Folder,
    File,
    TypeTable,
    ...components,
  } satisfies MDXComponents;
}

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
