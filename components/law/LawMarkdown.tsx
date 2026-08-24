"use client";

import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import styled, { css } from "styled-components";

const schema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
  ],
};

const Wrap = styled.div<{ $compact?: boolean }>`
  color: inherit;
  line-height: 1.55;

  h1,
  h2,
  h3,
  h4,
  h5,
  h6,
  p {
    margin: 0 0 ${({ theme }) => theme.space(3)};
  }

  h1,
  h2,
  h3,
  h4,
  h5,
  h6 {
    font-size: inherit;
    font-weight: ${({ theme }) => theme.fontWeights.semibold};
    line-height: 1.3;
  }

  ul,
  ol {
    margin: 0 0 ${({ theme }) => theme.space(3)};
    padding-left: ${({ theme }) => theme.space(5)};
  }

  table {
    width: 100%;
    border-collapse: collapse;
    margin: 0 0 ${({ theme }) => theme.space(3)};
    font-size: ${({ theme }) => theme.fontSize.sm};
  }

  th,
  td {
    border: 1px solid ${({ theme }) => theme.colors.g12};
    padding: ${({ theme }) => theme.space(1.5)} ${({ theme }) => theme.space(2)};
    text-align: left;
    vertical-align: top;
  }

  a {
    color: inherit;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  ${({ $compact }) =>
    $compact &&
    css`
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;

      h1,
      h2,
      h3,
      h4,
      h5,
      h6,
      p,
      ul,
      ol {
        display: inline;
        margin: 0;
        padding: 0;
        font-size: inherit;
        font-weight: inherit;
        line-height: inherit;
      }

      table,
      pre,
      blockquote {
        display: none;
      }

      br {
        display: none;
      }
    `}
`;

export function LawMarkdown({
  children,
  compact = false,
}: {
  children: string;
  compact?: boolean;
}) {
  const text = children.trim();
  if (!text) return null;
  return (
    <Wrap $compact={compact}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, schema]]}
      >
        {text}
      </ReactMarkdown>
    </Wrap>
  );
}
