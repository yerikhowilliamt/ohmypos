import * as React from 'react';
import { ArrowRight, Info, TriangleAlert } from 'lucide-react';
import type { HelpBlock } from '@/lib/help-content';

/**
 * A left-to-right chain of labelled boxes.
 *
 * Deliberately built from DOM nodes rather than a screenshot or an image: this
 * repo renames user-facing labels often (`Pusat (Dapur Sentral)` → `Umum`
 * changed five files in one day), and a picture would keep showing the old
 * word with nothing in lint, typecheck or CI able to notice. Text in a box can
 * at least be grepped. It also inherits the viewer's theme for free.
 */
function FlowDiagram({
  nodes,
  caption,
}: {
  nodes: string[];
  caption?: string;
}) {
  return (
    <figure className="m-0">
      {/* Wide chains scroll inside this box instead of widening the page. */}
      <div className="overflow-x-auto pb-1">
        <ol className="flex list-none items-stretch gap-1.5 p-0">
          {nodes.map((node, index) => (
            <li key={index} className="flex shrink-0 items-center gap-1.5">
              <span className="flex min-h-9 items-center rounded-sm border border-border-default bg-surface-muted px-2.5 py-1.5 text-xs font-medium text-text-primary">
                {node}
              </span>
              {index < nodes.length - 1 && (
                <ArrowRight
                  className="size-3.5 shrink-0 text-text-tertiary"
                  aria-hidden
                />
              )}
            </li>
          ))}
        </ol>
      </div>
      {caption && (
        <figcaption className="mt-1.5 text-xs text-text-tertiary">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

function Note({ tone, body }: { tone: 'info' | 'warning'; body: string }) {
  const isWarning = tone === 'warning';
  const Icon = isWarning ? TriangleAlert : Info;
  return (
    <div
      className={
        isWarning
          ? 'flex gap-2 rounded-sm border border-status-warning/30 bg-status-warning/10 p-3'
          : 'flex gap-2 rounded-sm border border-border-default bg-surface-muted p-3'
      }
    >
      <Icon
        className={
          isWarning
            ? 'mt-0.5 size-4 shrink-0 text-status-warning'
            : 'mt-0.5 size-4 shrink-0 text-text-tertiary'
        }
        aria-hidden
      />
      <p
        className={
          isWarning
            ? 'text-sm leading-relaxed text-status-warning'
            : 'text-sm leading-relaxed text-text-secondary'
        }
      >
        {body}
      </p>
    </div>
  );
}

export function HelpBlockView({ block }: { block: HelpBlock }) {
  switch (block.kind) {
    case 'text':
      return (
        <p className="text-sm leading-relaxed text-text-secondary">
          {block.body}
        </p>
      );

    case 'steps':
      return (
        <ol className="list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-text-secondary marker:text-text-tertiary">
          {block.items.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ol>
      );

    case 'note':
      return <Note tone={block.tone} body={block.body} />;

    case 'terms':
      return (
        <dl className="space-y-2.5">
          {block.items.map((item) => (
            <div key={item.term}>
              <dt className="text-sm font-semibold text-text-primary">
                {item.term}
              </dt>
              <dd className="mt-0.5 text-sm leading-relaxed text-text-secondary">
                {item.definition}
              </dd>
            </div>
          ))}
        </dl>
      );

    case 'flow':
      return <FlowDiagram nodes={block.nodes} caption={block.caption} />;
  }
}
